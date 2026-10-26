/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dns from "dns/promises";
import net from "net";
import { SERVER_PUBLIC_IP } from "../config";
import { logger } from "../logger";

/**
 * Helpers for the case where an app an admin wants to proxy is hosted on the very
 * machine the hub runs on, reachable publicly at `http://<server public ip>:<port>`.
 *
 * This server sits behind NAT that does not support hairpinning: a connection from
 * the server to its OWN public IP never completes, even though the same address
 * answers fine from anywhere else. That breaks two things naively:
 *
 *  1. The "Test" reachability gate on the Map Subdomain panel probes from the hub
 *     process, so a perfectly healthy local app looks dead and the subdomain field
 *     stays locked.
 *  2. An IIS rewrite rule pointing at that public IP is executed by IIS on this
 *     same machine, so the proxy itself 502s for exactly the same reason.
 *
 * Both are fixed by recognising "this origin is us" and substituting loopback.
 */

let cachedIp: string | null = null;
let cachedAt = 0;
const IP_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * This server's own public IP. Prefers the explicitly configured SERVER_PUBLIC_IP
 * — set it, because the ipify fallback is a network call that can fail, and when
 * it does every check below degrades to "not us" and the old broken behaviour
 * returns.
 */
export async function getOwnPublicIp(): Promise<string | null> {
  if (SERVER_PUBLIC_IP) return SERVER_PUBLIC_IP;
  if (cachedIp && Date.now() - cachedAt < IP_CACHE_TTL_MS) return cachedIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5000),
    });
    const json: any = await res.json();
    if (json?.ip) {
      cachedIp = json.ip;
      cachedAt = Date.now();
      logger.info("selfHost", `Auto-detected server public IP: ${cachedIp}. Set SERVER_PUBLIC_IP in .env to avoid this lookup.`);
      return cachedIp;
    }
    return null;
  } catch (err: any) {
    logger.warn("selfHost", `Could not determine this server's public IP: ${err?.message}. Set SERVER_PUBLIC_IP in .env.`);
    return null;
  }
}

/** Resolves a hostname to an IP, passing IP literals straight through. */
export async function resolveHostIp(hostname: string): Promise<string | null> {
  if (net.isIP(hostname)) return hostname;
  try {
    return (await dns.lookup(hostname)).address;
  } catch {
    return null;
  }
}

/**
 * Whether this hostname points back at the machine the hub is running on.
 * Returns false when the server's own IP can't be determined — the conservative
 * answer, since the loopback substitutions below would otherwise be applied to
 * somebody else's host that merely shares a port number.
 */
export async function isOwnServerHost(hostname: string): Promise<boolean> {
  const own = await getOwnPublicIp();
  if (!own) return false;
  const target = await resolveHostIp(hostname);
  return !!target && target === own;
}

/**
 * Rewrites an origin that points at this server's own public IP to the loopback
 * equivalent, leaving every other origin untouched.
 *
 * Only http is rewritten. An https origin on this server would need loopback to
 * present a certificate valid for 127.0.0.1, which it won't, so those are left
 * alone rather than swapped into something that fails certificate validation.
 */
export async function toReachableOrigin(origin: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return origin;
  }
  if (parsed.protocol !== "http:") return origin;
  if (!(await isOwnServerHost(parsed.hostname))) return origin;

  const port = parsed.port || "80";
  const loopback = `http://127.0.0.1:${port}`;
  logger.info("selfHost", `Origin ${origin} is this server — proxying via ${loopback} (NAT hairpin is not supported here).`);
  return loopback;
}
