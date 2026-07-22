/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import {
  Solution,
  Collateral,
  UserLog,
  CurrentProject,
  UpcomingProject,
  SubdomainPortal,
  PortalUser,
  CarouselItem,
} from "../../shared/types";
import { DATA_DIR, DATA_FILE, PORTALS_DIR } from "../config";

// Internal user record — includes passwordHash, never sent to frontend
export interface InternalUser extends PortalUser {
  passwordHash: string;
}

export interface DatabaseSchema {
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

// Re-export CarouselItem so dependents can import it from here if needed
export type { CarouselItem };

// Ensure required directories exist (called at module load)
function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PORTALS_DIR)) fs.mkdirSync(PORTALS_DIR, { recursive: true });
}

ensureDirectories();

// ── Default constants ──────────────────────────────────────────────────────────

export const DEFAULT_SUBDOMAINS: SubdomainPortal[] = [];

export const DEFAULT_CAROUSEL: CarouselItem[] = [
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
];

export const DEFAULT_CURRENT_PROJECTS: CurrentProject[] = [
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

export const DEFAULT_UPCOMING_PROJECTS: UpcomingProject[] = [
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

export const DEFAULT_HERO_PROMPT = "Create a sharp, high-end professional introductory message detailing Mobius Solutions portfolio covering supply chain, retail, and predictive maintenance portals.";

export const DEFAULT_HERO_TEXT = `## Delivering Enterprise Velocity Through Intelligent Workflows
We build custom software systems and technical pipelines that deliver real corporate impact. Explore our direct software solutions or read through full case studies mapping customer obstacles, technical implementations, and business analytics.`;

export const DEFAULT_SOLUTIONS: Solution[] = [];

export const DEFAULT_COLLATERALS: Collateral[] = [
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

// ── Database I/O ───────────────────────────────────────────────────────────────

export function readDatabase(): DatabaseSchema {
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
      // Remove legacy demo portals that were seeded in earlier versions
      const LEGACY_PORTAL_IDS = ["unilever", "reliance", "tatamotors", "icis"];
      if (parsed.subdomains) {
        const before = parsed.subdomains.length;
        parsed.subdomains = parsed.subdomains.filter((s: any) => !LEGACY_PORTAL_IDS.includes(s.id));
        if (parsed.subdomains.length !== before) altered = true;
      }
      // Backfill id from name for portals created before the id field was introduced
      if (parsed.subdomains) {
        parsed.subdomains = parsed.subdomains.map((s: any) => s.id ? s : { ...s, id: s.name });
        altered = true;
      }
      if (!parsed.carousel) {
        parsed.carousel = DEFAULT_CAROUSEL;
        altered = true;
      }
      if (!parsed.subdomain || parsed.subdomain === "retail" || LEGACY_PORTAL_IDS.includes(parsed.subdomain)) {
        parsed.subdomain = parsed.subdomains?.[0]?.name || "";
        altered = true;
      }
      if (altered) {
        writeDatabase(parsed);
      }
      return parsed;
    }
  } catch (error) {
    // Preserve the corrupted file for diagnosis before resetting
    try {
      const backupPath = DATA_FILE + `.corrupt-${Date.now()}.bak`;
      fs.copyFileSync(DATA_FILE, backupPath);
      // eslint-disable-next-line no-console
      console.error(`[DB] Corrupted database backed up to ${backupPath}`);
    } catch { /* best-effort */ }
    // eslint-disable-next-line no-console
    console.error("Error reading database file, resetting to defaults. Error:", error);
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
    subdomain: "",
    subdomains: DEFAULT_SUBDOMAINS,
    currentProjects: DEFAULT_CURRENT_PROJECTS,
    upcomingProjects: DEFAULT_UPCOMING_PROJECTS,
    carousel: DEFAULT_CAROUSEL,
    logo: ""
  };
  writeDatabase(initialDb);
  return initialDb;
}

export function writeDatabase(db: DatabaseSchema): void {
  const tmp = DATA_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tmp, DATA_FILE);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error writing database:", error);
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
  }
}
