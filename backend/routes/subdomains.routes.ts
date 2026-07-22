/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { Router } from "express";
import { SubdomainPortal } from "../../shared/types";
import { PORTALS_DIR, S3_PREFIX } from "../config";
import { readDatabase, writeDatabase, DEFAULT_SUBDOMAINS } from "../storage/db";
import { s3PutPortalFile } from "../storage/s3";
import { assignNextPort, pm2SpawnPortal, pm2StopPortal } from "../portal/process";
import { deployPortalInProcess, buildDefaultPortalJson } from "../portal/deploy";
import { ensureDnsRecord, deleteDnsRecord, checkDnsRecord } from "../dns/cloudflare";
import { ensureIisSite, removeIisSite } from "../iis/site";
import { logger } from "../logger";

const router = Router();

// POST /subdomain (singular) — sets the hub's primary subdomain reference
router.post("/subdomain", (req, res) => {
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
    details: `Portal host target set to: ${cleanSub}.mobiusservices.io`,
    date: new Date().toISOString()
  });

  writeDatabase(db);
  res.json({ success: true, subdomain: cleanSub, database: db });
});

// POST /subdomains — list management (create / create-dummy / update / toggle / delete)
router.post("/subdomains", async (req, res) => {
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
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
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
      return res.status(400).json({ error: `Subdomain portal ${cleanSub}.mobiusservices.io already exists.` });
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
      dnsStatus: "pending", // will be updated to "active" after Cloudflare confirms
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
      .catch(err => logger.error(`portal-${cleanSub}`, `Failed to init portal.json: ${err?.message}`));
    s3PutPortalFile(cleanSub, "config.json", {
      slug: cleanSub, displayName: displayName.trim(),
      domain: selectedDomain, port, s3Key, createdAt: newSub.createdAt,
    }).catch(err => logger.error(`portal-${cleanSub}`, `Failed to init config: ${err?.message}`));

    // Attempt Cloudflare DNS record creation — mark active immediately if it succeeds
    const dnsOk = await ensureDnsRecord(cleanSub, selectedDomain).catch(() => false);
    if (dnsOk) {
      const portalEntry = db.subdomains.find(s => s.id === cleanSub);
      if (portalEntry) portalEntry.dnsStatus = "active";
      writeDatabase(db);
    }

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
      action: "Customer Subdomain Portal Created",
      details: `Created portal: ${cleanSub}.${selectedDomain} on port ${port}. DNS: ${dnsOk ? "active" : "pending"}.`,
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
      dnsStatus: "not_required",
    };
    db.subdomains.unshift(newDummy);

    const dummyDir = path.join(PORTALS_DIR, slug);
    fs.mkdirSync(path.join(dummyDir, "assets"), { recursive: true });
    writeDatabase(db);

    // Write default portal.json pre-populated with hub content
    const defaultDummyJson = buildDefaultPortalJson(slug, newDummy, db);
    fs.writeFileSync(path.join(dummyDir, "portal.json"), JSON.stringify(defaultDummyJson, null, 2), "utf-8");
    s3PutPortalFile(slug, "portal.json", defaultDummyJson)
      .catch(err => logger.error(`portal-${slug}`, `Failed to init portal.json: ${err?.message}`));
    s3PutPortalFile(slug, "config.json", {
      slug, displayName: dummyDisplayName, port, s3Key, isDummy: true, createdAt: newDummy.createdAt,
    }).catch(err => logger.error(`portal-${slug}`, `Failed to init config: ${err?.message}`));

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
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
      try {
        await deployPortalInProcess(targetId, db);
      } catch (err: any) {
        logger.warn(`toggle-deploy`, `${targetId}: ${err?.message}`);
      }
      pm2SpawnPortal(targetId, portal.port);
      // Fire-and-forget: DNS + IIS site for real (non-dummy) portals
      if (!portal.isDummy && portal.domain) {
        ensureDnsRecord(targetId, portal.domain).catch(() => {});
        ensureIisSite(targetId, `${targetId}.${portal.domain}`, portal.port).catch(() => {});
      }
    } else {
      pm2StopPortal(targetId);
      if (!portal.isDummy) {
        removeIisSite(targetId).catch(() => {});
      }
    }

    portal.status = targetStatus;
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
      action: targetStatus === "live" ? "Portal Started" : "Portal Stopped",
      details: `Portal "${portal.displayName}" toggled to ${targetStatus} on port ${portal.port}.`,
      date: new Date().toISOString()
    });

  } else if (action === "delete") {
    const targetId = id || resolvedName;
    if (!targetId) {
      return res.status(400).json({ error: "Portal ID is required for delete." });
    }
    // Capture portal info BEFORE removing from list (needed for DNS cleanup)
    const deletedPortal = (db.subdomains || []).find(s => s.id === targetId || s.name === targetId);

    db.subdomains = db.subdomains.filter(s => s.id !== targetId && s.name !== targetId);

    if (db.subdomain === targetId) {
      db.subdomain = db.subdomains[0]?.name || "";
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

    // Stop PM2 portal process, remove DNS record and IIS site
    pm2StopPortal(targetId);
    if (deletedPortal && !deletedPortal.isDummy && deletedPortal.domain) {
      deleteDnsRecord(targetId, deletedPortal.domain).catch(() => {});
    }
    if (deletedPortal && !deletedPortal.isDummy) {
      removeIisSite(targetId).catch(() => {});
    }

    // Free the port assignment
    if (db.portAssignments) {
      delete db.portAssignments[targetId];
    }

    // Delete local portal folder
    const portalDir = path.join(PORTALS_DIR, targetId);
    if (fs.existsSync(portalDir)) {
      try {
        fs.rmSync(portalDir, { recursive: true, force: true });
        logger.info(`portal-${targetId}`, "Deleted local folder");
      } catch (err: any) {
        logger.warn(`portal-${targetId}`, `Could not delete local folder: ${err?.message}`);
      }
    }

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
      action: "Customer Subdomain Portal Deleted",
      details: `Deleted portal "${targetId}", removed its slug from all content mappings.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  res.json({ success: true, subdomain: db.subdomain, subdomains: db.subdomains, database: db });
});

// POST /refresh-dns — re-check and update DNS status for all pending portals
router.post("/refresh-dns", async (req, res) => {
  const db = readDatabase();
  const pendingPortals = (db.subdomains || []).filter(
    s => !s.isDummy && s.domain && s.dnsStatus === "pending"
  );

  let updated = 0;
  await Promise.all(
    pendingPortals.map(async (portal) => {
      const active = await checkDnsRecord(portal.id, portal.domain!).catch(() => false);
      if (active) {
        portal.dnsStatus = "active";
        updated++;
      }
    })
  );

  if (updated > 0) writeDatabase(db);

  res.json({
    success: true,
    checked: pendingPortals.length,
    activated: updated,
    subdomains: db.subdomains,
    database: db,
  });
});

export default router;
