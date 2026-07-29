/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { Router } from "express";
import { Solution, Collateral, CurrentProject, UpcomingProject } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";
import { autoDeployLivePortals } from "../portal/deploy";
import { buildAdminSafeDbView } from "../utils/dbView";
import { isSuperAdminRole } from "../auth";
import { DEPLOYED_SOLUTIONS_DIR } from "../config";
import { deleteDnsRecord } from "../dns/cloudflare";
import { removeStaticHtmlIisSite } from "../iis/site";
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
    db.solutions = db.solutions.filter(s => s.id !== solution.id);
    // Cascade: a collateral with no solution left to belong to is orphaned data,
    // not a standalone asset — remove it along with its solution rather than
    // leaving it to surface under "General Collaterals" in the catalogue.
    const linkedCollateralCount = (db.collaterals || []).filter(c => c.linkedSolutionId === solution.id).length;
    db.collaterals = (db.collaterals || []).filter(c => c.linkedSolutionId !== solution.id);

    // Cascade: a deployed standalone HTML app owns a DNS record, an IIS site, and
    // a stored file on disk — none of that is cleaned up just by removing the
    // Solution row, so tear it down explicitly.
    if (target?.deployedSlug) {
      const deployedDomain = target.deployedDomain || "mobiusservices.io";
      await deleteDnsRecord(target.deployedSlug, deployedDomain).catch(() => {});
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

    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Solution Deleted",
      details: `Solution with ID "${solution.id}" was deleted` +
        (linkedCollateralCount > 0 ? `, along with ${linkedCollateralCount} linked collateral(s).` : "."),
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
