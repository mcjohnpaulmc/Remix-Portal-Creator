/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dns from "dns/promises";
import http from "http";
import https from "https";
import net from "net";
import { Router } from "express";
import { Solution } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";
import { autoDeployLivePortals } from "../portal/deploy";
import { ensureDnsRecord } from "../dns/cloudflare";
import { ensureMappedUrlIisSite } from "../iis/site";
import { buildAdminSafeDbView } from "../utils/dbView";
import { isOwnServerHost } from "../utils/selfHost";
import { isSuperAdminRole } from "../auth";
import { logger } from "../logger";

const router = Router();

function isPrivateOrLoopbackIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    return ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd");
  }
  return (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    ip === "0.0.0.0"
  );
}

// Single GET against a URL; resolves false on any error or a 6s timeout.
function probeUrl(target: URL): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(target, { method: "GET", timeout: 6000 }, (r) => {
      r.destroy();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// POST /test-public-url — checks that a URL resolves to a public (non-private,
// non-loopback) address and actually responds, before the subdomain field on
// the "Map Subdomain" panel unlocks for editing.
router.post("/test-public-url", async (req, res) => {
  const raw = String(req.body?.url || "").trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return res.json({ ok: false, reason: "Enter a valid URL, e.g. http://1.2.3.4:8080/" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.json({ ok: false, reason: "URL must use http or https." });
  }
  if (parsed.hostname === "localhost") {
    return res.json({ ok: false, reason: "localhost is not a public address." });
  }

  let ip: string;
  try {
    if (net.isIP(parsed.hostname)) {
      ip = parsed.hostname;
    } else {
      ip = (await dns.lookup(parsed.hostname)).address;
    }
  } catch {
    return res.json({ ok: false, reason: "Could not resolve the hostname." });
  }
  if (isPrivateOrLoopbackIp(ip)) {
    return res.json({ ok: false, reason: "Address is private/internal, not publicly reachable." });
  }

  if (await probeUrl(parsed)) {
    return res.json({ ok: true });
  }

  // A direct probe failing does not prove the app is down. This server cannot
  // connect to its OWN public IP (the NAT in front of it does not hairpin), so an
  // app hosted on this very machine and published at http://<our public ip>:<port>
  // looks dead from in here while answering fine from anywhere else. Confirm that
  // specific case over loopback rather than blocking a mapping that would work —
  // the IIS rule for it is rewritten to loopback too (see ensureMappedUrlIisSite).
  if (await isOwnServerHost(parsed.hostname)) {
    const loopback = new URL(parsed.toString());
    loopback.hostname = "127.0.0.1";
    if (await probeUrl(loopback)) {
      logger.info(
        "map-subdomain",
        `${raw} did not answer directly but is this server; confirmed on ${loopback.origin}.`
      );
      return res.json({
        ok: true,
        viaLoopback: true,
        reason: "Reachable. This app runs on this server, so it will be proxied over loopback.",
      });
    }
  }

  res.json({ ok: false, reason: "URL did not respond." });
});

// POST /map-subdomain — reverse-proxies a new subdomain straight to an already-
// public external URL (no upload, no local process). Optionally registers a
// Solution record for it in the Solution Repository.
router.post("/map-subdomain", async (req, res) => {
  const adminEmail = (req as any).adminEmail;
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);

  const rawUrl = String(req.body?.targetUrl || "").trim();
  const domain = "mobiusservices.io";
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Application URL is invalid." });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "Application URL must use http or https." });
  }

  const cleanSlug = String(req.body?.subdomain || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!cleanSlug) {
    return res.status(400).json({ error: "Subdomain has invalid characters." });
  }

  const db = readDatabase();
  const taken = (db.subdomains || []).some(s => s.name === cleanSlug || s.id === cleanSlug) ||
    (db.solutions || []).some(s => s.deployedSlug === cleanSlug);
  if (taken) {
    return res.status(400).json({ error: `Subdomain "${cleanSlug}.${domain}" is already in use.` });
  }

  const fqdn = `${cleanSlug}.${domain}`;
  const targetOrigin = `${parsed.protocol}//${parsed.host}`;

  const dnsOk = await ensureDnsRecord(cleanSlug, domain).catch(() => false);
  await ensureMappedUrlIisSite(cleanSlug, fqdn, targetOrigin).catch(err =>
    logger.error(`map-subdomain-${cleanSlug}`, `IIS site creation failed: ${err?.message}`)
  );

  const addToRepository = req.body?.addToRepository !== false;
  const newSol: Solution = {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: cleanSlug,
    thumbnail: "",
    url: `https://${fqdn}`,
    credentialsDescription: "",
    tags: [],
    createdAt: new Date().toISOString(),
    enabled: true,
    customerName: "",
    customerNames: [],
    deployedSlug: cleanSlug,
    deployedDomain: domain,
    mappedExternalUrl: targetOrigin,
    hiddenFromRepository: !addToRepository,
    createdBy: adminEmail || undefined,
  };
  db.solutions.unshift(newSol);

  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: adminEmail || "admin@mobiusservices.co.in",
    action: "Subdomain Mapped",
    details: `Mapped ${fqdn} to ${targetOrigin}. DNS: ${dnsOk ? "active" : "pending"}.` +
      (addToRepository ? "" : " (not listed in Solution Repository)"),
    date: new Date().toISOString(),
  });

  writeDatabase(db);
  await autoDeployLivePortals(db);

  res.json({
    success: true,
    url: `https://${fqdn}`,
    dnsOk,
    solution: newSol,
    database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin),
  });
});

export default router;
