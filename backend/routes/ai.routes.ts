/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { Router } from "express";
import OpenAI from "openai";
import { readDatabase, writeDatabase } from "../storage/db";
import { autoDeployLivePortals } from "../portal/deploy";
import { logger } from "../logger";

const router = Router();

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

// POST /generate-hero — mounted at /api/admin
router.post("/generate-hero", async (req, res) => {
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
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
      action: "Hero Text Regenerated",
      details: "AI-generated portal headline updated.",
      date: new Date().toISOString()
    });
    writeDatabase(db);
    autoDeployLivePortals(db);
    res.json({ success: true, heroText: heroOutput, database: db });
  } catch (error: any) {
    logger.error("AI", `Hero Generation Error: ${error.message}`);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

// POST /generate-project — mounted at /api/admin
router.post("/generate-project", async (req, res) => {
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
    logger.error("AI", `Project Generation Error: ${error.message}`);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

// POST /generate-collateral — mounted at /api/admin
router.post("/generate-collateral", async (req, res) => {
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
    logger.error("AI", `Collateral Error: ${error.message}`);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

// POST /generate-hero-carousel — writes the three hero spotlight slides from the
// hub's actual content: one slide per catalogue page (Solutions, Collaterals,
// Opportunities).
//
// Returns the slides for review instead of saving them — the admin presses Save
// in the Hero section to commit, so a generation they dislike never overwrites
// hand-written copy. Image URLs are chosen by the caller, not the model: an
// invented Unsplash id renders as a blank slide.
router.post("/generate-hero-carousel", async (req, res) => {
  const db = readDatabase();
  const { portal } = req.body as { portal?: string };

  // Scope to one portal's mapped content when asked, so its hero describes what
  // that portal's visitors can actually see rather than the whole hub.
  const inScope = (item: { customerName?: string; customerNames?: string[] }): boolean => {
    if (!portal || portal === "all") return true;
    const names = item.customerNames || (item.customerName ? [item.customerName] : []);
    return names.includes(portal) || names.includes("all");
  };

  const solutions = (db.solutions || []).filter(s => s.enabled !== false && inScope(s));
  const collaterals = (db.collaterals || []).filter(c => c.enabled !== false && inScope(c));
  const opportunities = (db.upcomingProjects || []).filter(p => p.enabled !== false && inScope(p));

  if (solutions.length === 0 && collaterals.length === 0 && opportunities.length === 0) {
    return res.status(400).json({
      error: "There is no published content to write a hero from yet. Add a solution, collateral or opportunity first.",
    });
  }

  const inventory = [
    `SOLUTIONS (${solutions.length}):`,
    ...solutions.slice(0, 25).map(s => `- ${s.title}${s.description ? `: ${s.description.slice(0, 160)}` : ""}${s.tags?.length ? ` [${s.tags.join(", ")}]` : ""}`),
    ``,
    `COLLATERALS (${collaterals.length}):`,
    ...collaterals.slice(0, 25).map(c => `- ${c.title}${c.tag ? ` (${c.tag})` : ""}`),
    ``,
    `OPPORTUNITIES (${opportunities.length}):`,
    ...opportunities.slice(0, 25).map(p => `- ${p.name} [${p.status}]${p.description ? `: ${p.description.slice(0, 160)}` : ""}`),
  ].join("\n");

  const systemPrompt = `You write hero carousel copy for an enterprise client portal.

You will be given an inventory of what this portal actually publishes. Write exactly three slides, one per section, in this order: Solutions, Collaterals, Opportunities.

Rules:
- Ground every slide in the inventory. Name real items or themes you can see there. Never invent a product, client or number.
- title: 4-9 words, specific, no trailing punctuation.
- description: one sentence, at most 22 words, plain and professional.
- No hype, no exclamation marks, no words like "revolutionary", "cutting-edge", "unleash", "empower".
- If a section's inventory is empty, write an inviting line about what will appear there, without inventing content.

Respond with JSON only, no markdown fence:
{"slides":[{"section":"solutions","title":"...","description":"..."},{"section":"collaterals","title":"...","description":"..."},{"section":"opportunities","title":"...","description":"..."}]}`;

  try {
    const raw = await aiChat(systemPrompt, inventory);
    // The model is told to return bare JSON, but a ```json fence still slips
    // through often enough to be worth stripping rather than failing on.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed: { slides?: { section?: string; title?: string; description?: string }[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.error("AI", `Hero carousel returned non-JSON: ${cleaned.slice(0, 300)}`);
      return res.status(502).json({ error: "The AI response could not be read. Please try again." });
    }

    const bySection = new Map((parsed.slides || []).map(s => [String(s.section || "").toLowerCase(), s]));
    const SECTIONS: { key: string; linkType: string; fallbackTitle: string }[] = [
      { key: "solutions", linkType: "page-solutions", fallbackTitle: "Explore the solutions catalogue" },
      { key: "collaterals", linkType: "page-collaterals", fallbackTitle: "Browse case studies and collateral" },
      { key: "opportunities", linkType: "page-opportunities", fallbackTitle: "See what is in the pipeline" },
    ];

    const slides = SECTIONS.map((section, i) => {
      const got = bySection.get(section.key);
      return {
        id: `car-${Date.now()}-${i}`,
        title: (got?.title || section.fallbackTitle).trim(),
        description: (got?.description || "").trim(),
        linkType: section.linkType,
        linkTarget: "",
      };
    });

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
      action: "Hero Carousel Drafted",
      details: `AI drafted 3 hero slides from ${solutions.length} solution(s), ${collaterals.length} collateral(s) and ${opportunities.length} opportunity/ies${portal && portal !== "all" ? ` for portal "${portal}"` : ""}. Not yet saved.`,
      date: new Date().toISOString(),
    });
    writeDatabase(db);

    res.json({ success: true, slides });
  } catch (error: any) {
    logger.error("AI", `Hero carousel error: ${error.message}`);
    res.status(500).json({ error: "AI generation failed: " + error.message });
  }
});

export default router;
