/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from "express";
import { HUB_ORIGIN } from "../config";

const DEFAULT_HUB_ORIGIN = "http://localhost:3000";

/**
 * Resolves the hub's own public origin for building absolute URLs (uploaded/
 * re-hosted thumbnails) that must load correctly from any browser, including
 * one on a customer portal subdomain — a relative URL only resolves against
 * whatever origin the browser is currently on.
 *
 * Prefers the explicitly configured HUB_ORIGIN env var. If that was never set
 * in production (still the http://localhost:3000 default), falls back to
 * deriving it from the actual incoming request instead of silently emitting a
 * broken http://localhost:3000/... URL — which 404s for everyone off the
 * server itself, and trips a hard "mixed content" block in the browser when
 * the page was loaded over HTTPS.
 *
 * The host comes from the Host header (or X-Forwarded-Host, if a reverse
 * proxy sets one) — IIS's ARR proxying passes the original Host through by
 * default, so this is reliable even without extra proxy configuration.
 * The protocol is trickier: req.protocol reflects the *internal* hop from
 * IIS to Node, which is plain HTTP even when the public request was HTTPS,
 * and IIS is not guaranteed to set X-Forwarded-Proto. So an explicit
 * X-Forwarded-Proto is honored if present; otherwise HTTPS is assumed for
 * any non-local host, since that's how this hub is actually served whenever
 * it isn't literally localhost.
 */
export function resolveHubOrigin(req: Request): string {
  if (HUB_ORIGIN && HUB_ORIGIN !== DEFAULT_HUB_ORIGIN) return HUB_ORIGIN;

  const forwardedHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0].trim();
  const host = forwardedHost || req.get("host");
  if (!host) return HUB_ORIGIN;

  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host);
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim();
  const proto = forwardedProto || (isLocalHost ? req.protocol : "https");

  return `${proto}://${host}`;
}
