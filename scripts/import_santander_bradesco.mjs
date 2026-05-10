/**
 * Importa extratos Santander PF e Bradesco PF
 * Santander: "Extrato Consolidado Inteligente" (jan-abr/2026)
 * Bradesco: "Extrato de Conta Corrente" (mai/2026)
 */
import { execSync } from "child_process";
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config();

const USER_ID = 1;

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseMoney(str) {
  if (!str) return null;
  const s = str.trim();
  // Remove saldo acumulado (último número da linha) - pegar só o valor da transação
  // Formato: "1.234,56" (entrada) ou "1.234,56-" (saída)
  const negative = s.endsWith("-");
  const clean = s.replace(/-$/, "").replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  if (isNaN(val) || val <= 0) return null;
  return negative ? -val : val;
}

function parseDate(dateStr, year) {
  // Formato "DD/MM"
  const m = dateStr.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const month = parseInt(m[2]);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function detectType(desc, amount) {
  const d = desc.toLowerCase();
  if (d.includes("transf interna") || d.includes("pix recebido") && d.includes("campagnoli")) return "transfer";
  if (d.includes("pix enviado") || d.includes("pix recebido") && (d.includes("myrna") || d.includes("campagnoli e costa"))) {
    // Transferências internas entre contas próprias
    if (d.includes("campagnoli e costa") || d.includes("myrna perez") || d.includes("myrna campagnoli")) return "transfer";
  }
  if (amount > 0) return "income";
  return "expense";
}

function detectEntityType(desc) {
  // Todos esses extratos são PF
  return "PF";
}

// ─── Parser Santander ─────────────────────────────────────────────────────────

function parseSantander(pdfPath, year, monthName) {
  const text = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: "utf8" });
  const lines = text.split("\n");
  const transactions = [];

  // Padrão: linha começa com DD/MM seguido de descrição e valor
  const dateRe = /^\s*(\d{2}\/\d{2})\s+(.+?)\s+([\d.]+,\d{2}-?)\s*(?:[\d.]+,\d{2})?\s*$/;
  
  for (const line of lines) {
    const m = line.match(dateRe);
    if (!m) continue;
    
    const [, dateStr, rawDesc, rawAmount] = m;
    const date = parseDate(dateStr, year);
    if (!date) continue;
    
    // Ignorar linhas de saldo (sem descrição real)
    const desc = rawDesc.trim().replace(/\s+/g, " ");
    if (!desc || desc.match(/^\d+$/) || desc === "-") continue;
    
    // Ignorar linhas de cabeçalho ou resumo
    if (desc.toLowerCase().includes("saldo") || desc.toLowerCase().includes("limite")) continue;
    
    const amount = parseMoney(rawAmount);
    if (amount === null) continue;
    
    const type = detectType(desc, amount);
    const absAmount = Math.abs(amount);
    
    transactions.push({
      date,
      description: desc,
      amount: absAmount,
      type,
      entityType: "PF",
      importedFrom: "Santander PF",
      paymentMethod: desc.toLowerCase().includes("pix") ? "pix" : 
                     desc.toLowerCase().includes("boleto") ? "boleto" : "other",
    });
  }
  
  console.log(`  Santander ${monthName}: ${transactions.length} transações parseadas`);
  return transactions;
}

// ─── Parser Bradesco PF (extrato_conta.pdf) ───────────────────────────────────

function parseBradescoConta(pdfPath) {
  const text = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: "utf8" });
  const lines = text.split("\n");
  const transactions = [];

  // Formato Bradesco: "DD/MM/YYYY  DESCRIÇÃO  VALOR  SALDO"
  // Ou: "DD/MM/YYYY  DESCRIÇÃO"
  const dateRe = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.]+,\d{2}-?)\s*(?:[\d.]+,\d{2})?\s*$/;
  
  for (const line of lines) {
    const m = line.match(dateRe);
    if (!m) continue;
    
    const [, dateStr, rawDesc, rawAmount] = m;
    const [day, month, yearStr] = dateStr.split("/");
    const date = new Date(parseInt(yearStr), parseInt(month) - 1, parseInt(day), 12, 0, 0);
    
    const desc = rawDesc.trim().replace(/\s+/g, " ");
    if (!desc || desc.match(/^\d+$/) || desc === "-") continue;
    if (desc.toLowerCase().includes("saldo")) continue;
    
    const amount = parseMoney(rawAmount);
    if (amount === null) continue;
    
    const type = detectType(desc, amount);
    const absAmount = Math.abs(amount);
    
    transactions.push({
      date,
      description: desc,
      amount: absAmount,
      type,
      entityType: "PF",
      importedFrom: "Bradesco PF",
      paymentMethod: desc.toLowerCase().includes("pix") ? "pix" :
                     desc.toLowerCase().includes("boleto") ? "boleto" :
                     desc.toLowerCase().includes("debito aut") ? "debit" : "other",
    });
  }
  
  console.log(`  Bradesco PF (mai): ${transactions.length} transações parseadas`);
  return transactions;
}

// ─── Verificação de duplicatas ────────────────────────────────────────────────

async function checkDuplicate(conn, tx) {
  const dateFrom = new Date(tx.date);
  dateFrom.setDate(dateFrom.getDate() - 2);
  const dateTo = new Date(tx.date);
  dateTo.setDate(dateTo.getDate() + 2);
  
  const [rows] = await conn.execute(
    `SELECT id FROM transactions 
     WHERE userId=? AND ABS(amount - ?) < 0.02 
       AND dueDate BETWEEN ? AND ?
       AND (description LIKE ? OR description LIKE ?)
     LIMIT 1`,
    [
      USER_ID,
      tx.amount,
      dateFrom,
      dateTo,
      `%${tx.description.substring(0, 20)}%`,
      `%${tx.description.substring(0, 10)}%`,
    ]
  );
  return rows.length > 0;
}

// ─── Importação ───────────────────────────────────────────────────────────────

async function importTransactions(conn, txs, sourceName) {
  let imported = 0;
  let skipped = 0;
  
  for (const tx of txs) {
    const isDup = await checkDuplicate(conn, tx);
    if (isDup) {
      skipped++;
      continue;
    }
    
    await conn.execute(
      `INSERT INTO transactions 
       (userId, description, amount, type, entityType, paymentMethod, status, dueDate, paidAt, source, importedFrom, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, ?, 'import_pdf', ?, NOW(), NOW())`,
      [
        USER_ID,
        tx.description,
        tx.amount.toFixed(2),
        tx.type,
        tx.entityType,
        tx.paymentMethod || "other",
        tx.date,
        tx.type === "income" || tx.type === "transfer" ? tx.date : null,
        tx.importedFrom,
      ]
    );
    imported++;
  }
  
  console.log(`  ✅ ${sourceName}: ${imported} importadas, ${skipped} duplicatas puladas`);
  return { imported, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  console.log("✅ Conectado ao banco\n");
  
  let totalImported = 0;
  let totalSkipped = 0;
  
  // Santander PF - Jan/2026
  console.log("📄 Processando Santander PF...");
  const santJan = parseSantander("/home/ubuntu/upload/Extratoconsolidadomensal.pdf", 2026, "jan");
  const rJan = await importTransactions(conn, santJan, "Santander jan/2026");
  totalImported += rJan.imported; totalSkipped += rJan.skipped;
  
  // Santander PF - Fev/2026
  const santFev = parseSantander("/home/ubuntu/upload/Extratoconsolidadomensal(1).pdf", 2026, "fev");
  const rFev = await importTransactions(conn, santFev, "Santander fev/2026");
  totalImported += rFev.imported; totalSkipped += rFev.skipped;
  
  // Santander PF - Mar/2026
  const santMar = parseSantander("/home/ubuntu/upload/Extratoconsolidadomensal(2).pdf", 2026, "mar");
  const rMar = await importTransactions(conn, santMar, "Santander mar/2026");
  totalImported += rMar.imported; totalSkipped += rMar.skipped;
  
  // Santander PF - Abr/2026
  const santAbr = parseSantander("/home/ubuntu/upload/Extratoconsolidadomensal(3).pdf", 2026, "abr");
  const rAbr = await importTransactions(conn, santAbr, "Santander abr/2026");
  totalImported += rAbr.imported; totalSkipped += rAbr.skipped;
  
  // Bradesco PF - Mai/2026
  console.log("\n📄 Processando Bradesco PF (mai/2026)...");
  const bradMai = parseBradescoConta("/home/ubuntu/upload/extrato_conta.pdf");
  const rBrad = await importTransactions(conn, bradMai, "Bradesco PF mai/2026");
  totalImported += rBrad.imported; totalSkipped += rBrad.skipped;
  
  await conn.end();
  
  console.log(`\n📊 TOTAL: ${totalImported} importadas, ${totalSkipped} duplicatas puladas`);
  
  // Verificar totais atualizados
  const conn2 = await createConnection(process.env.DATABASE_URL);
  const [rows] = await conn2.execute(`
    SELECT MONTH(dueDate) as m, 
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as ent,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as sai,
      COUNT(*) as tot
    FROM transactions WHERE userId=1 AND YEAR(dueDate)=2026 AND status!='legal'
    GROUP BY MONTH(dueDate) ORDER BY MONTH(dueDate)
  `);
  const meses = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  console.log('\nTotais atualizados:');
  rows.forEach(r => {
    const fmt = v => 'R$' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
    console.log(meses[r.m], '| Ent:', fmt(r.ent), '| Sai:', fmt(r.sai), '|', r.tot, 'tx');
  });
  await conn2.end();
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
