import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import uploadRoutes from "../uploadRoutes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // File upload routes
  app.use("/api/upload", uploadRoutes);

  // Gmail OAuth callback
  app.get("/api/gmail/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) { res.redirect("/?error=no_code"); return; }

      const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
      const redirectUri = `${origin}/api/gmail/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: process.env.GMAIL_CLIENT_ID!, client_secret: process.env.GMAIL_CLIENT_SECRET!,
          redirect_uri: redirectUri, grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number; error?: string };

      if (tokens.error) { res.redirect(`/gmail?error=${tokens.error}`); return; }

      // Get user info from JWT cookie to identify the user
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const cookieName = "app_session_id";
      const cookieHeader = req.headers.cookie || "";
      const sessionCookie = cookieHeader.split(";").find(c => c.trim().startsWith(cookieName + "="))?.split("=")[1];

      if (sessionCookie) {
        try {
          const { jwtVerify } = await import("jose");
          const secret = new TextEncoder().encode(process.env.JWT_SECRET);
          const { payload } = await jwtVerify(sessionCookie, secret);
          const openId = payload.openId as string;
          if (openId) {
            const db = await getDb();
            if (db) {
              const expiry = new Date(Date.now() + tokens.expires_in * 1000);
              await db.update(users).set({
                gmailAccessToken: tokens.access_token,
                gmailRefreshToken: tokens.refresh_token || undefined,
                gmailTokenExpiry: expiry,
              }).where(eq(users.openId, openId));
            }
          }
        } catch (e) { console.error("[Gmail] JWT error:", e); }
      }

      res.redirect("/gmail?connected=1");
    } catch (e) {
      console.error("[Gmail] Callback error:", e);
      res.redirect("/gmail?error=callback_failed");
    }
  });

  // Backup semanal agendado — chamado pelo Manus Heartbeat toda segunda-feira
  app.post("/api/scheduled/backup-semanal", async (req, res) => {
    try {
      // Verifica se a chamada vem do cron do Manus (header injetado pela plataforma)
      const taskUid = req.headers["x-manus-cron-task-uid"] as string | undefined;
      if (!taskUid) {
        return res.status(403).json({ error: "cron-only endpoint" });
      }

      const { getTransactions } = await import("../db");
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { notifyOwner } = await import("./notification");
      const { sendBackupEmail } = await import("../emailBackup");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB unavailable" });

      // Busca o owner (admin) para gerar o resumo
      const ownerRows = await db.select().from(users).limit(1);
      const owner = ownerRows[0];
      if (!owner) return res.json({ ok: true, skipped: "no owner" });

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const txs = await getTransactions(owner.id, { from: firstOfMonth, to: now });

      const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount as string), 0);
      const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount as string), 0);
      const pending = txs.filter(t => t.status === 'pending').length;
      const overdue = txs.filter(t => t.status === 'overdue').length;
      const balance = income - expense;
      const mes = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

      // Gera CSV completo do mês com BOM UTF-8 para abrir corretamente no Excel
      const headers = ['Data','Descrição','Valor','Tipo','PJ/PF','Status','Pagamento','Vencimento'];
      const rows = txs.map(t => [
        t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : new Date(t.createdAt).toLocaleDateString('pt-BR'),
        t.description,
        parseFloat(t.amount as string).toFixed(2),
        t.type === 'income' ? 'Entrada' : t.type === 'expense' ? 'Saída' : 'Transferência',
        t.entityType, t.status, t.paymentMethod || '',
        t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : '',
      ]);
      const csvContent = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

      // Envia e-mail real com CSV em anexo via Resend
      const ownerEmail = owner.email || process.env.OWNER_EMAIL || 'myrnapcampagnoli@gmail.com';
      const emailSent = await sendBackupEmail({
        toEmail: ownerEmail,
        mes,
        income,
        expense,
        balance,
        pending,
        overdue,
        totalTx: txs.length,
        csvContent,
      });

      // Também envia notificação in-app como confirmação
      const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await notifyOwner({
        title: `📊 Backup Semanal — ${mes}`,
        content: emailSent
          ? `✅ Backup enviado para ${ownerEmail}\n\nEntradas: ${fmt(income)} | Saídas: ${fmt(expense)} | Saldo: ${fmt(balance)}\nPendentes: ${pending} | Atrasados: ${overdue} | Total: ${txs.length} lançamentos`
          : `⚠️ Falha ao enviar e-mail. Acesse Configurações → Exportar Dados para baixar o CSV manualmente.`,
      });

      res.json({ ok: true, emailSent, month: mes, transactions: txs.length, income, expense, balance });
    } catch (e: any) {
      console.error("[Backup Semanal] Error:", e);
      res.status(500).json({ error: e?.message || "unknown", timestamp: new Date().toISOString() });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
