/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, spawn, ChildProcess } from "child_process";
import os from "os";
import path from "path";
import { PORTAL_PORT_BASE } from "../config";
import { logger } from "../logger";

// Resolve pm2 binary using the home directory — avoids relying on PATH being set
// correctly in whatever shell (PM2 daemon, scheduled task, etc.) started the hub.
const PM2_BIN = process.platform === "win32"
  ? path.join(os.homedir(), "AppData", "Roaming", "npm", "pm2.cmd")
  : "pm2";

// Always pass an explicit PM2_HOME so exec'd pm2 commands connect to the same
// daemon that manages the hub, regardless of the parent shell's environment.
const PM2_HOME = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");

function pm2Env(): NodeJS.ProcessEnv {
  return { ...process.env, PM2_HOME };
}

export function assignNextPort(portAssignments: { [slug: string]: number }): number {
  const used = new Set(Object.values(portAssignments));
  let port = PORTAL_PORT_BASE;
  while (used.has(port)) port++;
  return port;
}

// Track child processes in dev mode (keyed by slug)
export const portalProcesses = new Map<string, ChildProcess>();

export function pm2SpawnPortal(slug: string, port: number): void {
  const cwd = process.cwd();
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    // Kill existing process for this slug if any
    if (portalProcesses.has(slug)) {
      try { portalProcesses.get(slug)!.kill(); } catch {}
      portalProcesses.delete(slug);
    }
    // Use spawn with shell:true so Windows can resolve npx/tsx from PATH
    const child = spawn(
      "npx", ["tsx", "backend/portal-server.ts", "--slug", slug, "--port", String(port)],
      { cwd, env: process.env, stdio: "pipe", shell: true }
    );
    child.stdout?.on("data", d => process.stdout.write(`[portal-${slug}] ${d}`));
    child.stderr?.on("data", d => process.stderr.write(`[portal-${slug}] ${d}`));
    child.on("exit", code => {
      logger.info(`portal-${slug}`, `Exited (code ${code})`);
      portalProcesses.delete(slug);
    });
    portalProcesses.set(slug, child);
    logger.info(`portal-${slug}`, `Spawned on port ${port} (pid ${child.pid})`);
  } else {
    // Delete any stale PM2 entry with this name first (handles re-toggle cycles
    // and avoids "process already exists" errors on a re-live).
    exec(`"${PM2_BIN}" delete portal-${slug}`, { env: pm2Env() }, () => {
      const cmd = `"${PM2_BIN}" start node --name "portal-${slug}" --cwd "${cwd}" -- dist/portal-server.cjs --slug ${slug} --port ${port}`;
      exec(cmd, { env: pm2Env() }, (err, _stdout, stderr) => {
        if (err) logger.error("PM2", `Failed to start portal-${slug}: ${stderr}`);
        else logger.info("PM2", `Started portal-${slug} on port ${port}`);
      });
    });
  }
}

export function pm2StopPortal(slug: string): void {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    if (portalProcesses.has(slug)) {
      try { portalProcesses.get(slug)!.kill(); } catch {}
      portalProcesses.delete(slug);
      logger.info(`portal-${slug}`, "Stopped");
    }
  } else {
    exec(`"${PM2_BIN}" delete portal-${slug}`, { env: pm2Env() }, (err) => {
      if (err) logger.warn("PM2", `Could not delete portal-${slug}: ${err?.message}`);
      else logger.info("PM2", `Stopped portal-${slug}`);
    });
  }
}
