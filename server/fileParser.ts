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
  type: "income" | "expense";
  entityType: "PJ" | "PF";
  dueDate?: Date;
  paymentMethod: "credit" | "debit" | "pix" | "cash" | "boleto" | "other";
  status: "paid" | "pending";
  notes?: string;
  boleto?: BoletoData;
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
      let type: "income" | "expense";
      if (!isNaN(rawValorNum) && rawValorNum < 0) {
        type = "expense";
      } else if (rawDetalhe && String(rawDetalhe).toLowerCase().includes("recebido")) {
        type = "income";
      } else if (rawDetalhe && String(rawDetalhe).toLowerCase().includes("enviado")) {
        type = "expense";
      } else if (rawDetalhe && (String(rawDetalhe).toLowerCase().includes("depósito") || String(rawDetalhe).toLowerCase().includes("deposito"))) {
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
      });
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

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Use pdftotext (poppler-utils) via temp file — reliable and fast
  const { execSync } = await import("child_process");
  const { writeFileSync, unlinkSync, mkdtempSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const dir = mkdtempSync(join(tmpdir(), "pdf-"));
  const inFile = join(dir, "input.pdf");
  try {
    writeFileSync(inFile, buffer);
    const result = execSync(`pdftotext "${inFile}" -`, { maxBuffer: 10 * 1024 * 1024 });
    return result.toString("utf-8");
  } finally {
    try { unlinkSync(inFile); } catch {}
    try { require("fs").rmdirSync(dir); } catch {}
  }
}

export async function parsePdf(buffer: Buffer): Promise<ParsedTransaction[]> {
  const text = await extractPdfText(buffer);

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
