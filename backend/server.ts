/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from "express";
import path from "path";
import fs from "fs";
import http from "http";
import { exec, spawn, ChildProcess } from "child_process";
import { createHash } from "crypto";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Solution, Collateral, UserLog, CurrentProject, UpcomingProject, SubdomainPortal, PortalUser } from "../shared/types";

// Password hashing (SHA-256 — sufficient for internal portal auth)
function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// Internal user record — includes passwordHash, never sent to frontend
interface InternalUser extends PortalUser {
  passwordHash: string;
}

// Setup storage
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "data-store.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const PORTALS_DIR = path.join(DATA_DIR, "portals");
if (!fs.existsSync(PORTALS_DIR)) {
  fs.mkdirSync(PORTALS_DIR, { recursive: true });
}

// OpenAI client (key from OPENAI_API_KEY env var loaded by dotenv)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function aiChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });
  return resp.choices[0].message.content || "";
}

// S3 configuration
const S3_BUCKET = "asg-bot-cache";
const S3_PREFIX = "Mobius_Portal_Creator_Hub";
const PORTAL_PORT_BASE = 4000;
const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

// In-memory users cache — loaded from S3 on startup, kept in sync on every CRUD.
// Login and admin-auth use this so S3 is the authoritative credential store.
let usersCache: InternalUser[] | null = null;

async function loadUsersFromS3(): Promise<InternalUser[] | null> {
  const key = `${S3_PREFIX}/users.json`;
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const body = await (resp.Body as any).transformToString();
    const { users } = JSON.parse(body);
    if (Array.isArray(users)) {
      console.log(`[S3] Loaded ${users.length} users from users.json`);
      return users as InternalUser[];
    }
  } catch (err: any) {
    console.warn(`[S3] Could not load users.json (will use local DB):`, err?.message || err);
  }
  return null;
}

async function s3PutPortalFile(slug: string, filename: string, content: object): Promise<void> {
  const key = `${S3_PREFIX}/${slug}/${filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(content, null, 2),
    ContentType: "application/json",
  }));
  console.log(`[S3] Uploaded s3://${S3_BUCKET}/${key}`);
}

async function s3GetPortalFile(slug: string, filename: string): Promise<any> {
  const key = `${S3_PREFIX}/${slug}/${filename}`;
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const body = await (resp.Body as any).transformToString();
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// Sync global users list to S3 — stored at Mobius_Portal_Creator_Hub/users.json
async function s3SyncUsers(users: InternalUser[]): Promise<void> {
  const key = `${S3_PREFIX}/users.json`;
  const payload = {
    updatedAt: new Date().toISOString(),
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      enabled: u.enabled !== false,
      createdAt: u.createdAt,
      passwordHash: u.passwordHash,
    })),
  };
  try {
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: "application/json",
    }));
    console.log(`[S3] Synced ${users.length} users → s3://${S3_BUCKET}/${key}`);
  } catch (err: any) {
    console.error(`[S3] Failed to sync users.json:`, err?.message);
  }
}

function assignNextPort(portAssignments: { [slug: string]: number }): number {
  const used = new Set(Object.values(portAssignments));
  let port = PORTAL_PORT_BASE;
  while (used.has(port)) port++;
  return port;
}

// Track child processes in dev mode (keyed by slug)
const portalProcesses = new Map<string, ChildProcess>();

function pm2SpawnPortal(slug: string, port: number): void {
  const cwd = process.cwd();
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    // Kill existing process for this slug if any
    if (portalProcesses.has(slug)) {
      try { portalProcesses.get(slug)!.kill(); } catch {}
      portalProcesses.delete(slug);
    }
    // Use spawn with shell:true so Windows can resolve npx/tsx from PATH
    const child = spawn(
      "npx", ["tsx", "backend/portal-server.ts", "--slug", slug, "--port", String(port)],
      { cwd, env: process.env, stdio: "pipe", shell: true }
    );
    child.stdout?.on("data", d => process.stdout.write(`[portal-${slug}] ${d}`));
    child.stderr?.on("data", d => process.stderr.write(`[portal-${slug}] ${d}`));
    child.on("exit", code => {
      console.log(`[portal-${slug}] Exited (code ${code})`);
      portalProcesses.delete(slug);
    });
    portalProcesses.set(slug, child);
    console.log(`[portal-${slug}] Spawned on port ${port} (pid ${child.pid})`);
  } else {
    const cmd = `pm2 start node --name "portal-${slug}" --cwd "${cwd}" -- dist/portal-server.cjs --slug ${slug} --port ${port}`;
    exec(cmd, (err, _stdout, stderr) => {
      if (err) console.error(`[PM2] Failed to start portal-${slug}:`, stderr);
      else console.log(`[PM2] Started portal-${slug} on port ${port}`);
    });
  }
}

function pm2StopPortal(slug: string): void {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    if (portalProcesses.has(slug)) {
      try { portalProcesses.get(slug)!.kill(); } catch {}
      portalProcesses.delete(slug);
      console.log(`[portal-${slug}] Stopped`);
    }
  } else {
    exec(`pm2 delete portal-${slug}`, (err) => {
      if (err) console.warn(`[PM2] Could not delete portal-${slug}:`, err?.message);
      else console.log(`[PM2] Stopped portal-${slug}`);
    });
  }
}

// Build an empty portal scaffold — used only at creation/first-start.
// Content is intentionally blank; the admin must explicitly deploy to populate it.
function buildDefaultPortalJson(slug: string, subdomainInfo: SubdomainPortal | null, db: any) {
  return {
    slug,
    subdomain: slug,
    deployedAt: new Date().toISOString(),
    heroText: "",
    logo: db.logo || "",   // keep the brand logo
    carousel: [],
    solutions: [],
    collaterals: [],
    currentProjects: [],
    upcomingProjects: [],
    subdomainInfo,
    subdomains: [],
    userLogs: [],
    heroPrompt: "",
    users: (db.users || []).filter((u: any) => u.enabled !== false).map((u: any) => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      passwordHash: u.passwordHash, createdAt: u.createdAt,
    })),
  };
}

// Build and write portal.json for a slug, signal reload — used by deploy endpoint + auto-deploy
async function deployPortalInProcess(cleanSlug: string, db: DatabaseSchema): Promise<void> {
  const matchesSlug = (names: string[]) => names.includes(cleanSlug) || names.includes("all");
  const subdomainInfo = (db.subdomains || []).find(s => s.name === cleanSlug) || null;
  const portalDir = path.join(PORTALS_DIR, cleanSlug);
  fs.mkdirSync(path.join(portalDir, "assets"), { recursive: true });

  const portalJson = {
    slug: cleanSlug,
    subdomain: cleanSlug,
    deployedAt: new Date().toISOString(),
    heroText: db.heroText,
    logo: db.logo || "",
    carousel: (db.carousel || []).filter((c: any) =>
      !c.customerName || c.customerName === cleanSlug || c.customerName === "all"
    ),
    solutions: (db.solutions || []).filter((s: any) =>
      matchesSlug(s.customerNames || (s.customerName ? [s.customerName] : ["all"]))
    ),
    collaterals: (db.collaterals || []).filter((c: any) =>
      matchesSlug(c.customerNames || (c.customerName ? [c.customerName] : ["all"]))
    ),
    currentProjects: (db.currentProjects || []).filter((p: any) =>
      matchesSlug(p.customerNames || [p.customerName])
    ),
    upcomingProjects: (db.upcomingProjects || []).filter((p: any) =>
      matchesSlug(p.customerNames || [p.customerName])
    ),
    subdomainInfo,
    subdomains: [],
    userLogs: [],
    heroPrompt: "",
    users: (db.users || []).filter(u => u.enabled !== false).map(u => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      passwordHash: (u as any).passwordHash, createdAt: u.createdAt,
    })),
  };

  fs.writeFileSync(path.join(portalDir, "portal.json"), JSON.stringify(portalJson, null, 2), "utf-8");

  // Upload to S3 before signaling reload so S3 is consistent when the portal reads it
  try {
    await s3PutPortalFile(cleanSlug, "portal.json", portalJson);
  } catch {
    // S3 upload failed; portal will still reload correctly from local file
  }

  // Signal the live portal process to hot-reload its data
  const portalPort = subdomainInfo?.port || (db.portAssignments || {})[cleanSlug];
  if (portalPort) {
    const reloadReq = http.request(
      { hostname: "127.0.0.1", port: portalPort, path: "/api/reload", method: "POST" },
      () => {}
    );
    reloadReq.on("error", () => {});
    reloadReq.end();
  }
}

// After any content CRUD, push fresh portal.json to every live portal (fire-and-forget)
function autoDeployLivePortals(db: DatabaseSchema): void {
  const livePortals = (db.subdomains || []).filter(s => s.status === "live");
  for (const portal of livePortals) {
    deployPortalInProcess(portal.name, db).catch(err =>
      console.warn(`[auto-deploy] ${portal.name}:`, err?.message)
    );
  }
}

// Dynamic state helpers
interface DatabaseSchema {
  solutions: Solution[];
  collaterals: Collateral[];
  userLogs: UserLog[];
  heroText: string;
  heroPrompt: string;
  subdomain: string;
  subdomains?: SubdomainPortal[];
  currentProjects?: CurrentProject[];
  upcomingProjects?: UpcomingProject[];
  logo?: string;
  carousel?: CarouselItem[];
  portAssignments?: { [slug: string]: number };
  users?: InternalUser[];
}

interface CarouselItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  linkType: "subdomain" | "project-current" | "project-upcoming" | "solution" | "collateral" | "none";
  linkTarget: string;
}

const DEFAULT_SUBDOMAINS: SubdomainPortal[] = [
  { id: "unilever", name: "unilever", displayName: "Unilever APAC", createdAt: new Date().toISOString() },
  { id: "reliance", name: "reliance", displayName: "Reliance Industries", createdAt: new Date().toISOString() },
  { id: "tatamotors", name: "tatamotors", displayName: "Tata Motors Co", createdAt: new Date().toISOString() },
  { id: "icis", name: "icis", displayName: "ICIS Services", createdAt: new Date().toISOString() }
];

const DEFAULT_CAROUSEL: CarouselItem[] = [
  {
    id: "car-1",
    title: "Mobius Retail Vision AI Platform",
    description: "Enterprise predictive modeling and hyperlocal shelf telemetry.",
    imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200",
    linkType: "solution",
    linkTarget: "sol-1"
  },
  {
    id: "car-2",
    title: "Unilever Asia Inventory Optimization Case Study",
    description: "Explore how we streamlined holding margins and reduced carrying overheads by 22%.",
    imageUrl: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1200",
    linkType: "collateral",
    linkTarget: "col-1"
  },
  {
    id: "car-3",
    title: "ICIS Portal Launch Pad",
    description: "Access specialized customer telemetry dashboards configured securely for ICIS workflows.",
    imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=1200",
    linkType: "subdomain",
    linkTarget: "icis"
  }
];

const DEFAULT_CURRENT_PROJECTS: CurrentProject[] = [
  {
    id: "proj-c1",
    customerName: "unilever",
    name: "APAC Automated Inventory Replenishment",
    description: "Real-time logistics platform monitoring, forecasting product shelf life and orchestrating stock movements across APAC distribution hubs.",
    department: "Logistics & Supply Chain APAC",
    deliveryLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    deliveryValues: [240, 280, 290, 310, 340, 380],
    qualityLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    qualityValues: [98.2, 98.7, 98.1, 99.0, 99.4, 99.6],
    innovations: [
      { title: "Dynamic Reorder Safety Stock", impact: "Reduced warehousing holding costs by 22% while completely avoiding core stockouts." },
      { title: "SLA Predictive Guardrails", impact: "Identifies delayed freight shipments 4 hours prior, triggering back-up logistics automatically." }
    ],
    tatTarget: "24 hours",
    tatActual: "18.5 hours",
    tatLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    tatValues: [22, 21, 20.5, 19.8, 19.1, 18.5],
    feedbackRepo: [
      { id: "fb-1", description: "Warehouse lead noted inventory Sync latency on Southeast Asia depots during peak promotion hours.", reportedDate: "2026-04-12", resolvedDate: "2026-04-14", status: "Resolved" },
      { id: "fb-2", description: "Requesting additional visual gauges on the telemetry dashboard for custom retail store clusters.", reportedDate: "2026-05-20", resolvedDate: null, status: "Open" }
    ],
    documents: [
      { name: "unilever_inventory_sla_brief.docx", size: "1.4 MB", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { name: "unilever_optimization_scope.pdf", size: "3.1 MB", type: "application/pdf" }
    ],
    enabled: true,
    createdAt: new Date().toISOString()
  },
  {
    id: "proj-c2",
    customerName: "reliance",
    name: "Omnichannel Grocery Fulfillment Sync",
    description: "Intelligent routing, multi-depot stock allocation, and visual micro-fulfillment tracking for hyperlocal grocery sales.",
    department: "Reliance Retail Hub Operations",
    deliveryLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    deliveryValues: [1420, 1510, 1490, 1680, 1750, 1820],
    qualityLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    qualityValues: [97.5, 97.9, 98.4, 98.8, 99.1, 99.4],
    innovations: [
      { title: "Batching Order Dispatchers", impact: "Increased fulfillment density, reducing final-mile routing fees by 14%." }
    ],
    tatTarget: "2 hours",
    tatActual: "1.6 hours",
    tatLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    tatValues: [1.9, 1.8, 1.75, 1.72, 1.65, 1.6],
    feedbackRepo: [
      { id: "fb-3", description: "Initial driver dispatch notification delays in Western Mumbai suburbs.", reportedDate: "2026-05-15", resolvedDate: "2026-05-18", status: "Resolved" }
    ],
    documents: [
      { name: "reliance_groceries_sla.pdf", size: "2.8 MB", type: "application/pdf" }
    ],
    enabled: true,
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_UPCOMING_PROJECTS: UpcomingProject[] = [
  {
    id: "proj-u1",
    customerName: "unilever",
    name: "IoT Sortation & Predictive Depot Maintenance",
    description: "Next-gen predictive maintenance pilot using temperature and vibration telemetry across high-volume belt systems at APAC central depot.",
    status: "POC / pilot",
    scope: "Instrumenting main sorter conveyor motors with temperature, heat, and sound sensors; ingestion into live predicting service dashboards; configuring early failure alert boundaries.",
    solution: "Continuous polling anomaly engine using sensory telemetry data, providing alerts to depot technicians before physical breakdown occurrences.",
    timelines: "Pilot launch scheduled: Q3 2026. Full rollout planned by Q1 2027.",
    department: "Logistics Maintenance APAC",
    documents: [
      { name: "iot_depot_maintenance_approach.pdf", size: "2.1 MB", type: "application/pdf", category: "Solution Approach" },
      { name: "depot_maintenance_pricing_draft.xlsx", size: "850 KB", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", category: "Pricing" }
    ],
    enabled: true,
    createdAt: new Date().toISOString()
  },
  {
    id: "proj-u2",
    customerName: "reliance",
    name: "AI Autonomous Demand Predictor",
    description: "Predictive replenishment modeling for festive holiday season shopping spikes across major tier-2 and tier-3 city retail outlets.",
    status: "Requirement gathering",
    scope: "Data mapping and cataloging historical festive cycles across 180 product divisions; evaluating predictive model suitability.",
    solution: "Deep learning forecasting pipelines leveraging regional social events and weather trends to model grocery item checkout demands.",
    timelines: "Discovery ends: Q3 2026. Proposed deployment: Q4 2026.",
    department: "Strategic Merchandising",
    documents: [
      { name: "reliance_festive_demand_proposal.pdf", size: "1.1 MB", type: "application/pdf", category: "Proposal" }
    ],
    enabled: true,
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_HERO_PROMPT = "Create a sharp, high-end professional introductory message detailing Mobius Solutions portfolio covering supply chain, retail, and predictive maintenance portals.";

const DEFAULT_HERO_TEXT = `## Delivering Enterprise Velocity Through Intelligent Workflows
We build custom software systems and technical pipelines that deliver real corporate impact. Explore our direct software solutions or read through full case studies mapping customer obstacles, technical implementations, and business analytics.`;

const DEFAULT_SOLUTIONS: Solution[] = [];

const DEFAULT_COLLATERALS: Collateral[] = [
  {
    id: "col-1",
    title: "Unilever Asia Inventory Optimization",
    thumbnail: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=800",
    prompt: "Generate an end-to-end modern inventory optimization study for Unilever Asia.",
    generatedContent: `# Unilever Asia Inventory Optimization Case Study

## 🏢 About the Customer
Unilever Asia is a leading consumer goods company managing over 40+ household brands across 15 different APAC regions, operating a complex supply chain consisting of 8 major distribution hubs.

## ⚠️ The Problem
- **Demand Over-Estimation**: Excessive buffer stock leading to high warehousing holding costs.
- **Stock-Out Events**: Unpredicted consumer shifts in retail resulting in a 4% loss of sales during high-season promotions.
- **Data Silos**: Distribution hubs lacked a single source of truth, causing a 12-day delay in inventory realignment.

## 👁️ The Solution
\`\`\`
[ Retail Stores ] ──(Real-time Sales)──> [ Mobius Sync Engine ] ──(ML Forecasting)──> [ Inventory Reorder ]
                                                 │
                                                 └───> [ Automated Distribution Plan ]
\`\`\`

Our solution integrated **Mobius Sync Engine** directly with Unilever's ERP:
1. **Telemetry Capture**: Ingestion of point-of-sale data with sub-hourly updates.
2. **Predictive ML Reordering**: Auto-generating replenishment drafts based on historical patterns and upcoming holiday traffic.
3. **Visual Replenishment Charts**: Live tracking of current warehouse inventory limits.

## 📈 Impact & Insights
* **Holding Costs Reduced by 22%**: Streamlined inventory margins across critical Southeast Asian depots.
* **Sales Up by 3.8%**: Elimination of peak stock-out situations.
* **Insight**: Dynamic forecasting is 10x more resilient against unexpected supply chain delays than strict static reordering thresholds.`,
    uploadedFiles: [
      { name: "unilever_asia_brief.docx", size: "1.4 MB", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { name: "unilever_inventory_optimization_deck.pdf", size: "4.2 MB", type: "application/pdf" }
    ],
    createdAt: new Date().toISOString(),
    customerName: "unilever"
  }
];

function readDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(content);
      let altered = false;
      if (!parsed.currentProjects) {
        parsed.currentProjects = DEFAULT_CURRENT_PROJECTS;
        altered = true;
      }
      if (!parsed.upcomingProjects) {
        parsed.upcomingProjects = DEFAULT_UPCOMING_PROJECTS;
        altered = true;
      }
      if (!parsed.subdomains) {
        parsed.subdomains = DEFAULT_SUBDOMAINS;
        altered = true;
      }
      // Ensure icis exists in subdomains list
      if (parsed.subdomains && !parsed.subdomains.some((s: any) => s.name === "icis")) {
        parsed.subdomains.push({ id: "icis", name: "icis", displayName: "ICIS Services", createdAt: new Date().toISOString() });
        altered = true;
      }
      if (!parsed.carousel) {
        parsed.carousel = DEFAULT_CAROUSEL;
        altered = true;
      }
      if (!parsed.subdomain || parsed.subdomain === "retail") {
        parsed.subdomain = "unilever";
        altered = true;
      }
      if (altered) {
        writeDatabase(parsed);
      }
      return parsed;
    }
  } catch (error) {
    console.error("Error reading database file, resetting to empty. Error:", error);
  }
  
  const initialDb: DatabaseSchema = {
    solutions: DEFAULT_SOLUTIONS,
    collaterals: DEFAULT_COLLATERALS,
    userLogs: [
      {
        id: "log-init",
        email: "onboarding@mobiusservices.co.in",
        action: "System Initialized",
        details: "Database hydrated with default solutions and collaterals.",
        date: new Date().toISOString()
      }
    ],
    heroText: DEFAULT_HERO_TEXT,
    heroPrompt: DEFAULT_HERO_PROMPT,
    subdomain: "unilever",
    subdomains: DEFAULT_SUBDOMAINS,
    currentProjects: DEFAULT_CURRENT_PROJECTS,
    upcomingProjects: DEFAULT_UPCOMING_PROJECTS,
    carousel: DEFAULT_CAROUSEL,
    logo: ""
  };
  writeDatabase(initialDb);
  return initialDb;
}

function writeDatabase(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing database:", error);
  }
}

// Start Express server
const app = express();
const PORT = 3000;

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (() => {
  console.warn("[WARN] ADMIN_TOKEN env var not set. Using default 'dev-admin' — set ADMIN_TOKEN in production.");
  return "dev-admin";
})();

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers["x-admin-token"];
  if (token && token === ADMIN_TOKEN) return next();

  // Accept logged-in admin users via X-Admin-User header — validate against S3-sourced cache
  const adminUserEmail = req.headers["x-admin-user"] as string | undefined;
  if (adminUserEmail) {
    const users: InternalUser[] = usersCache ?? (readDatabase().users || []);
    const user = users.find(u => u.email === adminUserEmail.trim().toLowerCase() && u.role === "admin" && u.enabled !== false);
    if (user) return next();
  }

  return res.status(401).json({ error: "Unauthorized." });
}

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Admin auth guard — applies to every /api/admin/* route defined below
app.use("/api/admin", requireAdminAuth);
app.post("/api/admin/verify", (_req, res) => res.json({ ok: true }));

// Multer — disk storage for uploaded files
const multerStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const slug = ((req.query.portalSlug as string) || "").replace(/[^a-z0-9_-]/gi, "");
    const dest = slug ? path.join(UPLOADS_DIR, slug) : UPLOADS_DIR;
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage: multerStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// Serve uploaded files as static assets
app.use("/uploads", express.static(UPLOADS_DIR));

// File upload endpoint (admin only)
app.post("/api/upload", requireAdminAuth, upload.single("file"), (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file received." });
  }
  const portalSlug = ((req.query.portalSlug as string) || "").replace(/[^a-z0-9_-]/gi, "");
  const subPath = portalSlug ? `${portalSlug}/` : "";
  const url = `/uploads/${subPath}${req.file.filename}`;
  res.json({
    url,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// File download — serve real files from uploads/
app.get("/api/download/:filename", (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const portalSlug = ((req.query.portalSlug as string) || "").replace(/[^a-z0-9_-]/gi, "");
  const filePath = portalSlug
    ? path.join(UPLOADS_DIR, portalSlug, safeFilename)
    : path.join(UPLOADS_DIR, safeFilename);

  if (!filePath.startsWith(UPLOADS_DIR)) {
    return res.status(400).json({ error: "Invalid path." });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found." });
  }
  res.download(filePath);
});

// GET database — strips passwordHash from users before sending to frontend
app.get("/api/database", (_req, res) => {
  const db = readDatabase();
  const safeUsers: PortalUser[] = (db.users || []).map(({ passwordHash: _ph, ...safe }) => safe);
  res.json({ ...db, users: safeUsers });
});

// POST login — validates email + password against S3-sourced users cache (falls back to local DB)
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const normalized = email.trim().toLowerCase();
  const hash = hashPassword(password);

  // Prefer in-memory S3 cache; fall back to local DB if cache not yet loaded
  const users: InternalUser[] = usersCache ?? (readDatabase().users || []);
  const user = users.find(u => u.email === normalized && u.passwordHash === hash && u.enabled !== false);

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Log to local DB (non-blocking)
  const db = readDatabase();
  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: normalized,
    action: "User Login",
    details: `User "${user.name}" (${user.role}) authenticated successfully.`,
    date: new Date().toISOString()
  });
  writeDatabase(db);

  res.json({ success: true, email: normalized, name: user.name, role: user.role });
});

// Legacy email-login kept for backward compatibility — redirects to /api/login
app.post("/api/email-login", (req, res) => {
  res.status(410).json({ error: "Please use email and password to login." });
});

// USER management (admin only)
app.post("/api/admin/users", (req, res) => {
  const { action, user } = req.body;
  const db = readDatabase();
  if (!db.users) db.users = [];

  if (action === "create") {
    if (!user.email || !user.name || !user.password) {
      return res.status(400).json({ error: "Email, name, and password are required." });
    }
    if (db.users.some(u => u.email === user.email.trim().toLowerCase())) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }
    const newUser: InternalUser = {
      id: `user-${Date.now()}`,
      email: user.email.trim().toLowerCase(),
      name: user.name.trim(),
      passwordHash: hashPassword(user.password),
      role: user.role || "viewer",
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    db.users.unshift(newUser);
    db.userLogs.unshift({ id: `log-${Date.now()}`, email: "admin@mobiusservices.co.in", action: "User Created", details: `User "${newUser.name}" (${newUser.email}) onboarded with role: ${newUser.role}.`, date: new Date().toISOString() });
  } else if (action === "update") {
    const target = db.users.find(u => u.id === user.id);
    if (target?.isSystem) {
      return res.status(403).json({ error: "System accounts cannot be modified." });
    }
    db.users = db.users.map(u => {
      if (u.id !== user.id) return u;
      return {
        ...u,
        name: user.name ?? u.name,
        role: user.role ?? u.role,
        enabled: user.enabled ?? u.enabled,
        ...(user.password ? { passwordHash: hashPassword(user.password) } : {}),
      };
    });
    db.userLogs.unshift({ id: `log-${Date.now()}`, email: "admin@mobiusservices.co.in", action: "User Updated", details: `User ID "${user.id}" updated.`, date: new Date().toISOString() });
  } else if (action === "delete") {
    const delTarget = db.users.find(u => u.id === user.id);
    if (delTarget?.isSystem) {
      return res.status(403).json({ error: "System accounts cannot be deleted." });
    }
    db.users = db.users.filter(u => u.id !== user.id);
    db.userLogs.unshift({ id: `log-${Date.now()}`, email: "admin@mobiusservices.co.in", action: "User Deleted", details: `User ID "${user.id}" removed.`, date: new Date().toISOString() });
  }

  writeDatabase(db);

  // Update in-memory cache so future logins immediately see the change
  usersCache = db.users || [];

  // Sync to S3 (fire-and-forget — don't block the HTTP response)
  s3SyncUsers(db.users || []).catch(() => {});

  const safeUsers: PortalUser[] = (db.users || []).map(({ passwordHash: _ph, ...safe }) => safe);
  res.json({ success: true, users: safeUsers });
});

// POST logging action
app.post("/api/log", (req, res) => {
  const { email, action, details } = req.body;
  const db = readDatabase();
  
  const newLog: UserLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    email: email || "anonymous-viewer",
    action: action || "Page View",
    details: details || "Viewed specific item.",
    date: new Date().toISOString()
  };
  
  db.userLogs.unshift(newLog);
  writeDatabase(db);
  res.json({ success: true });
});

// SOLUTIONS management
app.post("/api/admin/solutions", (req, res) => {
  const { action, solution } = req.body;
  const db = readDatabase();

  if (action === "create") {
    const newSol: Solution = {
      ...solution,
      id: `sol-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.solutions.unshift(newSol);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Solution Created",
      details: `Solution "${newSol.title}" onboarded successfully.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.solutions = db.solutions.map(s => s.id === solution.id ? { ...s, ...solution } : s);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Solution Updated",
      details: `Solution "${solution.title}" details was edited.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.solutions = db.solutions.filter(s => s.id !== solution.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Solution Deleted",
      details: `Solution with ID "${solution.id}" was soft deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// COLLATERALS management
app.post("/api/admin/collaterals", (req, res) => {
  const { action, collateral } = req.body;
  const db = readDatabase();

  if (action === "create") {
    const newCol: Collateral = {
      ...collateral,
      id: `col-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.collaterals.unshift(newCol);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Collateral Added",
      details: `Collateral study "${newCol.title}" created.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.collaterals = db.collaterals.map(c => c.id === collateral.id ? { ...c, ...collateral } : c);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Collateral Updated",
      details: `Collateral study "${collateral.title}" updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.collaterals = db.collaterals.filter(c => c.id !== collateral.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Collateral Deleted",
      details: `Collateral with ID "${collateral.id}" removed.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// CURRENT PROJECTS management
app.post("/api/admin/projects/current", (req, res) => {
  const { action, project } = req.body;
  const db = readDatabase();

  if (!db.currentProjects) db.currentProjects = [];

  if (action === "create") {
    const newProj: CurrentProject = {
      ...project,
      id: `proj-c-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.currentProjects.unshift(newProj);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Current Project Created",
      details: `Project "${newProj.name}" created for customer: ${newProj.customerName}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.currentProjects = db.currentProjects.map(p => p.id === project.id ? { ...p, ...project } : p);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Current Project Updated",
      details: `Project "${project.name}" details updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.currentProjects = db.currentProjects.filter(p => p.id !== project.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Current Project Deleted",
      details: `Project with ID "${project.id}" deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// UPCOMING PROJECTS management
app.post("/api/admin/projects/upcoming", (req, res) => {
  const { action, project } = req.body;
  const db = readDatabase();

  if (!db.upcomingProjects) db.upcomingProjects = [];

  if (action === "create") {
    const newProj: UpcomingProject = {
      ...project,
      id: `proj-u-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.upcomingProjects.unshift(newProj);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Upcoming Project Created",
      details: `Upcoming engagement "${newProj.name}" added for customer: ${newProj.customerName}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.upcomingProjects = db.upcomingProjects.map(p => p.id === project.id ? { ...p, ...project } : p);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Upcoming Project Updated",
      details: `Upcoming engagement "${project.name}" details revised.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.upcomingProjects = db.upcomingProjects.filter(p => p.id !== project.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Upcoming Project Deleted",
      details: `Upcoming engagement with ID "${project.id}" deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// AI PROJECT GENERATOR via OpenAI
app.post("/api/admin/generate-project", async (req, res) => {
  const { name, customerName, templateType } = req.body;

  const systemPrompt = `You are an expert enterprise systems project metadata and metrics generator.
Generate structured project metadata in raw JSON form.
Project Title: ${name}
Target Customer: ${customerName}
Type: ${templateType} (MUST be "current" or "upcoming")

If type is "current", return ONLY a raw JSON object (no markdown fences, no text outside JSON):
{"name":"${name}","description":"1-2 sentence description","department":"Logistics & Supply Chain","deliveryLabels":["Jan","Feb","Mar","Apr","May","Jun"],"deliveryValues":[310,390,420,380,480,520],"qualityLabels":["Jan","Feb","Mar","Apr","May","Jun"],"qualityValues":[98.2,98.6,99.1,98.9,99.4,99.7],"innovations":[{"title":"Example innovation","impact":"Reduced overhead by 12%."}],"tatTarget":"24 hours","tatActual":"18.5 hours","tatLabels":["Jan","Feb","Mar","Apr","May","Jun"],"tatValues":[23.1,21.5,20.1,19.4,18.7,18.5],"feedbackRepo":[{"id":"fb1","description":"Client feedback note.","reportedDate":"2026-05-12","resolvedDate":"2026-05-14","status":"Resolved"}]}

If type is "upcoming", return ONLY a raw JSON object:
{"name":"${name}","description":"Engaging description","status":"Requirement gathering","scope":"Scope of work","solution":"Technical solution","timelines":"Pilot Q3 2026, full rollout Q1 2027","department":"Operations"}

CRITICAL: Output ONLY the raw JSON object. No markdown, no explanation.`;

  try {
    const raw = await aiChat(systemPrompt, `Generate metadata for: ${name} (${customerName})`);
    const clean = raw.replace(/```json/gi, "").replace(/```/gi, "").trim();
    res.json(JSON.parse(clean));
  } catch (error: any) {
    console.error("AI Project Generation Error:", error);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

// AI collateral generation via OpenAI (reads uploaded files from disk for text content)
app.post("/api/admin/generate-collateral", async (req, res) => {
  const { title, prompt, uploadedFiles } = req.body;

  // Enrich file entries with text content read from disk where available
  const filesWithContent = await Promise.all((uploadedFiles || []).map(async (f: any) => {
    if (f.url?.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), f.url.replace(/^\//, "").split("/").join(path.sep));
      try {
        if (fs.existsSync(filePath)) {
          const isText = f.type?.startsWith("text/") ||
            [".txt", ".csv", ".json", ".md"].some((ext: string) => (f.name || "").toLowerCase().endsWith(ext));
          if (isText) {
            return { ...f, content: fs.readFileSync(filePath, "utf-8").substring(0, 15000) };
          }
        }
      } catch {}
    }
    return f;
  }));

  const fileCount = filesWithContent.length;
  let systemPrompt: string;

  if (fileCount === 0) {
    systemPrompt = `You are an elite enterprise AI asset content creator for Mobius Knowledge Services.
Generate a high-quality corporate case study / asset outline. Format with clean markdown:

# ${title || "Enterprise Asset"}

## 🏢 About the Customer
## ⚠️ The Problem
## 👁️ The Solution
[Include an ASCII workflow diagram]
## 📈 Impact & Insights`;
  } else {
    const referenceDocs = filesWithContent.map((f: any) =>
      `### FILE: ${f.name} (${f.type}, ${f.size || "unknown size"})\n${f.content || "[Binary file — content not extractable]"}`
    ).join("\n\n");

    systemPrompt = `You are a strict enterprise business case study generator for Mobius Knowledge Services.
RESTRICT generation SOLELY to facts found in the uploaded documents. Do not invent metrics.

Format:
# ${title || "Enterprise Solution Study"}
## 🏢 About the Customer
## ⚠️ The Problem
## 👁️ The Solution
## 📈 Impact & Insights

UPLOADED DOCUMENTS:
${referenceDocs}`;
  }

  try {
    const content = await aiChat(systemPrompt, prompt || "Generate the case study.");
    res.json({ generatedContent: content });
  } catch (error: any) {
    console.error("AI Collateral Error:", error);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

// AI Hero Generation via OpenAI
app.post("/api/admin/generate-hero", async (req, res) => {
  const { prompt } = req.body;
  const db = readDatabase();

  const systemPrompt = `You are an elite marketing copywriter for enterprise business channels.
Write a powerful headline (starting with ##) and a short professional paragraph.
Style: direct, sophisticated, no exclamation marks, no hype.
Format exactly:
## [Compelling Headline]
[One concise professional paragraph]`;

  try {
    const heroOutput = await aiChat(systemPrompt, prompt || "Write a corporate portal introduction.");
    db.heroText = heroOutput;
    db.heroPrompt = prompt;
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Hero Text Regenerated",
      details: "AI-generated portal headline updated.",
      date: new Date().toISOString()
    });
    writeDatabase(db);
    autoDeployLivePortals(db);
    res.json({ success: true, heroText: heroOutput, database: db });
  } catch (error: any) {
    console.error("Hero Generation Error:", error);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

// Subdomain management
app.post("/api/admin/subdomain", (req, res) => {
  const { subdomain } = req.body;
  if (!subdomain) {
    return res.status(400).json({ error: "Subdomain is required." });
  }
  
  const cleanSub = subdomain.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const db = readDatabase();
  db.subdomain = cleanSub;
  
  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: "admin@mobiusservices.co.in",
    action: "Server Subdomain Adjusted",
    details: `Portal host target set to: ${cleanSub}.mobiusservices.co.in`,
    date: new Date().toISOString()
  });

  writeDatabase(db);
  res.json({ success: true, subdomain: cleanSub, database: db });
});

// Subdomains list management (Customer Portals)
app.post("/api/admin/subdomains", (req, res) => {
  const { action, name, subdomain, displayName, id } = req.body;
  const resolvedName = name || subdomain;
  const db = readDatabase();
  if (!db.subdomains) db.subdomains = [...DEFAULT_SUBDOMAINS];

  if (action === "update") {
    const targetId = id || resolvedName;
    const portal = (db.subdomains || []).find(s => s.id === targetId);
    if (!portal) return res.status(404).json({ error: "Portal not found." });
    if (req.body.displayName !== undefined) portal.displayName = req.body.displayName.trim();
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Portal Updated",
      details: `Portal "${targetId}" settings saved.`,
      date: new Date().toISOString(),
    });
    writeDatabase(db);
    return res.json({ success: true, subdomains: db.subdomains, database: db });

  } else if (action === "create") {
    if (!resolvedName || !displayName) {
      return res.status(400).json({ error: "Subdomain name and Portal Display Name are required." });
    }
    const cleanSub = resolvedName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanSub) {
      return res.status(400).json({ error: "Subdomain name has invalid characters." });
    }
    const exists = db.subdomains.some(s => s.name === cleanSub);
    if (exists) {
      return res.status(400).json({ error: `Subdomain portal ${cleanSub}.mobiusservices.co.in already exists.` });
    }

    if (!db.portAssignments) db.portAssignments = {};
    const port = assignNextPort(db.portAssignments);
    db.portAssignments[cleanSub] = port;

    const selectedDomain = req.body.domain || "mobiusservices.io";
    const s3Key = `${S3_PREFIX}/${cleanSub}/`;

    const newSub: SubdomainPortal = {
      id: cleanSub,
      name: cleanSub,
      displayName: displayName.trim(),
      createdAt: new Date().toISOString(),
      port,
      domain: selectedDomain,
      s3Key,
      status: "sleep",
    };
    db.subdomains.unshift(newSub);
    db.subdomain = cleanSub;

    // Local portal folder
    fs.mkdirSync(path.join(PORTALS_DIR, cleanSub, "assets"), { recursive: true });

    writeDatabase(db);

    // Write default portal.json pre-populated with hub content + config
    const defaultPortalJson = buildDefaultPortalJson(cleanSub, newSub, db);
    const portalDir = path.join(PORTALS_DIR, cleanSub);
    fs.writeFileSync(path.join(portalDir, "portal.json"), JSON.stringify(defaultPortalJson, null, 2), "utf-8");
    s3PutPortalFile(cleanSub, "portal.json", defaultPortalJson)
      .catch(err => console.error(`[S3] Failed to init portal.json for ${cleanSub}:`, err?.message));
    s3PutPortalFile(cleanSub, "config.json", {
      slug: cleanSub, displayName: displayName.trim(),
      domain: selectedDomain, port, s3Key, createdAt: newSub.createdAt,
    }).catch(err => console.error(`[S3] Failed to init config for ${cleanSub}:`, err?.message));

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Customer Subdomain Portal Created",
      details: `Created portal: ${cleanSub}.${selectedDomain} on port ${port}. Toggle to Live when ready.`,
      date: new Date().toISOString()
    });

  } else if (action === "create-dummy") {
    if (!db.portAssignments) db.portAssignments = {};
    const port = assignNextPort(db.portAssignments);
    const slug = `local-${Date.now()}`;
    db.portAssignments[slug] = port;

    const dummyDisplayName = (req.body.displayName || "Local Dev Portal").trim();
    const s3Key = `${S3_PREFIX}/${slug}/`;

    const newDummy: SubdomainPortal = {
      id: slug,
      name: slug,
      displayName: dummyDisplayName,
      createdAt: new Date().toISOString(),
      port,
      s3Key,
      isDummy: true,
      status: "sleep",
    };
    db.subdomains.unshift(newDummy);

    const dummyDir = path.join(PORTALS_DIR, slug);
    fs.mkdirSync(path.join(dummyDir, "assets"), { recursive: true });
    writeDatabase(db);

    // Write default portal.json pre-populated with hub content
    const defaultDummyJson = buildDefaultPortalJson(slug, newDummy, db);
    fs.writeFileSync(path.join(dummyDir, "portal.json"), JSON.stringify(defaultDummyJson, null, 2), "utf-8");
    s3PutPortalFile(slug, "portal.json", defaultDummyJson)
      .catch(err => console.error(`[S3] Failed to init portal.json for ${slug}:`, err?.message));
    s3PutPortalFile(slug, "config.json", {
      slug, displayName: dummyDisplayName, port, s3Key, isDummy: true, createdAt: newDummy.createdAt,
    }).catch(err => console.error(`[S3] Failed to init config for ${slug}:`, err?.message));

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Dummy Portal Created",
      details: `Created local dev portal "${dummyDisplayName}" on port ${port} (localhost:${port}). Toggle to Live when ready.`,
      date: new Date().toISOString()
    });

  } else if (action === "toggle") {
    const targetId = id || resolvedName;
    const targetStatus: "live" | "sleep" = req.body.targetStatus;
    if (!targetId || !targetStatus) {
      return res.status(400).json({ error: "id and targetStatus ('live'|'sleep') are required." });
    }

    const portal = (db.subdomains || []).find(s => s.id === targetId);
    if (!portal) {
      return res.status(404).json({ error: `Portal "${targetId}" not found.` });
    }

    if (targetStatus === "live") {
      // Ensure portal has a port (assign one if missing for legacy portals)
      if (!portal.port) {
        if (!db.portAssignments) db.portAssignments = {};
        portal.port = assignNextPort(db.portAssignments);
        db.portAssignments[targetId] = portal.port;
      }
      // Always write a fresh portal.json with current content before spawning,
      // so the portal starts with up-to-date solutions/collaterals from day one
      fs.mkdirSync(path.join(PORTALS_DIR, targetId, "assets"), { recursive: true });
      deployPortalInProcess(targetId, db).catch(err =>
        console.warn(`[toggle-deploy] ${targetId}:`, err?.message)
      );
      pm2SpawnPortal(targetId, portal.port);
    } else {
      pm2StopPortal(targetId);
    }

    portal.status = targetStatus;
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: targetStatus === "live" ? "Portal Started" : "Portal Stopped",
      details: `Portal "${portal.displayName}" toggled to ${targetStatus} on port ${portal.port}.`,
      date: new Date().toISOString()
    });

  } else if (action === "delete") {
    const targetId = id || resolvedName;
    db.subdomains = db.subdomains.filter(s => s.id !== targetId);

    if (db.subdomain === targetId) {
      db.subdomain = db.subdomains[0]?.name || "unilever";
    }

    // Remove the deleted portal's slug from all content mappings so nothing carries over
    const stripSlug = (items: any[]) => items.map(item => ({
      ...item,
      customerNames: (item.customerNames || []).filter((n: string) => n !== targetId),
      customerName: item.customerName === targetId ? "" : item.customerName,
    }));
    db.solutions = stripSlug(db.solutions || []);
    db.collaterals = stripSlug(db.collaterals || []);
    db.currentProjects = stripSlug(db.currentProjects || []);
    db.upcomingProjects = stripSlug(db.upcomingProjects || []);

    // Stop PM2 portal process
    pm2StopPortal(targetId);

    // Free the port assignment
    if (db.portAssignments) {
      delete db.portAssignments[targetId];
    }

    // Delete local portal folder
    const portalDir = path.join(PORTALS_DIR, targetId);
    if (fs.existsSync(portalDir)) {
      try {
        fs.rmSync(portalDir, { recursive: true, force: true });
        console.log(`[portal-${targetId}] Deleted local folder`);
      } catch (err: any) {
        console.warn(`[portal-${targetId}] Could not delete local folder:`, err?.message);
      }
    }

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Customer Subdomain Portal Deleted",
      details: `Deleted portal "${targetId}", removed its slug from all content mappings.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  res.json({ success: true, subdomain: db.subdomain, subdomains: db.subdomains, database: db });
});

// Update Spotlight Carousel Configuration
app.post("/api/admin/update-carousel", (req, res) => {
  const { carousel } = req.body;
  if (!Array.isArray(carousel)) {
    return res.status(400).json({ error: "Carousel data must be an array." });
  }

  const db = readDatabase();
  db.carousel = carousel;

  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: "admin@mobiusservices.co.in",
    action: "Spotlight Carousel Updated",
    details: `Successfully saved ${carousel.length} carousel slides in administrative settings.`,
    date: new Date().toISOString()
  });

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, carousel: db.carousel, database: db });
});

// Portal deploy — writes filtered config snapshot locally + uploads to S3 + signals portal to reload
app.post("/api/admin/deploy", async (req, res) => {
  const { portalSlug } = req.body;
  if (!portalSlug) return res.status(400).json({ error: "portalSlug required." });

  const cleanSlug = portalSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const portalDir = path.join(PORTALS_DIR, cleanSlug);
  fs.mkdirSync(path.join(portalDir, "assets"), { recursive: true });

  const db = readDatabase();
  const matchesSlug = (names: string[]) => names.includes(cleanSlug) || names.includes("all");
  const subdomainInfo = (db.subdomains || []).find((s: any) => s.name === cleanSlug) || null;

  const portalJson = {
    slug: cleanSlug,
    subdomain: cleanSlug,
    deployedAt: new Date().toISOString(),
    heroText: db.heroText,
    logo: db.logo || "",
    carousel: (db.carousel || []).filter((c: any) =>
      !c.customerName || c.customerName === cleanSlug || c.customerName === "all"
    ),
    solutions: (db.solutions || []).filter((s: any) =>
      matchesSlug(s.customerNames || (s.customerName ? [s.customerName] : ["all"]))
    ),
    collaterals: (db.collaterals || []).filter((c: any) =>
      matchesSlug(c.customerNames || (c.customerName ? [c.customerName] : ["all"]))
    ),
    currentProjects: (db.currentProjects || []).filter((p: any) =>
      matchesSlug(p.customerNames || [p.customerName])
    ),
    upcomingProjects: (db.upcomingProjects || []).filter((p: any) =>
      matchesSlug(p.customerNames || [p.customerName])
    ),
    subdomainInfo,
    subdomains: [],
    userLogs: [],
    heroPrompt: "",
    users: (db.users || []).filter(u => u.enabled !== false).map(u => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      passwordHash: u.passwordHash, createdAt: u.createdAt,
    })),
  };

  // Write local snapshot
  fs.writeFileSync(path.join(portalDir, "portal.json"), JSON.stringify(portalJson, null, 2), "utf-8");

  // Upload to S3
  let s3Status = "ok";
  try {
    await s3PutPortalFile(cleanSlug, "portal.json", portalJson);
  } catch (err: any) {
    s3Status = err?.message || "S3 upload failed";
    console.error(`[S3] Deploy upload failed for ${cleanSlug}:`, s3Status);
  }

  // Signal portal process to reload its data (fire-and-forget)
  const portalPort = subdomainInfo?.port || (db.portAssignments || {})[cleanSlug];
  if (portalPort) {
    const reloadReq = http.request({ hostname: "127.0.0.1", port: portalPort, path: "/api/reload", method: "POST" }, () => {});
    reloadReq.on("error", () => {});
    reloadReq.end();
  }

  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: "admin@mobiusservices.co.in",
    action: "Portal Deployed",
    details: `Deployed ${cleanSlug} to S3 (s3://${S3_BUCKET}/${S3_PREFIX}/${cleanSlug}/portal.json). S3: ${s3Status}`,
    date: new Date().toISOString(),
  });
  writeDatabase(db);

  res.json({
    success: true,
    portalDir: `data/portals/${cleanSlug}`,
    s3Path: `s3://${S3_BUCKET}/${S3_PREFIX}/${cleanSlug}/portal.json`,
    s3Status,
    deployedAt: portalJson.deployedAt,
  });
});

// Hub identity endpoint — tells the frontend it is the Hub (not a customer portal)
app.get("/api/portal-info", (_req, res) => {
  res.json({ isHub: true });
});

async function seedDefaultAdmin(): Promise<void> {
  const SYSTEM_EMAIL = "eswar@xtract.io";
  const SYSTEM_HASH = hashPassword("xts123");

  const db = readDatabase();
  if (!db.users) db.users = [];

  // Pull users from S3 as the authoritative source; merge into local DB
  const s3Users = await loadUsersFromS3();
  if (s3Users && s3Users.length > 0) {
    // S3 wins: replace local users list (preserving any local-only entries not yet in S3)
    const s3Emails = new Set(s3Users.map(u => u.email));
    const localOnly = db.users.filter(u => !s3Emails.has(u.email));
    db.users = [...s3Users, ...localOnly];
    console.log(`[Auth] Merged ${s3Users.length} S3 users into local DB`);
  }

  // Ensure system admin exists and is always correct regardless of prior UI actions
  const idx = db.users.findIndex(u => u.email === SYSTEM_EMAIL);
  if (idx === -1) {
    db.users.unshift({
      id: "system-admin-eswar",
      email: SYSTEM_EMAIL,
      name: "Eswar (Admin)",
      role: "admin",
      passwordHash: SYSTEM_HASH,
      createdAt: new Date().toISOString(),
      enabled: true,
      isSystem: true,
    });
    console.log(`[Auth] Created system admin: ${SYSTEM_EMAIL}`);
  } else {
    db.users[idx] = {
      ...db.users[idx],
      passwordHash: SYSTEM_HASH,
      role: "admin",
      enabled: true,
      isSystem: true,
    };
    console.log(`[Auth] System admin enforced: ${SYSTEM_EMAIL}`);
  }

  writeDatabase(db);

  // Populate the in-memory cache so login works immediately from S3 data
  usersCache = db.users;

  // Push the authoritative merged list back to S3 (best-effort)
  s3SyncUsers(db.users).catch(() => {});
}

async function startServer() {
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Mobius Portal Server] Operating securely at: http://localhost:${PORT}`);
  });
}

startServer();
