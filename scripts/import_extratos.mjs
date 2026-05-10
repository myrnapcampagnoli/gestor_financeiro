/**
 * Script de importação em lote dos extratos bancários
 * Faz parse de PDFs e CSV, verifica duplicatas e importa via API
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// ─── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:3000/api/trpc";
const COOKIE_FILE = "/home/ubuntu/.gestor_session_cookie";

// Tentar ler cookie de sessão
let sessionCookie = "";
try {
  sessionCookie = readFileSync(COOKIE_FILE, "utf-8").trim();
} catch {
  // sem cookie salvo
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBRDate(str) {
  if (!str) return null;
  // DD/MM/YYYY or DD/MM
  const parts = str.trim().split("/");
  if (parts.length === 2) {
    return new Date(2026, parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
}

function parseBRMoney(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
}

function detectEntityType(desc, accountSource) {
  const d = (desc || "").toLowerCase();
  const s = (accountSource || "").toLowerCase();
  if (s.includes("pj") || s.includes("301") || s.includes("nubank pj")) return "PJ";
  if (s.includes("pf") || s.includes("bradesco pf") || s.includes("santander pf")) return "PF";
  if (d.includes("cnpj") || d.includes("09.189") || d.includes("33.932") || d.includes("36.")) return "PJ";
  return "PF";
}

function detectPaymentMethod(desc) {
  const d = (desc || "").toLowerCase();
  if (d.includes("pix")) return "pix";
  if (d.includes("boleto") || d.includes("cobranca") || d.includes("pagto eletron")) return "boleto";
  if (d.includes("cartao") || d.includes("cartão") || d.includes("crédito") || d.includes("credito")) return "credit";
  if (d.includes("debito") || d.includes("débito")) return "debit";
  return "pix";
}

function detectType(desc, value, accountSource) {
  // Transferências internas entre contas próprias
  const d = (desc || "").toLowerCase();
  const isOwnTransfer = (
    d.includes("myrna perez campagnoli") ||
    d.includes("campagnoli e costa") ||
    (d.includes("transferencia") && (d.includes("myrna") || d.includes("campagnoli")))
  );
  if (isOwnTransfer) return "transfer";
  if (value > 0) return "income";
  return "expense";
}

// ─── Parser CSV Nubank PJ ─────────────────────────────────────────────────────

function parseNubankCSV(filePath, accountSource) {
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

    const type = detectType(desc, value, accountSource);
    const amount = Math.abs(value);

    transactions.push({
      description: desc.substring(0, 255),
      amount,
      type,
      entityType: detectEntityType(desc, accountSource),
      paymentMethod: detectPaymentMethod(desc),
      status: "paid",
      dueDate: date,
      paidAt: date,
      importedFrom: accountSource,
      source: "import_csv",
      externalId: identifier, // para deduplicação
    });
  }

  return transactions;
}

// ─── Parser PDF genérico com pdfjs ───────────────────────────────────────────

async function extractPdfItems(filePath) {
  const data = new Uint8Array(readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item.str && item.str.trim()) {
        items.push({ str: item.str.trim(), x: Math.round(item.transform[4]), y: Math.round(item.transform[5]) });
      }
    }
  }
  return items;
}

// ─── Parser Nubank PF PDF ─────────────────────────────────────────────────────

async function parseNubankPF(filePath, accountSource) {
  const items = await extractPdfItems(filePath);
  const transactions = [];

  // Group by Y position
  const byY = new Map();
  for (const item of items) {
    if (!byY.has(item.y)) byY.set(item.y, []);
    byY.get(item.y).push(item);
  }

  // Sort Y descending (top to bottom)
  const ys = Array.from(byY.keys()).sort((a, b) => b - a);

  // Date pattern: DD MMM YYYY
  const dateRe = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$/i;
  const monthMap = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };
  const moneyRe = /^[+-]?\s*[\d.,]+$/;

  let currentDate = null;
  let currentGroup = [];

  function processGroup(group, date) {
    if (!date || group.length === 0) return;

    // Find value items (x > 450)
    const valueItems = group.filter(i => i.x > 450 && moneyRe.test(i.str.replace(/\s/g, "")));
    // Find description items (x < 450)
    const descItems = group.filter(i => i.x < 450 && i.x > 50);

    for (const vi of valueItems) {
      const raw = vi.str.replace(/\s/g, "");
      const isNeg = raw.startsWith("-");
      const amount = parseBRMoney(raw);
      if (amount <= 0) continue;

      const desc = descItems.map(d => d.str).join(" ").trim() || "Transação";
      const type = detectType(desc, isNeg ? -amount : amount, accountSource);

      transactions.push({
        description: desc.substring(0, 255),
        amount,
        type,
        entityType: detectEntityType(desc, accountSource),
        paymentMethod: detectPaymentMethod(desc),
        status: "paid",
        dueDate: date,
        paidAt: date,
        importedFrom: accountSource,
        source: "import_pdf",
      });
    }
  }

  for (const y of ys) {
    const row = byY.get(y);
    const texts = row.map(i => i.str);
    const fullText = texts.join(" ");

    // Check if this row has a date
    const dateMatch = fullText.match(dateRe);
    if (dateMatch) {
      processGroup(currentGroup, currentDate);
      currentDate = new Date(parseInt(dateMatch[3]), monthMap[dateMatch[2].toUpperCase()], parseInt(dateMatch[1]));
      currentGroup = [...row];
    } else if (currentDate) {
      currentGroup.push(...row);
    }
  }
  processGroup(currentGroup, currentDate);

  return transactions;
}

// ─── Parser Banco 301 PJ PDF ──────────────────────────────────────────────────

async function parseBanco301(filePath, accountSource) {
  const items = await extractPdfItems(filePath);
  const transactions = [];

  // Group by Y
  const byY = new Map();
  for (const item of items) {
    if (!byY.has(item.y)) byY.set(item.y, []);
    byY.get(item.y).push(item);
  }

  const ys = Array.from(byY.keys()).sort((a, b) => b - a);
  const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;

  for (const y of ys) {
    const row = byY.get(y).sort((a, b) => a.x - b.x);
    const texts = row.map(i => i.str);

    // Find date (x ≈ 50)
    const dateItem = row.find(i => i.x < 80 && dateRe.test(i.str));
    if (!dateItem) continue;

    const [, d, m, yr] = dateItem.str.match(dateRe);
    const date = new Date(parseInt(yr), parseInt(m) - 1, parseInt(d));

    // Find description (x ≈ 161-400)
    const descItems = row.filter(i => i.x >= 100 && i.x < 420);
    const desc = descItems.map(i => i.str).join(" ").trim();
    if (!desc) continue;

    // Find values: entrada (x ≈ 407) and saída (x ≈ 463)
    const entradaItem = row.find(i => i.x >= 390 && i.x <= 440 && i.str !== "-");
    const saidaItem = row.find(i => i.x >= 440 && i.x <= 500 && i.str !== "-");

    let amount = 0;
    let type = "expense";

    if (entradaItem && entradaItem.str !== "-" && !entradaItem.str.includes("R$") === false || (entradaItem && /[\d,]/.test(entradaItem.str))) {
      amount = parseBRMoney(entradaItem.str);
      type = "income";
    }
    if (saidaItem && saidaItem.str !== "-" && /[\d,]/.test(saidaItem.str)) {
      amount = parseBRMoney(saidaItem.str);
      type = "expense";
    }

    if (amount <= 0) continue;

    const txType = detectType(desc, type === "income" ? amount : -amount, accountSource);

    transactions.push({
      description: desc.substring(0, 255),
      amount,
      type: txType,
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
  const text = readFileSync(filePath).toString();
  // Use pdftotext approach via text extraction
  const items = await extractPdfItems(filePath);
  const transactions = [];

  // Bradesco has a text-based layout: Date, Histórico, Docto, Crédito, Débito, Saldo
  // Group by Y
  const byY = new Map();
  for (const item of items) {
    if (!byY.has(item.y)) byY.set(item.y, []);
    byY.get(item.y).push(item);
  }

  const ys = Array.from(byY.keys()).sort((a, b) => b - a);
  const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const moneyRe = /^\d{1,3}(\.\d{3})*,\d{2}$/;

  let currentDate = null;
  let currentDesc = "";

  for (const y of ys) {
    const row = byY.get(y).sort((a, b) => a.x - b.x);

    // Check for date
    const dateItem = row.find(i => dateRe.test(i.str));
    if (dateItem) {
      const [, d, m, yr] = dateItem.str.match(dateRe);
      currentDate = new Date(parseInt(yr), parseInt(m) - 1, parseInt(d));
      currentDesc = "";
      continue;
    }

    if (!currentDate) continue;

    // Check for money values
    const moneyItems = row.filter(i => moneyRe.test(i.str));
    if (moneyItems.length >= 2) {
      // Has credit and/or debit
      // Sort by X: typically credit is before debit
      const sorted = moneyItems.sort((a, b) => a.x - b.x);

      // Find description items (non-money, non-docto)
      const descItems = row.filter(i => !moneyRe.test(i.str) && !/^\d{7}$/.test(i.str) && i.str.length > 2);
      const desc = (currentDesc + " " + descItems.map(i => i.str).join(" ")).trim() || "Transação Bradesco";

      // Determine if credit or debit based on position
      // Bradesco: Crédito (R$) column x≈350, Débito (R$) x≈450, Saldo x≈550
      for (const mi of sorted) {
        const amount = parseBRMoney(mi.str);
        if (amount <= 0) continue;

        // Skip saldo (last column, highest x)
        if (mi.x > 500) continue;

        const isCredit = mi.x < 420;
        const type = isCredit ? "income" : "expense";
        const txType = detectType(desc, isCredit ? amount : -amount, accountSource);

        transactions.push({
          description: desc.substring(0, 255),
          amount,
          type: txType,
          entityType: "PF",
          paymentMethod: detectPaymentMethod(desc),
          status: "paid",
          dueDate: currentDate,
          paidAt: currentDate,
          importedFrom: accountSource,
          source: "import_pdf",
        });
        break; // only one transaction per row
      }
      currentDesc = "";
    } else {
      // Description continuation
      const descItems = row.filter(i => !moneyRe.test(i.str) && i.str.length > 1);
      if (descItems.length > 0) {
        currentDesc = descItems.map(i => i.str).join(" ").trim();
      }
    }
  }

  return transactions;
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function callTRPC(procedure, input) {
  const url = `${API_BASE}/${procedure}`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result?.data;
}

async function getExistingTransactions() {
  try {
    const result = await callTRPC("transactions.list", {});
    return result || [];
  } catch (e) {
    console.error("Erro ao buscar transações existentes:", e.message);
    return [];
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function isDuplicate(tx, existing) {
  const txAmt = parseFloat(String(tx.amount));
  const txDate = new Date(tx.dueDate);

  for (const ex of existing) {
    const exAmt = parseFloat(String(ex.amount));
    const exDate = ex.dueDate ? new Date(ex.dueDate) : new Date(ex.createdAt);

    // Same amount (within R$ 0.01)
    if (Math.abs(txAmt - exAmt) > 0.01) continue;

    // Same date (within 3 days)
    const daysDiff = Math.abs((txDate - exDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 3) continue;

    // Similar description (first 20 chars)
    const txDesc = tx.description.toLowerCase().substring(0, 20);
    const exDesc = (ex.description || "").toLowerCase().substring(0, 20);
    if (txDesc === exDesc || tx.description.toLowerCase().includes(exDesc) || exDesc.includes(txDesc.substring(0, 10))) {
      return true;
    }
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Iniciando importação de extratos...\n");

  // Define files to process
  const files = [
    // Nubank PJ - usar CSV (mais preciso)
    {
      path: "/home/ubuntu/upload/NU_2630533626_01JAN2026_09MAI2026.csv",
      parser: "nubank_csv",
      source: "Nubank PJ",
      label: "Nubank PJ - Jan a Mai/2026 (CSV)",
    },
    // Nubank PF - março
    {
      path: "/home/ubuntu/upload/NU_91720574_01MAR2026_31MAR2026(1)(1).pdf",
      parser: "nubank_pf",
      source: "Nubank PF",
      label: "Nubank PF - Março/2026",
    },
    // Nubank PF - abril
    {
      path: "/home/ubuntu/upload/NU_91720574_01ABR2026_30ABR2026(1).pdf",
      parser: "nubank_pf",
      source: "Nubank PF",
      label: "Nubank PF - Abril/2026",
    },
    // Banco 301 PJ - jan-mar
    {
      path: "/home/ubuntu/upload/31113764_01JAN2026_27MAR2026(2).pdf",
      parser: "banco301",
      source: "Banco 301 PJ",
      label: "Banco 301 PJ - Jan a Mar/2026",
    },
    // Banco 301 PJ - mar-mai
    {
      path: "/home/ubuntu/upload/31113764_27MAR2026_08MAI2026(1).pdf",
      parser: "banco301",
      source: "Banco 301 PJ",
      label: "Banco 301 PJ - Mar a Mai/2026",
    },
    // Bradesco PF
    {
      path: "/home/ubuntu/upload/9b218692-fd84-40b5-b151-6c962abe732c.pdf",
      parser: "bradesco_pf",
      source: "Bradesco PF",
      label: "Bradesco PF - Jan a Mai/2026",
    },
  ];

  // Fetch existing transactions for dedup
  console.log("📊 Buscando transações existentes para verificar duplicatas...");
  const existing = await getExistingTransactions();
  console.log(`   Encontradas ${existing.length} transações no banco.\n`);

  const report = {
    total: 0,
    imported: 0,
    duplicates: 0,
    errors: 0,
    byFile: [],
  };

  for (const file of files) {
    console.log(`\n📄 Processando: ${file.label}`);

    let transactions = [];
    try {
      if (file.parser === "nubank_csv") {
        transactions = parseNubankCSV(file.path, file.source);
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

    console.log(`   ✅ Parse: ${transactions.length} transações encontradas`);

    // Check duplicates
    const toImport = [];
    const dupes = [];
    for (const tx of transactions) {
      if (isDuplicate(tx, existing)) {
        dupes.push(tx);
      } else {
        toImport.push(tx);
      }
    }

    console.log(`   🔍 Duplicatas: ${dupes.length} | Novas: ${toImport.length}`);

    // Import in batches of 50
    let imported = 0;
    const batchSize = 50;
    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize).map(tx => ({
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        entityType: tx.entityType,
        paymentMethod: tx.paymentMethod || "pix",
        status: tx.status || "paid",
        dueDate: tx.dueDate instanceof Date ? tx.dueDate : new Date(tx.dueDate),
        paidAt: tx.paidAt instanceof Date ? tx.paidAt : new Date(tx.paidAt),
        importedFrom: tx.importedFrom,
        accountSource: tx.importedFrom,
      }));

      try {
        const result = await callTRPC("import.bulk", {
          transactions: batch,
          source: tx.source || "import_pdf",
        });
        imported += result?.imported || batch.length;
        // Add imported to existing for next file dedup
        existing.push(...batch.map((t, idx) => ({
          ...t,
          id: Date.now() + idx,
          createdAt: new Date(),
        })));
      } catch (e) {
        console.error(`   ❌ Erro ao importar batch: ${e.message}`);
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

  // Final report
  console.log("\n" + "=".repeat(60));
  console.log("📊 RELATÓRIO FINAL DE IMPORTAÇÃO");
  console.log("=".repeat(60));
  console.log(`Total processadas: ${report.total}`);
  console.log(`✅ Importadas:     ${report.imported}`);
  console.log(`⏭️  Duplicatas:     ${report.duplicates}`);
  console.log(`❌ Erros:          ${report.errors}`);
  console.log("\nPor arquivo:");
  for (const f of report.byFile) {
    console.log(`  ${f.label}`);
    console.log(`    Parse: ${f.parsed} | Importadas: ${f.imported} | Duplicatas: ${f.duplicates}${f.error ? ` | Erro: ${f.error}` : ""}`);
  }
  console.log("=".repeat(60));
}

main().catch(console.error);
