import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
