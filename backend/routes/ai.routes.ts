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

export default router;
