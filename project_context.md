# Remix Portal Creator — Project Context

## What This Is: The Hub

The **Hub** is the central control plane for Mobius Services portals. It serves two distinct user roles:

| Role | What they do |
|---|---|
| **Admin** | Creates portals, manages their content (solutions, collaterals, projects, branding), deploys them as live services |
| **Generic user** | Views all available portals as tiles on the Hub homepage; clicks a tile to navigate to that portal |

The Hub is the only app admins ever need to touch. Everything — portal creation, content management, subdomain assignment, and process control — lives here.

---

## User Flows

### Admin Flow
1. Admin logs into the Hub with an admin token
2. Creates a new portal: fills in display name, selects a domain from a dropdown, optionally enters a subdomain slug
3. Hub backend:
   - Copies the RE_MSP portal template to `data/portals/<slug>/`
   - Substitutes all hardcoded branding strings with admin-provided values
   - Finds an unoccupied port on the host machine
   - Starts the portal as a **PM2** managed process on that port
   - If a subdomain was provided, the portal is accessible at `<subdomain>.<domain>` via **IIS** reverse proxy
   - If no subdomain was provided, the portal is still accessible directly via its port (or a default fallback route)
4. Admin manages content for each portal: uploads collaterals, adds solutions, sets hero text, manages projects
5. Admin can start/stop/restart individual portal processes from within the Hub

### Generic User Flow
1. User opens the Hub (public-facing homepage)
2. Sees a tile grid of all created portals (name, description, domain/URL)
3. Clicks a tile → navigates to that portal's URL (subdomain or port-based)
4. Portal has its own email gate, credential reveal, solutions, and collaterals

---

## Portal Creation — Subdomain & Domain

When creating a portal, the admin:
- **Selects a domain** from a dropdown. The list of available domains is hardcoded in the backend (e.g. in a config array in `server.ts`); adding a new domain means updating the code and redeploying — there is no dynamic domain management UI
- **Optionally enters a subdomain slug** (e.g. `retail` → `retail.mobiusservices.io`)
  - If provided: portal is mapped to `<subdomain>.<domain>` via IIS reverse proxy binding
  - If left blank: portal URL is `<server-IP>:<port>` — direct access, no subdomain, no IIS binding needed

---

## Hosting Stack

| Layer | Technology |
|---|---|
| Host OS | Windows Server (IIS available) |
| Process manager | **PM2** — one process per portal, named by slug |
| Reverse proxy | **IIS** — routes `<subdomain>.<domain>` to the correct local port |
| Domain | `mobiusservices.io` (and future additional domains) |
| File / asset storage | Local `uploads/` (dev); AWS S3 (production target) |
| Portal config DB | Flat JSON `data/data-store.json` (dev); DynamoDB or RDS (production target) |

The Hub itself also runs as a PM2 process (on port 3000 by default).

---

## Portal Template

The RE_MSP (Real Estate MSP) portal at `D:\Projects\Repositories\Mobius Solution portal\RE_MSP\` is the template all new portals are generated from.

It is a full-stack app:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend**: Node.js + Express + SQLite
- **Auth**: Email gate + admin credential reveal page

On portal creation the Hub:
1. Copies the entire RE_MSP folder to `data/portals/<slug>/`
2. Runs find-and-replace across 22 hardcoded branding locations in 7 files (portal name, org name, tagline, DB name, port, credentials key, logo, etc.)
3. Copies any uploaded logo to `data/portals/<slug>/frontend/public/`
4. Writes a unique `backend/.env` with the assigned port and a freshly generated `CREDENTIALS_KEY`
5. Runs `npm install` in the new portal's backend directory
6. Starts the portal via PM2: `pm2 start backend/index.js --name <slug>`
7. If a subdomain was provided, configures an IIS site binding for `<subdomain>.<domain>` → `localhost:<port>`

### Template Variables (22 branding locations across 7 files)

| Variable | Example value |
|---|---|
| `PORTAL_NAME` | "Retail Intelligence Portal" |
| `PORTAL_DESC` | "Enterprise retail analytics and inventory management" |
| `ORG_NAME` | "Reliance Retail" |
| `ORG_SHORT_NAME` | "Reliance" |
| `PORTAL_TAGLINE` | "Intelligent retail, delivered." |
| `TENANT_ID` | `reliance` |
| `PORT` | `3005` (assigned from free port scan) |
| `CREDENTIALS_KEY` | randomly generated 32-char hex string |
| `LOGO_FILENAME` | `logo.png` (copied from uploads) |
| `DB_NAME` | `reliance.db` |

---

## Port Management

The Hub maintains a port registry in `data/data-store.json` under a `portAssignments` map (`slug → port`). When a new portal is created:
1. Hub scans for the next unoccupied port starting from a configured base (e.g. 4000)
2. Assigns and records it
3. Starts the portal process on that port
4. Port is freed and removed from the registry when the portal is deleted

---

## Hub API Surface (current + planned)

### Existing endpoints (fully implemented)
| Endpoint | Purpose |
|---|---|
| `GET /api/database` | Full state |
| `POST /api/email-login` | Corporate email gate |
| `POST /api/log` | Audit logging |
| `POST /api/admin/solutions` | CRUD solutions |
| `POST /api/admin/collaterals` | CRUD collaterals |
| `POST /api/admin/projects/current` | CRUD current projects |
| `POST /api/admin/projects/upcoming` | CRUD upcoming projects |
| `POST /api/admin/subdomain` | Set active subdomain pointer |
| `POST /api/admin/subdomains` | Create / delete portal records |
| `POST /api/admin/update-carousel` | Spotlight carousel config |
| `POST /api/admin/generate-collateral` | AI (GPT-4o-mini) case study generation |
| `POST /api/admin/generate-hero` | AI hero copy |
| `POST /api/admin/generate-project` | AI project metadata |
| `POST /api/upload` | Multer disk file upload |
| `GET /api/download/:filename` | File download from `uploads/` |
| `POST /api/admin/deploy` | Writes `portal.json` config snapshot |

### Planned endpoints (not yet implemented)
| Endpoint | Purpose |
|---|---|
| `POST /api/admin/portal/create` | Full portal generation: copy template, substitute branding, assign port, start PM2 process, configure IIS |
| `POST /api/admin/portal/start` | Start a stopped portal via PM2 |
| `POST /api/admin/portal/stop` | Stop a running portal via PM2 |
| `POST /api/admin/portal/restart` | Restart portal process |
| `GET /api/admin/portal/status` | PM2 status for all portals |
| `DELETE /api/admin/portal/:slug` | Stop + delete portal (PM2 + IIS + disk) |
| `GET /api/domains` | Returns the hardcoded domain list for the dropdown (updated by editing backend config + redeploy) |

---

## Current Data Model (shared/types.ts)

| Type | Purpose |
|---|---|
| `SubdomainPortal` | A registered portal (id, name, displayName, assigned port, PM2 status) |
| `Solution` | A live product URL with optional guest credentials |
| `Collateral` | A case study / document with AI-generated content and uploaded files |
| `CurrentProject` | An active delivery engagement with KPI charts and feedback log |
| `UpcomingProject` | A pipeline engagement (scoping, proposal, POC) |
| `CarouselItem` | A spotlight slide linking to any entity |
| `UserLog` | Audit trail of admin and user actions |
| `AppState` | Top-level DB shape |

---

## Key Work Remaining

1. **Hub homepage for generic users** — tile grid showing all portals (name, description, URL/status); no admin token needed to view
2. **Portal generation engine** — `POST /api/admin/portal/create`: template copy + 22-location string substitution + port assignment + PM2 start + IIS binding
3. **Process management UI** — start/stop/restart controls per portal; live PM2 status display in Hub admin
4. **Domain dropdown** — frontend reads domain list from a hardcoded backend config array; adding a new domain = edit config + redeploy
5. **IIS binding automation** — scripted via PowerShell (`New-WebBinding`, `New-Website`) called from the Hub backend on portal creation/deletion
6. **Port registry** — persist port assignments in `data/data-store.json`; free-port scanner on new portal creation
7. **S3 integration** (production) — swap local `uploads/` for S3; serve via pre-signed URLs
8. **Persistent DB** (production) — replace flat JSON with DynamoDB or RDS
