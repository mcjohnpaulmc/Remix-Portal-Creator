/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import multer from "multer";
import { Solution, Collateral, UserLog, CurrentProject, UpcomingProject, SubdomainPortal } from "../shared/types";

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
  const provided = req.headers["x-admin-token"];
  if (!provided || provided !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
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

// GET database
app.get("/api/database", (req, res) => {
  const db = readDatabase();
  res.json(db);
});

// POST corporate email login with exact work domain checks
app.post("/api/email-login", (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const normalized = email.trim().toLowerCase();
  
  // Forbidden consumer domains
  const forbiddenDomains = [
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "aol.com",
    "live.com",
    "zoho.com",
    "mail.com",
    "protonmail.com",
    "yandex.com",
    "gmx.com"
  ];

  const domain = normalized.split("@")[1];
  
  if (forbiddenDomains.includes(domain)) {
    return res.status(403).json({
      error: `Access denied. Personal email domains (${domain}) are not permitted. Please use your corporate or enterprise domain to authenticate.`
    });
  }

  // Success - track in logs
  const db = readDatabase();
  const newLog: UserLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    email: normalized,
    action: "Work Email Access Granted",
    details: `User entered domain: @${domain} and verified email status.`,
    date: new Date().toISOString()
  };
  db.userLogs.unshift(newLog);
  writeDatabase(db);

  res.json({ success: true, email: normalized });
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

  if (action === "create") {
    if (!resolvedName || !displayName) {
      return res.status(400).json({ error: "Subdomain name and Portal Display Name are required." });
    }
    const cleanSub = resolvedName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanSub) {
      return res.status(400).json({ error: "Subdomain name has invalid characters." });
    }
    // Check duplication
    const exists = db.subdomains.some(s => s.name === cleanSub);
    if (exists) {
      return res.status(400).json({ error: `Subdomain portal ${cleanSub}.mobiusservices.co.in already exists.` });
    }

    const newSub: SubdomainPortal = {
      id: cleanSub,
      name: cleanSub,
      displayName: displayName.trim(),
      createdAt: new Date().toISOString()
    };
    db.subdomains.unshift(newSub);
    // Auto point active subdomain to the newly created one to act as a launchpad!
    db.subdomain = cleanSub;

    // Create portal folder on disk
    fs.mkdirSync(path.join(PORTALS_DIR, cleanSub, "assets"), { recursive: true });

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Customer Subdomain Portal Created",
      details: `Created subdomain: ${cleanSub}.mobiusservices.co.in for "${displayName.trim()}"`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    const targetId = id || resolvedName;
    db.subdomains = db.subdomains.filter(s => s.id !== targetId);
    
    // If the active subdomain was deleted, default to the first available one (or "unilever")
    if (db.subdomain === targetId) {
      db.subdomain = db.subdomains[0]?.name || "unilever";
    }

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Customer Subdomain Portal Deleted",
      details: `Deleted subdomain portal with reference ID: ${targetId}`,
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
  res.json({ success: true, carousel: db.carousel, database: db });
});

// Portal deploy — writes filtered config snapshot to data/portals/<slug>/portal.json
app.post("/api/admin/deploy", async (req, res) => {
  const { portalSlug } = req.body;
  if (!portalSlug) return res.status(400).json({ error: "portalSlug required." });

  const cleanSlug = portalSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const portalDir = path.join(PORTALS_DIR, cleanSlug);
  fs.mkdirSync(path.join(portalDir, "assets"), { recursive: true });

  const db = readDatabase();
  const matchesSlug = (names: string[]) => names.includes(cleanSlug) || names.includes("all");

  const config = {
    slug: cleanSlug,
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
    subdomainInfo: (db.subdomains || []).find((s: any) => s.name === cleanSlug) || null,
  };

  fs.writeFileSync(path.join(portalDir, "portal.json"), JSON.stringify(config, null, 2), "utf-8");

  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: "admin@mobiusservices.co.in",
    action: "Portal Deployed",
    details: `Config snapshot written to data/portals/${cleanSlug}/portal.json`,
    date: new Date().toISOString(),
  });
  writeDatabase(db);

  res.json({ success: true, portalDir: `data/portals/${cleanSlug}`, deployedAt: config.deployedAt });
});

async function startServer() {
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
