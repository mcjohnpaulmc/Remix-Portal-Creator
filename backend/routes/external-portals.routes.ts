/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { logger } from "../logger";

const router = Router();

const PORTALS = {
  mobius: "http://127.0.0.1:4000",
  techmobius: "http://127.0.0.1:8082",
} as const;

type PortalKey = keyof typeof PORTALS;

interface ExternalSolution {
  id: string;
  title: string;
  targetUrl: string;
  thumbnailUrl: string;
  practice: string;
  solutionType: string;
  credentialsNote: string;
  defaultUsername: string;
  collateralCount: number;
}

async function fetchPortalData(key: PortalKey): Promise<ExternalSolution[]> {
  const base = PORTALS[key];
  try {
    const [solRes, colRes] = await Promise.all([
      fetch(`${base}/api/solutions`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${base}/api/collaterals`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (!solRes.ok) return [];

    const solutions: any[] = await solRes.json();
    let collaterals: any[] = [];
    if (colRes.ok) {
      collaterals = await colRes.json();
    }

    // Build collateral count map keyed by linked_solution_id
    const countMap: Record<string, number> = {};
    for (const c of collaterals) {
      const sid = c.linked_solution_id;
      if (sid) countMap[sid] = (countMap[sid] || 0) + 1;
    }

    return solutions.map((s: any) => ({
      id: s.id,
      title: s.title || "",
      targetUrl: s.target_url || "",
      thumbnailUrl: s.thumbnail_url || "",
      practice: s.practice || "",
      solutionType: s.solution_type || "",
      credentialsNote: s.credentials_note || "",
      defaultUsername: s.default_username || "",
      collateralCount: countMap[s.id] || 0,
    }));
  } catch (err: any) {
    logger.warn(`external-portals`, `${key} unreachable: ${err?.message}`);
    return [];
  }
}

// GET /external-portals/solutions — admin-gated (mounted under /api/admin in server.ts)
router.get("/external-portals/solutions", async (_req, res) => {
  const [mobius, techmobius] = await Promise.all([
    fetchPortalData("mobius"),
    fetchPortalData("techmobius"),
  ]);
  res.json({ mobius, techmobius });
});

export default router;
