/**
 * Script de importação direta no banco de dados
 * Usa pdfjs-dist para parsear PDFs e csv-parse para CSV
 * Verifica duplicatas antes de inserir
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config();

// pdfjs-dist uses ESM in this version
let pdfjsLib;

const USER_ID = 1; // Dra Myrna Campagnoli

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBRMoney(str) {
  if (!str) return 0;
  const s = String(str).replace(/[R$\s]/g, "").trim();
  // BR format: 1.250,50
  if (s.includes(",") && s.includes(".")) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) {
    return parseFloat(s.replace(",", ".")) || 0;
  }
  return parseFloat(s) || 0;
}

function parseBRDate(str) {
  if (!str) return null;
  const parts = str.trim().split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
}

function detectPaymentMethod(desc) {
  const d = (desc || "").toLowerCase();
  if (d.includes("pix")) return "pix";
  if (d.includes("boleto") || d.includes("cobranca") || d.includes("pagto eletron") || d.includes("pagamento de boleto")) return "boleto";
  if (d.includes("cartao") || d.includes("cartão") || d.includes("crédito") || d.includes("credito")) return "credit";
  if (d.includes("debito") || d.includes("débito")) return "debit";
  return "pix";
}

function detectType(desc, isPositive) {
  const d = (desc || "").toLowerCase();
  // Transferências internas entre contas próprias
  const isOwnTransfer = (
    d.includes("myrna perez campagnoli") ||
    d.includes("campagnoli e costa") ||
    d.includes("campagnoli e costa medicos") ||
    (d.includes("transferencia") && d.includes("myrna")) ||
    (d.includes("transferência") && d.includes("myrna"))
  );
  if (isOwnTransfer) return "transfer";
  return isPositive ? "income" : "expense";
}

// ─── Parser CSV Nubank PJ ─────────────────────────────────────────────────────

function parseNubankCSV(filePath, accountSource, entityType) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Format: Data,Valor,Identificador,Descrição
    const commaIdx1 = line.indexOf(",");
    const commaIdx2 = line.indexOf(",", commaIdx1 + 1);
    const commaIdx3 = line.indexOf(",", commaIdx2 + 1);

    if (commaIdx1 < 0 || commaIdx2 < 0 || commaIdx3 < 0) continue;

    const dateStr = line.substring(0, commaIdx1).trim();
    const valueStr = line.substring(commaIdx1 + 1, commaIdx2).trim();
    const identifier = line.substring(commaIdx2 + 1, commaIdx3).trim();
    const desc = line.substring(commaIdx3 + 1).trim().replace(/^"|"$/g, "");

    const date = parseBRDate(dateStr);
    const value = parseFloat(valueStr);

    if (!date || isNaN(value) || !desc) continue;

    const isPositive = value > 0;
    const amount = Math.abs(value);
    const type = detectType(desc, isPositive);

    transactions.push({
      description: desc.substring(0, 255),
      amount: amount.toFixed(2),
      type,
      entityType,
      paymentMethod: detectPaymentMethod(desc),
      status: "paid",
      dueDate: date,
      paidAt: date,
      importedFrom: accountSource,
      source: "import_csv",
      externalId: identifier,
    });
  }

  return transactions;
}

// ─── Parser PDF com pdfjs ─────────────────────────────────────────────────────

async function extractPdfItems(filePath) {
  const data = new Uint8Array(readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item.str && item.str.trim()) {
        items.push({
          str: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          page: p,
        });
      }
    }
  }
  return items;
}

// ─── Parser Nubank PF PDF ─────────────────────────────────────────────────────

async function parseNubankPF(filePath, accountSource) {
  const items = await extractPdfItems(filePath);
  const transactions = [];

  const byY = new Map();
  for (const item of items) {
    const key = `${item.page}_${item.y}`;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key).push(item);
  }

  const ys = Array.from(byY.keys()).sort((a, b) => {
    const [pa, ya] = a.split("_").map(Number);
    const [pb, yb] = b.split("_").map(Number);
    if (pa !== pb) return pa - pb;
    return yb - ya; // descending Y within page
  });

  const dateRe = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$/i;
  const monthMap = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };
  const moneyRe = /^[+-]?\s*[\d.]+,\d{2}$/;

  let currentDate = null;
  let pendingDesc = [];
  let pendingDate = null;

  function flushPending() {
    if (!pendingDate || pendingDesc.length === 0) return;
    // Look for value in pending
    for (const item of pendingDesc) {
      if (moneyRe.test(item.str) && item.x > 450) {
        const raw = item.str.replace(/\s/g, "");
        const isNeg = raw.startsWith("-");
        const amount = parseBRMoney(raw);
        if (amount <= 0) continue;

        const descItems = pendingDesc.filter(i => i.x > 50 && i.x < 450 && !moneyRe.test(i.str));
        const desc = descItems.map(d => d.str).join(" ").trim() || "Transação Nubank";

        transactions.push({
          description: desc.substring(0, 255),
          amount: amount.toFixed(2),
          type: detectType(desc, !isNeg),
          entityType: "PF",
          paymentMethod: detectPaymentMethod(desc),
          status: "paid",
          dueDate: pendingDate,
          paidAt: pendingDate,
          importedFrom: accountSource,
          source: "import_pdf",
        });
      }
    }
  }

  for (const key of ys) {
    const row = byY.get(key);
    const texts = row.map(i => i.str).join(" ");

    const dateMatch = texts.match(dateRe);
    if (dateMatch) {
      flushPending();
      currentDate = new Date(parseInt(dateMatch[3]), monthMap[dateMatch[2].toUpperCase()], parseInt(dateMatch[1]));
      pendingDate = currentDate;
      pendingDesc = [...row];
    } else if (currentDate) {
      // Check if this row has a money value (transaction line)
      const hasValue = row.some(i => moneyRe.test(i.str) && i.x > 450);
      if (hasValue) {
        pendingDesc.push(...row);
        flushPending();
        pendingDesc = [];
      } else {
        pendingDesc.push(...row);
      }
    }
  }
  flushPending();

  return transactions;
}

// ─── Parser Banco 301 PJ PDF ──────────────────────────────────────────────────
// Layout: Data(x=50), Categoria(x=102), Lançamento(x=161), Descrição(x=215), Entrada(x=407), Saída(x=463)

async function parseBanco301(filePath, accountSource) {
  const items = await extractPdfItems(filePath);
  const transactions = [];

  const byY = new Map();
  for (const item of items) {
    const key = `${item.page}_${item.y}`;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key).push(item);
  }

  const ys = Array.from(byY.keys()).sort((a, b) => {
    const [pa, ya] = a.split("_").map(Number);
    const [pb, yb] = b.split("_").map(Number);
    if (pa !== pb) return pa - pb;
    return yb - ya;
  });

  const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  // Money: with R$ prefix or plain number with comma
  const moneyRe = /^(R\$\s*)?\d{1,3}(\.\d{3})*,\d{2}$/;

  for (const key of ys) {
    const row = byY.get(key).sort((a, b) => a.x - b.x);

    // Find date (x 38-80)
    const dateItem = row.find(i => i.x >= 38 && i.x <= 80 && dateRe.test(i.str));
    if (!dateItem) continue;

    const [, d, m, yr] = dateItem.str.match(dateRe);
    const date = new Date(parseInt(yr), parseInt(m) - 1, parseInt(d));

    // Description items (x 160-420): Lançamento + Descrição
    const descItems = row.filter(i => i.x >= 100 && i.x < 420 && !moneyRe.test(i.str) && i.str !== "-" && i.str !== "Pessoa" && i.str !== "Jurídica" && i.str !== "Física");
    const desc = descItems.map(i => i.str).join(" ").trim();
    if (!desc) continue;

    // Entrada (x 395-445): column header is at x=407
    // Saída (x 445-510): column header is at x=463
    // Values come as "R$ 171,00" or just "-"
    const hasMoneyRe = /[\d,]/;
    const entradaItem = row.find(i => i.x >= 390 && i.x <= 445 && i.str !== "-" && hasMoneyRe.test(i.str));
    const saidaItem = row.find(i => i.x >= 445 && i.x <= 510 && i.str !== "-" && hasMoneyRe.test(i.str));

    let amount = 0;
    let isPositive = false;

    if (entradaItem) {
      amount = parseBRMoney(entradaItem.str);
      isPositive = true;
    } else if (saidaItem) {
      amount = parseBRMoney(saidaItem.str);
      isPositive = false;
    }

    if (amount <= 0) continue;

    transactions.push({
      description: desc.substring(0, 255),
      amount: amount.toFixed(2),
      type: detectType(desc, isPositive),
      entityType: "PJ",
      paymentMethod: detectPaymentMethod(desc),
      status: "paid",
      dueDate: date,
      paidAt: date,
      importedFrom: accountSource,
      source: "import_pdf",
    });
  }

  return transactions;
}

// ─── Parser Bradesco PF PDF ───────────────────────────────────────────────────

async function parseBradescoPF(filePath, accountSource) {
  const items = await extractPdfItems(filePath);
  const transactions = [];

  const byY = new Map();
  for (const item of items) {
    const key = `${item.page}_${item.y}`;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key).push(item);
  }

  const ys = Array.from(byY.keys()).sort((a, b) => {
    const [pa, ya] = a.split("_").map(Number);
    const [pb, yb] = b.split("_").map(Number);
    if (pa !== pb) return pa - pb;
    return yb - ya;
  });

  const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const moneyRe = /^\d{1,3}(\.\d{3})*,\d{2}$/;

  let currentDate = null;
  let currentDesc = "";

  for (const key of ys) {
    const row = byY.get(key).sort((a, b) => a.x - b.x);

    // Check for date
    const dateItem = row.find(i => dateRe.test(i.str));
    if (dateItem) {
      const [, d, m, yr] = dateItem.str.match(dateRe);
      currentDate = new Date(parseInt(yr), parseInt(m) - 1, parseInt(d));
      // Description on same row
      const descItems = row.filter(i => !dateRe.test(i.str) && !moneyRe.test(i.str) && !/^\d{7}$/.test(i.str) && i.str.length > 2);
      currentDesc = descItems.map(i => i.str).join(" ").trim();
      continue;
    }

    if (!currentDate) continue;

    // Check for money values
    const moneyItems = row.filter(i => moneyRe.test(i.str));
    if (moneyItems.length >= 1) {
      const descItems = row.filter(i => !moneyRe.test(i.str) && !/^\d{7}$/.test(i.str) && i.str.length > 2);
      const rowDesc = descItems.map(i => i.str).join(" ").trim();
      const fullDesc = (currentDesc + " " + rowDesc).trim() || "Transação Bradesco";

      // Bradesco layout: Crédito (x≈350-420), Débito (x≈420-490), Saldo (x≈490+)
      // Find credit and debit columns
      const creditItem = moneyItems.find(i => i.x >= 320 && i.x < 430);
      const debitItem = moneyItems.find(i => i.x >= 430 && i.x < 510);

      if (creditItem) {
        const amount = parseBRMoney(creditItem.str);
        if (amount > 0) {
          transactions.push({
            description: fullDesc.substring(0, 255),
            amount: amount.toFixed(2),
            type: detectType(fullDesc, true),
            entityType: "PF",
            paymentMethod: detectPaymentMethod(fullDesc),
            status: "paid",
            dueDate: currentDate,
            paidAt: currentDate,
            importedFrom: accountSource,
            source: "import_pdf",
          });
        }
      }

      if (debitItem) {
        const amount = parseBRMoney(debitItem.str);
        if (amount > 0) {
          transactions.push({
            description: fullDesc.substring(0, 255),
            amount: amount.toFixed(2),
            type: detectType(fullDesc, false),
            entityType: "PF",
            paymentMethod: detectPaymentMethod(fullDesc),
            status: "paid",
            dueDate: currentDate,
            paidAt: currentDate,
            importedFrom: accountSource,
            source: "import_pdf",
          });
        }
      }

      currentDesc = "";
    } else {
      // Description continuation
      const descItems = row.filter(i => !moneyRe.test(i.str) && !/^\d{7}$/.test(i.str) && i.str.length > 1);
      if (descItems.length > 0) {
        currentDesc = (currentDesc + " " + descItems.map(i => i.str).join(" ")).trim();
      }
    }
  }

  return transactions;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function isDuplicate(tx, existing) {
  const txAmt = parseFloat(String(tx.amount));
  const txDate = tx.dueDate instanceof Date ? tx.dueDate : new Date(tx.dueDate);

  for (const ex of existing) {
    const exAmt = parseFloat(String(ex.amount));
    const exDate = ex.dueDate ? new Date(ex.dueDate) : new Date(ex.createdAt);

    // Same amount (within R$ 0.02)
    if (Math.abs(txAmt - exAmt) > 0.02) continue;

    // Same date (within 3 days)
    const daysDiff = Math.abs((txDate - exDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 3) continue;

    // Similar description
    const txDesc = tx.description.toLowerCase();
    const exDesc = (ex.description || "").toLowerCase();

    // Check first 15 chars match OR key word match
    const txShort = txDesc.substring(0, 15);
    const exShort = exDesc.substring(0, 15);
    if (txShort === exShort) return true;

    // Check if same type and amount and date (within 1 day) - strong match
    if (daysDiff <= 1 && tx.type === ex.type) return true;
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Initialize pdfjs
  pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const conn = await createConnection(process.env.DATABASE_URL);
  console.log("✅ Conectado ao banco de dados\n");

  // Fetch existing transactions
  const [existing] = await conn.execute(
    "SELECT id, description, amount, type, entityType, dueDate, importedFrom FROM transactions WHERE userId = ?",
    [USER_ID]
  );
  console.log(`📊 Transações existentes: ${existing.length}\n`);

  const files = [
    // Nubank PJ - CSV (mais preciso que PDF)
    {
      path: "/home/ubuntu/upload/NU_2630533626_01JAN2026_09MAI2026.csv",
      parser: "nubank_csv",
      source: "Nubank PJ",
      entityType: "PJ",
      label: "Nubank PJ - Jan a Mai/2026 (CSV)",
    },
    // Nubank PF - março
    {
      path: "/home/ubuntu/upload/NU_91720574_01MAR2026_31MAR2026(1)(1).pdf",
      parser: "nubank_pf",
      source: "Nubank PF",
      entityType: "PF",
      label: "Nubank PF - Março/2026",
    },
    // Nubank PF - abril
    {
      path: "/home/ubuntu/upload/NU_91720574_01ABR2026_30ABR2026(1).pdf",
      parser: "nubank_pf",
      source: "Nubank PF",
      entityType: "PF",
      label: "Nubank PF - Abril/2026",
    },
    // Banco 301 PJ - jan-mar
    {
      path: "/home/ubuntu/upload/31113764_01JAN2026_27MAR2026(2).pdf",
      parser: "banco301",
      source: "Banco 301 PJ",
      entityType: "PJ",
      label: "Banco 301 PJ - Jan a Mar/2026",
    },
    // Banco 301 PJ - mar-mai
    {
      path: "/home/ubuntu/upload/31113764_27MAR2026_08MAI2026(1).pdf",
      parser: "banco301",
      source: "Banco 301 PJ",
      entityType: "PJ",
      label: "Banco 301 PJ - Mar a Mai/2026",
    },
    // Bradesco PF
    {
      path: "/home/ubuntu/upload/9b218692-fd84-40b5-b151-6c962abe732c.pdf",
      parser: "bradesco_pf",
      source: "Bradesco PF",
      entityType: "PF",
      label: "Bradesco PF - Jan a Mai/2026",
    },
  ];

  const report = { total: 0, imported: 0, duplicates: 0, errors: 0, byFile: [] };
  const allExisting = [...existing];

  for (const file of files) {
    console.log(`\n📄 ${file.label}`);

    let transactions = [];
    try {
      if (file.parser === "nubank_csv") {
        transactions = parseNubankCSV(file.path, file.source, file.entityType);
      } else if (file.parser === "nubank_pf") {
        transactions = await parseNubankPF(file.path, file.source);
      } else if (file.parser === "banco301") {
        transactions = await parseBanco301(file.path, file.source);
      } else if (file.parser === "bradesco_pf") {
        transactions = await parseBradescoPF(file.path, file.source);
      }
    } catch (e) {
      console.error(`   ❌ Erro no parse: ${e.message}`);
      report.byFile.push({ label: file.label, parsed: 0, imported: 0, duplicates: 0, error: e.message });
      report.errors++;
      continue;
    }

    console.log(`   Parse: ${transactions.length} transações encontradas`);

    // Check duplicates
    const toImport = [];
    const dupes = [];
    for (const tx of transactions) {
      if (isDuplicate(tx, allExisting)) {
        dupes.push(tx);
      } else {
        toImport.push(tx);
      }
    }

    console.log(`   Duplicatas: ${dupes.length} | Novas: ${toImport.length}`);

    // Insert in batches
    let imported = 0;
    for (const tx of toImport) {
      try {
        const dueDate = tx.dueDate instanceof Date ? tx.dueDate : new Date(tx.dueDate);
        const paidAt = tx.paidAt instanceof Date ? tx.paidAt : new Date(tx.paidAt);

        await conn.execute(
          `INSERT INTO transactions 
            (userId, description, amount, type, entityType, paymentMethod, status, dueDate, paidAt, importedFrom, source, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            USER_ID,
            tx.description,
            tx.amount,
            tx.type,
            tx.entityType,
            tx.paymentMethod || "pix",
            tx.status || "paid",
            dueDate,
            paidAt,
            tx.importedFrom,
            tx.source || "import_pdf",
          ]
        );
        imported++;
        // Add to existing for next file dedup
        allExisting.push({
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          entityType: tx.entityType,
          dueDate,
          importedFrom: tx.importedFrom,
        });
      } catch (e) {
        console.error(`   ❌ Erro ao inserir "${tx.description}": ${e.message}`);
        report.errors++;
      }
    }

    report.total += transactions.length;
    report.imported += imported;
    report.duplicates += dupes.length;
    report.byFile.push({
      label: file.label,
      parsed: transactions.length,
      imported,
      duplicates: dupes.length,
    });

    console.log(`   ✅ Importadas: ${imported}`);
  }

  await conn.end();

  // Final report
  console.log("\n" + "═".repeat(60));
  console.log("📊 RELATÓRIO FINAL DE IMPORTAÇÃO");
  console.log("═".repeat(60));
  console.log(`Total processadas : ${report.total}`);
  console.log(`✅ Importadas     : ${report.imported}`);
  console.log(`⏭️  Duplicatas     : ${report.duplicates}`);
  console.log(`❌ Erros          : ${report.errors}`);
  console.log("\nPor arquivo:");
  for (const f of report.byFile) {
    const status = f.error ? `❌ ${f.error}` : `✅ ${f.imported} novas | ⏭️ ${f.duplicates} duplicatas`;
    console.log(`  ${f.label}`);
    console.log(`    Parse: ${f.parsed} | ${status}`);
  }
  console.log("═".repeat(60));
}

main().catch(e => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
