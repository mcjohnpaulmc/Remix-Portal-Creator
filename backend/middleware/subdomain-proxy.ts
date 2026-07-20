/**
 * Subdomain proxy middleware.
 * When a request arrives at the hub with a Host header matching a live portal slug
 * (e.g. client1.mobiusservices.io), it is transparently proxied to that portal's
 * internal port (e.g. 127.0.0.1:4001). Requests for the hub itself pass through.
 *
 * MUST be registered before Express body-parser middleware so the raw request
 * stream is still available to pipe to the upstream portal process.
 */

import http from "http";
import type { Request, Response, NextFunction } from "express";
import { readDatabase } from "../storage/db";

export function subdomainProxyMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Strip port from Host header (e.g. "client1.mobiusservices.io:8816" → "client1.mobiusservices.io")
  const host = (req.headers.host || "").split(":")[0];
  const parts = host.split(".");

  // Need at least subdomain.domain.tld — bare host or localhost won't have 3 parts
  if (parts.length < 3) {
    next();
    return;
  }

  const slug = parts[0];

  const db = readDatabase();
  const portal = (db.subdomains || []).find(
    s => (s.name === slug || s.id === slug) && s.status === "live" && s.port
  );

  if (!portal) {
    next();
    return;
  }

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: portal.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `localhost:${portal.port}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on("error", () => {
    // Portal process not reachable — let hub handle it (will 404 gracefully)
    if (!res.headersSent) next();
  });

  req.pipe(proxyReq, { end: true });
}
