/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "path";
import { Router } from "express";
import { Solution, Collateral, CurrentProject, UpcomingProject } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";
import { autoDeployLivePortals } from "../portal/deploy";
import { buildAdminSafeDbView } from "../utils/dbView";
import { isSuperAdminRole } from "../auth";
import { deleteSolutionCascade } from "../utils/solutionCascade";
import { DEPLOYED_SOLUTIONS_DIR } from "../config";
import { ensureDnsRecord, deleteDnsRecord } from "../dns/cloudflare";
import { ensureStaticHtmlIisSite, removeStaticHtmlIisSite, ensureMappedUrlIisSite, removeMappedUrlIisSite } from "../iis/site";
import { logger } from "../logger";

const router = Router();

// POST /solutions — mounted at /api/admin
router.post("/solutions", async (req, res) => {
  const { action, solution } = req.body;
  const db = readDatabase();
  const adminEmail = (req as any).adminEmail;
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);

  if (action === "create") {
    const newSol: Solution = {
      ...solution,
      id: `sol-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail || undefined,
    };
    db.solutions.unshift(newSol);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Solution Created",
      details: `Solution "${newSol.title}" onboarded successfully.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    const target = db.solutions.find(s => s.id === solution.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to modify this solution." });
    }
    db.solutions = db.solutions.map(s => s.id === solution.id ? { ...s, ...solution, createdBy: s.createdBy } : s);

    // Keep linked collaterals in sync with their solution's portal mapping — if
    // a solution is remapped from one portal to another, a collateral that was
    // imported/created alongside it should move with it, not stay stranded on
    // the portal the solution no longer belongs to.
    if (solution.customerNames !== undefined) {
      const syncedNames: string[] = solution.customerNames || [];
      db.collaterals = (db.collaterals || []).map(c =>
        c.linkedSolutionId === solution.id
          ? { ...c, customerNames: syncedNames, customerName: syncedNames[0] ?? c.customerName }
          : c
      );
    }

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Solution Updated",
      details: `Solution "${solution.title}" details was edited.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    const target = db.solutions.find(s => s.id === solution.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to delete this solution." });
    }
    const { linkedCollateralCount } = await deleteSolutionCascade(db, solution.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Solution Deleted",
      details: `Solution with ID "${solution.id}" was deleted` +
        (linkedCollateralCount > 0 ? `, along with ${linkedCollateralCount} linked collateral(s).` : "."),
      date: new Date().toISOString()
    });
  } else if (action === "rename-subdomain") {
    // Moves a deployed standalone HTML solution to a new subdomain — points DNS
    // and IIS at the new slug first, then tears down the old DNS record and IIS
    // site so the app stops resolving at the previous subdomain entirely.
    const target = db.solutions.find(s => s.id === solution.id);
    if (!target) {
      return res.status(404).json({ error: "Solution not found." });
    }
    if (target.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to modify this solution." });
    }
    if (!target.deployedSlug) {
      return res.status(400).json({ error: "This solution was not deployed to its own subdomain." });
    }

    const domain = target.deployedDomain || "mobiusservices.io";
    const cleanSlug = String(solution.newSubdomain || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSlug) {
      return res.status(400).json({ error: "Subdomain has invalid characters." });
    }

    const oldSlug = target.deployedSlug;
    if (cleanSlug === oldSlug) {
      return res.json({ success: true, database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin) });
    }

    const taken = (db.subdomains || []).some(s => s.name === cleanSlug) ||
      (db.solutions || []).some(s => s.id !== target.id && s.deployedSlug === cleanSlug);
    if (taken) {
      return res.status(400).json({ error: `Subdomain "${cleanSlug}.${domain}" is already in use.` });
    }

    const newFqdn = `${cleanSlug}.${domain}`;

    // Stand up the new subdomain before tearing down the old one, so a failure
    // here leaves the app still reachable at its current address. A "Map
    // Subdomain" mapping reverse-proxies to its external origin; a real Deploy
    // Solution upload serves its locally-stored file directly — different IIS
    // site kinds, so branch on which one this solution actually is.
    const dnsOk = await ensureDnsRecord(cleanSlug, domain).catch(() => false);
    if (target.mappedExternalUrl) {
      await ensureMappedUrlIisSite(cleanSlug, newFqdn, target.mappedExternalUrl).catch(err =>
        logger.error(`rename-subdomain-${cleanSlug}`, `IIS site creation failed: ${err?.message}`)
      );
    } else {
      const contentDir = path.join(DEPLOYED_SOLUTIONS_DIR, oldSlug);
      await ensureStaticHtmlIisSite(cleanSlug, newFqdn, contentDir).catch(err =>
        logger.error(`rename-subdomain-${cleanSlug}`, `IIS site creation failed: ${err?.message}`)
      );
    }

    // Now decommission the old address — it must stop resolving/serving entirely.
    if (target.mappedExternalUrl) {
      await removeMappedUrlIisSite(oldSlug).catch(() => {});
    } else {
      await removeStaticHtmlIisSite(oldSlug).catch(() => {});
    }
    await deleteDnsRecord(oldSlug, domain).catch(() => {});

    target.deployedSlug = cleanSlug;
    target.url = `https://${newFqdn}`;

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Solution Subdomain Renamed",
      details: `Moved deployed solution "${target.title}" from ${oldSlug}.${domain} to ${newFqdn}. DNS: ${dnsOk ? "active" : "pending"}.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  await autoDeployLivePortals(db);
  res.json({ success: true, database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin) });
});

// POST /collaterals — mounted at /api/admin
router.post("/collaterals", async (req, res) => {
  const { action, collateral } = req.body;
  const db = readDatabase();
  const adminEmail = (req as any).adminEmail;
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);

  if (action === "create") {
    const newCol: Collateral = {
      ...collateral,
      id: `col-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail || undefined,
    };
    db.collaterals.unshift(newCol);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Collateral Added",
      details: `Collateral study "${newCol.title}" created.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    const target = db.collaterals.find(c => c.id === collateral.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to modify this collateral." });
    }
    db.collaterals = db.collaterals.map(c => c.id === collateral.id ? { ...c, ...collateral, createdBy: c.createdBy } : c);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Collateral Updated",
      details: `Collateral study "${collateral.title}" updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    const target = db.collaterals.find(c => c.id === collateral.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to delete this collateral." });
    }
    db.collaterals = db.collaterals.filter(c => c.id !== collateral.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Collateral Deleted",
      details: `Collateral with ID "${collateral.id}" removed.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  await autoDeployLivePortals(db);
  res.json({ success: true, database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin) });
});

// POST /projects/current — mounted at /api/admin
router.post("/projects/current", async (req, res) => {
  const { action, project } = req.body;
  const db = readDatabase();
  const adminEmail = (req as any).adminEmail;
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);

  if (!db.currentProjects) db.currentProjects = [];

  if (action === "create") {
    const newProj: CurrentProject = {
      ...project,
      id: `proj-c-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail || undefined,
    };
    db.currentProjects.unshift(newProj);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Current Project Created",
      details: `Project "${newProj.name}" created for customer: ${newProj.customerName}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    const target = db.currentProjects.find(p => p.id === project.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to modify this project." });
    }
    db.currentProjects = db.currentProjects.map(p => p.id === project.id ? { ...p, ...project, createdBy: p.createdBy } : p);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Current Project Updated",
      details: `Project "${project.name}" details updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    const target = db.currentProjects.find(p => p.id === project.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to delete this project." });
    }
    db.currentProjects = db.currentProjects.filter(p => p.id !== project.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Current Project Deleted",
      details: `Project with ID "${project.id}" deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  await autoDeployLivePortals(db);
  res.json({ success: true, database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin) });
});

// POST /projects/upcoming — mounted at /api/admin
router.post("/projects/upcoming", async (req, res) => {
  const { action, project } = req.body;
  const db = readDatabase();
  const adminEmail = (req as any).adminEmail;
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);

  if (!db.upcomingProjects) db.upcomingProjects = [];

  if (action === "create") {
    const newProj: UpcomingProject = {
      ...project,
      id: `proj-u-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail || undefined,
    };
    db.upcomingProjects.unshift(newProj);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Upcoming Project Created",
      details: `Upcoming engagement "${newProj.name}" added for customer: ${newProj.customerName}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    const target = db.upcomingProjects.find(p => p.id === project.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to modify this project." });
    }
    db.upcomingProjects = db.upcomingProjects.map(p => p.id === project.id ? { ...p, ...project, createdBy: p.createdBy } : p);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Upcoming Project Updated",
      details: `Upcoming engagement "${project.name}" details revised.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    const target = db.upcomingProjects.find(p => p.id === project.id);
    if (target?.createdBy && target.createdBy !== adminEmail && !isSuperAdmin) {
      return res.status(403).json({ error: "You do not have permission to delete this project." });
    }
    db.upcomingProjects = db.upcomingProjects.filter(p => p.id !== project.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Upcoming Project Deleted",
      details: `Upcoming engagement with ID "${project.id}" deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  await autoDeployLivePortals(db);
  res.json({ success: true, database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin) });
});

// POST /update-carousel — mounted at /api/admin
router.post("/update-carousel", async (req, res) => {
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
  await autoDeployLivePortals(db);
  res.json({
    success: true,
    carousel: db.carousel,
    database: buildAdminSafeDbView(db, (req as any).adminEmail, isSuperAdminRole((req as any).userRole)),
  });
});

export default router;
