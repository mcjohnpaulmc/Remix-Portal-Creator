/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { createServer as createViteServer } from "vite";
import { PORT } from "./config";
import { requireAdminAuth } from "./auth";
import { seedDefaultAdmin } from "./auth/seed";
import { logger } from "./logger";

// Route modules
import authRouter from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import contentRouter from "./routes/content.routes";
import subdomainsRouter from "./routes/subdomains.routes";
import aiRouter from "./routes/ai.routes";
import uploadRouter from "./routes/upload.routes";
import deployRouter from "./routes/deploy.routes";
import publicRouter from "./routes/public.routes";
import { subdomainProxyMiddleware } from "./middleware/subdomain-proxy";

const app = express();

// ── Subdomain proxy — MUST be first, before body parsers consume the stream ───
app.use(subdomainProxyMiddleware);

// ── Body parsers & cookie parser ──────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Upload / download / static uploads (root level — no admin guard) ───────────
app.use(uploadRouter);

// ── Auth routes (root level — /api/login, /api/email-login) ───────────────────
app.use(authRouter);

// ── Admin guard — applies to every /api/admin/* route below ───────────────────
app.use("/api/admin", requireAdminAuth);
app.post("/api/admin/verify", (_req, res) => res.json({ ok: true }));

// ── Admin routers ─────────────────────────────────────────────────────────────
app.use("/api/admin", usersRouter);
app.use("/api/admin", contentRouter);
app.use("/api/admin", subdomainsRouter);
app.use("/api/admin", aiRouter);
app.use("/api/admin", deployRouter);

// ── Public routes (/api/database, /api/portal-info, /api/log) ─────────────────
app.use(publicRouter);

// ── Start ──────────────────────────────────────────────────────────────────────
async function startServer(): Promise<void> {
  await seedDefaultAdmin();

  if (process.env.NODE_ENV !== "production") {
    const frontendRoot = path.join(process.cwd(), "frontend");
    const vite = await createViteServer({
      root: frontendRoot,
      configFile: path.join(frontendRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "frontend", "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    logger.info("Server", `Operating securely at: http://localhost:${PORT}`);
  });
}

startServer();
