/**
 * IIS site provisioning — automatically creates/removes IIS reverse-proxy sites
 * for portal subdomains when they are toggled live or deleted.
 * Only runs on Windows; all calls are no-ops on other platforms.
 */

import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { IIS_PORTALS_DIR } from "../config";
import { logger } from "../logger";

function runPS(lines: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `iis-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(tmpFile, lines.join("\r\n"), "utf-8");
    exec(
      `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { timeout: 20000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch {}
        if (err) reject(new Error(stderr?.trim() || err.message));
        else resolve(stdout.trim());
      }
    );
  });
}

function webConfigXml(port: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:${port}/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>`;
}

// Shared by both the reverse-proxy portal sites and the static HTML app sites —
// creates (or recreates) an IIS site with HTTP :80 and HTTPS :443 bindings (SNI),
// binding the server's wildcard cert for the FQDN's base domain. The two callers
// differ only in what `physicalPath` points to: a config-only dir holding a
// rewrite-rule web.config (portal sites) vs. the actual content directory
// (static HTML sites, which IIS serves directly — no reverse proxy involved).
async function createOrRecreateWebsite(siteName: string, physicalPath: string, fqdn: string): Promise<boolean> {
  const baseDomain = fqdn.split(".").slice(-2).join(".");
  const out = await runPS([
    `Import-Module WebAdministration -ErrorAction Stop`,
    // Remove stale site if it exists from a previous deploy/toggle cycle
    `if (Test-Path "IIS:\\Sites\\${siteName}") {`,
    `  Remove-WebSite -Name "${siteName}"`,
    `}`,
    // Create site with HTTP binding
    `New-WebSite -Name "${siteName}" -PhysicalPath "${physicalPath}" -Port 80 -HostHeader "${fqdn}" -Force | Out-Null`,
    // Add HTTPS binding with SNI (SslFlags=1)
    `New-WebBinding -Name "${siteName}" -Protocol https -Port 443 -HostHeader "${fqdn}" -SslFlags 1`,
    // Find and bind the wildcard cert matching the base domain
    `$cert = Get-ChildItem Cert:\\LocalMachine\\My | Where-Object { $_.Subject -like "*${baseDomain}*" } | Select-Object -First 1`,
    `if ($cert) {`,
    `  $binding = Get-WebBinding -Name "${siteName}" -Protocol https -Port 443 -HostHeader "${fqdn}"`,
    `  $binding.AddSslCertificate($cert.Thumbprint, "My")`,
    `  Write-Output "cert:$($cert.Thumbprint)"`,
    `} else {`,
    `  Write-Output "cert:none"`,
    `}`,
    `Write-Output "done"`,
  ]);
  return out.includes("cert:") && !out.includes("cert:none");
}

async function removeWebsite(siteName: string): Promise<void> {
  await runPS([
    `Import-Module WebAdministration -ErrorAction Stop`,
    `if (Test-Path "IIS:\\Sites\\${siteName}") {`,
    `  Remove-WebSite -Name "${siteName}"`,
    `  Write-Output "removed"`,
    `} else {`,
    `  Write-Output "not_found"`,
    `}`,
  ]);
}

/**
 * Creates (or recreates) an IIS site for a portal subdomain.
 * Adds HTTP :80 and HTTPS :443 bindings with SNI; binds the server's wildcard cert.
 */
export async function ensureIisSite(slug: string, fqdn: string, port: number): Promise<void> {
  if (process.platform !== "win32") return;

  const siteName = `portal-${slug}`;
  const siteDir = path.join(IIS_PORTALS_DIR, siteName);

  // Write web.config to disk before IIS touches the directory
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "web.config"), webConfigXml(port), "utf-8");

  try {
    const hasCert = await createOrRecreateWebsite(siteName, siteDir, fqdn);
    logger.info("IIS", `Site "${siteName}" ready — ${fqdn} → localhost:${port} (SSL: ${hasCert ? "bound" : "no cert found"})`);
  } catch (err: any) {
    logger.error("IIS", `Failed to create site "${siteName}": ${err?.message}`);
  }
}

/**
 * Removes the IIS site for a portal and deletes its config directory.
 */
export async function removeIisSite(slug: string): Promise<void> {
  if (process.platform !== "win32") return;

  const siteName = `portal-${slug}`;
  const siteDir = path.join(IIS_PORTALS_DIR, siteName);

  try {
    await removeWebsite(siteName);
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    logger.info("IIS", `Site "${siteName}" removed`);
  } catch (err: any) {
    logger.warn("IIS", `Could not remove site "${siteName}": ${err?.message}`);
  }
}

/**
 * Creates (or recreates) a plain static-file IIS site for a deployed standalone
 * HTML solution — `contentDir` IS the site's physical path (it must contain the
 * app's index.html directly; no reverse proxy, no Node process involved).
 */
export async function ensureStaticHtmlIisSite(slug: string, fqdn: string, contentDir: string): Promise<void> {
  if (process.platform !== "win32") return;

  const siteName = `html-${slug}`;
  try {
    const hasCert = await createOrRecreateWebsite(siteName, contentDir, fqdn);
    logger.info("IIS", `Static site "${siteName}" ready — ${fqdn} → ${contentDir} (SSL: ${hasCert ? "bound" : "no cert found"})`);
  } catch (err: any) {
    logger.error("IIS", `Failed to create static site "${siteName}": ${err?.message}`);
  }
}

/**
 * Removes the IIS site for a deployed standalone HTML solution. Does NOT delete
 * the content directory — `contentDir` there is the solution's actual stored
 * file, not IIS-owned config, so the caller is responsible for that cleanup.
 */
export async function removeStaticHtmlIisSite(slug: string): Promise<void> {
  if (process.platform !== "win32") return;

  const siteName = `html-${slug}`;
  try {
    await removeWebsite(siteName);
    logger.info("IIS", `Static site "${siteName}" removed`);
  } catch (err: any) {
    logger.warn("IIS", `Could not remove static site "${siteName}": ${err?.message}`);
  }
}

function reverseProxyToOriginWebConfigXml(targetOrigin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="${targetOrigin}/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>`;
}

/**
 * Creates (or recreates) an IIS site that reverse-proxies a subdomain straight
 * to an arbitrary external http(s) origin — used by "Map Subdomain" to point a
 * new subdomain at an already-public app hosted elsewhere, as opposed to
 * ensureIisSite (proxies to localhost:port for a portal process) or
 * ensureStaticHtmlIisSite (serves a locally-stored file with no proxy at all).
 */
export async function ensureMappedUrlIisSite(slug: string, fqdn: string, targetOrigin: string): Promise<void> {
  if (process.platform !== "win32") return;

  const siteName = `mapurl-${slug}`;
  const siteDir = path.join(IIS_PORTALS_DIR, siteName);

  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "web.config"), reverseProxyToOriginWebConfigXml(targetOrigin), "utf-8");

  try {
    const hasCert = await createOrRecreateWebsite(siteName, siteDir, fqdn);
    logger.info("IIS", `Mapped-URL site "${siteName}" ready — ${fqdn} → ${targetOrigin} (SSL: ${hasCert ? "bound" : "no cert found"})`);
  } catch (err: any) {
    logger.error("IIS", `Failed to create mapped-URL site "${siteName}": ${err?.message}`);
  }
}

/**
 * Removes the IIS site for a "Map Subdomain" mapping and deletes its config directory.
 */
export async function removeMappedUrlIisSite(slug: string): Promise<void> {
  if (process.platform !== "win32") return;

  const siteName = `mapurl-${slug}`;
  const siteDir = path.join(IIS_PORTALS_DIR, siteName);

  try {
    await removeWebsite(siteName);
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    logger.info("IIS", `Mapped-URL site "${siteName}" removed`);
  } catch (err: any) {
    logger.warn("IIS", `Could not remove mapped-URL site "${siteName}": ${err?.message}`);
  }
}
