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

  const baseDomain = fqdn.split(".").slice(-2).join(".");

  try {
    const out = await runPS([
      `Import-Module WebAdministration -ErrorAction Stop`,
      // Remove stale site if it exists from a previous toggle cycle
      `if (Test-Path "IIS:\\Sites\\${siteName}") {`,
      `  Remove-WebSite -Name "${siteName}"`,
      `}`,
      // Create site with HTTP binding
      `New-WebSite -Name "${siteName}" -PhysicalPath "${siteDir}" -Port 80 -HostHeader "${fqdn}" -Force | Out-Null`,
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
    const hasCert = out.includes("cert:") && !out.includes("cert:none");
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
    await runPS([
      `Import-Module WebAdministration -ErrorAction Stop`,
      `if (Test-Path "IIS:\\Sites\\${siteName}") {`,
      `  Remove-WebSite -Name "${siteName}"`,
      `  Write-Output "removed"`,
      `} else {`,
      `  Write-Output "not_found"`,
      `}`,
    ]);
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    logger.info("IIS", `Site "${siteName}" removed`);
  } catch (err: any) {
    logger.warn("IIS", `Could not remove site "${siteName}": ${err?.message}`);
  }
}
