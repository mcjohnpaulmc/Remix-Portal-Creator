"""
total_test.py — Regression & security test suite for Remix Portal Creator.

Each test corresponds to a verified bug/vulnerability fix. When a new fix is
applied, add a new test function here following the same pattern.

Run against a live server:
    python total_test.py

Skip server tests (file/static checks only):
    python total_test.py --static-only

Override base URL or admin token via env vars:
    BASE_URL=http://localhost:3000 ADMIN_TOKEN=secret python total_test.py
"""

import sys
import json
import os

# ── optional dependency: requests (needed only for server tests) ──────────────
try:
    import requests as _requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

BASE_URL    = os.environ.get("BASE_URL", "http://localhost:3000")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "dev-admin")
STATIC_ONLY = "--static-only" in sys.argv

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
APP_ROOT     = os.path.dirname(PROJECT_ROOT)  # tests/ lives inside Remix-Portal-Creator/

passed  = []
failed  = []
skipped = []


# ── helpers ───────────────────────────────────────────────────────────────────

def ok(name):
    passed.append(name)
    print(f"  PASS  {name}")


def fail(name, reason):
    failed.append(name)
    print(f"  FAIL  {name}")
    print(f"        {reason}")


def skip(name, reason):
    skipped.append(name)
    print(f"  SKIP  {name} — {reason}")


def server_get(path, headers=None):
    r = _requests.get(BASE_URL + path, headers=headers or {}, timeout=5)
    return r


def server_post(path, payload, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    r = _requests.post(BASE_URL + path, json=payload, headers=h, timeout=5)
    return r


def admin_post(path, payload):
    return server_post(path, payload, headers={"X-Admin-Token": ADMIN_TOKEN})


def read_file(rel_path):
    with open(os.path.join(APP_ROOT, rel_path), encoding="utf-8") as f:
        return f.read()


def read_json(rel_path):
    return json.loads(read_file(rel_path))


# ── server reachability ───────────────────────────────────────────────────────

def check_server():
    """Return True if the dev server is running."""
    if not REQUESTS_AVAILABLE:
        return False
    try:
        _requests.get(BASE_URL + "/api/database", timeout=3)
        return True
    except Exception:
        return False


SERVER_UP = (not STATIC_ONLY) and check_server()


# ═════════════════════════════════════════════════════════════════════════════
# Fix 1 — Admin API auth (server-side token guard on all /api/admin/* routes)
# ═════════════════════════════════════════════════════════════════════════════

def test_admin_endpoints_reject_missing_token():
    name = "Fix-1a: /api/admin/* returns 401 when X-Admin-Token is absent"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        endpoints = [
            ("/api/admin/solutions",  {"action": "create", "solution": {}}),
            ("/api/admin/collaterals", {"action": "create", "collateral": {}}),
        ]
        for path, body in endpoints:
            r = server_post(path, body)
            if r.status_code != 401:
                fail(name, f"{path} returned {r.status_code}, expected 401"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_admin_endpoints_reject_wrong_token():
    name = "Fix-1b: /api/admin/* returns 401 for an invalid token"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = server_post("/api/admin/solutions", {"action": "create", "solution": {}},
                        headers={"X-Admin-Token": "totally-wrong-token"})
        if r.status_code != 401:
            fail(name, f"Expected 401, got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_admin_verify_accepts_correct_token():
    name = "Fix-1c: /api/admin/verify returns 200 for the correct token"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = admin_post("/api/admin/verify", {})
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if not data.get("ok"):
            fail(name, f"Expected {{ok: true}}, got {data}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_server_ts_has_admin_middleware():
    name = "Fix-1d (static): server.ts registers requireAdminAuth middleware"
    try:
        src = read_file("backend/server.ts")
        assert 'requireAdminAuth' in src, "requireAdminAuth not defined"
        assert 'app.use("/api/admin", requireAdminAuth)' in src, \
            "middleware not registered with app.use"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 2 — Subdomain CRUD payload alignment (client sends `subdomain`, server
#          must accept it alongside the legacy `name` field)
# ═════════════════════════════════════════════════════════════════════════════

def test_subdomain_create_with_subdomain_field():
    name = "Fix-2a: POST /api/admin/subdomains accepts {subdomain:} field"
    if not SERVER_UP:
        skip(name, "server not running"); return
    slug = "testregression01"
    try:
        r = admin_post("/api/admin/subdomains",
                       {"action": "create", "subdomain": slug, "displayName": "Regression Test Portal"})
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if not data.get("success"):
            fail(name, f"success not true: {data}"); return
        # clean up
        admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_server_ts_accepts_subdomain_alias():
    name = "Fix-2b (static): server.ts destructures `subdomain` in subdomains handler"
    try:
        src = read_file("backend/server.ts")
        assert "const { action, name, subdomain, displayName, id } = req.body" in src, \
            "server does not destructure `subdomain` field"
        assert "resolvedName = name || subdomain" in src, \
            "server does not define resolvedName fallback"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 3 — Credentials not embedded in URLs or persisted in logs
# ═════════════════════════════════════════════════════════════════════════════

def test_logs_contain_no_credential_params():
    name = "Fix-3a: user-activity logs contain no password= URL parameter"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = server_get("/api/database")
        data = r.json()
        logs_text = json.dumps(data.get("userLogs", []))
        if "password=" in logs_text.lower():
            fail(name, "Found 'password=' in log entries"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_app_tsx_no_credential_url_embedding():
    name = "Fix-3b (static): App.tsx triggerSolutionRedirect does not set password= params"
    try:
        src = read_file("frontend/src/App.tsx")
        assert 'searchParams.set("password"' not in src, \
            "App.tsx still embeds password in URL search params"
        assert 'params += `password=' not in src, \
            "App.tsx still builds password= query string"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 4 — /api/admin/update-logo removed (was implemented but never called)
# ═════════════════════════════════════════════════════════════════════════════

def test_update_logo_endpoint_removed():
    name = "Fix-4a: POST /api/admin/update-logo returns 404 (endpoint removed)"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = admin_post("/api/admin/update-logo", {"logo": ""})
        if r.status_code != 404:
            fail(name, f"Expected 404, got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_server_ts_no_update_logo_route():
    name = "Fix-4b (static): server.ts does not define /api/admin/update-logo"
    try:
        src = read_file("backend/server.ts")
        assert "/api/admin/update-logo" not in src, \
            "update-logo route still present in server.ts"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 5 — Carousel subdomain <select> can now represent the "all" state
# ═════════════════════════════════════════════════════════════════════════════

def test_carousel_select_has_all_option():
    name = 'Fix-5 (static): carousel subdomain <select> includes value="all" option'
    try:
        src = read_file("frontend/src/App.tsx")
        # The select rendered inside the branding/carousel tab
        # must have an <option value="all"> so the default "all" state is valid
        assert '<option value="all">All Portals' in src, \
            'carousel subdomain <select> is missing <option value="all">'
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 6 — "Onboard Assets" button sets selectedAdminSubdomain (not just
#          the unused prefilledSubdomain state)
# ═════════════════════════════════════════════════════════════════════════════

def test_onboard_assets_sets_selected_admin_subdomain():
    name = "Fix-6 (static): Onboard Assets handler calls setSelectedAdminSubdomain"
    try:
        src = read_file("frontend/src/App.tsx")
        # The Portal Settings modal's "Onboard Assets" button calls setSelectedAdminSubdomain
        assert "setSelectedAdminSubdomain(portalSettingsTarget.name)" in src, \
            "Onboard Assets click handler does not call setSelectedAdminSubdomain"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 7 — Cross-platform clean script (no rm -rf)
# ═════════════════════════════════════════════════════════════════════════════

def test_clean_script_no_rm_rf():
    name = "Fix-7 (static): package.json clean script does not use rm -rf"
    try:
        pkg = read_json("package.json")
        clean = pkg.get("scripts", {}).get("clean", "")
        assert "rm -rf" not in clean, \
            f"clean script still uses rm -rf: {clean}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 8 — Encoding artifact removed from vite.config.ts
# ═════════════════════════════════════════════════════════════════════════════

def test_vite_config_no_encoding_artifact():
    name = "Fix-8 (static): vite.config.ts has no mojibake / garbled characters"
    try:
        with open(os.path.join(APP_ROOT, "frontend/vite.config.ts"), "rb") as f:
            raw = f.read()
        bad_seq = bytes([0xC3, 0xA2, 0xC2, 0x80, 0xC2, 0x94])
        assert bad_seq not in raw, \
            "vite.config.ts still contains mojibake byte sequence C3 A2 C2 80 C2 94"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 9 — Gemini replaced with OpenAI (gpt-4o-mini) across all AI endpoints
# ═════════════════════════════════════════════════════════════════════════════

def test_server_ts_uses_openai_not_gemini():
    name = "Fix-9a (static): server.ts imports OpenAI, not GoogleGenAI"
    try:
        src = read_file("backend/server.ts")
        assert "from \"@google/genai\"" not in src and "from '@google/genai'" not in src, \
            "server.ts still imports @google/genai"
        assert "import OpenAI from" in src or "import OpenAI from" in src, \
            "server.ts does not import OpenAI"
        assert "gpt-4o-mini" in src, "server.ts does not reference gpt-4o-mini model"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_generate_hero_uses_openai():
    name = "Fix-9b: POST /api/admin/generate-hero returns AI-generated text via OpenAI"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = admin_post("/api/admin/generate-hero", {"prompt": "Write a short enterprise intro."})
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if not data.get("heroText"):
            fail(name, f"heroText missing from response: {data}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_generate_project_uses_openai():
    name = "Fix-9c: POST /api/admin/generate-project returns valid JSON via OpenAI"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = admin_post("/api/admin/generate-project", {
            "name": "Test Logistics AI",
            "customerName": "unilever",
            "templateType": "current"
        })
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if "description" not in data or "deliveryValues" not in data:
            fail(name, f"Missing expected project fields: {list(data.keys())}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 10 — Real file upload endpoint (POST /api/upload saves to disk)
# ═════════════════════════════════════════════════════════════════════════════

def test_upload_endpoint_exists_and_requires_auth():
    name = "Fix-10a: POST /api/upload returns 401 without admin token"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = _requests.post(BASE_URL + "/api/upload", files={"file": ("test.txt", b"hello", "text/plain")}, timeout=5)
        if r.status_code != 401:
            fail(name, f"Expected 401, got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_upload_endpoint_saves_file():
    name = "Fix-10b: POST /api/upload saves file to disk and returns url"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = _requests.post(
            BASE_URL + "/api/upload",
            headers={"X-Admin-Token": ADMIN_TOKEN},
            files={"file": ("regression_test.txt", b"regression test content", "text/plain")},
            timeout=5
        )
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if "url" not in data:
            fail(name, f"url missing from upload response: {data}"); return
        if not data["url"].startswith("/uploads/"):
            fail(name, f"url should start with /uploads/, got: {data['url']}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_uploaded_file_is_served_statically():
    name = "Fix-10c: Uploaded file is accessible via GET /uploads/<filename>"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        # Upload a file first
        content = b"static serve regression test"
        r = _requests.post(
            BASE_URL + "/api/upload",
            headers={"X-Admin-Token": ADMIN_TOKEN},
            files={"file": ("static_test.txt", content, "text/plain")},
            timeout=5
        )
        if r.status_code != 200:
            skip(name, "upload failed, cannot test static serve"); return
        url = r.json()["url"]

        # Fetch the file via static URL
        r2 = _requests.get(BASE_URL + url, timeout=5)
        if r2.status_code != 200:
            fail(name, f"GET {url} returned {r2.status_code}"); return
        if r2.content != content:
            fail(name, "Uploaded file content does not match served content"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 11 — Real file download (GET /api/download/:filename serves from disk)
# ═════════════════════════════════════════════════════════════════════════════

def test_download_serves_real_file():
    name = "Fix-11: GET /api/download/:filename serves actual uploaded file"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        content = b"download regression test content"
        r = _requests.post(
            BASE_URL + "/api/upload",
            headers={"X-Admin-Token": ADMIN_TOKEN},
            files={"file": ("download_test.txt", content, "text/plain")},
            timeout=5
        )
        if r.status_code != 200:
            skip(name, "upload failed, cannot test download"); return
        filename = r.json()["filename"]

        r2 = _requests.get(BASE_URL + f"/api/download/{filename}", timeout=5)
        if r2.status_code != 200:
            fail(name, f"Expected 200, got {r2.status_code}"); return
        if r2.content != content:
            fail(name, "Downloaded content does not match uploaded content"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_download_not_stub():
    name = "Fix-11b (static): download endpoint does not serve hardcoded stub text"
    try:
        src = read_file("backend/server.ts")
        assert "MOBIUS SERVICES COMPLIARY ARCHIVE" not in src, \
            "server.ts still has the hardcoded mock download stub text"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 12 — Portal folder created on subdomain creation
# ═════════════════════════════════════════════════════════════════════════════

def test_portal_folder_created_on_subdomain_create():
    name = "Fix-12: Creating a subdomain creates data/portals/<slug>/assets/ folder"
    if not SERVER_UP:
        skip(name, "server not running"); return
    slug = "testportalfolder01"
    portal_path = os.path.join(APP_ROOT, "data", "portals", slug, "assets")
    try:
        # Clean up any previous test artifact
        import shutil
        parent = os.path.join(APP_ROOT, "data", "portals", slug)
        if os.path.exists(parent):
            shutil.rmtree(parent)

        r = admin_post("/api/admin/subdomains", {"action": "create", "subdomain": slug, "displayName": "Test Portal Folder"})
        if r.status_code != 200:
            fail(name, f"Subdomain creation returned {r.status_code}: {r.text}"); return
        if not os.path.isdir(portal_path):
            fail(name, f"Expected directory {portal_path} to be created"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))
    finally:
        admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})


# ═════════════════════════════════════════════════════════════════════════════
# Fix 13 — Real portal deploy (POST /api/admin/deploy writes portal.json)
# ═════════════════════════════════════════════════════════════════════════════

def test_deploy_endpoint_writes_portal_json():
    name = "Fix-13: POST /api/admin/deploy writes portal.json to data/portals/<slug>/"
    if not SERVER_UP:
        skip(name, "server not running"); return
    slug = "testdeploy01"
    portal_json_path = os.path.join(APP_ROOT, "data", "portals", slug, "portal.json")
    try:
        # Ensure subdomain exists
        admin_post("/api/admin/subdomains", {"action": "create", "subdomain": slug, "displayName": "Deploy Test Portal"})

        r = admin_post("/api/admin/deploy", {"portalSlug": slug})
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if not data.get("success"):
            fail(name, f"success not true: {data}"); return
        if not os.path.isfile(portal_json_path):
            fail(name, f"portal.json not found at {portal_json_path}"); return
        config = json.loads(open(portal_json_path).read())
        if config.get("slug") != slug:
            fail(name, f"portal.json slug mismatch: {config.get('slug')}"); return
        if "deployedAt" not in config:
            fail(name, "portal.json missing deployedAt field"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))
    finally:
        admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})


def test_deploy_endpoint_requires_auth():
    name = "Fix-13b: POST /api/admin/deploy returns 401 without token"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = server_post("/api/admin/deploy", {"portalSlug": "unilever"})
        if r.status_code != 401:
            fail(name, f"Expected 401, got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 14 — App.tsx deployment no longer uses setTimeout stub
# ═════════════════════════════════════════════════════════════════════════════

def test_app_tsx_deploy_uses_real_endpoint():
    name = "Fix-14 (static): App.tsx deployment calls /api/admin/deploy not setTimeout"
    try:
        src = read_file("frontend/src/App.tsx")
        assert "/api/admin/deploy" in src, \
            "App.tsx does not call /api/admin/deploy"
        assert "setTimeout" not in src or "handleSimulatedDeploymentLaunch" not in src.split("setTimeout")[0].split("\n")[-1], \
            "App.tsx deployment handler still uses setTimeout"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 15 — AdminSolutions/Collaterals/Projects use real file upload
# ═════════════════════════════════════════════════════════════════════════════

def test_admin_components_use_api_upload():
    name = "Fix-15 (static): Admin components call /api/upload instead of FileReader base64"
    try:
        for component in ["AdminSolutions.tsx", "AdminCollaterals.tsx", "AdminProjects.tsx"]:
            src = read_file(f"frontend/src/components/{component}")
            assert "/api/upload" in src, f"{component} does not call /api/upload"
            assert "readAsDataURL" not in src, f"{component} still uses FileReader.readAsDataURL"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 16 — UI: Pattern thumbnail fallback, horizontal auth modal, full-screen collateral
# ═════════════════════════════════════════════════════════════════════════════

def test_pattern_thumbnail_component_exists():
    name = "Fix-16a (static): PatternThumbnail component exists for empty-thumbnail fallback"
    try:
        src = read_file("frontend/src/components/PatternThumbnail.tsx")
        assert "PatternThumbnail" in src, "PatternThumbnail function not found"
        assert "linearGradient" in src, "PatternThumbnail must use SVG linearGradient"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_solution_card_uses_safe_image():
    name = "Fix-16b (static): App.tsx solution card uses SafeImage with onError fallback to PatternThumbnail"
    try:
        app_src = read_file("frontend/src/App.tsx")
        assert "SafeImage" in app_src, "App.tsx does not use SafeImage component"
        safe_src = read_file("frontend/src/components/SafeImage.tsx")
        assert "onError" in safe_src, "SafeImage does not have onError handler for broken images"
        assert "PatternThumbnail" in safe_src, "SafeImage does not fall back to PatternThumbnail"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_auth_modal_is_horizontal_two_column():
    name = "Fix-16c (static): AccessWall uses two-column horizontal grid layout"
    try:
        src = read_file("frontend/src/components/AccessWall.tsx")
        assert "grid-cols-2" in src or "md:grid-cols-2" in src, \
            "AccessWall does not use two-column grid layout"
        assert "onClose" in src, "AccessWall does not accept onClose prop"
        assert 'key === "Escape"' not in src, \
            "ESC key for auth modal should be in App.tsx, not AccessWall"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_auth_modal_esc_key_in_app():
    name = "Fix-16d (static): App.tsx closes auth overlay on Escape key"
    try:
        src = read_file("frontend/src/App.tsx")
        assert '"Escape"' in src, "App.tsx does not handle Escape key for auth modal"
        assert "setAuthNeededItem(null)" in src, "App.tsx does not close authNeededItem on ESC"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_collateral_modal_is_full_screen():
    name = "Fix-16e (static): CollateralDetailModal is full-screen, not a side panel"
    try:
        src = read_file("frontend/src/components/CollateralDetailModal.tsx")
        assert 'justify-end' not in src, \
            "CollateralDetailModal still uses justify-end (side panel layout)"
        assert 'x: "100%"' not in src and "x: '100%'" not in src, \
            "CollateralDetailModal still uses slide-in-from-right animation"
        assert 'justify-center' in src, \
            "CollateralDetailModal should use justify-center for full-screen layout"
        assert '"Escape"' in src, \
            "CollateralDetailModal should close on Escape key"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_header_subdomain_filters_use_valid_tailwind_color():
    name = "Fix-17 (static): Header subdomain filter buttons do not use the invalid bg-indigo-650 class"
    try:
        src = read_file("frontend/src/App.tsx")
        assert "bg-indigo-650" not in src, \
            "Header filter buttons still use bg-indigo-650 which is not a valid Tailwind class (renders transparent)"
        # Selected state now uses bg-slate-900 (not bg-indigo-600) — both are valid Tailwind classes
        assert "bg-slate-900" in src or "bg-orange-600" in src, \
            "Header filter selected state should use a valid Tailwind color class"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_carousel_bg_image_has_no_alt_text():
    name = "Fix-16g (static): HeroCarousel background img has empty alt to prevent ghost text on broken images"
    try:
        src = read_file("frontend/src/components/HeroCarousel.tsx")
        assert 'alt=""' in src, \
            "HeroCarousel background img still uses alt={current.title} — causes ghost text on broken image load"
        assert 'onError' in src, \
            "HeroCarousel background img has no onError handler to hide it when image fails to load"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_solution_with_empty_thumbnail_accepted():
    name = "Fix-16f: API accepts solution creation with empty thumbnail"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = admin_post("/api/admin/solutions", {
            "action": "create",
            "solution": {
                "title": "Regression No-Thumbnail Test",
                "thumbnail": "",
                "url": "",
                "credentialsDescription": "Test solution with no thumbnail",
                "enabled": False
            }
        })
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}: {r.text}"); return
        data = r.json()
        if not data.get("success"):
            fail(name, f"success not true: {data}"); return
        # clean up
        new_sol = next((s for s in data.get("database", {}).get("solutions", [])
                        if s.get("title") == "Regression No-Thumbnail Test"), None)
        if new_sol:
            admin_post("/api/admin/solutions", {"action": "delete", "solution": {"id": new_sol["id"]}})
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S1 — /api/database must not expose passwordHash
# ═════════════════════════════════════════════════════════════════════════════

def test_database_endpoint_strips_password_hash():
    name = "Sec-S1a: /api/database response omits passwordHash from all users"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = server_get("/api/database")
        if r.status_code != 200:
            fail(name, f"Expected 200, got {r.status_code}"); return
        data = r.json()
        users = data.get("users", [])
        for u in users:
            if "passwordHash" in u:
                fail(name, f"User {u.get('email')} exposes passwordHash"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_portal_server_ts_strips_password_hash():
    name = "Sec-S1b: portal-server.ts strips passwordHash before serving /api/database"
    try:
        src = read_file("backend/portal-server.ts")
        if "passwordHash: _ph" not in src and "passwordHash:_ph" not in src:
            fail(name, "Did not find passwordHash strip pattern in portal-server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S2 — Upload endpoint blocks dangerous file extensions
# ═════════════════════════════════════════════════════════════════════════════

def test_upload_rejects_dangerous_extensions():
    name = "Sec-S2a: Upload endpoint rejects .svg, .html, .js files"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        import io
        dangerous = [
            ("test.svg",  b"<svg><script>alert(1)</script></svg>", "image/svg+xml"),
            ("test.html", b"<script>alert(1)</script>",            "text/html"),
            ("test.js",   b"alert('xss')",                         "application/javascript"),
        ]
        for fname, content, ct in dangerous:
            files = {"file": (fname, io.BytesIO(content), ct)}
            r = _requests.post(
                BASE_URL + "/api/upload",
                headers={"X-Admin-Token": ADMIN_TOKEN},
                files=files,
                timeout=5,
            )
            if r.status_code not in (400, 415, 422):
                fail(name, f"{fname} was not rejected (status {r.status_code})"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_server_ts_has_blocked_extensions():
    name = "Sec-S2b: server.ts defines BLOCKED_EXTENSIONS set"
    try:
        src = read_file("backend/server.ts")
        if "BLOCKED_EXTENSIONS" not in src:
            fail(name, "BLOCKED_EXTENSIONS not found in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_upload_served_as_attachment():
    name = "Sec-S2c: server.ts serves uploaded files with Content-Disposition: attachment"
    try:
        src = read_file("backend/server.ts")
        if "Content-Disposition" not in src or "attachment" not in src:
            fail(name, "Content-Disposition: attachment not found in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S3 — X-Admin-User header must NOT grant authentication
# ═════════════════════════════════════════════════════════════════════════════

def test_x_admin_user_header_rejected():
    name = "Sec-S3a: X-Admin-User header is not accepted for authentication"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = server_post(
            "/api/admin/solutions",
            {"action": "create", "solution": {}},
            headers={"X-Admin-User": "admin@example.com"},
        )
        if r.status_code != 401:
            fail(name, f"X-Admin-User granted access (status {r.status_code}), expected 401"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_server_ts_no_x_admin_user_path():
    name = "Sec-S3b: server.ts requireAdminAuth no longer checks X-Admin-User header"
    try:
        src = read_file("backend/server.ts")
        if "x-admin-user" in src.lower():
            fail(name, "x-admin-user header path still present in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S4 — JWT issued on login grants admin access
# ═════════════════════════════════════════════════════════════════════════════

def test_jwt_issued_on_admin_login():
    name = "Sec-S4a: /api/login returns a JWT token for admin users"
    if not SERVER_UP:
        skip(name, "server not running"); return
    admin_email = os.environ.get("ADMIN_EMAIL", "eswar@xtract.io")
    admin_pass  = os.environ.get("ADMIN_PASS",  "xts123")
    try:
        r = server_post("/api/login", {"email": admin_email, "password": admin_pass})
        if r.status_code != 200:
            skip(name, f"Login failed ({r.status_code}) — check ADMIN_EMAIL / ADMIN_PASS env vars"); return
        data = r.json()
        if not data.get("token"):
            fail(name, f"No token in login response: {data}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_jwt_grants_admin_access():
    name = "Sec-S4b: Bearer JWT from /api/login grants access to admin endpoints"
    if not SERVER_UP:
        skip(name, "server not running"); return
    admin_email = os.environ.get("ADMIN_EMAIL", "eswar@xtract.io")
    admin_pass  = os.environ.get("ADMIN_PASS",  "xts123")
    try:
        login = server_post("/api/login", {"email": admin_email, "password": admin_pass})
        if login.status_code != 200:
            skip(name, "Login failed — cannot test JWT access"); return
        token = login.json().get("token")
        if not token:
            skip(name, "No token returned — admin may not be seeded yet"); return
        r = server_post(
            "/api/admin/solutions",
            {"action": "create", "solution": {"title": "JWT Test", "enabled": False}},
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code not in (200, 201):
            fail(name, f"JWT not accepted (status {r.status_code})"); return
        # clean up
        data = r.json()
        new_sol = next((s for s in data.get("database", {}).get("solutions", [])
                        if s.get("title") == "JWT Test"), None)
        if new_sol:
            server_post(
                "/api/admin/solutions",
                {"action": "delete", "solution": {"id": new_sol["id"]}},
                headers={"Authorization": f"Bearer {token}"},
            )
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_server_ts_has_jwt_secret():
    name = "Sec-S4c: server.ts defines JWT_SECRET (not ephemeral-only)"
    try:
        src = read_file("backend/server.ts")
        if "JWT_SECRET" not in src:
            fail(name, "JWT_SECRET not found in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S5 — Atomic DB writes (write .tmp then rename)
# ═════════════════════════════════════════════════════════════════════════════

def test_server_ts_uses_atomic_write():
    name = "Sec-S5a: server.ts writeDatabase uses atomic .tmp + renameSync pattern"
    try:
        src = read_file("backend/server.ts")
        if ".tmp" not in src or "renameSync" not in src:
            fail(name, "Atomic write pattern (.tmp + renameSync) not found in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S6 — Preserve corrupted DB instead of destroying it
# ═════════════════════════════════════════════════════════════════════════════

def test_server_ts_backs_up_corrupted_db():
    name = "Sec-S6a: server.ts readDatabase backs up corrupted file before resetting"
    try:
        src = read_file("backend/server.ts")
        if ".corrupt-" not in src and "copyFileSync" not in src:
            fail(name, "Corrupted DB backup pattern not found in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S7 — bcrypt in portal-server.ts login
# ═════════════════════════════════════════════════════════════════════════════

def test_portal_server_uses_verify_password():
    name = "Sec-S7a: portal-server.ts /api/login uses verifyPassword (bcrypt-aware)"
    try:
        src = read_file("backend/portal-server.ts")
        if "verifyPassword" not in src:
            fail(name, "verifyPassword not found in portal-server.ts"); return
        if "hashPassword" in src and "function hashPassword" in src:
            fail(name, "Old SHA-256 hashPassword still defined in portal-server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_portal_server_imports_bcrypt():
    name = "Sec-S7b: portal-server.ts imports bcryptjs"
    try:
        src = read_file("backend/portal-server.ts")
        if "bcryptjs" not in src:
            fail(name, "bcryptjs import not found in portal-server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S8 — No hardcoded admin password in server.ts
# ═════════════════════════════════════════════════════════════════════════════

def test_server_ts_no_hardcoded_admin_password():
    name = "Sec-S8a: server.ts does not hardcode admin password (uses SYSTEM_ADMIN_PASSWORD env)"
    try:
        src = read_file("backend/server.ts")
        if 'hashPassword("xts123")' in src or "hashPassword('xts123')" in src:
            fail(name, "Hardcoded hashPassword('xts123') still present in server.ts"); return
        if "SYSTEM_ADMIN_PASSWORD" not in src:
            fail(name, "SYSTEM_ADMIN_PASSWORD env var reference not found in server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── run all tests ─────────────────────────────────────────────────────────────

TESTS = [
    test_admin_endpoints_reject_missing_token,
    test_admin_endpoints_reject_wrong_token,
    test_admin_verify_accepts_correct_token,
    test_server_ts_has_admin_middleware,
    test_subdomain_create_with_subdomain_field,
    test_server_ts_accepts_subdomain_alias,
    test_logs_contain_no_credential_params,
    test_app_tsx_no_credential_url_embedding,
    test_update_logo_endpoint_removed,
    test_server_ts_no_update_logo_route,
    test_carousel_select_has_all_option,
    test_onboard_assets_sets_selected_admin_subdomain,
    test_clean_script_no_rm_rf,
    test_vite_config_no_encoding_artifact,
    # Fix 9 — OpenAI replaces Gemini
    test_server_ts_uses_openai_not_gemini,
    test_generate_hero_uses_openai,
    test_generate_project_uses_openai,
    # Fix 10 — Real file upload
    test_upload_endpoint_exists_and_requires_auth,
    test_upload_endpoint_saves_file,
    test_uploaded_file_is_served_statically,
    # Fix 11 — Real file download
    test_download_serves_real_file,
    test_download_not_stub,
    # Fix 12 — Portal folder on subdomain creation
    test_portal_folder_created_on_subdomain_create,
    # Fix 13 — Portal deploy endpoint
    test_deploy_endpoint_writes_portal_json,
    test_deploy_endpoint_requires_auth,
    # Fix 14 — No setTimeout stub in deploy
    test_app_tsx_deploy_uses_real_endpoint,
    # Fix 15 — Real file upload in admin components
    test_admin_components_use_api_upload,
    # Fix 16 — Pattern thumbnail, horizontal auth modal, full-screen collateral
    test_pattern_thumbnail_component_exists,
    test_solution_card_uses_safe_image,
    test_auth_modal_is_horizontal_two_column,
    test_auth_modal_esc_key_in_app,
    test_collateral_modal_is_full_screen,
    test_header_subdomain_filters_use_valid_tailwind_color,
    test_carousel_bg_image_has_no_alt_text,
    test_solution_with_empty_thumbnail_accepted,
    # Security fixes — S1: passwordHash not exposed
    test_database_endpoint_strips_password_hash,
    test_portal_server_ts_strips_password_hash,
    # Security fixes — S2: dangerous upload extensions blocked
    test_upload_rejects_dangerous_extensions,
    test_server_ts_has_blocked_extensions,
    test_upload_served_as_attachment,
    # Security fixes — S3: X-Admin-User header rejected
    test_x_admin_user_header_rejected,
    test_server_ts_no_x_admin_user_path,
    # Security fixes — S4: JWT authentication
    test_jwt_issued_on_admin_login,
    test_jwt_grants_admin_access,
    test_server_ts_has_jwt_secret,
    # Security fixes — S5: atomic DB writes
    test_server_ts_uses_atomic_write,
    # Security fixes — S6: corrupted DB preserved
    test_server_ts_backs_up_corrupted_db,
    # Security fixes — S7: bcrypt in portal-server
    test_portal_server_uses_verify_password,
    test_portal_server_imports_bcrypt,
    # Security fixes — S8: no hardcoded admin password
    test_server_ts_no_hardcoded_admin_password,
]

if __name__ == "__main__":
    print()
    print("=" * 60)
    print("  Remix Portal Creator — Security & Regression Test Suite")
    print("=" * 60)

    if STATIC_ONLY:
        print("  Mode: static-only (no server calls)")
    elif not SERVER_UP:
        print(f"  Server at {BASE_URL} is not reachable — server tests will be skipped")
        if not REQUESTS_AVAILABLE:
            print("  (install 'requests' via pip to enable server tests)")
    else:
        print(f"  Server: {BASE_URL}  |  Token: {'*' * len(ADMIN_TOKEN)}")
    print()

    for t in TESTS:
        t()

    print()
    print("=" * 60)
    print(f"  Results: {len(passed)} passed  |  {len(failed)} failed  |  {len(skipped)} skipped")
    print("=" * 60)
    print()

    sys.exit(1 if failed else 0)
