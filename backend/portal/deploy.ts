/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import http from "http";
import path from "path";
import { PORTALS_DIR, S3_BUCKET, S3_PREFIX } from "../config";
import { effectiveAdminToken } from "../auth";
import { logger } from "../logger";
import { DatabaseSchema } from "../storage/db";
import { SubdomainPortal } from "../../shared/types";
import { s3PutPortalFile } from "../storage/s3";
import { buildPortalSnapshot } from "./snapshot";

export interface DeployResult {
  localWriteOk: boolean;
  s3Ok: boolean;
  reloadOk: boolean;
}

/**
 * deployPortalInProcess — builds and writes portal.json for a slug, uploads to S3,
 * then signals the live portal process to hot-reload its data.
 */
export async function deployPortalInProcess(
  cleanSlug: string,
  db: DatabaseSchema
): Promise<DeployResult> {
  const subdomainInfo = (db.subdomains || []).find(s => s.name === cleanSlug) || null;
  const portalDir = path.join(PORTALS_DIR, cleanSlug);
  fs.mkdirSync(path.join(portalDir, "assets"), { recursive: true });

  const portalJson = buildPortalSnapshot(cleanSlug, db, subdomainInfo);

  // Write local snapshot — this is the primary content source; portal reads from disk.
  let localWriteOk = false;
  try {
    fs.writeFileSync(path.join(portalDir, "portal.json"), JSON.stringify(portalJson, null, 2), "utf-8");
    localWriteOk = true;
  } catch (err: any) {
    logger.error(`portal-${cleanSlug}`, `Failed to write local portal.json: ${err?.message}`);
  }

  // Signal reload immediately after local write — the portal reads from disk, so there
  // is no reason to wait for S3 before sending the signal.
  const portalPort = subdomainInfo?.port || (db.portAssignments || {})[cleanSlug];
  let reloadOk = false;
  if (portalPort) {
    reloadOk = await new Promise<boolean>((resolve) => {
      const reloadReq = http.request(
        {
          hostname: "127.0.0.1", port: portalPort, path: "/api/reload", method: "POST",
          timeout: 3000,
          headers: { "X-Admin-Token": effectiveAdminToken, "Content-Length": "0" },
        },
        () => resolve(true)
      );
      reloadReq.on("error", () => resolve(false));
      reloadReq.on("timeout", () => { reloadReq.destroy(); resolve(false); });
      reloadReq.end();
    });
  }

  // S3 upload is fire-and-forget — only needed for cold-start recovery on new machines.
  s3PutPortalFile(cleanSlug, "portal.json", portalJson).catch(() => {});

  return { localWriteOk, s3Ok: true, reloadOk };
}

/**
 * autoDeployLivePortals — after any content CRUD, push fresh portal.json to every
 * live portal and wait until every portal has confirmed its reload.
 * Deploys in parallel so multiple portals don't add latency.
 */
export async function autoDeployLivePortals(db: DatabaseSchema): Promise<void> {
  const livePortals = (db.subdomains || []).filter(s => s.status === "live");
  await Promise.all(
    livePortals.map(portal =>
      deployPortalInProcess(portal.name, db).catch(err =>
        logger.warn("auto-deploy", `${portal.name}: ${err?.message}`)
      )
    )
  );
}

/**
 * buildDefaultPortalJson — empty portal scaffold used only at creation/first-start.
 * Content is intentionally blank; the admin must explicitly deploy to populate it.
 */
export function buildDefaultPortalJson(
  slug: string,
  subdomainInfo: SubdomainPortal | null,
  db: any
): object {
  return {
    slug,
    subdomain: slug,
    deployedAt: new Date().toISOString(),
    heroText: "",
    logo: db.logo || "",
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
      createdAt: u.createdAt,
    })),
  };
}
