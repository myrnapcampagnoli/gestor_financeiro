import * as XLSX from "xlsx";
import { parse as csvParse } from "csv-parse/sync";

export interface BoletoData {
  linhaDigitavel?: string;
  codigoBarras?: string;
  vencimento?: Date;
  valor?: number;
  beneficiario?: string;
  pagador?: string;
  isBoleto: boolean;
}

export interface ParsedTransaction {
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  entityType: "PJ" | "PF";
  dueDate?: Date;
  paymentMethod: "credit" | "debit" | "pix" | "cash" | "boleto" | "other";
  status: "paid" | "pending";
  notes?: string;
  boleto?: BoletoData;
  isTransferCandidate?: boolean; // true when detected as possible transfer between own accounts
  accountSource?: string; // e.g. "Nubank PF", "Banco 301 PJ"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Math.abs(raw);
  let str = String(raw).replace(/[R$\s]/g, "").trim();
  // Detect format: if both . and , exist, determine which is decimal separator
  const hasDot = str.includes(".");
  const hasComma = str.includes(",");
  if (hasDot && hasComma) {
    // e.g. "1.250,50" (BR) or "1,250.50" (EN)
    const lastDot = str.lastIndexOf(".");
    const lastComma = str.lastIndexOf(",");
    if (lastComma > lastDot) {
      // BR format: 1.250,50 → remove dots, replace comma with dot
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // EN format: 1,250.50 → remove commas
      str = str.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Could be BR decimal: 250,50 or thousands: 1,250
    const parts = str.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal comma: 250,50
      str = str.replace(",", ".");
    } else {
      // Thousands comma: 1,250
      str = str.replace(/,/g, "");
    }
  } else if (hasDot && !hasComma) {
    // Could be EN decimal: 250.50 or BR thousands: 1.250
    const parts = str.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal dot: 250.50 - keep as is
    } else {
      // Thousands dot: 1.250 → remove dots
      str = str.replace(/\./g, "");
    }
  }
  const val = parseFloat(str);
  return isNaN(val) ? null : Math.abs(val);
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  // Excel serial date number
  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }
  const str = String(raw).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const date = new Date(year, parseInt(m) - 1, parseInt(d));
    if (!isNaN(date.getTime())) return date;
  }
  // ISO or other
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function detectType(raw: unknown, amount: number): "income" | "expense" {
  const str = String(raw || "").toLowerCase();
  if (
    str.includes("entrada") ||
    str.includes("crédito") ||
    str.includes("credito") ||
    str.includes("receita") ||
    str.includes("income") ||
    str.includes("credit")
  )
    return "income";
  if (
    str.includes("saída") ||
    str.includes("saida") ||
    str.includes("débito") ||
    str.includes("debito") ||
    str.includes("despesa") ||
    str.includes("expense") ||
    str.includes("debit")
  )
    return "expense";
  // Negative amounts are expenses
  const rawNum = typeof raw === "number" ? raw : parseFloat(String(raw || "").replace(",", "."));
  if (!isNaN(rawNum) && rawNum < 0) return "expense";
  return "expense"; // default
}

function detectEntityType(text: string): "PJ" | "PF" {
  const t = text.toLowerCase();
  if (
    t.includes("cnpj") ||
    t.includes("empresa") ||
    t.includes("ltda") ||
    t.includes("s.a.") ||
    t.includes("eireli") ||
    t.includes("mei") ||
    t.includes("pj")
  )
    return "PJ";
  return "PF";
}

function detectPaymentMethod(text: string): "credit" | "debit" | "pix" | "cash" | "boleto" | "other" {
  const t = text.toLowerCase();
  if (t.includes("pix")) return "pix";
  if (t.includes("boleto")) return "boleto";
  if (t.includes("crédito") || t.includes("credito") || t.includes("credit")) return "credit";
  if (t.includes("débito") || t.includes("debito") || t.includes("debit")) return "debit";
  if (t.includes("dinheiro") || t.includes("espécie") || t.includes("cash")) return "cash";
  return "other";
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

export function parseCsv(buffer: Buffer): ParsedTransaction[] {
  const text = buffer.toString("utf-8");
  let records: Record<string, string>[];

  // Auto-detect delimiter: count occurrences in first line
  const firstLine = text.split("\n")[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  try {
    records = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch {
    // Try the other delimiter as fallback
    const fallback = delimiter === ";" ? "," : ";";
    records = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: fallback,
      relax_column_count: true,
    }) as Record<string, string>[];
  }

  return records
    .map((row) => {
      const keys = Object.keys(row).map((k) => k.toLowerCase());
      const get = (candidates: string[]) => {
        for (const c of candidates) {
          const k = keys.find((k) => k.includes(c));
          if (k) return row[Object.keys(row)[keys.indexOf(k)]];
        }
        return "";
      };

      const rawAmount = get(["valor", "amount", "value", "montante"]);
      const amount = parseAmount(rawAmount);
      if (!amount) return null;

      const description =
        get(["descri", "description", "historico", "histórico", "memo", "detalhe"]) ||
        get(["lancamento", "lançamento", "item"]) ||
        "Transação importada";

      const rawDate = get(["data", "date", "vencimento", "competencia", "competência"]);
      const dueDate = parseDate(rawDate) || undefined;

      const rawType = get(["tipo", "type", "natureza"]);
      const type = detectType(rawType || rawAmount, amount);

      const allText = Object.values(row).join(" ");
      const entityType = detectEntityType(allText);
      const paymentMethod = detectPaymentMethod(allText);

      const rawStatus = get(["status", "situacao", "situação", "pago", "paid"]);
      const status: "paid" | "pending" =
        rawStatus && (rawStatus.toLowerCase().includes("pago") || rawStatus.toLowerCase().includes("paid"))
          ? "paid"
          : "pending";

      return {
        description: String(description).trim().substring(0, 255),
        amount,
        type,
        entityType,
        dueDate,
        paymentMethod,
        status,
      } as ParsedTransaction;
    })
    .filter(Boolean) as ParsedTransaction[];
}

// ─── Excel Parser ────────────────────────────────────────────────────────────

export function parseExcel(buffer: Buffer): ParsedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const results: ParsedTransaction[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    for (const row of rows) {
      const keys = Object.keys(row).map((k) => String(k).toLowerCase());
      const get = (candidates: string[]) => {
        for (const c of candidates) {
          const k = keys.find((k) => k.includes(c));
          if (k !== undefined) return row[Object.keys(row)[keys.indexOf(k)]];
        }
        return "";
      };

      const rawAmount = get(["valor", "amount", "value", "montante", "total"]);
      const amount = parseAmount(rawAmount);
      if (!amount || amount === 0) continue;

      const description =
        String(
          get(["descri", "description", "historico", "histórico", "memo", "detalhe", "lancamento", "lançamento", "item", "nome"]) || ""
        ).trim() || "Transação importada";

      if (description.toLowerCase() === "descrição" || description.toLowerCase() === "description") continue; // header row

      const rawDate = get(["data", "date", "vencimento", "competencia", "competência", "pagamento"]);
      const dueDate = parseDate(rawDate) || undefined;

      const rawType = get(["tipo", "type", "natureza", "categoria"]);
      // Detect income/expense:
      // 1. If raw value is negative number → expense
      // 2. If "Detalhe" column says "Recebido" → income, "Enviado" → expense
      // 3. Otherwise fall back to detectType
      const rawDetalhe = get(["detalhe", "detail", "descrição", "descricao"]);
      const rawValorNum = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount || "").replace(/[R$\s]/g, "").replace(",", "."));
      let type: "income" | "expense" | "transfer";
      let isTransferCandidate = false;
      const detalheStr = rawDetalhe ? String(rawDetalhe).toLowerCase() : "";
      if (!isNaN(rawValorNum) && rawValorNum < 0) {
        type = "expense";
      } else if (detalheStr.includes("recebido")) {
        type = "income";
      } else if (detalheStr.includes("enviado")) {
        // "Enviado" can be a transfer between own accounts — mark as candidate
        type = "transfer";
        isTransferCandidate = true;
      } else if (detalheStr.includes("depósito") || detalheStr.includes("deposito")) {
        type = "income";
      } else {
        type = detectType(rawType || rawAmount, amount);
      }

      const allText = Object.values(row).map(String).join(" ");
      const entityType = detectEntityType(allText);
      const paymentMethod = detectPaymentMethod(allText);

      const rawStatus = get(["status", "situacao", "situação", "pago", "paid"]);
      const status: "paid" | "pending" =
        rawStatus &&
        (String(rawStatus).toLowerCase().includes("pago") || String(rawStatus).toLowerCase().includes("paid"))
          ? "paid"
          : "pending";

      results.push({
        description: description.substring(0, 255),
        amount,
        type,
        entityType,
        dueDate,
        paymentMethod,
        status,
        isTransferCandidate,
      });
    }
  }

  // Post-process: detect transfer pairs (same amount within ±1 day)
  // If an "Enviado" (transfer candidate) has a matching "Recebido" (income) with same amount ±1 day,
  // it's almost certainly an internal transfer — mark both as transfer
  const candidates = results.filter(r => r.isTransferCandidate);
  for (const candidate of candidates) {
    const match = results.find(r =>
      r !== candidate &&
      r.type === 'income' &&
      Math.abs(r.amount - candidate.amount) < 0.02 &&
      r.dueDate && candidate.dueDate &&
      Math.abs(r.dueDate.getTime() - candidate.dueDate.getTime()) <= 86400000 // ±1 day
    );
    if (match) {
      match.type = 'transfer';
      match.isTransferCandidate = true;
    }
  }

  return results;
}

// ─── Boleto Parser ──────────────────────────────────────────────────────────

export function extractBoleto(text: string): BoletoData {
  const result: BoletoData = { isBoleto: false };

  // Linha digitável: padrão FEBRABAN - 5 grupos de dígitos separados por espaços ou pontos
  // Formato: AAAAA.BBBBB CCCCC.CCCCCC DDDDD.DDDDDD E FFFFFFFFFFFFFFFFF
  // ou sem pontos/espaços (47 ou 48 dígitos)
  const linhaDigitavelPatterns = [
    // Com pontos e espaços (formato visual padrão bancas)
    /(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14,15})/,
    // Concessionárias: 4 grupos de 12 dígitos separados por espaços (ex: Ultragaz, Sanepar, Copel)
    /(\d{11,12}\s+\d{11,12}\s+\d{11,12}\s+\d{11,12})/,
    // Compacto sem formatação (47-48 dígitos)
    /(?<![\d])(\d{47,48})(?![\d])/,
    // Linha digitável com pontos (sem espaços)
    /(\d{5}\.\d{5}\d{5}\.\d{6}\d{5}\.\d{6}\d{1}\d{14,15})/,
    // 3 grupos de 10 dígitos (formato alternativo)
    /(\d{10}\s+\d{10}\s+\d{10})/,
  ];

  for (const pattern of linhaDigitavelPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.linhaDigitavel = match[1].replace(/\s+/g, ' ').trim();
      result.isBoleto = true;
      break;
    }
  }

  // Código de barras: 44 dígitos consecutivos
  if (!result.codigoBarras) {
    const cbMatch = text.match(/(?<![\d])(\d{44})(?![\d])/);
    if (cbMatch) {
      result.codigoBarras = cbMatch[1];
      result.isBoleto = true;
    }
  }

  // Vencimento do boleto - padrões específicos de boleto
  const vencPatterns = [
    /vencimento[:\s]+([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i,
    /data\s+de\s+vencimento[:\s]+([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i,
    /vence\s+em[:\s]+([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i,
    /vencto[:\s]+([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i,
    /vencimento[:\s]+(\d{2}\.\d{2}\.\d{4})/i,
    // Padrão Ultragaz/concessionárias: "Vencimento" em linha, data na próxima linha
    /Vencimento\s*\n\s*([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i,
    // Padrão com múltiplas linhas entre Vencimento e a data (como Ultragaz que tem outras infos no meio)
    /Vencimento[\s\S]{0,100}?([\d]{2}\/[\d]{2}\/[\d]{4})/i,
  ];
  for (const p of vencPatterns) {
    const m = text.match(p);
    if (m) {
      const dateStr = m[1].replace(/\./g, '/');
      const parsed = parseDate(dateStr);
      if (parsed) { result.vencimento = parsed; break; }
    }
  }

  // Valor do boleto
  const valorPatterns = [
    /valor\s+do\s+documento[:\s]+R?\$?\s*([\d.,]+)/i,
    /valor\s+cobrado[:\s]+R?\$?\s*([\d.,]+)/i,
    /valor[:\s]+R?\$?\s*([\d.,]+)/i,
    /total[:\s]+R?\$?\s*([\d.,]+)/i,
    /R\$\s*([\d.,]+)/,
  ];
  for (const p of valorPatterns) {
    const m = text.match(p);
    if (m) {
      const val = parseAmount(m[1]);
      if (val && val > 0) { result.valor = val; break; }
    }
  }

  // Beneficiário (quem emite o boleto)
  const benefPatterns = [
    /benefici[áa]rio[:\s]+([^\n]+)/i,
    /cedente[:\s]+([^\n]+)/i,
    /empresa[:\s]+([^\n]+)/i,
    /raz[ãa]o\s+social[:\s]+([^\n]+)/i,
  ];
  for (const p of benefPatterns) {
    const m = text.match(p);
    if (m) { result.beneficiario = m[1].trim().substring(0, 100); break; }
  }

  // Se tem linha digitável ou código de barras, é boleto
  if (result.linhaDigitavel || result.codigoBarras) {
    result.isBoleto = true;
  }

  return result;
}

// ─── PDF Parser ──────────────────────────────────────────────────────────────

// PDF text item with position
interface PdfItem {
  str: string;
  x: number;
  y: number;
}

async function extractPdfItems(buffer: Buffer): Promise<PdfItem[][]> {
  // Use pdfjs-dist — pure JS, works in production without system dependencies
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  const uint8 = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise;
  const pages: PdfItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: PdfItem[] = content.items
      .filter((item: any) => "str" in item && item.str.trim())
      .map((item: any) => ({
        str: item.str as string,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
      }));
    pages.push(items);
  }
  return pages;
}

// ── Nubank extrato parser ──────────────────────────────────────────────────────
// Layout (x coordinates, approximate):
//   Date: x≈58, format "DD JAN 2026"
//   "Total de entradas/saídas": x≈120
//   Amount with sign ("+ X" or "- X"): x≈490-515
//   Transaction type: x≈120 (next row)
//   Beneficiary: x≈261 (right column)
//   Individual amount: x≈490-515
function parseNubankExtrato(pages: PdfItem[][]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const MONTH_MAP: Record<string, number> = {
    JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
    JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11,
  };

  for (const items of pages) {
    // Group items by approximate Y position (within ±8px = same row)
    const rowMap: Map<number, PdfItem[]> = new Map();
    for (const item of items) {
      let rowKey = -1;
      const existingKeys = Array.from(rowMap.keys());
      for (const k of existingKeys) {
        if (Math.abs(k - item.y) <= 8) { rowKey = k; break; }
      }
      if (rowKey === -1) { rowKey = item.y; rowMap.set(rowKey, []); }
      rowMap.get(rowKey)!.push(item);
    }

    // Sort rows by Y descending (top to bottom in PDF coordinates)
    const sortedRows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, rowItems]) => rowItems.sort((a, b) => a.x - b.x));

    let currentDate: Date | null = null;
    let currentDirection: "income" | "expense" = "expense";

    for (let ri = 0; ri < sortedRows.length; ri++) {
      const row = sortedRows[ri];
      const rowText = row.map(r => r.str).join(" ").trim();

      // Skip footer/header lines
      if (/Tem alguma dúvida|Caso a solução|Ouvidoria|VALORES EM R\$|Saldo (final|inicial)|Rendimento|nubank\.com/i.test(rowText)) continue;
      if (/^Myrna Perez|CPF|Agência 0001 Conta|9172057-4/i.test(rowText)) continue;

      // Detect date row: contains "DD MMM YYYY" pattern at left (x<80)
      const fullDateMatch = rowText.match(/(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
      if (fullDateMatch && row.some(r => r.x < 90)) {
        const [, day, mon, year] = fullDateMatch;
        const month = MONTH_MAP[mon.toUpperCase()];
        if (month !== undefined) {
          currentDate = new Date(parseInt(year), month, parseInt(day));
        }
        // Check direction on same row
        if (/total de entradas/i.test(rowText)) currentDirection = "income";
        else if (/total de saídas/i.test(rowText)) currentDirection = "expense";
        continue;
      }

      // Detect "Total de entradas/saídas" row (without date, continuation of previous date)
      if (/^total de (entradas|saídas)/i.test(rowText) && row.some(r => r.x < 150)) {
        currentDirection = /entradas/i.test(rowText) ? "income" : "expense";
        continue;
      }

      // Skip "Movimentações" header
      if (/^Movimentações$/i.test(rowText)) continue;

      // Transaction rows: type at x≈120, beneficiary at x≈261, amount at x≈490+
      const typeItems = row.filter(r => r.x >= 100 && r.x < 255);
      const benefItems = row.filter(r => r.x >= 255 && r.x < 490);
      const amtItems = row.filter(r => r.x >= 480);

      if (!currentDate) continue;
      if (typeItems.length === 0) continue;

      const typeText = typeItems.map(r => r.str).join(" ").trim();
      const benefText = benefItems.map(r => r.str).join(" ").trim();
      const amtText = amtItems.map(r => r.str).join(" ").trim();

      // Skip sub-total rows
      if (/^total de/i.test(typeText)) continue;
      // Skip pure number rows (continuation of description)
      if (/^\d[\d.,]*$/.test(typeText)) continue;
      // Skip very short or numeric-only
      if (typeText.length < 3) continue;

      const amount = parseAmount(amtText);
      if (!amount || amount <= 0) continue;

      // Build description: prefer beneficiary, fall back to type
      let description = benefText.length > 3 ? benefText : typeText;
      // Clean up CNPJ/CPF patterns from description for brevity
      description = description.replace(/\s*-\s*[\d.\/\-]+\s*-\s*/g, " - ").trim();

      results.push({
        description: description.substring(0, 255),
        amount,
        type: currentDirection,
        entityType: "PF",
        dueDate: currentDate,
        paymentMethod: detectPaymentMethod(typeText),
        status: currentDate < new Date() ? "paid" : "pending",
        notes: "Extrato Nubank importado",
        accountSource: "Nubank PF",
      });
    }
  }

  return results;
}

// ── Banco 301 extrato parser ──────────────────────────────────────────────────
// Layout (x coordinates, approximate):
//   Date: x≈50, format DD/MM/YYYY
//   Categoria (Pessoa Jurídica): x≈102
//   Lançamento (PIX/Pagamento/Outros): x≈161
//   Descrição: x≈215
//   Entrada: x≈390-450 (R$ X,XX or "-")
//   Saída: x≈450-540 (R$ X,XX or "-")
function parseBanco301Extrato(pages: PdfItem[][]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  for (const items of pages) {
    // Group items by approximate Y position (within ±10px = same row)
    const rowMap: Map<number, PdfItem[]> = new Map();
    for (const item of items) {
      let rowKey = -1;
      const existingKeys = Array.from(rowMap.keys());
      for (const k of existingKeys) {
        if (Math.abs(k - item.y) <= 10) { rowKey = k; break; }
      }
      if (rowKey === -1) { rowKey = item.y; rowMap.set(rowKey, []); }
      rowMap.get(rowKey)!.push(item);
    }

    // Sort rows by Y descending (top to bottom in PDF coordinates)
    const sortedRows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, rowItems]) => rowItems.sort((a, b) => a.x - b.x));

    let currentDate: Date | null = null;

    for (const row of sortedRows) {
      const rowText = row.map(r => r.str).join(" ").trim();

      // Skip header/footer rows
      if (/Extrato gerado|Movimentações|Total de entradas|Total de saídas|^Lançamento|^\d+ de \d+$|CNPJ|Banco 301|De \d{2}\/\d{2}/i.test(rowText)) continue;
      if (/^(Data|Categoria|Saldo do dia|Entrada|Saída|Pessoa|Jurídica|Física)$/i.test(rowText)) continue;
      if (/^MYRNA|PEREZ|CAMPAGNOLI|APOIO|GESTAO|SAUDE$/i.test(rowText)) continue;

      // Date item: x≈50, format DD/MM/YYYY
      const dateItem = row.find(r => r.x < 75 && /^\d{2}\/\d{2}\/\d{4}$/.test(r.str.trim()));
      if (dateItem) {
        currentDate = parseDate(dateItem.str) || currentDate;
      }

      // Lançamento item: x≈161 (PIX, Pagamento, Outros, TED, etc.)
      const lancItem = row.find(r => r.x >= 140 && r.x < 215 && /^(PIX|Pagamento|Outros|TED|DOC|Transferência|Débito|Crédito|Boleto)/i.test(r.str.trim()));
      if (!lancItem) continue;

      // Description: x≈215 to 390
      const descItems = row.filter(r => r.x >= 215 && r.x < 390);
      const description = descItems.map(r => r.str).join(" ").trim();

      // Entrada: x≈390-455 (R$ X,XX or "-")
      const entradaItems = row.filter(r => r.x >= 390 && r.x < 455);
      const entradaText = entradaItems.map(r => r.str).join(" ").trim();
      const entradaVal = entradaText !== "-" && entradaText ? parseAmount(entradaText) : null;

      // Saída: x≈455-560 (R$ X,XX or "-")
      const saidaItems = row.filter(r => r.x >= 455 && r.x < 560);
      const saidaText = saidaItems.map(r => r.str).join(" ").trim();
      const saidaVal = saidaText !== "-" && saidaText ? parseAmount(saidaText) : null;

      const amount = entradaVal || saidaVal;
      if (!amount || amount <= 0) continue;
      if (!description || description.length < 2) continue;

      const type: "income" | "expense" = entradaVal ? "income" : "expense";
      const lancText = lancItem.str.trim();

      results.push({
        description: description.substring(0, 255),
        amount,
        type,
        entityType: "PJ",
        dueDate: currentDate || undefined,
        paymentMethod: detectPaymentMethod(lancText),
        status: currentDate && currentDate < new Date() ? "paid" : "pending",
        notes: "Extrato Banco 301 importado",
        accountSource: "Banco 301 PJ",
      });
    }
  }

  return results;
}

export async function parsePdf(buffer: Buffer): Promise<ParsedTransaction[]> {
  const pages = await extractPdfItems(buffer);
  const text = pages.map(items => items.map(i => i.str).join(" ")).join("\n");

  // ── Boleto detection first ────────────────────────────────────────────────
  const boletoData = extractBoleto(text);
  if (boletoData.isBoleto && (boletoData.linhaDigitavel || boletoData.codigoBarras)) {
    // It's a boleto — return a single transaction with boleto data
    const description = boletoData.beneficiario
      ? `Boleto — ${boletoData.beneficiario}`
      : "Boleto importado";
    return [
      {
        description: description.substring(0, 255),
        amount: boletoData.valor || 0,
        type: "expense",
        entityType: detectEntityType(text.substring(0, 500)),
        dueDate: boletoData.vencimento,
        paymentMethod: "boleto",
        status: "pending",
        notes: boletoData.linhaDigitavel
          ? `Linha digitável: ${boletoData.linhaDigitavel}`
          : boletoData.codigoBarras
          ? `Código de barras: ${boletoData.codigoBarras}`
          : undefined,
        boleto: boletoData,
      },
    ];
  }

  // ── Banco 301 detection ──────────────────────────────────────────────────
  const isBanco301 = /Banco 301|33\.932\.723\/0001-88|3111376-4/i.test(text);
  if (isBanco301) {
    const results = parseBanco301Extrato(pages);
    if (results.length > 0) return results;
  }

  // ── Nubank detection ─────────────────────────────────────────────────────
  const isNubank = /9172057-4|Agência 0001 Conta/i.test(text) && /Movimentações|Total de entradas|Total de saídas/i.test(text);
  if (isNubank) {
    const results = parseNubankExtrato(pages);
    if (results.length > 0) return results;
  }

  // ── Generic bank statement (fallback) ────────────────────────────────────
  const results: ParsedTransaction[] = [];

  // Try to extract line-by-line transactions
  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);

  // Pattern: date + description + amount on same or adjacent lines
  const amountPattern = /R?\$?\s*([\d.,]+)/g;
  const datePattern = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/;

  // First try: look for structured lines with date + description + amount
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(datePattern);
    const amounts: number[] = [];
    let m: RegExpExecArray | null;
    amountPattern.lastIndex = 0;
    while ((m = amountPattern.exec(line)) !== null) {
      const val = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(val) && val > 0 && val < 1_000_000) amounts.push(val);
    }

    if (dateMatch && amounts.length > 0) {
      const amount = amounts[amounts.length - 1]; // usually last amount is the value
      const dueDate = parseDate(dateMatch[1]) || undefined;

      // Description: remove date and amounts from line
      let description = line
        .replace(datePattern, "")
        .replace(/R?\$?\s*[\d.,]+/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!description || description.length < 3) {
        description = lines[i - 1] || lines[i + 1] || "Transação PDF";
      }

      results.push({
        description: description.substring(0, 255),
        amount,
        type: "expense",
        entityType: detectEntityType(text.substring(0, 500)),
        dueDate,
        paymentMethod: detectPaymentMethod(line),
        status: "pending",
      });
    }
  }

  // Fallback: if nothing found, try to extract a single bill amount
  if (results.length === 0) {
    const totalPatterns = [
      /total[:\s]+R?\$?\s*([\d.,]+)/i,
      /valor[:\s]+R?\$?\s*([\d.,]+)/i,
      /vencimento.*?R?\$?\s*([\d.,]+)/i,
      /R\$\s*([\d.,]+)/,
    ];

    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
        if (!isNaN(amount) && amount > 0) {
          const dateMatch = text.match(datePattern);
          results.push({
            description: "Documento PDF importado",
            amount,
            type: "expense",
            entityType: detectEntityType(text.substring(0, 500)),
            dueDate: dateMatch ? parseDate(dateMatch[1]) || undefined : undefined,
            paymentMethod: detectPaymentMethod(text),
            status: "pending",
          });
          break;
        }
      }
    }
  }

  return results;
}
