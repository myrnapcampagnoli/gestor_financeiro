import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock user for tests
const mockUser = {
  id: 9999,
  openId: "test-user-financeiro",
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

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const cleared: any[] = [];
    const ctx: TrpcContext = {
      user: mockUser,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: (name: string, opts: any) => cleared.push({ name, opts }) } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.name).toBe("app_session_id");
  });
});

describe("gmail.isConnected", () => {
  it("returns false when no gmail token", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gmail.isConnected();
    expect(result.connected).toBe(false);
  });

  it("returns true when gmail token exists", async () => {
    const ctx: TrpcContext = {
      ...createTestContext(),
      user: { ...mockUser, gmailAccessToken: "some-token" } as any,
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gmail.isConnected();
    expect(result.connected).toBe(true);
  });
});

describe("gmail.getAuthUrl", () => {
  it("returns a valid Google OAuth URL", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gmail.getAuthUrl({ origin: "https://example.com" });
    expect(result.url).toContain("accounts.google.com");
    expect(result.url).toContain("gmail.readonly");
    expect(result.url).toContain("example.com");
  });
});

describe("export.csv", () => {
  it("returns a CSV string with headers", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.export.csv();
    expect(result.csv).toContain("Data");
    expect(result.csv).toContain("Descrição");
    expect(result.csv).toContain("Valor");
    expect(result.csv).toContain("PJ/PF");
    expect(result.csv).toContain("Status");
  });
});

describe("installments.create input validation", () => {
  it("requires at least 2 installments", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.installments.create({
        description: "Test",
        totalAmount: 100,
        installmentCount: 1, // invalid: min is 2
        entityType: "PF",
        startDate: new Date(),
      })
    ).rejects.toThrow();
  });

  it("requires positive total amount", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.installments.create({
        description: "Test",
        totalAmount: -100, // invalid
        installmentCount: 3,
        entityType: "PF",
        startDate: new Date(),
      })
    ).rejects.toThrow();
  });
});

describe("transactions.create input validation", () => {
  it("requires description", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.transactions.create({
        description: "", // invalid: empty
        amount: 100,
        type: "expense",
        entityType: "PF",
      })
    ).rejects.toThrow();
  });

  it("requires positive amount", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.transactions.create({
        description: "Test",
        amount: 0, // invalid: must be positive
        type: "expense",
        entityType: "PF",
      })
    ).rejects.toThrow();
  });
});
