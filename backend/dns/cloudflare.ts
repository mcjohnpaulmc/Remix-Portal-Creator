/**
 * Cloudflare DNS automation — creates/updates/deletes/checks A records for portal subdomains.
 * Requires CLOUDFLARE_API_TOKEN in .env (restricted to Mobius server IPs).
 * Set SERVER_PUBLIC_IP in .env, or the server's public IP is auto-detected via api.ipify.org.
 */

import { CLOUDFLARE_API_TOKEN, SERVER_PUBLIC_IP } from "../config";
import { logger } from "../logger";

const CF_BASE = "https://api.cloudflare.com/client/v4";

let cachedZoneId: string | null = null;
let cachedServerIp: string | null = null;

function cfHeaders() {
  return {
    Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function getZoneId(domain: string): Promise<string | null> {
  if (cachedZoneId) return cachedZoneId;
  try {
    const res = await fetch(`${CF_BASE}/zones?name=${domain}&status=active`, {
      headers: cfHeaders(),
    });
    const json: any = await res.json();
    if (!json.success || !json.result?.length) {
      logger.warn("Cloudflare", `Zone not found for domain "${domain}": ${JSON.stringify(json.errors)}`);
      return null;
    }
    cachedZoneId = json.result[0].id;
    logger.info("Cloudflare", `Zone ID for ${domain}: ${cachedZoneId}`);
    return cachedZoneId;
  } catch (err: any) {
    logger.error("Cloudflare", `getZoneId error: ${err?.message}`);
    return null;
  }
}

async function getServerIp(): Promise<string | null> {
  if (SERVER_PUBLIC_IP) return SERVER_PUBLIC_IP;
  if (cachedServerIp) return cachedServerIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const json: any = await res.json();
    cachedServerIp = json.ip;
    logger.info("Cloudflare", `Auto-detected server public IP: ${cachedServerIp}`);
    return cachedServerIp;
  } catch (err: any) {
    logger.error("Cloudflare", `getServerIp error: ${err?.message}`);
    return null;
  }
}

async function findRecord(zoneId: string, fqdn: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${CF_BASE}/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(fqdn)}`,
      { headers: cfHeaders() }
    );
    const json: any = await res.json();
    if (!json.success) return null;
    return json.result?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns true if an A record exists in Cloudflare for `{slug}.{domain}`.
 */
export async function checkDnsRecord(slug: string, domain: string): Promise<boolean> {
  if (!CLOUDFLARE_API_TOKEN) return false;
  const zoneId = await getZoneId(domain);
  if (!zoneId) return false;
  const fqdn = `${slug}.${domain}`;
  const recordId = await findRecord(zoneId, fqdn);
  return !!recordId;
}

/**
 * Creates or updates an A record for `{slug}.{domain}` pointing to the server's public IP.
 * Returns true if the record was successfully created/updated, false on any error.
 */
export async function ensureDnsRecord(slug: string, domain: string): Promise<boolean> {
  if (!CLOUDFLARE_API_TOKEN) return false;

  const zoneId = await getZoneId(domain);
  if (!zoneId) return false;

  const ip = await getServerIp();
  if (!ip) {
    logger.warn("Cloudflare", `Cannot create DNS record for ${slug}.${domain}: server IP unknown. Set SERVER_PUBLIC_IP in .env.`);
    return false;
  }

  const fqdn = `${slug}.${domain}`;
  const existingId = await findRecord(zoneId, fqdn);

  const payload = {
    type: "A",
    name: fqdn,
    content: ip,
    ttl: 1,        // automatic TTL
    proxied: true, // Cloudflare proxy (orange cloud)
  };

  try {
    let res: Response;
    if (existingId) {
      res = await fetch(`${CF_BASE}/zones/${zoneId}/dns_records/${existingId}`, {
        method: "PATCH",
        headers: cfHeaders(),
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${CF_BASE}/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers: cfHeaders(),
        body: JSON.stringify(payload),
      });
    }
    const json: any = await res.json();
    if (json.success) {
      logger.info("Cloudflare", `${existingId ? "Updated" : "Created"} A record: ${fqdn} → ${ip}`);
      return true;
    } else {
      logger.warn("Cloudflare", `DNS upsert failed for ${fqdn}: ${JSON.stringify(json.errors)}`);
      return false;
    }
  } catch (err: any) {
    logger.error("Cloudflare", `ensureDnsRecord error for ${fqdn}: ${err?.message}`);
    return false;
  }
}

/**
 * Deletes the A record for `{slug}.{domain}` from Cloudflare if it exists.
 */
export async function deleteDnsRecord(slug: string, domain: string): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) return;

  const zoneId = await getZoneId(domain);
  if (!zoneId) return;

  const fqdn = `${slug}.${domain}`;
  const recordId = await findRecord(zoneId, fqdn);
  if (!recordId) return;

  try {
    const res = await fetch(`${CF_BASE}/zones/${zoneId}/dns_records/${recordId}`, {
      method: "DELETE",
      headers: cfHeaders(),
    });
    const json: any = await res.json();
    if (json.success) {
      logger.info("Cloudflare", `Deleted A record: ${fqdn}`);
    } else {
      logger.warn("Cloudflare", `DNS delete failed for ${fqdn}: ${JSON.stringify(json.errors)}`);
    }
  } catch (err: any) {
    logger.error("Cloudflare", `deleteDnsRecord error for ${fqdn}: ${err?.message}`);
  }
}
