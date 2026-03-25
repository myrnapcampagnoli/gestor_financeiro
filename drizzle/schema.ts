import { boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  gmailAccessToken: text("gmailAccessToken"),
  gmailRefreshToken: text("gmailRefreshToken"),
  gmailTokenExpiry: timestamp("gmailTokenExpiry"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6B7280"),
  icon: varchar("icon", { length: 50 }).default("tag"),
  type: mysqlEnum("type", ["PJ", "PF", "both"]).default("both").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Category = typeof categories.$inferSelect;

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  bank: varchar("bank", { length: 100 }),
  type: mysqlEnum("type", ["PJ", "PF"]).notNull(),
  accountType: mysqlEnum("accountType", ["checking", "savings", "credit", "other"]).default("checking"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0.00"),
  color: varchar("color", { length: 7 }).default("#1F4E79"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Account = typeof accounts.$inferSelect;

export const installmentGroups = mysqlTable("installmentGroups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  installmentCount: int("installmentCount").notNull(),
  installmentAmount: decimal("installmentAmount", { precision: 15, scale: 2 }).notNull(),
  entityType: mysqlEnum("entityType", ["PJ", "PF"]).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["credit", "debit", "pix", "cash", "boleto", "other"]).default("credit"),
  categoryId: int("categoryId"),
  startDate: timestamp("startDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InstallmentGroup = typeof installmentGroups.$inferSelect;

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId"),
  categoryId: int("categoryId"),
  installmentGroupId: int("installmentGroupId"),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["income", "expense", "transfer"]).notNull(),
  entityType: mysqlEnum("entityType", ["PJ", "PF"]).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["credit", "debit", "pix", "cash", "boleto", "other"]).default("pix"),
  status: mysqlEnum("status", ["paid", "pending", "overdue", "legal", "scheduled"]).default("pending").notNull(),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  cnpjCpf: varchar("cnpjCpf", { length: 20 }),
  source: mysqlEnum("source", ["manual", "import_pdf", "import_csv", "import_excel", "gmail"]).default("manual"),
  importedFrom: varchar("importedFrom", { length: 255 }),
  isRecurring: boolean("isRecurring").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  transactionId: int("transactionId"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["due_soon", "overdue", "imported", "info"]).default("info").notNull(),
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;

export const gmailImports = mysqlTable("gmailImports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  gmailMessageId: varchar("gmailMessageId", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  sender: varchar("sender", { length: 255 }),
  documentType: mysqlEnum("documentType", ["extrato", "fatura_cartao", "conta_servico", "boleto", "other"]).default("other"),
  status: mysqlEnum("status", ["pending", "imported", "skipped", "error"]).default("pending"),
  transactionsImported: int("transactionsImported").default(0),
  rawData: text("rawData"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GmailImport = typeof gmailImports.$inferSelect;