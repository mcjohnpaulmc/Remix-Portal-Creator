/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { PortalUser } from "../../shared/types";
import { hashPassword, setUsersCache } from "../auth";
import { readDatabase, writeDatabase, InternalUser } from "../storage/db";
import { s3SyncUsers } from "../storage/s3";

const router = Router();

// POST /users — mounted at /api/admin, so full path is /api/admin/users
router.post("/users", (req, res) => {
  const { action, user } = req.body;
  const db = readDatabase();
  if (!db.users) db.users = [];

  if (action === "create") {
    if (!user.email || !user.name || !user.password) {
      return res.status(400).json({ error: "Email, name, and password are required." });
    }
    if (db.users.some(u => u.email === user.email.trim().toLowerCase())) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }
    const newUser: InternalUser = {
      id: `user-${Date.now()}`,
      email: user.email.trim().toLowerCase(),
      name: user.name.trim(),
      passwordHash: hashPassword(user.password),
      role: user.role || "viewer",
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    db.users.unshift(newUser);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "User Created",
      details: `User "${newUser.name}" (${newUser.email}) onboarded with role: ${newUser.role}.`,
      date: new Date().toISOString()
    });
  } else if (action === "update") {
    const target = db.users.find(u => u.id === user.id);
    if (target?.isSystem) {
      return res.status(403).json({ error: "System accounts cannot be modified." });
    }
    db.users = db.users.map(u => {
      if (u.id !== user.id) return u;
      return {
        ...u,
        name: user.name ?? u.name,
        role: user.role ?? u.role,
        enabled: user.enabled ?? u.enabled,
        ...(user.password ? { passwordHash: hashPassword(user.password) } : {}),
      };
    });
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "User Updated",
      details: `User ID "${user.id}" updated.`,
      date: new Date().toISOString()
    });
  } else if (action === "delete") {
    const delTarget = db.users.find(u => u.id === user.id);
    if (delTarget?.isSystem) {
      return res.status(403).json({ error: "System accounts cannot be deleted." });
    }
    db.users = db.users.filter(u => u.id !== user.id);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: "admin@mobiusservices.co.in",
      action: "User Deleted",
      details: `User ID "${user.id}" removed.`,
      date: new Date().toISOString()
    });
  }

  writeDatabase(db);

  // Update in-memory cache so future logins immediately see the change
  setUsersCache(db.users || []);

  // Sync to S3 (fire-and-forget — don't block the HTTP response)
  s3SyncUsers(db.users || []).catch(() => {});

  const safeUsers: PortalUser[] = (db.users || []).map(({ passwordHash: _ph, ...safe }) => safe);
  res.json({ success: true, users: safeUsers });
});

export default router;
