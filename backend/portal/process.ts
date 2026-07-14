/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, spawn, ChildProcess } from "child_process";
import { PORTAL_PORT_BASE } from "../config";
import { logger } from "../logger";

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
    const cmd = `pm2 start node --name "portal-${slug}" --cwd "${cwd}" -- dist/portal-server.cjs --slug ${slug} --port ${port}`;
    exec(cmd, (err, _stdout, stderr) => {
      if (err) logger.error("PM2", `Failed to start portal-${slug}: ${stderr}`);
      else logger.info("PM2", `Started portal-${slug} on port ${port}`);
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
    exec(`pm2 delete portal-${slug}`, (err) => {
      if (err) logger.warn("PM2", `Could not delete portal-${slug}: ${err?.message}`);
      else logger.info("PM2", `Stopped portal-${slug}`);
    });
  }
}
