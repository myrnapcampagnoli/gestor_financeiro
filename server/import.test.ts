import { describe, expect, it } from "vitest";
import { parseCsv, parseExcel } from "./fileParser";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as XLSX from "xlsx";

const mockUser = {
  id: 9999,
  openId: "test-user-import",
  email: "test@example.com",
  name: "Test User",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  gmailAccessToken: null,
  gmailRefreshToken: null,
  gmailTokenExpiry: null,
};

function createTestContext(): TrpcContext {
  return {
    user: mockUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── CSV Parser Tests ─────────────────────────────────────────────────────────

describe("parseCsv", () => {
  it("parses a simple CSV with comma delimiter", () => {
    const csv = `Data,Descrição,Valor,Tipo
01/03/2026,Conta de luz,250.50,Saída
15/03/2026,Salário,5000.00,Entrada`;
    const result = parseCsv(Buffer.from(csv, "utf-8"));
    expect(result.length).toBe(2);
    expect(result[0].description).toBe("Conta de luz");
    expect(result[0].amount).toBe(250.5);
    expect(result[0].type).toBe("expense");
    expect(result[1].description).toBe("Salário");
    expect(result[1].amount).toBe(5000);
    expect(result[1].type).toBe("income");
  });

  it("parses CSV with semicolon delimiter", () => {
    const csv = `Data;Descrição;Valor\n10/03/2026;Aluguel;1200`;
    const result = parseCsv(Buffer.from(csv, "utf-8"));
    expect(result.length).toBe(1);
    expect(result[0].description).toBe("Aluguel");
    expect(result[0].amount).toBe(1200);
  });

  it("parses R$ formatted amounts", () => {
    // In CSV, R$ 99,90 with comma delimiter would be split into two columns
    // Use semicolon CSV to test R$ amount with comma decimal
    const csv = `Descrição;Valor\nInternet;R$ 99,90`;
    const result = parseCsv(Buffer.from(csv, "utf-8"));
    expect(result.length).toBe(1);
    expect(result[0].amount).toBe(99.9);
  });

  it("skips rows with no valid amount", () => {
    const csv = `Descrição,Valor\nSem valor,\nCom valor,100`;
    const result = parseCsv(Buffer.from(csv, "utf-8"));
    expect(result.length).toBe(1);
    expect(result[0].amount).toBe(100);
  });

  it("detects PIX payment method", () => {
    const csv = `Descrição,Valor,Pagamento\nPIX recebido,500,PIX`;
    const result = parseCsv(Buffer.from(csv, "utf-8"));
    expect(result[0].paymentMethod).toBe("pix");
  });
});

// ─── Excel Parser Tests ───────────────────────────────────────────────────────

describe("parseExcel", () => {
  function makeExcelBuffer(rows: Record<string, unknown>[]): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  }

  it("parses a basic Excel file", () => {
    const buf = makeExcelBuffer([
      { Descrição: "Consulta médica", Valor: 350, Data: "05/03/2026" },
      { Descrição: "Honorários", Valor: 8000, Data: "20/03/2026" },
    ]);
    const result = parseExcel(buf);
    expect(result.length).toBe(2);
    expect(result[0].description).toBe("Consulta médica");
    expect(result[0].amount).toBe(350);
    expect(result[1].description).toBe("Honorários");
    expect(result[1].amount).toBe(8000);
  });

  it("skips rows with zero or missing amount", () => {
    const buf = makeExcelBuffer([
      { Descrição: "Linha vazia", Valor: 0 },
      { Descrição: "Linha válida", Valor: 100 },
    ]);
    const result = parseExcel(buf);
    expect(result.length).toBe(1);
    expect(result[0].amount).toBe(100);
  });

  it("detects PJ entity type from CNPJ keyword", () => {
    const buf = makeExcelBuffer([
      { Descrição: "Nota fiscal CNPJ empresa", Valor: 500 },
    ]);
    const result = parseExcel(buf);
    expect(result[0].entityType).toBe("PJ");
  });

  it("defaults to PF entity type", () => {
    const buf = makeExcelBuffer([
      { Descrição: "Compra pessoal", Valor: 200 },
    ]);
    const result = parseExcel(buf);
    expect(result[0].entityType).toBe("PF");
  });
});

// ─── import.bulk tRPC procedure tests ────────────────────────────────────────

describe("import.bulk", () => {
  it("rejects empty description", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.import.bulk({
        transactions: [
          {
            description: "", // invalid
            amount: 100,
            type: "expense",
            entityType: "PF",
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("rejects negative amount", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.import.bulk({
        transactions: [
          {
            description: "Test",
            amount: -50, // invalid
            type: "expense",
            entityType: "PF",
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("accepts valid source enum values", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw on valid source
    await expect(
      caller.import.bulk({
        transactions: [],
        source: "import_csv",
      })
    ).resolves.toMatchObject({ success: true, imported: 0 });
  });
});
