import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { accounts, categories, gmailImports, installmentGroups, notifications, transactions, users } from "../drizzle/schema";
import type { InsertTransaction, InsertUser } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserGmailTokens(userId: number, accessToken: string, refreshToken: string, expiry: Date) {
  const db = await getDb(); if (!db) return;
  await db.update(users).set({ gmailAccessToken: accessToken, gmailRefreshToken: refreshToken, gmailTokenExpiry: expiry }).where(eq(users.id, userId));
}

export async function getTransactions(userId: number, filters?: { entityType?: 'PJ'|'PF'; status?: string; type?: string; from?: Date; to?: Date; excludeLegal?: boolean; }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [eq(transactions.userId, userId)];
  if (filters?.entityType) conditions.push(eq(transactions.entityType, filters.entityType));
  if (filters?.status) conditions.push(eq(transactions.status, filters.status as any));
  if (filters?.type) conditions.push(eq(transactions.type, filters.type as any));
  if (filters?.from) conditions.push(gte(transactions.dueDate, filters.from));
  if (filters?.to) conditions.push(lte(transactions.dueDate, filters.to));
  if (filters?.excludeLegal) conditions.push(ne(transactions.status, 'legal'));
  return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.dueDate));
}

export async function createTransaction(data: InsertTransaction) {
  const db = await getDb(); if (!db) throw new Error('DB not available');
  return db.insert(transactions).values(data);
}

export async function updateTransaction(id: number, userId: number, data: Partial<InsertTransaction>) {
  const db = await getDb(); if (!db) throw new Error('DB not available');
  await db.update(transactions).set({ ...data, updatedAt: new Date() }).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function deleteTransaction(id: number, userId: number) {
  const db = await getDb(); if (!db) throw new Error('DB not available');
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function markTransactionPaid(id: number, userId: number) {
  const db = await getDb(); if (!db) throw new Error('DB not available');
  await db.update(transactions).set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() }).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function getDashboardSummary(userId: number) {
  const db = await getDb(); if (!db) return null;
  const now = new Date();
  await db.update(transactions).set({ status: 'overdue', updatedAt: new Date() }).where(and(eq(transactions.userId, userId), eq(transactions.status, 'pending'), lte(transactions.dueDate, now)));
  const allTx = await db.select().from(transactions).where(and(eq(transactions.userId, userId), ne(transactions.status, 'legal')));
  const sum = (arr: typeof allTx) => arr.reduce((s, t) => s + parseFloat(t.amount as string), 0);
  const pjIncome = sum(allTx.filter(t => t.entityType==='PJ'&&t.type==='income'&&t.status==='paid'));
  const pjExpense = sum(allTx.filter(t => t.entityType==='PJ'&&t.type==='expense'&&t.status==='paid'));
  const pfIncome = sum(allTx.filter(t => t.entityType==='PF'&&t.type==='income'&&t.status==='paid'));
  const pfExpense = sum(allTx.filter(t => t.entityType==='PF'&&t.type==='expense'&&t.status==='paid'));
  const pending = allTx.filter(t => t.status==='pending'||t.status==='overdue');
  const overdue = allTx.filter(t => t.status==='overdue');
  const legalTx = await db.select().from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.status, 'legal')));
  const next7 = new Date(); next7.setDate(next7.getDate()+7);
  const dueSoon = allTx.filter(t => (t.status==='pending'||t.status==='scheduled')&&t.dueDate&&t.dueDate<=next7&&t.dueDate>=now);
  return {
    pj: { income: pjIncome, expense: pjExpense, balance: pjIncome-pjExpense },
    pf: { income: pfIncome, expense: pfExpense, balance: pfIncome-pfExpense },
    total: { income: pjIncome+pfIncome, expense: pjExpense+pfExpense, balance: (pjIncome+pfIncome)-(pjExpense+pfExpense) },
    pending: { count: pending.length, amount: sum(pending.filter(t=>t.type==='expense')) },
    overdue: { count: overdue.length, amount: sum(overdue) },
    legal: { count: legalTx.length, amount: sum(legalTx) },
    dueSoon: dueSoon.length,
  };
}

export async function createInstallmentGroup(userId: number, data: { description: string; totalAmount: number; installmentCount: number; entityType: 'PJ'|'PF'; paymentMethod: string; categoryId?: number; startDate: Date; }) {
  const db = await getDb(); if (!db) throw new Error('DB not available');
  const installmentAmount = data.totalAmount / data.installmentCount;
  const [group] = await db.insert(installmentGroups).values({ userId, description: data.description, totalAmount: data.totalAmount.toFixed(2), installmentCount: data.installmentCount, installmentAmount: installmentAmount.toFixed(2), entityType: data.entityType, paymentMethod: data.paymentMethod as any, categoryId: data.categoryId, startDate: data.startDate }).$returningId();
  const txInserts: InsertTransaction[] = [];
  for (let i = 0; i < data.installmentCount; i++) {
    const dueDate = new Date(data.startDate); dueDate.setMonth(dueDate.getMonth()+i);
    txInserts.push({ userId, installmentGroupId: group.id, description: `${data.description} (${i+1}/${data.installmentCount})`, amount: installmentAmount.toFixed(2), type: 'expense', entityType: data.entityType, paymentMethod: data.paymentMethod as any, status: i===0?'pending':'scheduled', dueDate, source: 'manual' });
  }
  await db.insert(transactions).values(txInserts);
  return group.id;
}

export async function getAccounts(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)));
}

export async function createAccount(userId: number, data: { name: string; bank?: string; type: 'PJ'|'PF'; accountType?: string; color?: string }) {
  const db = await getDb(); if (!db) throw new Error('DB not available');
  await db.insert(accounts).values({ userId, ...data, accountType: (data.accountType||'checking') as any });
}

export async function getCategories(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(categories).where(eq(categories.userId, userId));
}

export async function seedDefaultCategories(userId: number) {
  const db = await getDb(); if (!db) return;
  const existing = await db.select().from(categories).where(eq(categories.userId, userId)).limit(1);
  if (existing.length > 0) return;
  const defaults = [
    { name: 'Salário / Pró-labore', color: '#16A34A', icon: 'briefcase', type: 'both' as const },
    { name: 'Aluguel', color: '#DC2626', icon: 'home', type: 'both' as const },
    { name: 'Alimentação', color: '#EA580C', icon: 'utensils', type: 'PF' as const },
    { name: 'Saúde', color: '#0891B2', icon: 'heart', type: 'PF' as const },
    { name: 'Transporte', color: '#7C3AED', icon: 'car', type: 'PF' as const },
    { name: 'Telefone / Internet', color: '#0284C7', icon: 'phone', type: 'both' as const },
    { name: 'Energia Elétrica', color: '#CA8A04', icon: 'zap', type: 'both' as const },
    { name: 'Fornecedores', color: '#6366F1', icon: 'package', type: 'PJ' as const },
    { name: 'Impostos / Taxas', color: '#B45309', icon: 'file-text', type: 'PJ' as const },
    { name: 'Cartão de Crédito', color: '#DB2777', icon: 'credit-card', type: 'both' as const },
    { name: 'Jurídico', color: '#6B7280', icon: 'scale', type: 'both' as const },
    { name: 'Outros', color: '#9CA3AF', icon: 'more-horizontal', type: 'both' as const },
  ];
  await db.insert(categories).values(defaults.map(c => ({ userId, ...c })));
}

export async function getNotifications(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function createNotification(userId: number, data: { title: string; message: string; type: 'due_soon'|'overdue'|'imported'|'info'; transactionId?: number }) {
  const db = await getDb(); if (!db) return;
  await db.insert(notifications).values({ userId, ...data });
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb(); if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function checkAndCreateDueSoonNotifications(userId: number) {
  const db = await getDb(); if (!db) return;
  const now = new Date(); const in3Days = new Date(); in3Days.setDate(in3Days.getDate()+3);
  const dueSoon = await db.select().from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.status, 'pending'), gte(transactions.dueDate, now), lte(transactions.dueDate, in3Days)));
  for (const tx of dueSoon) {
    const existing = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.transactionId, tx.id), eq(notifications.type, 'due_soon'))).limit(1);
    if (existing.length === 0) {
      const dueStr = tx.dueDate ? new Date(tx.dueDate).toLocaleDateString('pt-BR') : '';
      await createNotification(userId, { title: `Vence em breve: ${tx.description}`, message: `R$ ${parseFloat(tx.amount as string).toLocaleString('pt-BR',{minimumFractionDigits:2})} vence em ${dueStr}`, type: 'due_soon', transactionId: tx.id });
    }
  }
  const overdue = await db.select().from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.status, 'overdue')));
  for (const tx of overdue) {
    const existing = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.transactionId, tx.id), eq(notifications.type, 'overdue'))).limit(1);
    if (existing.length === 0) await createNotification(userId, { title: `Atrasado: ${tx.description}`, message: `R$ ${parseFloat(tx.amount as string).toLocaleString('pt-BR',{minimumFractionDigits:2})} está em atraso!`, type: 'overdue', transactionId: tx.id });
  }
}

export async function getGmailImports(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(gmailImports).where(eq(gmailImports.userId, userId)).orderBy(desc(gmailImports.createdAt)).limit(100);
}

export async function upsertGmailImport(userId: number, data: { gmailMessageId: string; subject?: string; sender?: string; documentType?: string; rawData?: string; }) {
  const db = await getDb(); if (!db) return null;
  const existing = await db.select().from(gmailImports).where(and(eq(gmailImports.userId, userId), eq(gmailImports.gmailMessageId, data.gmailMessageId))).limit(1);
  if (existing.length > 0) return existing[0];
  const [result] = await db.insert(gmailImports).values({ userId, gmailMessageId: data.gmailMessageId, subject: data.subject, sender: data.sender, documentType: (data.documentType||'other') as any, rawData: data.rawData, status: 'pending' }).$returningId();
  return result;
}

export async function updateGmailImportStatus(id: number, userId: number, status: 'imported'|'skipped'|'error', count?: number) {
  const db = await getDb(); if (!db) return;
  await db.update(gmailImports).set({ status, transactionsImported: count||0, processedAt: new Date() }).where(and(eq(gmailImports.id, id), eq(gmailImports.userId, userId)));
}
