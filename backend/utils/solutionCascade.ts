/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { DatabaseSchema } from "../storage/db";
import { DEPLOYED_SOLUTIONS_DIR } from "../config";
import { deleteDnsRecord } from "../dns/cloudflare";
import { removeStaticHtmlIisSite, removeMappedUrlIisSite } from "../iis/site";
import { logger } from "../logger";

/**
 * Removes a solution and everything that depends on it: linked collaterals
 * (a collateral with no solution left to belong to is orphaned data, not a
 * standalone asset) and — if it's a deployed standalone HTML app — its DNS
 * record, IIS site, and stored file. Mutates `db` in place; the caller is
 * responsible for writeDatabase(). Shared by the direct "delete solution"
 * action and by portal deletion cascading to solutions left with no portal.
 */
export async function deleteSolutionCascade(
  db: DatabaseSchema,
  solutionId: string
): Promise<{ linkedCollateralCount: number }> {
  const target = (db.solutions || []).find(s => s.id === solutionId);

  db.solutions = (db.solutions || []).filter(s => s.id !== solutionId);

  const linkedCollateralCount = (db.collaterals || []).filter(c => c.linkedSolutionId === solutionId).length;
  db.collaterals = (db.collaterals || []).filter(c => c.linkedSolutionId !== solutionId);

  if (target?.deployedSlug) {
    const deployedDomain = target.deployedDomain || "mobiusservices.io";
    await deleteDnsRecord(target.deployedSlug, deployedDomain).catch(() => {});
    if (target.mappedExternalUrl) {
      // "Map Subdomain" reverse-proxy — no locally-stored file to clean up.
      await removeMappedUrlIisSite(target.deployedSlug).catch(() => {});
    } else {
      await removeStaticHtmlIisSite(target.deployedSlug).catch(() => {});
      const solutionDir = path.join(DEPLOYED_SOLUTIONS_DIR, target.deployedSlug);
      if (fs.existsSync(solutionDir)) {
        try {
          fs.rmSync(solutionDir, { recursive: true, force: true });
        } catch (err: any) {
          logger.warn(`deploy-solution-${target.deployedSlug}`, `Could not delete stored file: ${err?.message}`);
        }
      }
    }
  }

  return { linkedCollateralCount };
}
