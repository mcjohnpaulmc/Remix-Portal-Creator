/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { Solution, Collateral, CurrentProject, UpcomingProject } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";
import { autoDeployLivePortals } from "../portal/deploy";

const router = Router();

// POST /solutions — mounted at /api/admin
router.post("/solutions", (req, res) => {
  const { action, solution } = req.body;
  const db = readDatabase();

  if (action === "create") {
    const newSol: Solution = {
      ...solution,
      id: `sol-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.solutions.unshift(newSol);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Solution Created",
      details: `Solution "${newSol.title}" onboarded successfully.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.solutions = db.solutions.map(s => s.id === solution.id ? { ...s, ...solution } : s);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Solution Updated",
      details: `Solution "${solution.title}" details was edited.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.solutions = db.solutions.filter(s => s.id !== solution.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Solution Deleted",
      details: `Solution with ID "${solution.id}" was soft deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// POST /collaterals — mounted at /api/admin
router.post("/collaterals", (req, res) => {
  const { action, collateral } = req.body;
  const db = readDatabase();

  if (action === "create") {
    const newCol: Collateral = {
      ...collateral,
      id: `col-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.collaterals.unshift(newCol);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Collateral Added",
      details: `Collateral study "${newCol.title}" created.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.collaterals = db.collaterals.map(c => c.id === collateral.id ? { ...c, ...collateral } : c);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Collateral Updated",
      details: `Collateral study "${collateral.title}" updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.collaterals = db.collaterals.filter(c => c.id !== collateral.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Collateral Deleted",
      details: `Collateral with ID "${collateral.id}" removed.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// POST /projects/current — mounted at /api/admin
router.post("/projects/current", (req, res) => {
  const { action, project } = req.body;
  const db = readDatabase();

  if (!db.currentProjects) db.currentProjects = [];

  if (action === "create") {
    const newProj: CurrentProject = {
      ...project,
      id: `proj-c-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.currentProjects.unshift(newProj);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Current Project Created",
      details: `Project "${newProj.name}" created for customer: ${newProj.customerName}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.currentProjects = db.currentProjects.map(p => p.id === project.id ? { ...p, ...project } : p);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Current Project Updated",
      details: `Project "${project.name}" details updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.currentProjects = db.currentProjects.filter(p => p.id !== project.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Current Project Deleted",
      details: `Project with ID "${project.id}" deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// POST /projects/upcoming — mounted at /api/admin
router.post("/projects/upcoming", (req, res) => {
  const { action, project } = req.body;
  const db = readDatabase();

  if (!db.upcomingProjects) db.upcomingProjects = [];

  if (action === "create") {
    const newProj: UpcomingProject = {
      ...project,
      id: `proj-u-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    db.upcomingProjects.unshift(newProj);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Upcoming Project Created",
      details: `Upcoming engagement "${newProj.name}" added for customer: ${newProj.customerName}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    db.upcomingProjects = db.upcomingProjects.map(p => p.id === project.id ? { ...p, ...project } : p);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Upcoming Project Updated",
      details: `Upcoming engagement "${project.name}" details revised.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    db.upcomingProjects = db.upcomingProjects.filter(p => p.id !== project.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "Upcoming Project Deleted",
      details: `Upcoming engagement with ID "${project.id}" deleted.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);
  autoDeployLivePortals(db);
  res.json({ success: true, database: db });
});

// POST /update-carousel — mounted at /api/admin
router.post("/update-carousel", (req, res) => {
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
  autoDeployLivePortals(db);
  res.json({ success: true, carousel: db.carousel, database: db });
});

export default router;
