module.exports = {
  apps: [
    {
      name: "remix-portal-hub",
      script: "dist/server.cjs",
      cwd: "C:\\Remix-Portal-Creator",
      env: {
        NODE_ENV: "production",
        // Pinned explicitly — the default (3000) is shared with at least one
        // other app on this server, and Windows lets both a wildcard
        // (0.0.0.0:3000) and a loopback-specific (127.0.0.1:3000) bind
        // coexist, with the loopback one winning IIS's reverse-proxy
        // traffic. That silently served a different app's content under
        // hub.mobiusservices.io. Must match the port in this site's
        // web.config rewrite rule (C:\Remix-Portal-Creator\web.config on
        // the server — not tracked in this repo).
        PORT: "4900",
      },
    },
  ],
};
