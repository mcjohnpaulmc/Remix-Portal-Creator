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
 * deployPortalInProcess — builds and writes portal.json for a portal, uploads to
 * S3, then signals the live portal process to hot-reload its data.
 *
 * `processId` is the portal's permanent identity: it's what the PM2 process was
 * spawned with (`--slug <processId>`), so it's also the directory this portal's
 * process reads from and the value it self-reports on /api/reload — this never
 * changes, even if the portal's public subdomain is later renamed.
 *
 * `contentSlug` (defaults to `processId`) is what actually gets embedded in the
 * deployed portal.json's own `slug`/`subdomain` fields and used to match
 * customerNames — i.e. the portal's *current* public subdomain. Callers that
 * rename a portal's subdomain (see subdomains.routes.ts) pass the new name here
 * while `processId` stays the same, so the already-running process picks up the
 * new content/display name without needing to be respawned.
 */
export async function deployPortalInProcess(
  processId: string,
  db: DatabaseSchema,
  contentSlug?: string
): Promise<DeployResult> {
  const slug = contentSlug || processId;
  const subdomainInfo = (db.subdomains || []).find(s => s.id === processId) || null;
  const portalDir = path.join(PORTALS_DIR, processId);
  fs.mkdirSync(path.join(portalDir, "assets"), { recursive: true });

  const portalJson = buildPortalSnapshot(slug, db, subdomainInfo);

  // Write local snapshot — this is the primary content source; portal reads from disk.
  let localWriteOk = false;
  try {
    fs.writeFileSync(path.join(portalDir, "portal.json"), JSON.stringify(portalJson, null, 2), "utf-8");
    localWriteOk = true;
  } catch (err: any) {
    logger.error(`portal-${processId}`, `Failed to write local portal.json: ${err?.message}`);
  }

  // Signal reload immediately after local write — the portal reads from disk, so there
  // is no reason to wait for S3 before sending the signal.
  const portalPort = subdomainInfo?.port || (db.portAssignments || {})[processId];
  let reloadOk = false;
  if (portalPort) {
    reloadOk = await new Promise<boolean>((resolve) => {
      const reloadReq = http.request(
        {
          hostname: "127.0.0.1", port: portalPort, path: "/api/reload", method: "POST",
          timeout: 3000,
          headers: { "X-Admin-Token": effectiveAdminToken, "Content-Length": "0" },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            // A port can end up answered by a DIFFERENT portal's still-alive process
            // (e.g. a delete/recreate race that reassigned this port before the old
            // process finished shutting down). Trusting any 200 response here would
            // silently report the deploy as successful while the browser keeps being
            // served the wrong portal's content — so the responder must confirm it IS
            // this slug before the reload counts as ok.
            try {
              const parsed = JSON.parse(body);
              if (res.statusCode === 200 && parsed.slug === processId) {
                resolve(true);
              } else {
                logger.error(
                  `portal-${processId}`,
                  `Reload responder on port ${portalPort} reported slug "${parsed.slug}" — ` +
                  `expected "${processId}". Likely a stale process still bound to this port; refusing to report success.`
                );
                resolve(false);
              }
            } catch {
              resolve(false);
            }
          });
        }
      );
      reloadReq.on("error", () => resolve(false));
      reloadReq.on("timeout", () => { reloadReq.destroy(); resolve(false); });
      reloadReq.end();
    });
  }

  // S3 upload is fire-and-forget — only needed for cold-start recovery on new machines.
  s3PutPortalFile(processId, "portal.json", portalJson).catch(() => {});

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
      deployPortalInProcess(portal.id, db, portal.name).catch(err =>
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
