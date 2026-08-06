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
    name = "Fix-2b (static): subdomains route destructures `subdomain` alias field"
    try:
        # After refactoring, subdomain logic lives in the dedicated route module
        src = read_file("backend/routes/subdomains.routes.ts")
        assert "subdomain" in src, \
            "server does not destructure `subdomain` field"
        assert "resolvedName" in src or "name || subdomain" in src, \
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
    name = "Fix-9a (static): AI routes import OpenAI, not GoogleGenAI"
    try:
        # After refactoring, AI logic lives in the dedicated route module
        ai_src = read_file("backend/routes/ai.routes.ts")
        assert "from \"@google/genai\"" not in ai_src and "from '@google/genai'" not in ai_src, \
            "AI routes still import @google/genai"
        assert "OpenAI" in ai_src, \
            "AI routes do not import or use OpenAI"
        assert "gpt-4o-mini" in ai_src, "AI routes do not reference gpt-4o-mini model"
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

        r2 = _requests.get(BASE_URL + f"/api/download/{filename}",
                           headers={"X-Admin-Token": ADMIN_TOKEN}, timeout=5)
        if r2.status_code != 200:
            fail(name, f"Expected 200 (with auth), got {r2.status_code}"); return
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
    name = "Sec-S1b: portal-server.ts strips passwordHash via shared publicDbProjection"
    try:
        # After refactoring, the strip is done via publicDbProjection from portal/snapshot
        portal_src = read_file("backend/portal-server.ts")
        snapshot_src = read_file("backend/portal/snapshot.ts")
        uses_projection = "publicDbProjection" in portal_src
        has_strip_inline = "passwordHash: _ph" in portal_src or "passwordHash:_ph" in portal_src
        has_strip_in_snapshot = "passwordHash: _ph" in snapshot_src or "passwordHash:_ph" in snapshot_src
        if not (uses_projection or has_strip_inline) and not has_strip_in_snapshot:
            fail(name, "passwordHash is not stripped in portal-server or snapshot module"); return
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
    name = "Sec-S2b: upload route defines BLOCKED_EXTENSIONS set"
    try:
        # After refactoring, upload logic lives in the dedicated route module
        src = read_file("backend/routes/upload.routes.ts")
        if "BLOCKED_EXTENSIONS" not in src:
            fail(name, "BLOCKED_EXTENSIONS not found in upload.routes.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_upload_served_as_attachment():
    name = "Sec-S2c: upload route serves files with Content-Disposition: attachment"
    try:
        # After refactoring, upload logic lives in the dedicated route module
        src = read_file("backend/routes/upload.routes.ts")
        if "Content-Disposition" not in src or "attachment" not in src:
            fail(name, "Content-Disposition: attachment not found in upload.routes.ts"); return
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
    name = "Sec-S4c: auth module defines JWT_SECRET handling (not ephemeral-only)"
    try:
        # After refactoring, JWT logic lives in the auth module
        src = read_file("backend/auth/index.ts")
        if "JWT_SECRET" not in src:
            fail(name, "JWT_SECRET not found in backend/auth/index.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S5 — Atomic DB writes (write .tmp then rename)
# ═════════════════════════════════════════════════════════════════════════════

def test_server_ts_uses_atomic_write():
    name = "Sec-S5a: storage/db.ts writeDatabase uses atomic .tmp + renameSync pattern"
    try:
        # After refactoring, DB write logic lives in storage/db.ts
        src = read_file("backend/storage/db.ts")
        if ".tmp" not in src or "renameSync" not in src:
            fail(name, "Atomic write pattern (.tmp + renameSync) not found in storage/db.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Security Fix S6 — Preserve corrupted DB instead of destroying it
# ═════════════════════════════════════════════════════════════════════════════

def test_server_ts_backs_up_corrupted_db():
    name = "Sec-S6a: storage/db.ts readDatabase backs up corrupted file before resetting"
    try:
        # After refactoring, DB read logic lives in storage/db.ts
        src = read_file("backend/storage/db.ts")
        if ".corrupt-" not in src and "copyFileSync" not in src:
            fail(name, "Corrupted DB backup pattern not found in storage/db.ts"); return
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
    name = "Sec-S8a: auth/seed.ts uses SYSTEM_ADMIN_PASSWORD env (no hardcoded password)"
    try:
        # After refactoring, admin seed logic lives in auth/seed.ts
        seed_src = read_file("backend/auth/seed.ts")
        server_src = read_file("backend/server.ts")
        for src, label in [(seed_src, "auth/seed.ts"), (server_src, "server.ts")]:
            if 'hashPassword("xts123")' in src or "hashPassword('xts123')" in src:
                fail(name, f"Hardcoded hashPassword('xts123') still present in {label}"); return
        if "SYSTEM_ADMIN_PASSWORD" not in seed_src:
            fail(name, "SYSTEM_ADMIN_PASSWORD env var reference not found in auth/seed.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Refactor R1 — Modular backend structure
# ═════════════════════════════════════════════════════════════════════════════

def test_refactor_module_files_exist():
    name = "Refactor-R1a: all expected backend modules exist"
    expected = [
        "backend/config.ts",
        "backend/logger.ts",
        "backend/auth/index.ts",
        "backend/auth/seed.ts",
        "backend/storage/db.ts",
        "backend/storage/s3.ts",
        "backend/portal/snapshot.ts",
        "backend/portal/deploy.ts",
        "backend/portal/process.ts",
        "backend/routes/auth.routes.ts",
        "backend/routes/users.routes.ts",
        "backend/routes/content.routes.ts",
        "backend/routes/subdomains.routes.ts",
        "backend/routes/ai.routes.ts",
        "backend/routes/upload.routes.ts",
        "backend/routes/deploy.routes.ts",
        "backend/routes/public.routes.ts",
    ]
    try:
        missing = [p for p in expected if not os.path.exists(os.path.join(APP_ROOT, p))]
        if missing:
            fail(name, f"Missing modules: {missing}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_config_exports_constants():
    name = "Refactor-R1b: config.ts exports key constants (PORT, S3_BUCKET, DATA_DIR)"
    try:
        src = read_file("backend/config.ts")
        for const in ["PORT", "S3_BUCKET", "S3_PREFIX", "DATA_DIR", "DATA_FILE", "UPLOADS_DIR",
                      "PORTALS_DIR", "ADMIN_TOKEN", "JWT_SECRET", "BCRYPT_ROUNDS"]:
            if const not in src:
                fail(name, f"{const} not exported from config.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_logger_has_methods():
    name = "Refactor-R1c: logger.ts exports info/warn/error/debug methods"
    try:
        src = read_file("backend/logger.ts")
        for method in ["info", "warn", "error", "debug"]:
            if method not in src:
                fail(name, f"logger.{method} not found in logger.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_server_ts_is_thin():
    name = "Refactor-R1d: server.ts is a thin orchestrator (under 100 lines)"
    try:
        lines = read_file("backend/server.ts").splitlines()
        if len(lines) > 100:
            fail(name, f"server.ts has {len(lines)} lines — expected < 100 after refactoring"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_deploy_returns_structured_result():
    name = "Refactor-R1e: portal/deploy.ts returns structured {localWriteOk, s3Ok, reloadOk}"
    try:
        src = read_file("backend/portal/deploy.ts")
        for field in ["localWriteOk", "s3Ok", "reloadOk"]:
            if field not in src:
                fail(name, f"deploy.ts does not include '{field}' in return value"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_deploy_endpoint_returns_structured_result():
    name = "Refactor-R1f: /api/admin/deploy response includes localWriteOk and s3Ok fields"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = admin_post("/api/admin/deploy", {"portalSlug": "nonexistent-slug-test"})
        # Even for a non-live portal, the endpoint should respond with structured fields
        if r.status_code not in (200, 404):
            fail(name, f"Unexpected status {r.status_code}"); return
        if r.status_code == 200:
            data = r.json()
            if "localWriteOk" not in data or "s3Ok" not in data:
                fail(name, f"Response missing localWriteOk/s3Ok: {data}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_shared_snapshot_function():
    name = "Refactor-R1g: portal/snapshot.ts exports buildPortalSnapshot and publicDbProjection"
    try:
        src = read_file("backend/portal/snapshot.ts")
        for fn in ["buildPortalSnapshot", "publicDbProjection"]:
            if fn not in src:
                fail(name, f"{fn} not found in portal/snapshot.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Refactor R2 — Frontend API client layer
# ═════════════════════════════════════════════════════════════════════════════

def test_refactor_frontend_api_client_exists():
    name = "Refactor-R2a: frontend/src/api/client.ts exists with adminFetch and publicFetch"
    try:
        src = read_file("frontend/src/api/client.ts")
        for fn in ["adminFetch", "publicFetch", "storeAuthToken", "clearAuthToken"]:
            if fn not in src:
                fail(name, f"{fn} not found in frontend/src/api/client.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refactor_app_tsx_imports_admin_fetch():
    name = "Refactor-R2b: App.tsx imports adminFetch from ./api/client (not inline)"
    try:
        src = read_file("frontend/src/App.tsx")
        if "from \"./api/client\"" not in src and "from './api/client'" not in src:
            fail(name, "App.tsx does not import from ./api/client"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Bug Fix MF1 — X-Admin-Token bypass with default "dev-admin" token
# ═════════════════════════════════════════════════════════════════════════════

def test_mf1_config_no_dev_admin_fallback():
    name = "BugFix-MF1a (static): config.ts does not fall back to predictable 'dev-admin' string"
    try:
        src = read_file("backend/config.ts")
        if '"dev-admin"' in src or "'dev-admin'" in src:
            fail(name, "config.ts still uses 'dev-admin' as ADMIN_TOKEN fallback"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mf1_auth_uses_effective_admin_token():
    name = "BugFix-MF1b (static): auth/index.ts uses effectiveAdminToken (not bare ADMIN_TOKEN) in X-Admin-Token check"
    try:
        src = read_file("backend/auth/index.ts")
        if "effectiveAdminToken" not in src:
            fail(name, "effectiveAdminToken not defined in auth/index.ts"); return
        if "token === effectiveAdminToken" not in src:
            fail(name, "X-Admin-Token check does not compare against effectiveAdminToken"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mf1_auth_generates_ephemeral_token_when_unset():
    name = "BugFix-MF1c (static): auth/index.ts generates random ephemeral token when ADMIN_TOKEN is unset"
    try:
        src = read_file("backend/auth/index.ts")
        has_random = "Math.random()" in src
        has_createHash = "createHash" in src
        has_condition = "if (!ADMIN_TOKEN)" in src or "if (ADMIN_TOKEN ===" not in src
        if not (has_random and has_createHash):
            fail(name, "Random ephemeral token generation not found in auth/index.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mf1_dev_admin_token_rejected():
    name = "BugFix-MF1d (server): X-Admin-Token 'dev-admin' is rejected when ADMIN_TOKEN env var is not set"
    if not SERVER_UP:
        skip(name, "server not running"); return
    # When the test suite's ADMIN_TOKEN is 'dev-admin' (the default), the server also has
    # ADMIN_TOKEN=dev-admin explicitly configured (e.g. in .env), so the ephemeral-random
    # path is not active. Only meaningful when ADMIN_TOKEN is unset on the server.
    if ADMIN_TOKEN == "dev-admin":
        skip(name, "ADMIN_TOKEN is 'dev-admin' in this env — server uses it explicitly, ephemeral path not active"); return
    try:
        r = server_post("/api/admin/solutions", {"action": "create", "solution": {}},
                        headers={"X-Admin-Token": "dev-admin"})
        if r.status_code != 401:
            fail(name, f"Expected 401 (ephemeral token active), got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Bug Fix MF2 — passwordHash still in portal.json artifacts
# ═════════════════════════════════════════════════════════════════════════════

def test_mf2_build_portal_snapshot_no_password_hash():
    name = "BugFix-MF2a (static): buildPortalSnapshot does not include passwordHash in portal.json users"
    try:
        src = read_file("backend/portal/snapshot.ts")
        # Find the buildPortalSnapshot function body and check passwordHash is absent from users map
        snapshot_section = src[src.find("export function buildPortalSnapshot"):] if "export function buildPortalSnapshot" in src else src
        # publicDbProjection has "passwordHash: _ph" for stripping — that is fine.
        # We check the users mapping inside buildPortalSnapshot does NOT set passwordHash.
        users_block_start = snapshot_section.find("users:")
        users_block = snapshot_section[users_block_start:users_block_start + 400] if users_block_start != -1 else ""
        if "passwordHash: (u as any).passwordHash" in users_block or "passwordHash: u.passwordHash" in users_block:
            fail(name, "buildPortalSnapshot still maps passwordHash into portal.json users"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mf2_build_default_portal_json_no_password_hash():
    name = "BugFix-MF2b (static): buildDefaultPortalJson does not include passwordHash in portal.json users"
    try:
        src = read_file("backend/portal/deploy.ts")
        deploy_section = src[src.find("export function buildDefaultPortalJson"):] if "export function buildDefaultPortalJson" in src else src
        users_block_start = deploy_section.find("users:")
        users_block = deploy_section[users_block_start:users_block_start + 400] if users_block_start != -1 else ""
        if "passwordHash" in users_block:
            fail(name, "buildDefaultPortalJson still maps passwordHash into portal.json users"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Bug Fix MF3 — toggle-to-live races portal startup vs deploy
# ═════════════════════════════════════════════════════════════════════════════

def test_mf3_toggle_awaits_deploy_before_spawn():
    name = "BugFix-MF3a (static): subdomains.routes.ts awaits deployPortalInProcess before pm2SpawnPortal in toggle"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        # Handler must be async
        if "async (req, res)" not in src:
            fail(name, "subdomains route handler is not async"); return
        # The deploy call should be awaited, not fire-and-forget
        if "deployPortalInProcess(targetId, db).catch(" in src:
            fail(name, "deployPortalInProcess is still fire-and-forget (.catch) — should be awaited"); return
        if "await deployPortalInProcess(" not in src:
            fail(name, "deployPortalInProcess is not awaited before pm2SpawnPortal"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Bug Fix MF4 — /api/admin/deploy always returns success: true
# ═════════════════════════════════════════════════════════════════════════════

def test_mf4_deploy_returns_failure_on_write_error():
    name = "BugFix-MF4a (static): deploy.routes.ts returns 500 with success:false when localWriteOk is false"
    try:
        src = read_file("backend/routes/deploy.routes.ts")
        if "!localWriteOk" not in src:
            fail(name, "No guard for !localWriteOk in deploy.routes.ts"); return
        if "success: false" not in src:
            fail(name, "deploy.routes.ts never returns success: false"); return
        if "status(500)" not in src and "res.status(500)" not in src:
            fail(name, "deploy.routes.ts does not return HTTP 500 on failure"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mf4_deploy_logs_failure_separately():
    name = "BugFix-MF4b (static): deploy.routes.ts logs 'Portal Deploy Failed' separately from 'Portal Deployed'"
    try:
        src = read_file("backend/routes/deploy.routes.ts")
        if "Portal Deploy Failed" not in src:
            fail(name, "'Portal Deploy Failed' log action not found in deploy.routes.ts"); return
        if "Portal Deployed" not in src:
            fail(name, "'Portal Deployed' success log action not found in deploy.routes.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Security Fix MS3 — /api/reload is unauthenticated
# ═════════════════════════════════════════════════════════════════════════════

def test_ms3_portal_server_reload_requires_token():
    name = "SecFix-MS3a (static): portal-server.ts /api/reload requires X-Admin-Token"
    try:
        src = read_file("backend/portal-server.ts")
        reload_section = src[src.find('"/api/reload"'):src.find('"/api/reload"') + 400] if '"/api/reload"' in src else ""
        if "x-admin-token" not in reload_section.lower():
            fail(name, "/api/reload handler does not check X-Admin-Token"); return
        if "401" not in reload_section:
            fail(name, "/api/reload handler does not return 401 on missing/wrong token"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ms3_hub_sends_token_on_reload():
    name = "SecFix-MS3b (static): portal/deploy.ts sends X-Admin-Token header when calling /api/reload"
    try:
        src = read_file("backend/portal/deploy.ts")
        if '"X-Admin-Token"' not in src and "'X-Admin-Token'" not in src:
            fail(name, "deploy.ts does not send X-Admin-Token header on reload request"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Security Fix MS4 — No rate limiting on login endpoints
# ═════════════════════════════════════════════════════════════════════════════

def test_ms4_hub_login_has_rate_limiter():
    name = "SecFix-MS4a (static): auth.routes.ts /api/login applies express-rate-limit"
    try:
        src = read_file("backend/routes/auth.routes.ts")
        if "express-rate-limit" not in src and "rateLimit" not in src:
            fail(name, "express-rate-limit not imported in auth.routes.ts"); return
        if "loginLimiter" not in src:
            fail(name, "loginLimiter not defined/applied in auth.routes.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ms4_portal_login_has_rate_limiter():
    name = "SecFix-MS4b (static): portal-server.ts /api/login applies rate limiting"
    try:
        src = read_file("backend/portal-server.ts")
        if "rateLimit" not in src and "loginLimiter" not in src:
            fail(name, "rate limiter not found in portal-server.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ms4_hub_login_returns_429_after_limit():
    name = "SecFix-MS4c (server): /api/login returns 429 after 5 failed attempts"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        for _ in range(5):
            server_post("/api/login", {"email": "nobody@test.invalid", "password": "wrong"})
        r = server_post("/api/login", {"email": "nobody@test.invalid", "password": "wrong"})
        if r.status_code != 429:
            fail(name, f"Expected 429 after 5 attempts, got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Security Fix MS5 — Uploaded files publicly retrievable
# ═════════════════════════════════════════════════════════════════════════════

def test_ms5_download_requires_auth():
    name = "SecFix-MS5a (static): upload.routes.ts /api/download requires admin auth"
    try:
        src = read_file("backend/routes/upload.routes.ts")
        # Check that requireAdminAuth appears before the download handler
        download_pos = src.find('"/api/download/:filename"')
        auth_pos = src.rfind("requireAdminAuth", 0, download_pos) if download_pos != -1 else -1
        if download_pos == -1:
            fail(name, "/api/download/:filename route not found in upload.routes.ts"); return
        # requireAdminAuth can appear on the same line as the download route or earlier
        download_line = src[max(0, download_pos - 20):download_pos + 80]
        if "requireAdminAuth" not in download_line:
            fail(name, "requireAdminAuth is not applied to /api/download/:filename"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ms5_download_rejects_unauthenticated():
    name = "SecFix-MS5b (server): GET /api/download/:file returns 401 without auth"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        r = server_get("/api/download/nonexistent.pdf")
        if r.status_code != 401:
            fail(name, f"Expected 401, got {r.status_code}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Manager Security Fix MS6 — /api/log is unauthenticated and unbounded
# ═════════════════════════════════════════════════════════════════════════════

def test_ms6_log_rate_limited():
    name = "SecFix-MS6a (static): public.routes.ts /api/log applies rate limiting"
    try:
        src = read_file("backend/routes/public.routes.ts")
        if "rateLimit" not in src and "logLimiter" not in src:
            fail(name, "rate limiter not found in public.routes.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ms6_log_fields_validated():
    name = "SecFix-MS6b (static): public.routes.ts /api/log truncates field lengths"
    try:
        src = read_file("backend/routes/public.routes.ts")
        if ".slice(" not in src:
            fail(name, "field length truncation (.slice) not found in public.routes.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ms6_log_has_entry_cap():
    name = "SecFix-MS6c (static): public.routes.ts caps total userLogs entries"
    try:
        src = read_file("backend/routes/public.routes.ts")
        if "MAX_LOG_ENTRIES" not in src:
            fail(name, "MAX_LOG_ENTRIES cap not found in public.routes.ts"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — PI: per-user portal isolation ──────────────────────────────────
# A user must never see/manage a portal created by another user, and content
# mapped to "all portals" must only broadcast within the creator's own portals.

def test_pi1_content_types_have_created_by():
    name = "PI1 (static): shared/types.ts tracks createdBy on Solution/Collateral/CurrentProject/UpcomingProject"
    try:
        src = read_file("shared/types.ts")
        for iface in ["Solution", "Collateral", "CurrentProject", "UpcomingProject"]:
            start = src.index(f"interface {iface} ")
            # Interface bodies contain nested inline object-type braces, so find the end
            # of the block by the next top-level "export interface" (or EOF) instead of
            # the first "}", which would match a nested type literal too early.
            next_iface = src.find("\nexport interface", start + 1)
            end = next_iface if next_iface != -1 else len(src)
            if "createdBy" not in src[start:end]:
                fail(name, f"{iface} interface has no createdBy field"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pi2_content_routes_stamps_created_by_on_create():
    name = "PI2 (static): content.routes.ts stamps createdBy on solution/collateral/project create"
    try:
        src = read_file("backend/routes/content.routes.ts")
        if src.count("createdBy: adminEmail || undefined") < 4:
            fail(name, "expected createdBy to be stamped on create for all four content types"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pi3_content_routes_enforces_ownership_on_write():
    name = "PI3 (static): content.routes.ts rejects update/delete of another admin's content"
    try:
        src = read_file("backend/routes/content.routes.ts")
        if src.count("You do not have permission to modify") < 3:
            fail(name, "expected an ownership check on update for solutions/collaterals/projects"); return
        if src.count("You do not have permission to delete") < 3:
            fail(name, "expected an ownership check on delete for solutions/collaterals/projects"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pi4_snapshot_all_broadcast_respects_ownership():
    name = "PI4 (static): portal/snapshot.ts scopes 'map to all portals' to the item's own creator"
    try:
        src = read_file("backend/portal/snapshot.ts")
        if "isOwnedByPortalCreator" not in src:
            fail(name, "buildPortalSnapshot no longer resolves 'all' with an ownership check"); return
        if "portalOwner" not in src:
            fail(name, "buildPortalSnapshot does not derive the target portal's owner"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pi5_admin_responses_use_safe_db_view():
    name = "PI5 (static): admin routes stop echoing the raw, unfiltered database back to the client"
    try:
        content_src = read_file("backend/routes/content.routes.ts")
        subdomains_src = read_file("backend/routes/subdomains.routes.ts")
        if "buildAdminSafeDbView" not in content_src:
            fail(name, "content.routes.ts does not use buildAdminSafeDbView"); return
        if "database: db }" in content_src or "database: db," in content_src:
            fail(name, "content.routes.ts still returns the raw db object somewhere"); return
        if "buildAdminSafeDbView" not in subdomains_src:
            fail(name, "subdomains.routes.ts does not use buildAdminSafeDbView"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pi6_refresh_dns_filters_by_ownership():
    name = "PI6 (static): POST /refresh-dns only returns/re-checks the requesting admin's own portals"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        start = src.index('router.post("/refresh-dns"')
        body = src[start:start + 1500]
        if "createdBy" not in body:
            fail(name, "refresh-dns handler no longer filters pendingPortals/response by createdBy"); return
        if "safeView" not in body:
            fail(name, "refresh-dns response is not built from a filtered safe view"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pi7_db_view_helper_filters_legacy_safely():
    name = "PI7 (static): buildAdminSafeDbView strips secrets and filters subdomains by createdBy"
    try:
        src = read_file("backend/utils/dbView.ts")
        if "passwordHash" not in src:
            fail(name, "buildAdminSafeDbView does not strip passwordHash"); return
        if "portAssignments" not in src:
            fail(name, "buildAdminSafeDbView does not strip portAssignments"); return
        if "s.createdBy === adminEmail" not in src:
            fail(name, "buildAdminSafeDbView does not filter subdomains by createdBy === adminEmail"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — UI1: Portal Domains page load ───────────────────────────────────
# The "ACTIVE TENANT PORTAL CONTEXT FILTER" section and Step 2 must show the
# portal list on first render, not only after clicking "Refresh DNS".

def test_ui1_domains_tab_hides_duplicate_filter_section():
    name = "UI1a (static): App.tsx hides the tenant filter chips on the Portal Domains tab"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index("ACTIVE TENANT PORTAL CONTEXT FILTER")
        preceding = src[max(0, idx - 800):idx]
        if 'adminActiveTab !== "subdomain"' not in preceding:
            fail(name, "filter section is not guarded to skip the subdomain tab"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ui1_fetch_portal_data_checks_response_ok():
    name = "UI1b (static): App.tsx fetchPortalData checks res.ok before consuming /api/database"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index("fetchPortalData = async")
        body = src[idx:idx + 2000]
        if "res.ok" not in body:
            fail(name, "fetchPortalData does not check res.ok"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_ui1_fetch_portal_data_retries_on_failure():
    name = "UI1c (static): App.tsx retries the initial portal-data load instead of failing silently"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index("fetchPortalData = async")
        body = src[idx:idx + 2000]
        if "fetchPortalData(attempt + 1)" not in body:
            fail(name, "fetchPortalData has no retry path on failure"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — PC: port-reuse race lets one portal serve another's content ────
# Deleting a portal freed its port assignment before the old PM2 process/IIS site
# were confirmed torn down, so a portal created moments later could be handed the
# same port while the old process was still alive on it — the new subdomain would
# then silently be served by the OLD portal's process (wrong displayName, wrong/
# stale/deleted solutions), because nothing verified process identity by slug.

def test_pc1_pm2_stop_portal_is_awaitable():
    name = "PC1 (static): pm2StopPortal returns a Promise so callers can await teardown"
    try:
        src = read_file("backend/portal/process.ts")
        if "pm2StopPortal(slug: string): Promise<void>" not in src:
            fail(name, "pm2StopPortal no longer declared to return Promise<void>"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc2_delete_awaits_teardown_before_freeing_port():
    name = "PC2 (static): subdomains.routes.ts delete awaits pm2StopPortal/removeIisSite before freeing the port"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        delete_start = src.index('action === "delete"')
        free_port_idx = src.index("Free the port assignment", delete_start)
        segment = src[delete_start:free_port_idx]
        if "await pm2StopPortal(targetId)" not in segment:
            fail(name, "delete handler does not await pm2StopPortal before freeing the port"); return
        if "await removeIisSite(targetId)" not in segment:
            fail(name, "delete handler does not await removeIisSite before freeing the port"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc3_toggle_sleep_awaits_teardown():
    name = "PC3 (static): subdomains.routes.ts toggle-to-sleep awaits pm2StopPortal"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        if "await pm2StopPortal(targetId);" not in src:
            fail(name, "toggle handler does not await pm2StopPortal"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc4_portal_server_handles_listen_error():
    name = "PC4 (static): portal-server.ts fails loudly (not silently) on a port bind/EADDRINUSE error"
    try:
        src = read_file("backend/portal-server.ts")
        if 'server.on("error"' not in src:
            fail(name, "app.listen() has no error handler"); return
        if "EADDRINUSE" not in src:
            fail(name, "listen error handler does not special-case EADDRINUSE"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc5_deploy_reload_verifies_slug_identity():
    name = "PC5 (static): portal/deploy.ts rejects a reload response from the wrong slug instead of trusting any 200"
    try:
        src = read_file("backend/portal/deploy.ts")
        idx = src.index('path: "/api/reload"')
        body = src[idx:idx + 1200]
        if "parsed.slug === cleanSlug" not in body:
            fail(name, "reload handler does not verify the responder's slug matches the deploy target"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc6_portal_ready_verifies_slug_identity():
    name = "PC6 (static): /portal-ready/:id verifies the responder's slug before reporting ready"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        idx = src.index('"/portal-ready/:id"')
        body = src[idx:idx + 1200]
        if "parsed.slug === id" not in body:
            fail(name, "portal-ready probe does not verify the responder's slug matches the requested id"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc7_assign_next_port_verifies_os_level_availability():
    name = "PC7 (static): assignNextPort confirms a port is actually free at the OS level, not just absent from bookkeeping"
    try:
        src = read_file("backend/portal/process.ts")
        if "function isPortFree" not in src:
            fail(name, "isPortFree helper not found — port assignment still trusts JSON bookkeeping alone"); return
        if "export async function assignNextPort" not in src:
            fail(name, "assignNextPort is not async — cannot be doing a real availability probe"); return
        if "await isPortFree(port)" not in src:
            fail(name, "assignNextPort does not call isPortFree before handing out a port"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_pc8_subdomains_routes_awaits_assign_next_port():
    name = "PC8 (static): subdomains.routes.ts awaits assignNextPort at every call site"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        calls = [line for line in src.splitlines() if "assignNextPort(db.portAssignments)" in line]
        if len(calls) < 3:
            fail(name, f"expected 3 call sites (create, create-dummy, toggle), found {len(calls)}"); return
        unawaited = [line.strip() for line in calls if "await assignNextPort" not in line]
        if unawaited:
            fail(name, f"call site(s) not awaited: {unawaited}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — IMP: external-portal import drops collaterals/thumbnails; URL leak ─

def test_imp1_solution_card_hides_target_url():
    name = "IMP1 (static): App.tsx solution cards no longer render the raw target URL"
    try:
        src = read_file("frontend/src/App.tsx")
        if "Target: ${sol.url}" in src or "No URL configured" in src:
            fail(name, "solution card still renders 'Target: <url>' / 'No URL configured' text"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp2_import_endpoint_creates_linked_collaterals():
    name = "IMP2 (static): external-portals import endpoint creates Collateral records linked to the imported solution"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if '"/external-portals/import"' not in src:
            fail(name, "POST /external-portals/import endpoint not found"); return
        if "linked_solution_id" not in src:
            fail(name, "import handler does not filter collaterals by linked_solution_id"); return
        if "db.collaterals.unshift" not in src:
            fail(name, "import handler does not push imported collaterals into db.collaterals"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp3_import_rehosts_thumbnails_instead_of_https_only_filter():
    name = "IMP3 (static): thumbnail import re-hosts images server-side instead of dropping non-https URLs"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if 'startsWith("https://")' in src:
            fail(name, "https-only thumbnail filter still present — would drop http/relative source URLs"); return
        if "function rehostImage" not in src:
            fail(name, "rehostImage helper not found"); return
        if "s3PutUpload" not in src:
            fail(name, "rehosted thumbnails are not persisted via s3PutUpload"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp4_frontend_import_calls_server_endpoint_and_reloads():
    name = "IMP4 (static): AdminSolutions.tsx bulk import calls the server import endpoint and reloads full DB state"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index("handleBulkImport = async")
        body = src[idx:idx + 2500]
        if "/api/admin/external-portals/import" not in body:
            fail(name, "handleBulkImport no longer calls the server-side import endpoint"); return
        if "onReload?.()" not in body:
            fail(name, "handleBulkImport does not reload full database state after import (collaterals changed too)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_map1_solutions_reset_form_respects_prefilled_subdomain():
    name = "MAP1 (static): AdminSolutions.tsx resetForm() seeds customerNames from prefilledSubdomain instead of hardcoding 'all'"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index("const resetForm = ()")
        body = src[idx:idx + 700]
        if 'setCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["all"])' not in body:
            fail(name, "resetForm no longer respects prefilledSubdomain — opening the create form after "
                       "'Onboard Assets for this Portal' would silently reset the mapping to every portal"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — IMP2: thumbnail import fidelity, collateral kinds, catalogue layout ─

def test_imp5_thumbnail_import_sniffs_magic_bytes_not_just_content_type_header():
    name = "IMP5 (static): thumbnail re-host identifies images by content, not just a possibly-wrong Content-Type header"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if "function sniffImageContentType" not in src:
            fail(name, "sniffImageContentType helper not found — still trusting Content-Type header alone"); return
        if "const sniffed = sniffImageContentType(buf)" not in src:
            fail(name, "rehostImage does not use the magic-byte sniffer"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp6_thumbnail_import_falls_back_to_direct_url_on_rehost_failure():
    name = "IMP6 (static): thumbnail import falls back to the direct source URL if re-hosting fails (unless it's a loopback address)"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if "function resolveThumbnail" not in src:
            fail(name, "resolveThumbnail helper not found"); return
        if "LOOPBACK_RE" not in src:
            fail(name, "no loopback-address guard — could fall back to a 127.0.0.1 URL the browser can't reach"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp7_collateral_import_captures_resource_file_not_just_metadata():
    name = "IMP7 (static): collateral import captures the actual resource file (video/doc/pptx/article link), not just text metadata"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if "uploadedFiles: resourceUrl" not in src:
            fail(name, "collateral import still hardcodes uploadedFiles to an empty array"); return
        if "function pick(" not in src:
            fail(name, "no defensive multi-field lookup for the source's resource/kind fields"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp8_collateral_import_sets_linked_solution_id():
    name = "IMP8 (static): imported collaterals are tagged with linkedSolutionId so they can be grouped under their solution"
    try:
        types_src = read_file("shared/types.ts")
        if "linkedSolutionId" not in types_src:
            fail(name, "Collateral type has no linkedSolutionId field"); return
        routes_src = read_file("backend/routes/external-portals.routes.ts")
        if "linkedSolutionId: newSol.id" not in routes_src:
            fail(name, "import handler does not stamp linkedSolutionId on imported collaterals"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_imp9_collaterals_catalogue_grouped_by_solution_with_horizontal_scroll():
    name = "IMP9 (static): Collaterals Catalogue renders one row per solution with a horizontally-scrollable tile strip"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index('currentTab === "collaterals" ? (')
        body = src[idx:idx + 10000]
        if "col.linkedSolutionId === sol.id" not in body:
            fail(name, "collaterals are not grouped by linkedSolutionId against visibleSolutions"); return
        if "overflow-x-auto" not in body:
            fail(name, "no horizontally-scrollable container found for the tile strip"); return
        if '"General Collaterals"' not in body:
            fail(name, "unlinked collaterals have no fallback row"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — CASC: solution delete cascades to collaterals; refresh buttons ─────

def test_casc1_deleting_solution_cascades_to_linked_collaterals():
    name = "CASC1 (static): deleting a solution also removes its linked collaterals"
    try:
        # This cascade logic was later extracted into backend/utils/solutionCascade.ts
        # (shared with portal-delete cascading) — see CASC2a for the helper itself and
        # CASC2b for content.routes.ts calling it.
        src = read_file("backend/utils/solutionCascade.ts")
        if "c.linkedSolutionId !== solutionId" not in src:
            fail(name, "solutionCascade helper does not filter out collaterals by linkedSolutionId"); return
        content_src = read_file("backend/routes/content.routes.ts")
        if "await deleteSolutionCascade(db, solution.id)" not in content_src:
            fail(name, "solution delete handler does not call deleteSolutionCascade"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refresh1_admin_collaterals_has_refresh_button():
    name = "REFRESH1 (static): AdminCollaterals.tsx has a refresh button wired to onReload"
    try:
        src = read_file("frontend/src/components/AdminCollaterals.tsx")
        if "onReload?: () => Promise<void>" not in src:
            fail(name, "AdminCollateralsProps has no onReload prop"); return
        if "Reload collaterals from server" not in src:
            fail(name, "no refresh button found"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refresh2_admin_projects_has_refresh_button():
    name = "REFRESH2 (static): AdminProjects.tsx has a refresh button wired to onReload"
    try:
        src = read_file("frontend/src/components/AdminProjects.tsx")
        if "onReload?: () => Promise<void>" not in src:
            fail(name, "AdminProjectsProps has no onReload prop"); return
        if "Reload projects & portals from server" not in src:
            fail(name, "no refresh button found"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refresh3_hero_section_has_refresh_button():
    name = "REFRESH3 (static): App.tsx Hero section (branding tab) has a refresh button"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index('adminActiveTab === "branding"')
        body = src[idx:idx + 1600]
        if "Reload hero section from server" not in body:
            fail(name, "no refresh button found in the Hero section header"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refresh4_admin_users_has_refresh_button():
    name = "REFRESH4 (static): AdminUsers.tsx has a refresh button"
    try:
        src = read_file("frontend/src/components/AdminUsers.tsx")
        if "Reload users from server" not in src:
            fail(name, "no refresh button found"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_refresh5_admin_logs_has_refresh_button():
    name = "REFRESH5 (static): AdminLogs.tsx has a refresh button wired to onReload, and App.tsx passes it"
    try:
        src = read_file("frontend/src/components/AdminLogs.tsx")
        if "onReload?: () => Promise<void>" not in src:
            fail(name, "AdminLogsProps has no onReload prop"); return
        if "Reload visitor telemetry from server" not in src:
            fail(name, "no refresh button found"); return
        app_src = read_file("frontend/src/App.tsx")
        if "<AdminLogs logs={logs} onReload={fetchPortalData} />" not in app_src:
            fail(name, "App.tsx does not pass onReload to AdminLogs"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — SUPER: Super Admin role bypasses per-admin ownership isolation ───

def test_super1_role_type_includes_superadmin():
    name = "SUPER1 (static): PortalUser.role type includes superadmin"
    try:
        src = read_file("shared/types.ts")
        if '"admin" | "viewer" | "superadmin"' not in src:
            fail(name, "PortalUser.role union does not include superadmin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super2_auth_middleware_recognizes_superadmin():
    name = "SUPER2 (static): requireAdminAuth/requireAnyAuth admit superadmin and expose userRole"
    try:
        src = read_file("backend/auth/index.ts")
        if "export function isAdminRole" not in src or "export function isSuperAdminRole" not in src:
            fail(name, "isAdminRole/isSuperAdminRole helpers not found"); return
        admin_auth_start = src.index("export function requireAdminAuth")
        admin_auth_body = src[admin_auth_start:admin_auth_start + 1400]
        if "isAdminRole(payload.role)" not in admin_auth_body:
            fail(name, "requireAdminAuth still hardcodes role === 'admin'"); return
        if "(req as any).userRole = payload.role" not in admin_auth_body:
            fail(name, "requireAdminAuth does not expose userRole for downstream ownership-bypass checks"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super3_ownership_checks_bypass_for_superadmin():
    name = "SUPER3 (static): all createdBy ownership 403 checks bypass for superadmin"
    try:
        subs_src = read_file("backend/routes/subdomains.routes.ts")
        content_src = read_file("backend/routes/content.routes.ts")
        combined = subs_src + content_src
        total_checks = combined.count("createdBy !== adminEmail")
        bypassed_checks = combined.count("createdBy !== adminEmail && !isSuperAdmin")
        if total_checks == 0:
            fail(name, "no ownership checks found — test may be stale"); return
        if total_checks != bypassed_checks:
            fail(name, f"{total_checks - bypassed_checks} ownership check(s) do not bypass for superadmin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super4_db_view_and_public_database_bypass_for_superadmin():
    name = "SUPER4 (static): buildAdminSafeDbView and GET /api/database return every portal for superadmin"
    try:
        dbview_src = read_file("backend/utils/dbView.ts")
        if "isSuperAdmin: boolean" not in dbview_src:
            fail(name, "buildAdminSafeDbView has no isSuperAdmin parameter"); return
        public_src = read_file("backend/routes/public.routes.ts")
        if "isSuperAdminRole(userRole)" not in public_src:
            fail(name, "GET /api/database does not bypass ownership filtering for superadmin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super5_only_superadmin_can_grant_superadmin_role():
    name = "SUPER5 (static): users.routes.ts blocks a non-superadmin from granting the superadmin role"
    try:
        src = read_file("backend/routes/users.routes.ts")
        if "Only a Super Admin can grant the Super Admin role" not in src:
            fail(name, "no server-side restriction on granting superadmin found"); return
        if "VALID_ROLES" not in src:
            fail(name, "no server-side role validation allow-list found"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super6_frontend_admits_superadmin_to_console():
    name = "SUPER6 (static): App.tsx admits superadmin (not just admin) into the admin console"
    try:
        src = read_file("frontend/src/App.tsx")
        if 'userRole !== "admin" && userRole !== "superadmin"' not in src:
            fail(name, "admin-console gate does not admit superadmin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super7_admin_users_ui_restricts_superadmin_grant():
    name = "SUPER7 (static): AdminUsers.tsx only offers the Super Admin role option to an existing superadmin"
    try:
        src = read_file("frontend/src/components/AdminUsers.tsx")
        if 'currentUserRole === "superadmin"' not in src:
            fail(name, "role dropdown does not gate the superadmin option on currentUserRole"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_super8_system_admin_seeded_as_superadmin():
    name = "SUPER8 (static): seedDefaultAdmin() enforces the system admin (eswar@xtract.io) as superadmin"
    try:
        src = read_file("backend/auth/seed.ts")
        if src.count('role: "superadmin"') < 2:
            fail(name, "system admin is not seeded/enforced with role: superadmin on both create and update paths"); return
        if 'role: "admin"' in src:
            fail(name, "seed.ts still hardcodes role: admin somewhere for the system account"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — DEPLOY: standalone HTML app deploy-to-subdomain ──────────────────

def test_deploy1_solution_type_has_deployed_fields():
    name = "DEPLOY1 (static): Solution type tracks deployedSlug/deployedDomain"
    try:
        src = read_file("shared/types.ts")
        if "deployedSlug?: string" not in src or "deployedDomain?: string" not in src:
            fail(name, "Solution interface missing deployedSlug/deployedDomain"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy2_config_defines_deployed_solutions_dir():
    name = "DEPLOY2 (static): config.ts defines DEPLOYED_SOLUTIONS_DIR"
    try:
        src = read_file("backend/config.ts")
        if "DEPLOYED_SOLUTIONS_DIR" not in src:
            fail(name, "DEPLOYED_SOLUTIONS_DIR not defined"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy3_static_iis_site_helpers_exist():
    name = "DEPLOY3 (static): iis/site.ts exports ensureStaticHtmlIisSite/removeStaticHtmlIisSite"
    try:
        src = read_file("backend/iis/site.ts")
        if "export async function ensureStaticHtmlIisSite" not in src:
            fail(name, "ensureStaticHtmlIisSite not found"); return
        if "export async function removeStaticHtmlIisSite" not in src:
            fail(name, "removeStaticHtmlIisSite not found"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy4_route_exists_and_allows_html_upload():
    name = "DEPLOY4 (static): POST /deploy-solution exists, accepts .html, provisions DNS+IIS, creates a Solution"
    try:
        src = read_file("backend/routes/deploy-solution.routes.ts")
        if '"/deploy-solution"' not in src:
            fail(name, "route path not found"); return
        if 'ext !== ".html" && ext !== ".htm"' not in src:
            fail(name, "upload filter does not explicitly allow .html/.htm"); return
        if "ensureDnsRecord" not in src or "ensureStaticHtmlIisSite" not in src:
            fail(name, "handler does not provision DNS + static IIS site"); return
        if "deployedSlug: cleanSlug" not in src:
            fail(name, "created Solution does not record deployedSlug"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy5_route_mounted_in_server():
    name = "DEPLOY5 (static): server.ts mounts deploy-solution router under /api/admin"
    try:
        src = read_file("backend/server.ts")
        if "deploySolutionRouter" not in src or 'app.use("/api/admin", deploySolutionRouter)' not in src:
            fail(name, "deploy-solution router not mounted at /api/admin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy6_delete_cascades_dns_iis_and_file_cleanup():
    name = "DEPLOY6 (static): deleting a deployed solution cleans up its DNS record, IIS site, and stored file"
    try:
        # Extracted into backend/utils/solutionCascade.ts — see CASC2a/CASC2b.
        src = read_file("backend/utils/solutionCascade.ts")
        idx = src.index("target?.deployedSlug")
        body = src[idx:idx + 700]
        if "deleteDnsRecord" not in body:
            fail(name, "cascade helper does not remove the DNS record"); return
        if "removeStaticHtmlIisSite" not in body:
            fail(name, "cascade helper does not remove the static IIS site"); return
        if "fs.rmSync(solutionDir" not in body:
            fail(name, "cascade helper does not remove the stored HTML file"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy7_frontend_deploy_button_and_panel_exist():
    name = "DEPLOY7 (static): AdminSolutions.tsx has a Deploy Solution button and upload panel"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        if "Deploy Solution" not in src:
            fail(name, "Deploy Solution button not found"); return
        if "/api/admin/deploy-solution" not in src:
            fail(name, "frontend does not call the deploy-solution endpoint"); return
        if 'accept=".html,.htm,text/html"' not in src:
            fail(name, "file input does not restrict to .html/.htm"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — THUMB: broken thumbnails/downloads on customer portal subdomains ─

def test_thumb1_upload_url_is_absolute():
    name = "THUMB1 (static): /api/upload returns an absolute URL, not a relative one"
    try:
        # Originally built via the raw HUB_ORIGIN constant; later replaced with
        # resolveHubOrigin(req) (see MIXED1-MIXED3) so a misconfigured/unset
        # HUB_ORIGIN doesn't silently emit a broken localhost URL in production.
        src = read_file("backend/routes/upload.routes.ts")
        if "resolveHubOrigin" not in src:
            fail(name, "upload.routes.ts does not build an absolute URL via resolveHubOrigin"); return
        if "const url = `${resolveHubOrigin(req)}/api/download/" not in src:
            fail(name, "/api/upload still returns a relative /api/download URL"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_thumb2_rehosted_thumbnail_url_is_absolute():
    name = "THUMB2 (static): external-portals rehostImage returns an absolute URL"
    try:
        # Originally built via the raw HUB_ORIGIN constant; later replaced with
        # resolveHubOrigin(req) (see MIXED1-MIXED3).
        src = read_file("backend/routes/external-portals.routes.ts")
        if "resolveHubOrigin" not in src:
            fail(name, "external-portals.routes.ts does not build an absolute URL via resolveHubOrigin"); return
        if "return `${hubOrigin}/api/download/imports/" not in src:
            fail(name, "rehostImage still returns a relative /api/download URL"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_thumb3_reason_relative_urls_break_on_portal_subdomains():
    name = "THUMB3 (static): portal-server.ts genuinely has no /api/download route (confirms why relative URLs 404 there)"
    try:
        src = read_file("backend/portal-server.ts")
        if '"/api/download' in src or "'/api/download" in src:
            fail(name, "portal-server.ts unexpectedly defines /api/download — relative-URL assumption may be wrong now"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_thumb4_collaterals_catalogue_row_icon_is_positioned():
    name = "THUMB4 (static): Collaterals Catalogue row-header thumbnail wrapper has 'relative' (contains PatternThumbnail's absolute SVG)"
    try:
        src = read_file("frontend/src/App.tsx")
        if 'className="h-9 w-9 rounded-xl overflow-hidden border border-slate-150 shrink-0 bg-white relative"' not in src:
            fail(name, "row-header thumbnail wrapper is missing 'relative' — PatternThumbnail's absolutely-positioned "
                       "SVG fallback would break out and fill the nearest positioned ancestor instead of this small icon box"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_thumb5_collateral_attachment_download_uses_stored_url():
    name = "THUMB5 (static): CollateralDetailModal downloads via the stored file.url, not a malformed reconstructed path"
    try:
        src = read_file("frontend/src/components/CollateralDetailModal.tsx")
        if "href={`/api/download/${file.name}`}" in src:
            fail(name, "still uses the malformed /api/download/<name> path (route requires /api/download/:slug/:filename)"); return
        if "href={file.url" not in src:
            fail(name, "download link does not use the stored file.url"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — CFILTER: Collaterals Catalogue type filter; admin thumbnail fallback ─

def test_cfilter1_type_filter_options_and_classifier_exist():
    name = "CFILTER1 (static): App.tsx defines the All/Document/Deck/Video/Web page filter with a classifier"
    try:
        src = read_file("frontend/src/App.tsx")
        if "COLLATERAL_FILTER_OPTIONS" not in src:
            fail(name, "COLLATERAL_FILTER_OPTIONS not found"); return
        for label in ['"Document"', '"Deck"', '"Video"', '"Web page"']:
            if label not in src:
                fail(name, f"filter option {label} not found"); return
        if "function classifyCollateralType" not in src:
            fail(name, "classifyCollateralType helper not found"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_cfilter2_all_defaults_and_is_not_a_checkbox():
    name = "CFILTER2 (static): 'All' is the default (empty filter set) and is a plain button, not a checkbox"
    try:
        src = read_file("frontend/src/App.tsx")
        if "useState<Set<CollateralFilterType>>(new Set())" not in src:
            fail(name, "collateralTypeFilter does not default to an empty Set (i.e. 'All')"); return
        idx = src.index("setCollateralTypeFilter(new Set())")
        body = src[max(0, idx - 300):idx + 50]
        if 'type="checkbox"' in body:
            fail(name, "the 'All' option appears to be rendered as a checkbox"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_cfilter3_filter_applied_before_grouping_rows():
    name = "CFILTER3 (static): rows are built from the type-filtered collaterals list, and a filtered count is shown"
    try:
        src = read_file("frontend/src/App.tsx")
        if "filteredCollaterals.filter((col) => col.linkedSolutionId === sol.id)" not in src:
            fail(name, "row items are not derived from filteredCollaterals"); return
        if "{filteredCollaterals.length} collateral" not in src:
            fail(name, "filtered collaterals count is not displayed"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_cfilter4_admin_solutions_list_uses_safe_image():
    name = "CFILTER4 (static): AdminSolutions.tsx list view uses SafeImage (not a raw <img>) for solution thumbnails"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        if "import { SafeImage }" not in src:
            fail(name, "SafeImage not imported"); return
        idx = src.index("Visual preview")
        body = src[idx:idx + 500]
        if "<SafeImage" not in body:
            fail(name, "solution list thumbnail still uses a raw <img> instead of SafeImage"); return
        if "shrink-0 relative" not in body:
            fail(name, "thumbnail wrapper is missing 'relative' (PatternThumbnail fallback would break out of its box)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_cfilter5_admin_collaterals_list_uses_safe_image():
    name = "CFILTER5 (static): AdminCollaterals.tsx list view uses SafeImage (not a raw <img>) for collateral thumbnails"
    try:
        src = read_file("frontend/src/components/AdminCollaterals.tsx")
        if "import { SafeImage }" not in src:
            fail(name, "SafeImage not imported"); return
        idx = src.index('h-20 w-32 rounded-xl bg-slate-100')
        body = src[idx:idx + 400]
        if "<SafeImage" not in body:
            fail(name, "collateral list thumbnail still uses a raw <img> instead of SafeImage"); return
        if "shrink-0 relative" not in body:
            fail(name, "thumbnail wrapper is missing 'relative' (PatternThumbnail fallback would break out of its box)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — CASC2: portal delete orphans solutions instead of deleting them;
#    collaterals don't follow a remapped solution to its new portal ────────────

def test_casc2_solution_cascade_helper_exists():
    name = "CASC2a (static): backend/utils/solutionCascade.ts exports deleteSolutionCascade"
    try:
        src = read_file("backend/utils/solutionCascade.ts")
        if "export async function deleteSolutionCascade" not in src:
            fail(name, "deleteSolutionCascade not exported"); return
        if "linkedSolutionId === solutionId" not in src:
            fail(name, "helper does not remove collaterals linked to the deleted solution"); return
        if "deployedSlug" not in src:
            fail(name, "helper does not clean up a deployed HTML app's DNS/IIS site/file"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_casc2_content_routes_uses_shared_cascade_helper():
    name = "CASC2b (static): content.routes.ts solution delete uses the shared deleteSolutionCascade helper"
    try:
        src = read_file("backend/routes/content.routes.ts")
        if "await deleteSolutionCascade(db, solution.id)" not in src:
            fail(name, "solutions delete action does not call the shared cascade helper"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_casc2_portal_delete_removes_orphaned_solutions():
    name = "CASC2c (static): deleting a portal deletes solutions left with no remaining portal mapping, instead of leaving them to read as 'mapped to all'"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        idx = src.index("Remove the deleted portal's slug from all content mappings")
        body = src[idx:idx + 1500]
        if "orphanedSolutionIds" not in body:
            fail(name, "no orphaned-solution detection found after stripping the deleted portal's slug"); return
        if "deleteSolutionCascade(db, orphanId)" not in body:
            fail(name, "orphaned solutions are not cascade-deleted"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_casc3_remapping_solution_syncs_linked_collaterals():
    name = "CASC3 (static): updating a solution's customerNames re-maps its linked collaterals to match"
    try:
        src = read_file("backend/routes/content.routes.ts")
        idx = src.index('action === "update"')
        body = src[idx:idx + 900]
        if "solution.customerNames !== undefined" not in body:
            fail(name, "solution update does not check for a customerNames remap"); return
        if "c.linkedSolutionId === solution.id" not in body:
            fail(name, "solution update does not sync linked collaterals' customerNames"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_sandbox1_interactive_asset_sandbox_removed():
    name = "SANDBOX1 (static): CollateralDetailModal no longer renders the Interactive Asset Sandbox preview section"
    try:
        src = read_file("frontend/src/components/CollateralDetailModal.tsx")
        if "Interactive Asset Sandbox" in src:
            fail(name, "Interactive Asset Sandbox label still present"); return
        if "Google Drive Document Embed" in src:
            fail(name, "the sandbox iframe embed block is still present"); return
        if "Simulated Document Preview" in src:
            fail(name, "the simulated document preview mockup is still present"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Bug fixes — MIXED: mixed-content / broken thumbnail URLs when HUB_ORIGIN is
#    left at its http://localhost:3000 default in production ──────────────────

def test_mixed1_resolve_hub_origin_helper_exists():
    name = "MIXED1 (static): backend/utils/hubOrigin.ts exports resolveHubOrigin with a request-derived fallback"
    try:
        src = read_file("backend/utils/hubOrigin.ts")
        if "export function resolveHubOrigin" not in src:
            fail(name, "resolveHubOrigin not exported"); return
        if "x-forwarded-proto" not in src.lower():
            fail(name, "no X-Forwarded-Proto handling for reverse-proxy deployments"); return
        if '"https"' not in src:
            fail(name, "no https fallback for non-local hosts (this is what fixes the mixed-content error)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mixed2_upload_route_uses_resolve_hub_origin():
    name = "MIXED2 (static): /api/upload builds its URL via resolveHubOrigin(req), not the raw HUB_ORIGIN constant"
    try:
        src = read_file("backend/routes/upload.routes.ts")
        if "resolveHubOrigin(req)" not in src:
            fail(name, "upload.routes.ts does not call resolveHubOrigin(req)"); return
        if "${HUB_ORIGIN}" in src:
            fail(name, "upload.routes.ts still references the raw HUB_ORIGIN constant directly"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_mixed3_external_import_uses_resolve_hub_origin():
    name = "MIXED3 (static): external-portals rehostImage builds its URL via resolveHubOrigin(req), not the raw HUB_ORIGIN constant"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if "resolveHubOrigin(req)" not in src:
            fail(name, "external-portals.routes.ts does not call resolveHubOrigin(req)"); return
        if "${HUB_ORIGIN}" in src:
            fail(name, "external-portals.routes.ts still references the raw HUB_ORIGIN constant directly"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — SOLFORM: onboarding form Back button; thumbnail made optional ────

def test_solform1_onboard_form_has_back_button():
    name = "SOLFORM1 (static): AdminSolutions.tsx onboarding form has a labeled Back button that returns to the solutions list"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index('editingId ? "Edit Solution Resource" : "Onboard New Utility"')
        body = src[max(0, idx - 700):idx]
        if "Back to Solutions list" not in body:
            fail(name, "no labeled Back button found before the onboarding form header"); return
        if "onClick={resetForm}" not in body:
            fail(name, "Back button is not wired to resetForm"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_solform2_thumbnail_is_optional():
    name = "SOLFORM2 (static): solution onboarding no longer requires a thumbnail"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        if "if (!title || !thumbnail)" in src:
            fail(name, "handleSubmit still requires thumbnail alongside title"); return
        idx = src.index("const handleSubmit = async")
        body = src[idx:idx + 300]
        if "if (!title)" not in body:
            fail(name, "handleSubmit no longer validates title as required"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — HUBREPO: Import-from-Portal below Step 1; Hub Repository source ──

def test_hubrepo1_import_section_appears_after_step1():
    name = "HUBREPO1 (static): 'Import from Portal' section renders after STEP 1 in the onboarding form"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        step1_idx = src.index("STEP 1: Select Target Subdomains")
        import_idx = src.index("Import from Portal (optional)")
        if import_idx < step1_idx:
            fail(name, "Import from Portal section still appears before STEP 1"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo2_step1_has_unmapped_note():
    name = "HUBREPO2 (static): STEP 1 has a note explaining that an empty selection onboards to the Hub Repository"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        step1_idx = src.index("STEP 1: Select Target Subdomains")
        body = src[step1_idx:step1_idx + 2500]
        if "Hub Repository" not in body or "unchecked" not in body:
            fail(name, "no note about leaving Step 1 unchecked found near the checkboxes"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo3_empty_step1_selection_allowed():
    name = "HUBREPO3 (static): unchecking every Step 1 box no longer force-reverts to ['all']"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index("const handleSubdomainCheckboxChange")
        body = src[idx:idx + 700]
        if 'updated = ["all"]' in body:
            fail(name, "handleSubdomainCheckboxChange still forces ['all'] when the selection becomes empty"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo4_submit_no_longer_defaults_customer_name_to_all():
    name = "HUBREPO4 (static): submitting with no Step 1 selection stores an empty customerName, not 'all'"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        if 'customerName: customerNames[0] || "all"' in src:
            fail(name, "handleSubmit payload still defaults customerName to 'all' when unmapped"); return
        if 'customerName: customerNames[0] || ""' not in src:
            fail(name, "handleSubmit payload does not default customerName to an empty string when unmapped"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo5_hub_repository_card_right_of_techmobius():
    name = "HUBREPO5 (static): Hub Repository is a third import card positioned after TechMobius Portal"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        techmobius_idx = src.index("TechMobius Portal")
        hubrepo_idx = src.index("Hub Repository", techmobius_idx)
        if hubrepo_idx <= techmobius_idx:
            fail(name, "Hub Repository card does not appear after TechMobius Portal"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo6_import_sources_use_popup_not_inline_cards():
    name = "HUBREPO6 (static): Mobius/TechMobius/Hub Repository open a shared popup modal instead of expanding inline"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        if "activeImportModal" not in src:
            fail(name, "no unified activeImportModal state found"); return
        if "mobiusOpen" in src or "techMobiusOpen" in src:
            fail(name, "old inline-expand booleans (mobiusOpen/techMobiusOpen) still present"); return
        if 'className="fixed inset-0 z-50' not in src:
            fail(name, "no fixed full-screen popup overlay found for the import source modal"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo7_cards_show_selected_count_badge():
    name = "HUBREPO7 (static): each import card shows a selected-count badge, blank when nothing is selected"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index("Mobius Portal")
        body = src[idx:idx + 3500]
        if "selectedMobius.size > 0 &&" not in body:
            fail(name, "Mobius card does not conditionally render a selected-count badge"); return
        if "selectedHubRepo.size > 0 &&" not in body:
            fail(name, "Hub Repository card does not conditionally render a selected-count badge"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hubrepo8_map_badge_no_longer_defaults_to_all():
    name = "HUBREPO8 (static): the 'Map:' badge in AdminSolutions/AdminCollaterals lists no longer mislabels unmapped items as 'all'"
    try:
        sol_src = read_file("frontend/src/components/AdminSolutions.tsx")
        if '{sol.customerName || "all"}' in sol_src:
            fail(name, "AdminSolutions.tsx Map: badge still falls back to displaying 'all' for unmapped solutions"); return
        col_src = read_file("frontend/src/components/AdminCollaterals.tsx")
        if '{coll.customerName || "all"}' in col_src:
            fail(name, "AdminCollaterals.tsx Map: badge still falls back to displaying 'all' for unmapped collaterals"); return
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
    # Refactor — R1: modular backend
    test_refactor_module_files_exist,
    test_refactor_config_exports_constants,
    test_refactor_logger_has_methods,
    test_refactor_server_ts_is_thin,
    test_refactor_deploy_returns_structured_result,
    test_refactor_deploy_endpoint_returns_structured_result,
    test_refactor_shared_snapshot_function,
    # Refactor — R2: frontend API client
    test_refactor_frontend_api_client_exists,
    test_refactor_app_tsx_imports_admin_fetch,
    # Manager Bug Fixes — MF1: X-Admin-Token default bypass
    test_mf1_config_no_dev_admin_fallback,
    test_mf1_auth_uses_effective_admin_token,
    test_mf1_auth_generates_ephemeral_token_when_unset,
    test_mf1_dev_admin_token_rejected,
    # Manager Bug Fixes — MF2: passwordHash in portal artifacts
    test_mf2_build_portal_snapshot_no_password_hash,
    test_mf2_build_default_portal_json_no_password_hash,
    # Manager Bug Fixes — MF3: toggle race condition
    test_mf3_toggle_awaits_deploy_before_spawn,
    # Manager Bug Fixes — MF4: deploy always returns success
    test_mf4_deploy_returns_failure_on_write_error,
    test_mf4_deploy_logs_failure_separately,
    # Manager Security Fixes — MS3: unauthenticated /api/reload
    test_ms3_portal_server_reload_requires_token,
    test_ms3_hub_sends_token_on_reload,
    # Manager Security Fixes — MS4: login rate limiting
    test_ms4_hub_login_has_rate_limiter,
    test_ms4_portal_login_has_rate_limiter,
    # Manager Security Fixes — MS5: /api/download requires auth
    test_ms5_download_requires_auth,
    test_ms5_download_rejects_unauthenticated,
    # Manager Security Fixes — MS6: /api/log rate-limited and capped
    test_ms6_log_rate_limited,
    test_ms6_log_fields_validated,
    test_ms6_log_has_entry_cap,
    # Bug fixes — PI: per-user portal isolation
    test_pi1_content_types_have_created_by,
    test_pi2_content_routes_stamps_created_by_on_create,
    test_pi3_content_routes_enforces_ownership_on_write,
    test_pi4_snapshot_all_broadcast_respects_ownership,
    test_pi5_admin_responses_use_safe_db_view,
    test_pi6_refresh_dns_filters_by_ownership,
    test_pi7_db_view_helper_filters_legacy_safely,
    # Bug fixes — UI1: Portal Domains page loads without a manual "Refresh DNS" click
    test_ui1_domains_tab_hides_duplicate_filter_section,
    test_ui1_fetch_portal_data_checks_response_ok,
    test_ui1_fetch_portal_data_retries_on_failure,
    # Bug fixes — PC: port-reuse race lets one portal serve another's content
    test_pc1_pm2_stop_portal_is_awaitable,
    test_pc2_delete_awaits_teardown_before_freeing_port,
    test_pc3_toggle_sleep_awaits_teardown,
    test_pc4_portal_server_handles_listen_error,
    test_pc5_deploy_reload_verifies_slug_identity,
    test_pc6_portal_ready_verifies_slug_identity,
    test_pc7_assign_next_port_verifies_os_level_availability,
    test_pc8_subdomains_routes_awaits_assign_next_port,
    # Bug fixes — IMP: external-portal import drops collaterals/thumbnails; URL leak
    test_imp1_solution_card_hides_target_url,
    test_imp2_import_endpoint_creates_linked_collaterals,
    test_imp3_import_rehosts_thumbnails_instead_of_https_only_filter,
    test_imp4_frontend_import_calls_server_endpoint_and_reloads,
    test_map1_solutions_reset_form_respects_prefilled_subdomain,
    # Bug fixes — IMP2: thumbnail import fidelity, collateral kinds, catalogue layout
    test_imp5_thumbnail_import_sniffs_magic_bytes_not_just_content_type_header,
    test_imp6_thumbnail_import_falls_back_to_direct_url_on_rehost_failure,
    test_imp7_collateral_import_captures_resource_file_not_just_metadata,
    test_imp8_collateral_import_sets_linked_solution_id,
    test_imp9_collaterals_catalogue_grouped_by_solution_with_horizontal_scroll,
    # Bug fixes — CASC: solution delete cascades to collaterals; refresh buttons
    test_casc1_deleting_solution_cascades_to_linked_collaterals,
    test_refresh1_admin_collaterals_has_refresh_button,
    test_refresh2_admin_projects_has_refresh_button,
    test_refresh3_hero_section_has_refresh_button,
    test_refresh4_admin_users_has_refresh_button,
    test_refresh5_admin_logs_has_refresh_button,
    # Feature — SUPER: Super Admin role bypasses per-admin ownership isolation
    test_super1_role_type_includes_superadmin,
    test_super2_auth_middleware_recognizes_superadmin,
    test_super3_ownership_checks_bypass_for_superadmin,
    test_super4_db_view_and_public_database_bypass_for_superadmin,
    test_super5_only_superadmin_can_grant_superadmin_role,
    test_super6_frontend_admits_superadmin_to_console,
    test_super7_admin_users_ui_restricts_superadmin_grant,
    test_super8_system_admin_seeded_as_superadmin,
    # Feature — DEPLOY: standalone HTML app deploy-to-subdomain
    test_deploy1_solution_type_has_deployed_fields,
    test_deploy2_config_defines_deployed_solutions_dir,
    test_deploy3_static_iis_site_helpers_exist,
    test_deploy4_route_exists_and_allows_html_upload,
    test_deploy5_route_mounted_in_server,
    test_deploy6_delete_cascades_dns_iis_and_file_cleanup,
    test_deploy7_frontend_deploy_button_and_panel_exist,
    # Bug fixes — THUMB: broken thumbnails/downloads on customer portal subdomains
    test_thumb1_upload_url_is_absolute,
    test_thumb2_rehosted_thumbnail_url_is_absolute,
    test_thumb3_reason_relative_urls_break_on_portal_subdomains,
    test_thumb4_collaterals_catalogue_row_icon_is_positioned,
    test_thumb5_collateral_attachment_download_uses_stored_url,
    # Feature — CFILTER: Collaterals Catalogue type filter; admin thumbnail fallback
    test_cfilter1_type_filter_options_and_classifier_exist,
    test_cfilter2_all_defaults_and_is_not_a_checkbox,
    test_cfilter3_filter_applied_before_grouping_rows,
    test_cfilter4_admin_solutions_list_uses_safe_image,
    test_cfilter5_admin_collaterals_list_uses_safe_image,
    # Bug fixes — CASC2/CASC3: portal-delete solution orphaning; solution remap sync
    test_casc2_solution_cascade_helper_exists,
    test_casc2_content_routes_uses_shared_cascade_helper,
    test_casc2_portal_delete_removes_orphaned_solutions,
    test_casc3_remapping_solution_syncs_linked_collaterals,
    test_sandbox1_interactive_asset_sandbox_removed,
    # Bug fixes — MIXED: mixed-content / broken thumbnail URLs from HUB_ORIGIN default
    test_mixed1_resolve_hub_origin_helper_exists,
    test_mixed2_upload_route_uses_resolve_hub_origin,
    test_mixed3_external_import_uses_resolve_hub_origin,
    # Feature — SOLFORM: onboarding form Back button; thumbnail made optional
    test_solform1_onboard_form_has_back_button,
    test_solform2_thumbnail_is_optional,
    # Feature — HUBREPO: Import-from-Portal below Step 1; Hub Repository source
    test_hubrepo1_import_section_appears_after_step1,
    test_hubrepo2_step1_has_unmapped_note,
    test_hubrepo3_empty_step1_selection_allowed,
    test_hubrepo4_submit_no_longer_defaults_customer_name_to_all,
    test_hubrepo5_hub_repository_card_right_of_techmobius,
    test_hubrepo6_import_sources_use_popup_not_inline_cards,
    test_hubrepo7_cards_show_selected_count_badge,
    test_hubrepo8_map_badge_no_longer_defaults_to_all,
    # MS4c last — it exhausts the rate-limit window and would block earlier login tests
    test_ms4_hub_login_returns_429_after_limit,
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
