import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  checkAndCreateDueSoonNotifications, createAccount, createInstallmentGroup,
  createNotification, createTransaction, deleteTransaction, getAccounts,
  getCategories, getDashboardSummary, getGmailImports, getNotifications,
  getTransactions, markNotificationRead, markTransactionPaid,
  seedDefaultCategories, updateGmailImportStatus, updateTransaction,
  updateUserGmailTokens, upsertGmailImport,
} from "./db";

function getGmailAuthUrl(redirectUri: string) {
  const scopes = ["https://www.googleapis.com/auth/gmail.readonly"].join(" ");
  const params = new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: scopes, access_type: "offline", prompt: "consent" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function refreshGmailToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GMAIL_CLIENT_ID!, client_secret: process.env.GMAIL_CLIENT_SECRET!, grant_type: "refresh_token" }) });
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function fetchGmailMessages(accessToken: string, query: string, maxResults = 20) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json() as { messages?: { id: string }[] };
  return data.messages || [];
}

async function fetchGmailMessage(accessToken: string, messageId: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json() as Promise<any>;
}

function detectDocumentType(subject: string, sender: string): string {
  const s = (subject + ' ' + sender).toLowerCase();
  if (s.includes('extrato') || s.includes('movimentação')) return 'extrato';
  if ((s.includes('fatura')) && (s.includes('cartão') || s.includes('nubank') || s.includes('itaú') || s.includes('bradesco') || s.includes('xp'))) return 'fatura_cartao';
  if (s.includes('vivo') || s.includes('claro') || s.includes('tim') || s.includes('copel') || s.includes('cemig') || s.includes('sanepar') || s.includes('sabesp') || s.includes('conta de luz') || s.includes('conta de água')) return 'conta_servico';
  if (s.includes('boleto') || s.includes('cobrança')) return 'boleto';
  if (s.includes('fatura')) return 'fatura_cartao';
  return 'other';
}

function extractAmountFromText(text: string): number | null {
  const patterns = [/R\$\s*([\d.,]+)/gi, /valor[:\s]+R?\$?\s*([\d.,]+)/gi, /total[:\s]+R?\$?\s*([\d.,]+)/gi];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) { const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.')); if (!isNaN(val) && val > 0) return val; }
  }
  return null;
}

function extractDueDateFromText(text: string): Date | null {
  const patterns = [/vencimento[:\s]+(\d{2}\/\d{2}\/\d{4})/gi, /vence em[:\s]+(\d{2}\/\d{2}\/\d{4})/gi, /(\d{2}\/\d{2}\/\d{4})/g];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) { const [day, month, year] = match[1].split('/'); const date = new Date(parseInt(year), parseInt(month)-1, parseInt(day)); if (!isNaN(date.getTime()) && date > new Date()) return date; }
  }
  return null;
}

function detectCnpjCpf(text: string): { value: string; type: 'PJ'|'PF' } | null {
  const cnpjMatch = text.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/);
  if (cnpjMatch) return { value: cnpjMatch[0].replace(/\D/g, ''), type: 'PJ' };
  const cpfMatch = text.match(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/);
  if (cpfMatch) return { value: cpfMatch[0].replace(/\D/g, ''), type: 'PF' };
  return null;
}

function getEmailBody(message: any): string {
  const extractText = (parts: any[]): string => { for (const part of parts) { if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64').toString('utf-8'); if (part.parts) { const sub = extractText(part.parts); if (sub) return sub; } } return ''; };
  const parts = message.payload?.parts || [];
  if (parts.length > 0) return extractText(parts);
  if (message.payload?.body?.data) return Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  return '';
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      await seedDefaultCategories(ctx.user.id);
      await checkAndCreateDueSoonNotifications(ctx.user.id);
      return getDashboardSummary(ctx.user.id);
    }),
  }),

  transactions: router({
    list: protectedProcedure.input(z.object({
      entityType: z.enum(['PJ','PF']).optional(),
      status: z.string().optional(),
      type: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      excludeLegal: z.boolean().optional(),
    }).optional()).query(async ({ ctx, input }) => getTransactions(ctx.user.id, input || {})),

    create: protectedProcedure.input(z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      type: z.enum(['income','expense','transfer']),
      entityType: z.enum(['PJ','PF']),
      paymentMethod: z.enum(['credit','debit','pix','cash','boleto','other']).optional(),
      status: z.enum(['paid','pending','overdue','legal','scheduled']).optional(),
      dueDate: z.date().optional(),
      paidAt: z.date().optional(),
      notes: z.string().optional(),
      categoryId: z.number().optional(),
      accountId: z.number().optional(),
      cnpjCpf: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await createTransaction({ userId: ctx.user.id, description: input.description, amount: input.amount.toFixed(2), type: input.type, entityType: input.entityType, paymentMethod: input.paymentMethod||'pix', status: input.status||'pending', dueDate: input.dueDate, paidAt: input.paidAt, notes: input.notes, categoryId: input.categoryId, accountId: input.accountId, cnpjCpf: input.cnpjCpf, source: 'manual' });
      return { success: true };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      description: z.string().optional(),
      amount: z.number().optional(),
      type: z.enum(['income','expense','transfer']).optional(),
      entityType: z.enum(['PJ','PF']).optional(),
      paymentMethod: z.enum(['credit','debit','pix','cash','boleto','other']).optional(),
      status: z.enum(['paid','pending','overdue','legal','scheduled']).optional(),
      dueDate: z.date().optional(),
      notes: z.string().optional(),
      categoryId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, amount, ...rest } = input;
      await updateTransaction(id, ctx.user.id, { ...rest, ...(amount !== undefined ? { amount: amount.toFixed(2) } : {}) });
      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await deleteTransaction(input.id, ctx.user.id);
      return { success: true };
    }),

    markPaid: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await markTransactionPaid(input.id, ctx.user.id);
      return { success: true };
    }),
  }),

  installments: router({
    create: protectedProcedure.input(z.object({
      description: z.string().min(1),
      totalAmount: z.number().positive(),
      installmentCount: z.number().int().min(2).max(60),
      entityType: z.enum(['PJ','PF']),
      paymentMethod: z.enum(['credit','debit','pix','cash','boleto','other']).optional(),
      categoryId: z.number().optional(),
      startDate: z.date(),
    })).mutation(async ({ ctx, input }) => {
      const groupId = await createInstallmentGroup(ctx.user.id, { ...input, paymentMethod: input.paymentMethod||'credit' });
      return { success: true, groupId };
    }),
  }),

  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => getAccounts(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().min(1), bank: z.string().optional(), type: z.enum(['PJ','PF']), accountType: z.enum(['checking','savings','credit','other']).optional(), color: z.string().optional() })).mutation(async ({ ctx, input }) => { await createAccount(ctx.user.id, input); return { success: true }; }),
  }),

  categories: router({
    list: protectedProcedure.query(async ({ ctx }) => getCategories(ctx.user.id)),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => getNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => { await markNotificationRead(input.id, ctx.user.id); return { success: true }; }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => { const notifs = await getNotifications(ctx.user.id); await Promise.all(notifs.filter(n => !n.isRead).map(n => markNotificationRead(n.id, ctx.user.id))); return { success: true }; }),
  }),

  gmail: router({
    getAuthUrl: protectedProcedure.input(z.object({ origin: z.string() })).query(async ({ input }) => {
      const redirectUri = `${input.origin}/api/gmail/callback`;
      return { url: getGmailAuthUrl(redirectUri) };
    }),
    isConnected: protectedProcedure.query(async ({ ctx }) => ({ connected: !!(ctx.user as any).gmailAccessToken })),
    disconnect: protectedProcedure.mutation(async ({ ctx }) => { await updateUserGmailTokens(ctx.user.id, '', '', new Date(0)); return { success: true }; }),
    scanEmails: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user as any;
      if (!user.gmailAccessToken) throw new Error('Gmail não conectado');
      let accessToken = user.gmailAccessToken;
      if (user.gmailTokenExpiry && new Date(user.gmailTokenExpiry) < new Date() && user.gmailRefreshToken) {
        const refreshed = await refreshGmailToken(user.gmailRefreshToken);
        accessToken = refreshed.access_token;
        await updateUserGmailTokens(ctx.user.id, accessToken, user.gmailRefreshToken, new Date(Date.now() + refreshed.expires_in * 1000));
      }
      const queries = ['subject:(extrato OR fatura OR boleto OR vencimento) has:attachment newer_than:30d', 'from:(nubank OR bradesco OR itau OR santander OR vivo OR claro OR tim OR copel OR cemig) newer_than:30d'];
      const allMessageIds = new Set<string>();
      for (const query of queries) { const msgs = await fetchGmailMessages(accessToken, query, 15); msgs.forEach(m => allMessageIds.add(m.id)); }
      const found: any[] = [];
      for (const messageId of Array.from(allMessageIds).slice(0, 30)) {
        await upsertGmailImport(ctx.user.id, { gmailMessageId: messageId });
        const message = await fetchGmailMessage(accessToken, messageId);
        const headers = message.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const sender = headers.find((h: any) => h.name === 'From')?.value || '';
        const body = getEmailBody(message);
        const fullText = subject + ' ' + sender + ' ' + body;
        const docType = detectDocumentType(subject, sender);
        const amount = extractAmountFromText(fullText);
        const dueDate = extractDueDateFromText(fullText);
        const cnpjCpf = detectCnpjCpf(fullText);
        const entityType = cnpjCpf?.type || 'PF';
        await upsertGmailImport(ctx.user.id, { gmailMessageId: messageId, subject, sender, documentType: docType, rawData: JSON.stringify({ subject, sender, amount, dueDate, entityType }) });
        found.push({ id: messageId, subject, sender, documentType: docType, amount, dueDate, entityType });
      }
      return { found, total: found.length };
    }),
    importEmail: protectedProcedure.input(z.object({ gmailMessageId: z.string(), description: z.string(), amount: z.number(), entityType: z.enum(['PJ','PF']), dueDate: z.date().optional(), categoryId: z.number().optional() })).mutation(async ({ ctx, input }) => {
      await createTransaction({ userId: ctx.user.id, description: input.description, amount: input.amount.toFixed(2), type: 'expense', entityType: input.entityType, paymentMethod: 'boleto', status: 'pending', dueDate: input.dueDate, source: 'gmail', importedFrom: input.gmailMessageId, categoryId: input.categoryId });
      const imports = await getGmailImports(ctx.user.id);
      const imp = imports.find(i => i.gmailMessageId === input.gmailMessageId);
      if (imp) await updateGmailImportStatus(imp.id, ctx.user.id, 'imported', 1);
      await createNotification(ctx.user.id, { title: 'Email importado', message: `${input.description} - R$ ${input.amount.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, type: 'imported' });
      return { success: true };
    }),
    listImports: protectedProcedure.query(async ({ ctx }) => getGmailImports(ctx.user.id)),
  }),

  import: router({
    checkDuplicates: protectedProcedure.input(z.object({
      transactions: z.array(z.object({
        description: z.string(),
        amount: z.number(),
        dueDate: z.date().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const { findPossibleDuplicates } = await import('./db');
      const results = await Promise.all(
        input.transactions.map(async (tx, index) => {
          const dupes = await findPossibleDuplicates(ctx.user.id, tx);
          if (dupes.length === 0) return { index, status: 'new' as const, duplicates: [] };
          // Check if any is exact (same amount + same date)
          const exact = dupes.find(d => {
            const sameAmount = Math.abs(parseFloat(d.amount as string) - tx.amount) < 0.02;
            if (!tx.dueDate || !d.dueDate) return sameAmount;
            const diff = Math.abs(new Date(d.dueDate).getTime() - new Date(tx.dueDate).getTime());
            return sameAmount && diff < 24 * 60 * 60 * 1000; // same day
          });
          return {
            index,
            status: exact ? 'duplicate_exact' as const : 'duplicate_similar' as const,
            duplicates: dupes.map(d => ({
              id: d.id,
              description: d.description,
              amount: parseFloat(d.amount as string),
              dueDate: d.dueDate,
              status: d.status,
            })),
          };
        })
      );
      return results;
    }),

    bulk: protectedProcedure.input(z.object({
      transactions: z.array(z.object({
        description: z.string().min(1),
        amount: z.number().positive(),
        type: z.enum(['income','expense','transfer']),
        entityType: z.enum(['PJ','PF']),
        paymentMethod: z.enum(['credit','debit','pix','cash','boleto','other']).optional(),
        status: z.enum(['paid','pending','overdue','legal','scheduled']).optional(),
        dueDate: z.date().optional(),
        notes: z.string().optional(),
        categoryId: z.number().optional(),
        replaceId: z.number().optional(), // if set, delete existing and replace
      })),
      source: z.enum(['import_csv','import_excel','import_pdf']).optional(),
    })).mutation(async ({ ctx, input }) => {
      let imported = 0;
      for (const tx of input.transactions) {
        if (tx.replaceId) {
          await deleteTransaction(tx.replaceId, ctx.user.id);
        }
        await createTransaction({
          userId: ctx.user.id,
          description: tx.description,
          amount: tx.amount.toFixed(2),
          type: tx.type,
          entityType: tx.entityType,
          paymentMethod: tx.paymentMethod || 'other',
          status: tx.status || 'pending',
          dueDate: tx.dueDate,
          notes: tx.notes,
          categoryId: tx.categoryId,
          source: input.source || 'import_csv',
        });
        imported++;
      }
      await createNotification(ctx.user.id, {
        title: 'Importação concluída',
        message: `${imported} transação(ões) importada(s) com sucesso.`,
        type: 'imported',
      });
      return { success: true, imported };
    }),
  }),

  export: router({
    csv: protectedProcedure
      .input(z.object({
        from: z.string().optional(), // ISO date string YYYY-MM-DD
        to: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const filters: Parameters<typeof getTransactions>[1] = {};
        if (input?.from) filters.from = new Date(input.from);
        if (input?.to) { const d = new Date(input.to); d.setHours(23,59,59,999); filters.to = d; }
        const txs = await getTransactions(ctx.user.id, filters);
        const headers = ['Data','Descrição','Valor','Tipo','PJ/PF','Status','Pagamento','Vencimento','Categoria'];
        const rows = txs.map(t => [
          t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : new Date(t.createdAt).toLocaleDateString('pt-BR'),
          t.description,
          parseFloat(t.amount as string).toFixed(2),
          t.type==='income'?'Entrada':t.type==='expense'?'Saída':'Transferência',
          t.entityType,
          t.status,
          t.paymentMethod||'',
          t.dueDate?new Date(t.dueDate).toLocaleDateString('pt-BR'):'',
          t.categoryId?.toString()||'',
        ]);
        const periodo = input?.from && input?.to
          ? `${input.from}_a_${input.to}`
          : input?.from ? `a_partir_de_${input.from}`
          : 'completo';
        return {
          csv: [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n'),
          filename: `financeiro_${periodo}.csv`,
          total: txs.length,
        };
      }),

    // Resumo para backup/notificação
    summary: protectedProcedure.query(async ({ ctx }) => {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const txs = await getTransactions(ctx.user.id, { from: firstOfMonth, to: now });
      const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+parseFloat(t.amount as string),0);
      const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+parseFloat(t.amount as string),0);
      const pending = txs.filter(t=>t.status==='pending').length;
      const overdue = txs.filter(t=>t.status==='overdue').length;
      return { income, expense, balance: income-expense, pending, overdue, month: now.toLocaleString('pt-BR',{month:'long',year:'numeric'}) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
