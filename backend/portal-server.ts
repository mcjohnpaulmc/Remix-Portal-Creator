/**
 * Customer portal server — runs as a separate PM2 process per subdomain.
 * Reads portal data from S3: s3://asg-bot-cache/Mobius_Portal_Creator_Hub/<slug>/portal.json
 * Serves the same React frontend (frontend/dist/) in read-only portal mode.
 */

import 'dotenv/config';
import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import http from "http";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { publicDbProjection } from "./portal/snapshot";

function verifyPassword(plain: string, stored: string): boolean {
  if (stored.startsWith("$2")) return bcrypt.compareSync(plain, stored);
  // Legacy SHA-256 fallback
  return createHash("sha256").update(plain).digest("hex") === stored;
}

// --- CLI args / env ---
const argv = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};

const SLUG = process.env.PORTAL_SLUG || getArg("--slug") || "";
const PORT = parseInt(process.env.PORTAL_PORT || getArg("--port") || "4000", 10);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

if (!SLUG) {
  console.error("[portal-server] --slug <slug> is required");
  process.exit(1);
}

// --- S3 ---
const S3_BUCKET = "asg-bot-cache";
const S3_PREFIX = "Mobius_Portal_Creator_Hub";
const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

let portalData: any = null;

async function loadPortalData(): Promise<void> {
  // Local file is the authoritative content source — the hub writes it synchronously before
  // signaling a reload, so it is always at least as fresh as S3.
  const localPath = path.join(process.cwd(), "data", "portals", SLUG, "portal.json");
  let loadedFromLocal = false;
  if (fs.existsSync(localPath)) {
    try {
      portalData = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      console.log(`[portal-${SLUG}] Loaded portal.json from local disk`);
      loadedFromLocal = true;
    } catch { /* fall through to S3 */ }
  }

  // Only reach out to S3 when there is no local file (cold start on a fresh machine)
  if (!loadedFromLocal) {
    const key = `${S3_PREFIX}/${SLUG}/portal.json`;
    try {
      const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const body = await (resp.Body as any).transformToString();
      portalData = JSON.parse(body);
      console.log(`[portal-${SLUG}] Loaded portal.json from S3 (no local file)`);
    } catch (err: any) {
      if (!portalData) {
        console.warn(`[portal-${SLUG}] S3 load failed, using empty data:`, err?.message || err);
        portalData = buildEmptyPortal();
      }
    }
  }

  // Always refresh the global users list from S3 — it is the auth source of truth
  try {
    const usersKey = `${S3_PREFIX}/users.json`;
    const uresp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: usersKey }));
    const ubody = await (uresp.Body as any).transformToString();
    const { users } = JSON.parse(ubody);
    if (Array.isArray(users)) {
      portalData.users = users;
      console.log(`[portal-${SLUG}] Loaded ${users.length} users from global users.json`);
    }
  } catch {
    // users.json may not exist yet — fall back to users embedded in portal.json
  }
}

function buildEmptyPortal() {
  return {
    slug: SLUG,
    subdomain: SLUG,
    heroText: "",
    logo: "",
    carousel: [],
    solutions: [],
    collaterals: [],
    currentProjects: [],
    upcomingProjects: [],
    subdomainInfo: null,
    subdomains: [],
    userLogs: [],
    heroPrompt: "",
  };
}

// --- Express app ---
const app = express();
app.use(express.json());

// CORS — the admin hub polls /api/portal-info from a different port, so public
// API endpoints must allow cross-origin requests from any hub origin.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
  if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

// Portal identity — frontend uses this to suppress admin console
app.get("/api/portal-info", (_req, res) => {
  res.json({
    isHub: false,
    slug: SLUG,
    displayName: portalData?.subdomainInfo?.displayName || SLUG,
  });
});

// Main data endpoint — shaped identically to the Hub's /api/database
app.get("/api/database", (_req, res) => {
  const data = portalData || buildEmptyPortal();
  // Strip passwordHash before serving — hashes must never leave the auth boundary
  res.json(publicDbProjection(data));
});

// Login — validates email + password against users deployed in portal.json
app.post("/api/login", loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const normalized = email.trim().toLowerCase();
  const users: any[] = portalData?.users || [];
  const user = users.find(u => u.email === normalized && verifyPassword(password, u.passwordHash || ""));
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  res.json({ success: true, email: normalized, name: user.name, role: user.role });
});

app.post("/api/email-login", (_req, res) => {
  res.status(410).json({ error: "Please use email and password to login." });
});

// Analytics logging — forward to hub for central persistence, tagged with this portal's slug
app.post("/api/log", (req, res) => {
  res.json({ success: true });
  const hubPort = parseInt(process.env.HUB_PORT || process.env.PORT || "3000", 10);
  const body = JSON.stringify({
    email: String(req.body?.email || "anonymous-viewer").slice(0, 254),
    action: String(req.body?.action || "Page View").slice(0, 128),
    details: String(req.body?.details || "").slice(0, 512),
    subdomain: SLUG,
  });
  try {
    const proxyReq = http.request({
      hostname: "127.0.0.1",
      port: hubPort,
      path: "/api/log",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    proxyReq.on("error", () => {});
    proxyReq.write(body);
    proxyReq.end();
  } catch { /* best-effort */ }
});

// Hot-reload — Hub calls this after deploying to S3 so the portal picks up the latest data.
// Requires X-Admin-Token to prevent unauthenticated external reload abuse.
app.post("/api/reload", async (req, res) => {
  if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  await loadPortalData();
  res.json({ success: true, reloadedAt: new Date().toISOString(), slug: SLUG });
});

// Block all admin operations on customer portals
app.all("/api/admin/*", (_req, res) => {
  res.status(403).json({ error: "Admin operations are not available on customer portals." });
});

// Serve frontend — built dist in production, proxy to hub Vite dev server in development
const distPath = path.join(process.cwd(), "frontend", "dist");
const distReady = fs.existsSync(path.join(distPath, "index.html"));

if (distReady) {
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  // Dev mode: proxy all non-API requests to the hub's Vite dev server
  const HUB_PORT = parseInt(process.env.HUB_PORT || "3000", 10);
  console.log(`[portal-${SLUG}] No dist build found — proxying static assets from hub at :${HUB_PORT}`);

  app.use((req, res) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: HUB_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${HUB_PORT}` },
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxyReq.on("error", () => {
      // Hub not up yet — serve a self-refreshing holding page
      res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Portal Starting…</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;font-family:sans-serif;color:#94a3b8}
.card{text-align:center;padding:3rem 4rem;border:1px solid #1e293b;border-radius:1.5rem;background:#1e293b}
h1{color:#fff;font-size:1.5rem;margin-bottom:.75rem}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#f97316;margin:0 4px;animation:bounce .9s infinite alternate}
.dot:nth-child(2){animation-delay:.3s}.dot:nth-child(3){animation-delay:.6s}@keyframes bounce{to{transform:translateY(-10px);opacity:.3}}</style></head>
<body><div class="card"><h1>Portal is starting</h1><p style="margin-bottom:1.5rem;font-size:.9rem">${SLUG} · port ${PORT}</p>
<span class="dot"></span><span class="dot"></span><span class="dot"></span>
<p style="margin-top:1.5rem;font-size:.75rem">This page refreshes automatically…</p></div>
<script>setTimeout(()=>location.reload(),3000)</script></body></html>`);
    });
    req.pipe(proxyReq, { end: true });
  });
}

// Boot
loadPortalData().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[portal-${SLUG}] Running at http://localhost:${PORT}`);
  });
});
