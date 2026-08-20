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


def test_auth_modal_is_single_column_with_no_demo_credentials_panel():
    name = "Fix-16c (static): AccessWall is a single-column login card — the demo/guest credentials side panel was removed"
    try:
        src = read_file("frontend/src/components/AccessWall.tsx")
        assert "md:grid-cols-2" not in src, \
            "AccessWall still uses the old two-column grid layout"
        assert "Demo / Guest Solution Credentials" not in src, \
            "the demo/guest credentials panel is still present"
        assert "credSolutions" not in src, \
            "dead credSolutions logic from the removed panel is still present"
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
# Security Fix S7 — portal-server.ts login proxies to the hub's live user list
# (superseded design: it used to validate bcrypt hashes against a locally-
# replicated, S3-synced copy of the users list, which could go stale/empty and
# lock out valid — including newly-onboarded — users; see MSUI62/63 below)
# ═════════════════════════════════════════════════════════════════════════════

def test_portal_server_proxies_login_to_hub():
    name = "Sec-S7a: portal-server.ts /api/login proxies the credential check to the hub instead of validating a local copy"
    try:
        src = read_file("backend/portal-server.ts")
        if "/api/internal/verify-credentials" not in src:
            fail(name, "portal-server.ts does not proxy to the hub's internal verify-credentials endpoint"); return
        if "bcryptjs" in src:
            fail(name, "portal-server.ts still imports bcryptjs directly — password verification should live only on the hub"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_hub_internal_verify_credentials_uses_bcrypt_aware_check():
    name = "Sec-S7b: the hub's /api/internal/verify-credentials endpoint uses verifyPassword (bcrypt-aware)"
    try:
        src = read_file("backend/routes/auth.routes.ts")
        idx = src.index('router.post("/api/internal/verify-credentials"')
        body = src[idx:idx + 1200]
        if "verifyPassword(" not in body:
            fail(name, "verify-credentials endpoint does not use verifyPassword"); return
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
    name = "SecFix-MS4c (server): /api/login returns 429 after 50 failed attempts"
    if not SERVER_UP:
        skip(name, "server not running"); return
    try:
        for _ in range(50):
            server_post("/api/login", {"email": "nobody@test.invalid", "password": "wrong"})
        r = server_post("/api/login", {"email": "nobody@test.invalid", "password": "wrong"})
        if r.status_code != 429:
            fail(name, f"Expected 429 after 50 attempts, got {r.status_code}"); return
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
        if "parsed.slug === processId" not in body:
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
        if "putUpload" not in src:
            fail(name, "rehosted thumbnails are not persisted via putUpload"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# IMP4 (selective per-solution Mobius/TechMobius import picker) and MAP1
# (prefilledSubdomain-seeded Step 1 checkboxes) tested a manual import/mapping
# UI inside the onboarding form that MSUI26 below confirms was intentionally
# removed — see that test and its containing section for the replacement
# behavior (onboarding always saves unmapped; bulk import lives on the
# Solution Repository's Update button; mapping lives on Map Solutions).


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
        if "const uploadedFiles = resourceUrl" not in src:
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
        if "linkedSolutionId: sol.id" not in routes_src:
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
    name = "DEPLOY7 (static): Onboard Solution page has a Deploy Solution card, and DeploySolutionForm.tsx has the upload panel"
    try:
        page_src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if "Deploy Solution" not in page_src:
            fail(name, "Deploy Solution card not found on the Onboard Solution page"); return
        form_src = read_file("frontend/src/components/DeploySolutionForm.tsx")
        if "/api/admin/deploy-solution" not in form_src:
            fail(name, "frontend does not call the deploy-solution endpoint"); return
        if 'accept=".html,.htm,text/html"' not in form_src:
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
    name = "CFILTER1 (static): the shared collateralType util defines the All/Document/Deck/Video/Web page filter with a classifier, imported by App.tsx"
    try:
        util_src = read_file("frontend/src/utils/collateralType.ts")
        if "COLLATERAL_FILTER_OPTIONS" not in util_src:
            fail(name, "COLLATERAL_FILTER_OPTIONS not found"); return
        for label in ['"Document"', '"Deck"', '"Video"', '"Web page"']:
            if label not in util_src:
                fail(name, f"filter option {label} not found"); return
        if "function classifyCollateralType" not in util_src:
            fail(name, "classifyCollateralType helper not found"); return
        app_src = read_file("frontend/src/App.tsx")
        if "from \"./utils/collateralType\"" not in app_src:
            fail(name, "App.tsx does not import the shared collateralType util"); return
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
    name = "CFILTER4 (static): AdminMapSolutions.tsx list view uses SafeImage (not a raw <img>) for solution thumbnails"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if "import { SafeImage }" not in src:
            fail(name, "SafeImage not imported"); return
        idx = src.index("shrink-0 relative")
        body = src[idx:idx + 200]
        if "<SafeImage" not in body:
            fail(name, "solution list thumbnail still uses a raw <img> instead of SafeImage"); return
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
    name = "SOLFORM1 (static): AdminSolutions.tsx onboarding form has a labeled Back button that closes the popup"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index('editingId ? "Edit Solution Resource" : "Onboard New Utility"')
        body = src[max(0, idx - 700):idx]
        if "ArrowLeft" not in body or "Back" not in body:
            fail(name, "no labeled Back button found before the onboarding form header"); return
        if "onClick={handleClose}" not in body:
            fail(name, "Back button is not wired to handleClose"); return
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


# ── Feature — HUBREPO: onboarding always saves unmapped to the Hub Repository ──
# HUBREPO1/2/3/5/6/7 tested the Step 1 checkbox grid and the Mobius/TechMobius/
# Hub Repository import-card picker that used to live inside the onboarding
# form — MSUI26 below confirms both were intentionally removed (see that
# section for why). HUBREPO4/8 still apply to what's left of the form.

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


# ── Feature — MSUI: Portal Domains landing page, Onboard/Map Solutions split ───

def test_msui1_portal_domains_is_default_landing_tab():
    name = "MSUI1 (static): App.tsx defaults adminActiveTab to 'subdomain' (Portal Domains) on login/refresh"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index("const [adminActiveTab, setAdminActiveTab] = useState<")
        line = src[idx:idx + 250]
        if '>("subdomain")' not in line:
            fail(name, "adminActiveTab does not default to 'subdomain'"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui2_nav_has_onboard_and_map_solutions_tabs():
    name = "MSUI2 (static): sidebar nav has 'Onboard Solution' below Portal Domains, and 'Solutions Onboard' is renamed to 'Map Solutions'"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index('{ id: "subdomain", label: "Portal Domains" }')
        body = src[idx:idx + 250]
        if '{ id: "onboardSolution", label: "Onboard Solution" }' not in body:
            fail(name, "Onboard Solution tab not found directly below Portal Domains"); return
        if '{ id: "solutions", label: "Map Solutions" }' not in body:
            fail(name, "Solutions tab was not renamed to 'Map Solutions'"); return
        if "Solutions Onboard" in src:
            fail(name, "old 'Solutions Onboard' label still present"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui3_map_solutions_page_has_no_onboard_deploy_buttons_or_filter_bar():
    name = "MSUI3 (static): Map Solutions page has no Onboard/Deploy buttons and the tenant context filter bar is hidden there"
    try:
        map_src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if "Onboard New Solution" in map_src or "Deploy Solution" in map_src:
            fail(name, "AdminMapSolutions.tsx still renders an Onboard/Deploy trigger button"); return
        app_src = read_file("frontend/src/App.tsx")
        idx = app_src.index("ACTIVE TENANT PORTAL CONTEXT FILTER")
        guard = app_src[max(0, idx - 900):idx]
        if 'adminActiveTab !== "solutions"' not in guard or 'adminActiveTab !== "onboardSolution"' not in guard:
            fail(name, "context filter bar guard does not exclude the solutions/onboardSolution tabs"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui4_map_solutions_portal_rows_have_clickable_name_and_map_button():
    name = "MSUI4 (static): AdminMapSolutions.tsx renders a per-portal row with a clickable portal name (opens View) + Map Solution button and a horizontal-scroll strip"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if "overflow-x-auto" not in src:
            fail(name, "no horizontal-scroll container for a portal's mapped solutions"); return
        if "Map Solution" not in src:
            fail(name, "no Map Solution button found"); return
        if 'onClick={() => setViewPortal(row)}' not in src:
            fail(name, "portal name is not wired to open the View popup"); return
        if "hover:text-orange-600" not in src:
            fail(name, "portal name does not turn orange on hover"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui5_view_popup_close_button_right_of_map_solution():
    name = "MSUI5 (static): the View popup's close button sits to the right of its Map Solution button"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        idx = src.index('{viewPortal.displayName} — Mapped Solutions')
        body = src[idx:idx + 900]
        map_idx = body.index("Map Solution")
        close_idx = body.index('title="Close"')
        if not (map_idx < close_idx):
            fail(name, "Close button is not positioned after (to the right of) the Map Solution button"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui6_view_popup_two_column_grid_with_hide_edit_delete():
    name = "MSUI6 (static): View popup lists mapped solutions in a 2-column grid with hide/edit/delete actions"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if "md:grid-cols-2" not in src:
            fail(name, "solutions are not laid out in a 2-column grid"); return
        if "handleToggleEnable" not in src or "setEditingSolution" not in src or "handleDelete" not in src:
            fail(name, "hide/edit/delete actions are missing from the View popup"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui7_onboard_page_has_two_themed_cards():
    name = "MSUI7 (static): Onboard Solution page has an Onboard card (white/orange) and a Deploy card (dark blue/orange)"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if 'text-orange-600">Map/Onboard Solution</h4>' not in src:
            fail(name, "Onboard Solution card title is not orange-accented"); return
        onboard_idx = src.index("Map/Onboard Solution</h4>")
        onboard_body = src[max(0, onboard_idx - 800):onboard_idx]
        if "bg-white" not in onboard_body:
            fail(name, "Onboard Solution card is not white-themed"); return
        if 'text-orange-400">Deploy Solution</h4>' not in src:
            fail(name, "Deploy Solution card title is not orange-accented"); return
        deploy_idx = src.index("Deploy Solution</h4>")
        deploy_body = src[max(0, deploy_idx - 800):deploy_idx]
        if "blue" not in deploy_body.lower():
            fail(name, "Deploy Solution card is not dark-blue themed"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui8_popups_use_shared_layoutid_for_seamless_animation():
    name = "MSUI8 (static): Onboard/Deploy card popups share a layoutId with their trigger card for a seamless expand animation"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if src.count('layoutId="onboard-solution-card"') < 2:
            fail(name, "onboard card and its popup do not share a layoutId"); return
        if src.count('layoutId="deploy-solution-card"') < 2:
            fail(name, "deploy card and its popup do not share a layoutId"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui9_deploy_subdomain_optional_frontend():
    name = "MSUI9 (static): DeploySolutionForm.tsx no longer requires a subdomain to be entered"
    try:
        src = read_file("frontend/src/components/DeploySolutionForm.tsx")
        idx = src.index("const handleDeploySolution")
        body = src[idx:idx + 400]
        if "!deployFile || !deployTitle.trim() || !deploySlug.trim()" in body:
            fail(name, "subdomain is still required by frontend validation"); return
        if "!deployFile || !deployTitle.trim()" not in body:
            fail(name, "expected relaxed validation (file + title only) not found"); return
        if "optional" not in src.lower():
            fail(name, "no 'optional' hint shown for the subdomain field"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui10_deploy_subdomain_optional_backend():
    name = "MSUI10 (static): deploy-solution.routes.ts derives a slug from the title when no subdomain is supplied"
    try:
        src = read_file("backend/routes/deploy-solution.routes.ts")
        if "titleSlug" not in src:
            fail(name, "no title-derived slug fallback found"); return
        if 'let cleanSlug = explicitSlug || titleSlug;' not in src:
            fail(name, "cleanSlug does not fall back to the title-derived slug"); return
        if 'if (!cleanSlug) return res.status(400).json({ error: "Subdomain has invalid characters." });' in src:
            fail(name, "old hard requirement for a manually-typed subdomain is still present"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui11_popups_are_landscape_with_internal_scroll():
    name = "MSUI11 (static): Onboard/Deploy/Edit popups use a wide max-width with internal scroll instead of a tall page-level scroll"
    try:
        page_src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if 'max-w-7xl max-h-[88vh] overflow-y-auto' not in page_src:
            fail(name, "Onboard popup is not a wide, height-capped, internally-scrolling box"); return
        if 'max-w-4xl max-h-[88vh] overflow-y-auto' not in page_src:
            fail(name, "Deploy popup is not a wide, height-capped, internally-scrolling box"); return
        if 'items-start md:items-center' in page_src:
            fail(name, "popup backdrop still scrolls the whole page instead of the modal box internally"); return
        map_src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if 'max-w-6xl max-h-[88vh] overflow-y-auto' not in map_src:
            fail(name, "Edit-solution popup is not a wide, height-capped, internally-scrolling box"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui12_deploy_solution_defaults_to_no_checkbox_ticked():
    name = "MSUI12 (static): DeploySolutionForm.tsx no longer defaults the target-portal checkboxes to ['all']"
    try:
        src = read_file("frontend/src/components/DeploySolutionForm.tsx")
        if 'useState<string[]>(prefilledSubdomain ? [prefilledSubdomain] : ["all"])' in src:
            fail(name, "deployCustomerNames still defaults to ['all'] when there is no prefilled portal"); return
        if 'useState<string[]>(prefilledSubdomain ? [prefilledSubdomain] : [])' not in src:
            fail(name, "deployCustomerNames does not default to an empty (no ticks) selection"); return
        idx = src.index("const handleDeployCustomerCheckboxChange")
        body = src[idx:idx + 500]
        if 'updated = ["all"]' in body:
            fail(name, "checkbox handler still force-reverts an empty selection back to ['all']"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui13_deploy_backend_allows_empty_target_portals():
    name = "MSUI13 (static): deploy-solution.routes.ts no longer requires at least one target portal"
    try:
        src = read_file("backend/routes/deploy-solution.routes.ts")
        if 'if (customerNames.length === 0) return res.status(400).json({ error: "Select at least one target portal." });' in src:
            fail(name, "backend still hard-requires at least one target portal for deploy"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui14_map_solution_popup_shows_only_the_solution_repository():
    name = "MSUI14 (static): the Map Solution popup shows only the Solution Repository list (no Mobius/TechMobius import cards)"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        idx = src.index("Map Solutions to {mapPortal.displayName}")
        body = src[idx:idx + 3500]
        if "<ImportFromPortalPanel" in body:
            fail(name, "Map Solution popup still renders the Mobius/TechMobius/Hub Repository import panel"); return
        if "Mobius Portal" in body or "TechMobius Portal" in body:
            fail(name, "Map Solution popup still references the two other portal sources"); return
        if "solutions.map((sol) =>" not in body:
            fail(name, "Map Solution popup does not list every solution from the repository"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui15_import_from_portal_panel_fully_removed():
    name = "MSUI15 (static): ImportFromPortalPanel.tsx is gone and nothing still imports it (its only caller, the onboarding form's picker, was removed — see MSUI26)"
    try:
        if os.path.exists(os.path.join(APP_ROOT, "frontend/src/components/ImportFromPortalPanel.tsx")):
            fail(name, "ImportFromPortalPanel.tsx still exists on disk but has no remaining callers"); return
        for component in ["AdminSolutions.tsx", "AdminMapSolutions.tsx", "AdminOnboardSolutionPage.tsx"]:
            src = read_file(f"frontend/src/components/{component}")
            if "ImportFromPortalPanel" in src:
                fail(name, f"{component} still references the removed ImportFromPortalPanel"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI2: portal link, search + checkbox filter, seamless row popup ─

def test_msui16_portal_row_has_external_link_opening_in_new_tab():
    name = "MSUI16 (static): each portal row shows a clickable link to the live portal that opens in a new tab"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if "function portalUrl(portal: SubdomainPortal)" not in src:
            fail(name, "no portalUrl() URL builder found"); return
        idx = src.index("href={portalUrl(row.portal)}")
        body = src[idx:idx + 200]
        if 'target="_blank"' not in body:
            fail(name, "portal link does not open in a new tab"); return
        if 'rel="noopener noreferrer"' not in body:
            fail(name, "portal link is missing rel=noopener noreferrer"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui17_search_bar_and_portal_checkbox_filter_left_of_refresh():
    name = "MSUI17 (static): a search bar and a portal checkbox filter sit to the left of the Refresh button"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        search_idx = src.index("Search portals or solutions…")
        filter_idx = src.index('checked={portalFilter.size === 0}')
        refresh_idx = src.index('title="Reload solutions from server"')
        if not (search_idx < filter_idx < refresh_idx):
            fail(name, "search bar and/or checkbox filter are not positioned before the Refresh button in source order"); return
        if "visibleRows" not in src:
            fail(name, "portal rows are not actually filtered by search/checkbox state"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui18_view_popup_shares_layoutid_with_its_row_for_seamless_transition():
    name = "MSUI18 (static): the View popup shares a per-row layoutId with its trigger row so open/close is a seamless expand/collapse"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        if "layoutId={`portal-row-${row.id}`}" not in src:
            fail(name, "portal row is not assigned a layoutId"); return
        if "layoutId={`portal-row-${viewPortal.id}`}" not in src:
            fail(name, "View popup does not share the row's layoutId"); return
        if "whileHover={{ scale: 1.012 }}" not in src:
            fail(name, "portal row card does not pop up slightly on hover"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui19_onboard_deploy_cards_are_shorter():
    name = "MSUI19 (static): the Onboard/Deploy cards on the Onboard Solution page are shorter (no min-h-[220px], reduced padding)"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if "min-h-[220px]" in src:
            fail(name, "cards still use the old tall min-h-[220px]"); return
        if "p-8 bg-white" in src or "p-8 bg-gradient-to-br" in src:
            fail(name, "cards still use the old p-8 padding"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui20_solution_repository_section_below_cards():
    name = "MSUI20 (static): a 'Solution Repository' row-list (name, URL, collateral count) renders below the Onboard/Deploy cards"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        cards_idx = src.index('className="grid grid-cols-1 md:grid-cols-2 gap-6"')
        repo_idx = src.index("Solution Repository")
        if repo_idx < cards_idx:
            fail(name, "Solution Repository section appears before the cards, not below them"); return
        body = src[repo_idx:repo_idx + 5000]
        if "Solution Name" not in body:
            fail(name, "no Solution Name column"); return
        if ">URL<" not in body:
            fail(name, "no URL column"); return
        if "Collaterals" not in body:
            fail(name, "no Collaterals count column"); return
        if "filteredSolutions.map((sol) =>" not in body:
            fail(name, "repository does not iterate over the (filterable) solutions list"); return
        if "collaterals.filter((c) => c.linkedSolutionId === sol.id).length" not in body:
            fail(name, "collateral count is not computed per-solution"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui21_repository_update_button_syncs_from_both_portals():
    name = "MSUI21 (static): the Solution Repository 'Update' button syncs from Mobius+TechMobius — new items land unmapped, existing ones are refreshed in place"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        idx = src.index("const handleUpdateRepository")
        body = src[idx:idx + 2500]
        if '"/api/admin/external-portals/solutions"' not in body:
            fail(name, "does not fetch the combined Mobius/TechMobius solutions list"); return
        if "existingTitles" in body:
            fail(name, "still pre-filters by title client-side instead of letting the server match-or-update by source record"); return
        if '"mobius", "techmobius"' not in body:
            fail(name, "does not pull from both mobius and techmobius"); return
        if '"/api/admin/external-portals/import"' not in body:
            fail(name, "does not call the server-side import endpoint"); return
        if "customerNames: []" not in body:
            fail(name, "imported solutions are not left unmapped (Hub Repository) by default"); return
        if "data.updatedSolutions" not in body:
            fail(name, "does not surface how many existing solutions were refreshed"); return
        button_idx = src.index("Solution Repository")
        button_body = src[button_idx:button_idx + 3000]
        if "onClick={handleUpdateRepository}" not in button_body:
            fail(name, "no Update button wired to handleUpdateRepository near the Solution Repository header"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui69_external_import_matches_existing_solution_by_source_not_title():
    name = "MSUI69 (static): re-syncing an already-imported solution updates it in place (matched by sourcePortal+sourceExternalId, falling back to title) instead of skipping or duplicating it"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if "solutionsByExternalId" not in src or "solutionsByTitle" not in src:
            fail(name, "import route does not build both a source-id and a title lookup for matching existing solutions"); return
        if "existingSol.sourcePortal = portal" not in src:
            fail(name, "matched solutions do not get sourcePortal/sourceExternalId backfilled for future re-syncs"); return
        if "existingSol.credentialsDescription = credentialsDescription" not in src:
            fail(name, "matched solutions do not have their credentials refreshed from the source on re-sync"); return
        if "existingSol.customerNames" in src or "existingSol.enabled" in src or "existingSol.createdBy" in src:
            fail(name, "re-sync touches portal-mapping/enabled/createdBy — it must only refresh content fields"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui70_external_import_deploys_updates_to_mapped_live_portals():
    name = "MSUI70 (static): after syncing updated content from Mobius/TechMobius, the import route redeploys to every live portal the solution is mapped to"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        idx = src.index("writeDatabase(db);")
        body = src[idx:idx + 200]
        if "autoDeployLivePortals(db)" not in body:
            fail(name, "does not push the refreshed data out to live portals after a sync"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui71_solution_and_collateral_types_track_import_source():
    name = "MSUI71 (static): Solution and Collateral both carry sourcePortal/sourceExternalId so a later re-sync can find them by origin, not by title"
    try:
        src = read_file("shared/types.ts")
        sol_idx = src.index("export interface Solution")
        sol_body = src[sol_idx:src.index("export interface", sol_idx + 10)]
        if "sourcePortal?:" not in sol_body or "sourceExternalId?:" not in sol_body:
            fail(name, "Solution does not declare sourcePortal/sourceExternalId"); return
        col_idx = src.index("export interface Collateral")
        col_body = src[col_idx:src.index("export interface", col_idx + 10)]
        if "sourcePortal?:" not in col_body or "sourceExternalId?:" not in col_body:
            fail(name, "Collateral does not declare sourcePortal/sourceExternalId"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui72_upload_storage_mode_is_configurable():
    name = "MSUI72 (static): config.ts exposes an UPLOAD_STORAGE_MODE switch (env-driven, defaults to s3) plus a local uploads directory"
    try:
        src = read_file("backend/config.ts")
        if 'UPLOAD_STORAGE_MODE = (process.env.UPLOAD_STORAGE_MODE || "s3")' not in src:
            fail(name, "UPLOAD_STORAGE_MODE is not env-driven with a default of 's3'"); return
        if "UPLOADS_DIR = path.join(DATA_DIR" not in src:
            fail(name, "no local UPLOADS_DIR under DATA_DIR for the local storage mode"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui73_uploads_module_switches_backend_and_falls_back_on_read():
    name = "MSUI73 (static): storage/uploads.ts writes to whichever backend UPLOAD_STORAGE_MODE selects, but reads check both — so switching back to s3 doesn't break files saved while in local mode"
    try:
        src = read_file("backend/storage/uploads.ts")
        if 'UPLOAD_STORAGE_MODE === "local"' not in src:
            fail(name, "putUpload/getUpload do not branch on UPLOAD_STORAGE_MODE"); return
        put_idx = src.index("export async function putUpload")
        put_body = src[put_idx:src.index("export async function getUpload")]
        if "s3PutUpload" not in put_body or "putLocal" not in put_body:
            fail(name, "putUpload does not cover both the S3 and local write paths"); return
        get_idx = src.index("export async function getUpload")
        get_body = src[get_idx:get_idx + 600]
        if "getLocal" not in get_body or "s3GetUpload" not in get_body:
            fail(name, "getUpload does not check both backends"); return
        if "||" not in get_body:
            fail(name, "getUpload does not fall back to the other backend when the primary one has nothing"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui74_upload_and_import_routes_use_the_switchable_storage_module():
    name = "MSUI74 (static): both the admin upload route and the Mobius/TechMobius thumbnail re-hoster go through storage/uploads.ts, not the S3 helpers directly"
    try:
        upload_src = read_file("backend/routes/upload.routes.ts")
        if 'from "../storage/uploads"' not in upload_src:
            fail(name, "upload.routes.ts does not import from storage/uploads"); return
        if "s3PutUpload" in upload_src or "s3GetUpload" in upload_src:
            fail(name, "upload.routes.ts still calls the S3 helpers directly, bypassing the storage-mode switch"); return
        external_src = read_file("backend/routes/external-portals.routes.ts")
        if 'from "../storage/uploads"' not in external_src:
            fail(name, "external-portals.routes.ts does not import from storage/uploads"); return
        if "s3PutUpload" in external_src:
            fail(name, "external-portals.routes.ts still calls s3PutUpload directly, bypassing the storage-mode switch"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui75_external_import_captures_solution_description_separately_from_credentials_note():
    name = "MSUI75 (static): import carries the source's actual 'description' field (not just credentials_note) into a dedicated Solution.description, shown on the catalogue card and launch modal"
    try:
        types_src = read_file("shared/types.ts")
        sol_idx = types_src.index("export interface Solution")
        sol_body = types_src[sol_idx:types_src.index("export interface", sol_idx + 10)]
        if "description?:" not in sol_body:
            fail(name, "Solution has no dedicated description field distinct from credentialsDescription"); return

        routes_src = read_file("backend/routes/external-portals.routes.ts")
        if 'const description = s.description || "";' not in routes_src:
            fail(name, "import does not read the source's own 'description' field"); return
        if "existingSol.description = description;" not in routes_src:
            fail(name, "re-syncing an existing solution does not refresh its description"); return

        app_src = read_file("frontend/src/App.tsx")
        if "sol.description || sol.credentialsDescription" not in app_src:
            fail(name, "solution catalogue card does not prefer the real description over the credentials note"); return

        modal_src = read_file("frontend/src/components/SolutionLaunchModal.tsx")
        if "solution.description || solution.credentialsDescription" not in modal_src:
            fail(name, "solution launch modal does not prefer the real description over the credentials note"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui76_verified_node_ingress_replaced_with_solutions_search():
    name = "MSUI76 (static): the decorative 'Verified Node Ingress' label is replaced with a functional search input that filters the Solutions Hub grid"
    try:
        src = read_file("frontend/src/App.tsx")
        if "Verified Node Ingress" in src:
            fail(name, "the decorative 'Verified Node Ingress' label is still present"); return
        if "solutionSearch" not in src or "setSolutionSearch" not in src:
            fail(name, "no solutionSearch state backing a search input"); return
        if "searchedSolutions" not in src:
            fail(name, "no derived searchedSolutions list filtering the grid by search text"); return
        if "{searchedSolutions.map((sol) =>" not in src:
            fail(name, "the solutions grid does not render from the search-filtered list"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui77_solution_search_does_not_affect_collateral_grouping():
    name = "MSUI77 (static): the Solutions Hub search only narrows the solutions grid — the Collaterals Catalogue's per-solution grouping still uses the full visibleSolutions list"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index("const linkedSolutionIds = new Set(visibleSolutions.map((s) => s.id));")
        body = src[idx:idx + 400]
        if "visibleSolutions" not in body:
            fail(name, "collateral row grouping no longer iterates visibleSolutions"); return
        if "searchedSolutions" in body:
            fail(name, "collateral row grouping was accidentally narrowed by the solutions search text"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui78_solution_card_shows_collateral_icons_with_hover_view_button():
    name = "MSUI78 (static): each solution card with linked collaterals shows a per-type icon row that swaps to a 'View Collaterals' button on hover"
    try:
        src = read_file("frontend/src/App.tsx")
        if "KIND_ICONS[classifyCollateralType(col)]" not in src:
            fail(name, "solution card does not render a per-collateral type icon"); return
        if "group/collaterals" not in src:
            fail(name, "no dedicated hover group scoping the icon-row/button swap (would conflict with the card's own hover group)"); return
        if "View Collaterals" not in src:
            fail(name, "no 'View Collaterals' button"); return
        if "group-hover/collaterals:opacity-100" not in src or "group-hover/collaterals:opacity-0" not in src:
            fail(name, "icon row and button do not swap visibility on hover"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui79_view_collaterals_scrolls_to_and_highlights_the_solutions_row():
    name = "MSUI79 (static): clicking 'View Collaterals' switches to the Collaterals Catalogue tab and scrolls/highlights that solution's own row"
    try:
        src = read_file("frontend/src/App.tsx")
        if "const handleViewCollaterals = (solId: string) => (e: React.MouseEvent) => {" not in src:
            fail(name, "no handleViewCollaterals handler"); return
        handler_idx = src.index("const handleViewCollaterals")
        handler_body = src[handler_idx:handler_idx + 300]
        if "e.stopPropagation()" not in handler_body:
            fail(name, "handleViewCollaterals does not stop propagation, so it would also trigger the card's own click-to-open"); return
        if 'setCurrentTab("collaterals")' not in handler_body:
            fail(name, "handleViewCollaterals does not switch to the Collaterals Catalogue tab"); return
        if "id={`collateral-row-${row.key}`}" not in src:
            fail(name, "collateral rows have no scroll-target id matching handleViewCollaterals' target"); return
        if "highlightedCollateralRow === row.key" not in src:
            fail(name, "the target row is not visually highlighted after navigating to it"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui81_login_rate_limit_raised_to_50_on_hub_and_portals():
    name = "MSUI81 (static): the login rate limiter allows 50 attempts per 15 minutes (raised from 5) on both the hub and every customer portal, not removed entirely"
    try:
        for path in ["backend/routes/auth.routes.ts", "backend/portal-server.ts"]:
            src = read_file(path)
            if "rateLimit(" not in src or "loginLimiter" not in src:
                fail(name, f"{path} no longer rate-limits login at all — brute-force protection was removed"); return
            idx = src.index("const loginLimiter = rateLimit(")
            body = src[idx:idx + 250]
            if "max: 50" not in body:
                fail(name, f"{path}'s loginLimiter is not set to max: 50"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui82_solution_card_thumbnail_and_description_sized_to_match_reference():
    name = "MSUI82 (static): solution card thumbnail uses a fixed 4:3 aspect box (not a short fixed height) and the description shows up to 3 lines before truncating"
    try:
        src = read_file("frontend/src/App.tsx")
        card_idx = src.index('id={`sol-card-${sol.id}`}')
        card_body = src[card_idx:card_idx + 2000]
        if "aspect-[4/3]" not in card_body:
            fail(name, "solution card thumbnail is not sized with a 4:3 aspect ratio"); return
        if "line-clamp-3" not in card_body:
            fail(name, "solution card description does not allow up to 3 lines before truncating"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui83_access_wall_has_abstract_orange_white_background():
    name = "MSUI83 (static): AccessWall's login card has an abstract 3D-style backdrop in the white/orange palette, layered behind the form content"
    try:
        src = read_file("frontend/src/components/AccessWall.tsx")
        if "pointer-events-none absolute inset-0 z-0" not in src:
            fail(name, "no dedicated backdrop layer behind the form content"); return
        if src.count("blur-3xl") + src.count("blur-2xl") < 2:
            fail(name, "backdrop does not use soft blurred blobs to read as an abstract 3D-style background"); return
        if "from-orange-" not in src:
            fail(name, "backdrop is not in the orange palette"); return
        if "relative z-10" not in src:
            fail(name, "form content has no explicit stacking above the backdrop layer"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui84_access_wall_props_and_call_sites_no_longer_carry_removed_solutions_data():
    name = "MSUI84 (static): AccessWall no longer accepts solutions/targetSolutionId (dead after removing the credentials panel), and App.tsx call sites don't pass them"
    try:
        src = read_file("frontend/src/components/AccessWall.tsx")
        if "solutions?:" in src or "targetSolutionId" in src:
            fail(name, "AccessWall still declares the removed solutions/targetSolutionId props"); return

        app_src = read_file("frontend/src/App.tsx")
        idx = 0
        count = 0
        while True:
            idx = app_src.find("<AccessWall", idx)
            if idx == -1:
                break
            call_body = app_src[idx:idx + 300]
            if "solutions={solutions}" in call_body or "targetSolutionId=" in call_body:
                fail(name, "an <AccessWall> call site still passes the removed solutions/targetSolutionId prop"); return
            count += 1
            idx += 1
        if count < 3:
            fail(name, f"expected 3 <AccessWall> call sites in App.tsx, found {count}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui80_no_featured_external_new_badges_on_solution_cards():
    name = "MSUI80 (static): solution cards do not show Featured/External/New style tags"
    try:
        src = read_file("frontend/src/App.tsx")
        card_idx = src.index('id={`sol-card-${sol.id}`}')
        card_body = src[card_idx:card_idx + 6000]
        for banned in ["Featured", ">External<", ">NEW<", ">New<"]:
            if banned in card_body:
                fail(name, f"solution card contains a disallowed tag-like label: {banned}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui22_external_import_empty_customer_names_means_unmapped_not_all():
    name = "MSUI22 (static): external-portals import no longer defaults an empty/missing customerNames to ['all']"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if 'customerNames.length > 0 ? customerNames : ["all"]' in src:
            fail(name, "import route still defaults empty customerNames to ['all'] instead of leaving the solution unmapped"); return
        if "const targetCustomerNames = Array.isArray(customerNames) ? customerNames : [];" not in src:
            fail(name, "targetCustomerNames does not fall back to an empty (unmapped) array"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui23_map_solution_popup_has_checkbox_column_and_is_larger():
    name = "MSUI23 (static): the Map Solution popup has a checkbox to the left of each solution and a larger max-width/height"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        idx = src.index("Map Solutions to {mapPortal.displayName}")
        wrapper_before = src[max(0, idx - 400):idx]
        if "max-w-5xl max-h-[90vh]" not in wrapper_before:
            fail(name, "Map Solution popup is not sized larger (expected max-w-5xl max-h-[90vh])"); return
        body = src[idx:idx + 3500]
        if 'type="checkbox"' not in body:
            fail(name, "no checkbox found in the Map Solution popup's solution rows"); return
        if "Solution Name" not in body or ">URL<" not in body or "Collaterals" not in body:
            fail(name, "Map Solution popup table is missing the Solution Name/URL/Collaterals columns"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui24_map_solution_popup_preticks_already_mapped_solutions():
    name = "MSUI24 (static): reopening the Map Solution popup pre-ticks solutions already mapped to that portal"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        idx = src.index("const openMap = (row: PortalRow)")
        body = src[idx:idx + 500]
        if "namesOf(s).includes(row.name)" not in body:
            fail(name, "openMap does not seed selectedToMap from solutions already mapped to this portal"); return
        if "setSelectedToMap(initial)" not in body:
            fail(name, "openMap does not initialize selectedToMap before opening the popup"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui25_map_selected_syncs_both_additions_and_removals():
    name = "MSUI25 (static): clicking Map both adds newly-checked solutions to the portal and removes unchecked ones that were previously mapped"
    try:
        src = read_file("frontend/src/components/AdminMapSolutions.tsx")
        idx = src.index("const handleMapSelected = async () => {\n    if (!mapPortal) return;")
        body = src[idx:idx + 1200]
        if "names.filter((n) => n !== mapPortal.name)" not in body:
            fail(name, "unchecking a previously-mapped solution does not remove it from the portal"); return
        if "[...names, mapPortal.name]" not in body:
            fail(name, "checking a solution does not add it to the portal while preserving its other mappings"); return
        if 'onRefresh("update", { ...sol, customerNames: updated' not in body:
            fail(name, "mapping change is not persisted via onRefresh with the full updated customerNames (needed so linked collaterals re-sync too)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI26: onboarding form simplified to just its own fields ────────
# Portal targeting (Step 1) and the Mobius/TechMobius/Hub Repository import
# picker were removed from the onboarding form entirely — onboarding a new
# solution now always saves it unmapped to the Solution Repository; mapping
# to portals, and bulk-importing from the external portals, both moved
# elsewhere (Map Solutions, and the Solution Repository's Update button).

def test_msui26_onboard_form_has_no_step1_or_import_section():
    name = "MSUI26 (static): AdminSolutions.tsx no longer has a Step 1 portal-checkbox grid or a Mobius/TechMobius/Hub Repository import picker"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        if "STEP 1" in src or "Select Target Subdomains" in src:
            fail(name, "Step 1 target-subdomain section is still present"); return
        if "ImportFromPortalPanel" in src:
            fail(name, "onboarding form still references the removed ImportFromPortalPanel"); return
        if "Mobius Portal" in src or "TechMobius Portal" in src:
            fail(name, "onboarding form still references the two external portal import cards"); return
        if "handleSubdomainCheckboxChange" in src:
            fail(name, "the now-unused Step 1 checkbox handler is still present"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui27_new_solutions_always_land_unmapped():
    name = "MSUI27 (static): a brand-new solution from the onboarding form always starts unmapped (customerNames defaults to [])"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index("const [customerNames, setCustomerNames] = useState<string[]>(")
        line = src[idx:idx + 120]
        if "useState<string[]>([])" not in line:
            fail(name, "customerNames does not default to an empty (unmapped) array"); return
        reset_idx = src.index("const resetForm = ()")
        reset_body = src[reset_idx:reset_idx + 200]
        if "setCustomerNames([])" not in reset_body:
            fail(name, "resetForm does not reset customerNames back to unmapped"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui28_editing_still_preserves_existing_mapping_silently():
    name = "MSUI28 (static): editing an existing solution still carries its current portal mapping through on submit, even with no UI to change it"
    try:
        src = read_file("frontend/src/components/AdminSolutions.tsx")
        idx = src.index("const handleEditClick = (sol: Solution) => {")
        body = src[idx:idx + 300]
        if "sol.customerNames" not in body:
            fail(name, "handleEditClick does not seed customerNames from the solution being edited"); return
        if "customerNames," not in src.split("const payload = {")[1][:600]:
            fail(name, "submit payload does not include customerNames, so editing would silently unmap the solution"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI29: Edit button on the Solution Repository list ──────────────

def test_msui29_repository_row_has_edit_button():
    name = "MSUI29 (static): each row in the Solution Repository list has an Edit button that opens EditSolutionQuickPopup"
    try:
        page_src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if "import { EditSolutionQuickPopup }" not in page_src:
            fail(name, "AdminOnboardSolutionPage.tsx does not import EditSolutionQuickPopup"); return
        if "onClick={() => setEditingSolution(sol)}" not in page_src:
            fail(name, "no per-row Edit button wired to open the quick-edit popup"); return
        if "<EditSolutionQuickPopup" not in page_src:
            fail(name, "EditSolutionQuickPopup is not rendered"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui30_quick_edit_popup_has_title_url_thumbnail_only():
    name = "MSUI30 (static): EditSolutionQuickPopup only edits title, URL, and thumbnail — no tags/credentials/portal-mapping fields"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        if "Solution Name / Title" not in src:
            fail(name, "no title field"); return
        if "Application URL" not in src:
            fail(name, "no URL field"); return
        if "Visual Card Thumbnail Setup" not in src:
            fail(name, "no thumbnail setup section"); return
        if "Tag Categories" in src or "Credentials Instruction" in src or "STEP 1" in src:
            fail(name, "quick-edit popup pulls in fields beyond title/URL/thumbnail"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui31_quick_edit_locks_url_for_deployed_solutions():
    name = "MSUI31 (static): the URL field is locked (disabled) when editing a solution deployed via Deploy Solution, editable otherwise"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        if "const isDeployed = !!solution.deployedSlug;" not in src:
            fail(name, "no isDeployed check based on solution.deployedSlug"); return
        idx = src.index("{isDeployed ? (")
        body = src[idx:idx + 1200]
        if "disabled" not in body:
            fail(name, "URL input is not disabled in the deployed branch"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui32_quick_edit_submits_minimal_partial_payload():
    name = "MSUI32 (static): EditSolutionQuickPopup submits only id/title/url/thumbnail — a partial merge, not the full solution object"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        if 'onRefresh("update", { id: solution.id, title: title.trim(), url: appUrl, thumbnail })' not in src:
            fail(name, "submit does not send the expected minimal partial-update payload"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI33: Modify rename, Delete Solution, Edit Subdomain rename ────

def test_msui33_repository_edit_button_renamed_to_modify_no_icon():
    name = "MSUI33 (static): the Solution Repository's Edit button is renamed to 'Modify' with no pencil icon"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if "Edit2" in src:
            fail(name, "AdminOnboardSolutionPage.tsx still imports/uses the Edit2 pencil icon"); return
        idx = src.index("onClick={() => setEditingSolution(sol)}")
        body = src[idx:idx + 300]
        if ">\n                        Modify\n" not in body and "Modify" not in body:
            fail(name, "Modify button label not found"); return
        if "\n                        Edit\n" in body:
            fail(name, "button still labeled Edit"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui34_quick_edit_has_delete_solution_button_opposite_apply():
    name = "MSUI34 (static): EditSolutionQuickPopup has a Delete Solution button on the opposite side of Apply Modifications"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        footer_idx = src.index('className="pt-3 border-t border-slate-100 flex items-center justify-between')
        footer_body = src[footer_idx:footer_idx + 1200]
        delete_idx = footer_body.index("Delete Solution")
        apply_idx = footer_body.index("Apply Modifications")
        if not (delete_idx < apply_idx):
            fail(name, "Delete Solution does not appear before (left of) Apply Modifications in the justify-between footer"); return
        if "onClick={handleDelete}" not in footer_body:
            fail(name, "Delete Solution button is not wired to handleDelete"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui35_delete_warns_about_unassigning_subdomain_when_deployed():
    name = "MSUI35 (static): deleting a deployed solution warns that its subdomain will be unassigned first"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        idx = src.index("const handleDelete = async () => {")
        body = src[idx:idx + 500]
        if "unassigned" not in body.lower():
            fail(name, "no mention of the subdomain being unassigned in the deployed delete warning"); return
        if 'onRefresh("delete", { id: solution.id })' not in body:
            fail(name, "delete does not call onRefresh with the delete action (backend cascade handles DNS/IIS cleanup)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui36_edit_subdomain_button_toggles_to_save_changes():
    name = "MSUI36 (static): the Edit Subdomain button unlocks the field, then switches to an orange Save Changes button once the value differs"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        if "const subdomainChanged = subdomainSlug.trim() !== \"\" && subdomainSlug !== currentSlug;" not in src:
            fail(name, "no subdomainChanged detection comparing the edited slug to the current one"); return
        idx = src.index("onClick={handleSubdomainButtonClick}")
        body = src[idx:idx + 700]
        if "bg-orange-600" not in body:
            fail(name, "button does not switch to an orange 'changed' style"); return
        if '"Save Changes"' not in body or '"Edit Subdomain"' not in body:
            fail(name, "button does not toggle between 'Edit Subdomain' and 'Save Changes' labels"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui37_backend_rename_subdomain_decommissions_old_subdomain_first_creates_new():
    name = "MSUI37 (static): the rename-subdomain action stands up the new subdomain before tearing down and fully decommissioning the old one"
    try:
        src = read_file("backend/routes/content.routes.ts")
        idx = src.index('action === "rename-subdomain"')
        body = src[idx:idx + 3000]
        if "ensureDnsRecord(cleanSlug, domain)" not in body:
            fail(name, "does not create a DNS record for the new subdomain"); return
        if "ensureStaticHtmlIisSite(cleanSlug, newFqdn, contentDir)" not in body:
            fail(name, "does not create an IIS site for the new subdomain"); return
        if "removeStaticHtmlIisSite(oldSlug)" not in body:
            fail(name, "does not remove the old IIS site — the app would still be reachable at the previous subdomain"); return
        if "deleteDnsRecord(oldSlug, domain)" not in body:
            fail(name, "does not delete the old DNS record — the previous subdomain would still resolve"); return
        new_idx = body.index("ensureStaticHtmlIisSite(cleanSlug")
        old_idx = body.index("removeStaticHtmlIisSite(oldSlug)")
        if not (new_idx < old_idx):
            fail(name, "old subdomain is torn down before the new one is stood up (risks a dead app mid-rename)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI38: Total/Onboarded/Deployed sliding filter widget ───────────

def test_msui38_repo_filter_widget_left_of_update_with_three_segments():
    name = "MSUI38 (static): a Total/Onboarded/Deployed filter widget sits left of the Update button, in that order"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        widget_idx = src.index('repoFilters.map((f, i) =>')
        update_idx = src.index('onClick={handleUpdateRepository}')
        if not (widget_idx < update_idx):
            fail(name, "filter widget does not appear before (left of) the Update button in source order"); return
        idx = src.index('{ key: "all", label: "Total", count: totalCount }')
        body = src[idx:idx + 300]
        if '{ key: "onboarded", label: "Onboarded", count: onboardedCount }' not in body:
            fail(name, "Onboarded segment does not follow Total"); return
        if '{ key: "deployed", label: "Deployed", count: deployedCount }' not in body:
            fail(name, "Deployed segment does not follow Onboarded"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui39_repo_filter_defaults_to_total_and_actually_filters_rows():
    name = "MSUI39 (static): the filter defaults to 'all' (Total) and actually narrows the repository rows by onboarded/deployed status"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if 'useState<"all" | "onboarded" | "deployed">("all")' not in src:
            fail(name, "repoFilter does not default to 'all' (the Total segment)"); return
        idx = src.index("const filteredSolutions = repositorySolutions.filter((s) => {")
        body = src[idx:idx + 300]
        if 'if (repoFilter === "onboarded") return !s.deployedSlug;' not in body:
            fail(name, "onboarded filter does not exclude deployed solutions"); return
        if 'if (repoFilter === "deployed") return !!s.deployedSlug;' not in body:
            fail(name, "deployed filter does not restrict to deployed solutions"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui40_repo_filter_segments_share_layoutid_for_seamless_slide():
    name = "MSUI40 (static): the active filter segment's glass highlight shares a layoutId so it slides seamlessly between segments"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if 'layoutId="repo-filter-highlight"' not in src:
            fail(name, "no shared layoutId on the sliding highlight"); return
        idx = src.index('layoutId="repo-filter-highlight"')
        body = src[max(0, idx - 200):idx + 300]
        if "backdrop-blur" not in body:
            fail(name, "highlight does not have a glass/frosted (backdrop-blur) look"); return
        if "{active &&" not in body:
            fail(name, "highlight is not conditionally rendered only in the active segment"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI41: Portal subdomain rename + shared toast notification ──────

def test_msui41_deploy_in_process_decouples_process_id_from_content_slug():
    name = "MSUI41 (static): deployPortalInProcess takes a separate contentSlug so a renamed portal's process/data dir stay keyed by its permanent id"
    try:
        src = read_file("backend/portal/deploy.ts")
        if "processId: string" not in src or "contentSlug?: string" not in src:
            fail(name, "deployPortalInProcess does not accept a separate processId/contentSlug"); return
        if "const slug = contentSlug || processId;" not in src:
            fail(name, "contentSlug does not default to processId for backward compatibility"); return
        if "find(s => s.id === processId)" not in src:
            fail(name, "subdomainInfo lookup does not match by the permanent id"); return
        if "deployPortalInProcess(portal.id, db, portal.name)" not in src:
            fail(name, "autoDeployLivePortals does not pass both the permanent id and the current name"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui42_toggle_and_delete_use_current_name_for_dns_not_permanent_id():
    name = "MSUI42 (static): toggling live and deleting a portal use its current public name for DNS/IIS fqdn, not its permanent id (so a rename sticks)"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        if "ensureDnsRecord(portal.name, portal.domain)" not in src:
            fail(name, "toggle-live does not create the DNS record under the portal's current name"); return
        if "ensureIisSite(targetId, `${portal.name}.${portal.domain}`, portal.port)" not in src:
            fail(name, "toggle-live does not rebind IIS to the portal's current name"); return
        if "deleteDnsRecord(deletedPortal.name, deletedPortal.domain)" not in src:
            fail(name, "portal delete does not clean up the DNS record under the portal's current name"); return
        if "checkDnsRecord(portal.name, portal.domain!)" not in src:
            fail(name, "refresh-dns does not check the portal's current name"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui43_backend_portal_rename_migrates_dns_and_iis_then_cascades_mappings():
    name = "MSUI43 (static): portal rename-subdomain stands up the new DNS/IIS, decommissions the old DNS, and re-maps every solution/collateral/project reference"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        idx = src.index('action === "rename-subdomain"')
        body = src[idx:idx + 4000]
        if "ensureDnsRecord(newName, domain)" not in body:
            fail(name, "does not create a DNS record for the new subdomain"); return
        if 'ensureIisSite(targetId, `${newName}.${domain}`, portal.port)' not in body:
            fail(name, "does not rebind the IIS site to the new subdomain when live"); return
        if "deleteDnsRecord(oldName, domain)" not in body:
            fail(name, "does not delete the old DNS record — the previous subdomain would keep resolving"); return
        new_idx = body.index("ensureIisSite(targetId")
        old_idx = body.index("deleteDnsRecord(oldName, domain)")
        if not (new_idx < old_idx):
            fail(name, "old subdomain is decommissioned before the new one is stood up"); return
        if "renameSlugRefs(db.solutions)" not in body or "renameSlugRefs(db.collaterals)" not in body:
            fail(name, "does not cascade-rename customerNames/customerName references on solutions/collaterals"); return
        if "renameSlugRefs(db.currentProjects)" not in body or "renameSlugRefs(db.upcomingProjects)" not in body:
            fail(name, "does not cascade-rename customerNames/customerName references on projects"); return
        if "portal.id = " in body:
            fail(name, "rename mutates the portal's permanent id — it must stay fixed (PM2/data dir/port depend on it)"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui44_portal_rename_rejects_dummy_portals_and_taken_slugs():
    name = "MSUI44 (static): portal rename-subdomain refuses dummy portals and slugs already in use"
    try:
        src = read_file("backend/routes/subdomains.routes.ts")
        idx = src.index('action === "rename-subdomain"')
        body = src[idx:idx + 4000]
        if "portal.isDummy" not in body:
            fail(name, "no guard against renaming a dummy (localhost-only) portal"); return
        if "already in use" not in body:
            fail(name, "no uniqueness check against other portals/deployed solutions"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui45_portal_settings_has_edit_subdomain_toggle():
    name = "MSUI45 (static): the Portal Settings popup has an Edit Subdomain field that toggles to an orange Save Changes button once changed"
    try:
        src = read_file("frontend/src/App.tsx")
        if "handleRenamePortalSubdomain" not in src:
            fail(name, "no handler for renaming the portal's subdomain"); return
        idx = src.index("const subdomainChanged = subdomainSlug.trim()")
        body = src[idx:idx + 2600]
        if '"Edit Subdomain"' not in body or '"Save Changes"' not in body:
            fail(name, "button does not toggle between Edit Subdomain and Save Changes labels"); return
        if "bg-orange-600" not in body:
            fail(name, "button does not switch to an orange changed style"); return
        if "!portalSettingsTarget.isDummy" not in src.split("const subdomainChanged")[0][-300:]:
            fail(name, "Edit Subdomain section is not gated off for dummy portals"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui46_portal_rename_posts_rename_subdomain_action_and_closes_on_success():
    name = "MSUI46 (static): saving a portal subdomain change posts the rename-subdomain action and closes the popup on success"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index("const handleRenamePortalSubdomain = async () => {")
        body = src[idx:idx + 900]
        if '"rename-subdomain"' not in body:
            fail(name, "does not call the rename-subdomain action"); return
        if "setPortalSettingsTarget(null)" not in body:
            fail(name, "popup does not close after a successful subdomain rename"); return
        if "showToast(" not in body:
            fail(name, "no success toast triggered after the rename"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui47_bottom_right_toast_shared_by_both_edit_subdomain_flows():
    name = "MSUI47 (static): a bottom-right toast is rendered in App.tsx and wired into both the portal and deployed-solution Edit Subdomain flows"
    try:
        app_src = read_file("frontend/src/App.tsx")
        if "fixed bottom-6 right-6" not in app_src:
            fail(name, "no bottom-right-positioned toast element"); return
        if "toastMessage &&" not in app_src:
            fail(name, "toast is not conditionally rendered from toastMessage state"); return
        if "onNotify={showToast}" not in app_src:
            fail(name, "showToast is not passed down to AdminOnboardSolutionPage"); return
        popup_src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        if "onNotify?.(\"Changes saved successfully\")" not in popup_src:
            fail(name, "deployed-solution subdomain save does not trigger the success toast"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui48_deployed_solution_subdomain_save_now_closes_popup():
    name = "MSUI48 (static): saving a deployed solution's subdomain change now closes the popup immediately (not just re-locking the field)"
    try:
        src = read_file("frontend/src/components/EditSolutionQuickPopup.tsx")
        idx = src.index("const handleSubdomainButtonClick = async () => {")
        body = src[idx:idx + 700]
        if 'onRefresh("rename-subdomain"' not in body:
            fail(name, "does not call the rename-subdomain action"); return
        if "onClose();" not in body:
            fail(name, "popup does not close after a successful subdomain save"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI49: Map Subdomain panel (public-IP reverse-proxy mapping) ────

def test_msui49_solution_type_tracks_mapped_external_url_and_hidden_flag():
    name = "MSUI49 (static): shared/types.ts Solution tracks mappedExternalUrl and hiddenFromRepository"
    try:
        src = read_file("shared/types.ts")
        if "mappedExternalUrl?: string;" not in src:
            fail(name, "Solution does not track mappedExternalUrl"); return
        if "hiddenFromRepository?: boolean;" not in src:
            fail(name, "Solution does not track hiddenFromRepository"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui50_iis_has_reverse_proxy_to_arbitrary_origin_helpers():
    name = "MSUI50 (static): iis/site.ts exports ensureMappedUrlIisSite/removeMappedUrlIisSite, distinct from the static-HTML site kind"
    try:
        src = read_file("backend/iis/site.ts")
        if "export async function ensureMappedUrlIisSite" not in src:
            fail(name, "no ensureMappedUrlIisSite export"); return
        if "export async function removeMappedUrlIisSite" not in src:
            fail(name, "no removeMappedUrlIisSite export"); return
        if 'const siteName = `mapurl-${slug}`;' not in src:
            fail(name, "mapped-URL sites are not distinctly named from html-*/portal-* sites"); return
        if "${targetOrigin}/{R:1}" not in src:
            fail(name, "reverse-proxy rule does not rewrite to the arbitrary target origin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui51_test_public_url_rejects_private_and_loopback_addresses():
    name = "MSUI51 (static): /test-public-url rejects localhost/private-range addresses before checking reachability"
    try:
        src = read_file("backend/routes/map-subdomain.routes.ts")
        if "function isPrivateOrLoopbackIp" not in src:
            fail(name, "no private/loopback IP guard"); return
        if 'hostname === "localhost"' not in src:
            fail(name, "does not explicitly reject the literal 'localhost' hostname"); return
        if "/^127\\./.test(ip)" not in src or "/^192\\.168\\./.test(ip)" not in src:
            fail(name, "private IPv4 ranges are not comprehensively checked"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui52_map_subdomain_route_creates_dns_iis_and_optional_solution():
    name = "MSUI52 (static): /map-subdomain creates the DNS record + reverse-proxy IIS site, and a Solution unless addToRepository is false"
    try:
        src = read_file("backend/routes/map-subdomain.routes.ts")
        idx = src.index('router.post("/map-subdomain"')
        body = src[idx:idx + 3000]
        if "ensureDnsRecord(cleanSlug, domain)" not in body:
            fail(name, "does not create a DNS record"); return
        if "ensureMappedUrlIisSite(cleanSlug, fqdn, targetOrigin)" not in body:
            fail(name, "does not create the reverse-proxy IIS site"); return
        if "hiddenFromRepository: !addToRepository" not in body:
            fail(name, "created solution does not respect the addToRepository flag"); return
        if "mappedExternalUrl: targetOrigin" not in body:
            fail(name, "created solution is not tagged with mappedExternalUrl"); return
        if 'customerNames: [],' not in body:
            fail(name, "mapped solution is not left unmapped (Hub Repository) by default"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui53_map_subdomain_rejects_taken_slugs_and_mounted_in_server():
    name = "MSUI53 (static): /map-subdomain rejects an already-used subdomain, and the router is mounted under /api/admin"
    try:
        src = read_file("backend/routes/map-subdomain.routes.ts")
        if "already in use" not in src:
            fail(name, "no uniqueness check against existing portals/deployed solutions"); return
        server_src = read_file("backend/server.ts")
        if 'import mapSubdomainRouter from "./routes/map-subdomain.routes";' not in server_src:
            fail(name, "map-subdomain router is not imported in server.ts"); return
        if 'app.use("/api/admin", mapSubdomainRouter);' not in server_src:
            fail(name, "map-subdomain router is not mounted under /api/admin"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui54_cascade_delete_and_rename_branch_on_mapped_external_url():
    name = "MSUI54 (static): deleting or renaming a mapped-URL solution's subdomain uses the reverse-proxy IIS helpers, not the static-HTML ones"
    try:
        cascade_src = read_file("backend/utils/solutionCascade.ts")
        if "target.mappedExternalUrl" not in cascade_src:
            fail(name, "solutionCascade does not branch on mappedExternalUrl"); return
        if "removeMappedUrlIisSite(target.deployedSlug)" not in cascade_src:
            fail(name, "cascade delete does not remove the reverse-proxy IIS site for mapped-URL solutions"); return
        content_src = read_file("backend/routes/content.routes.ts")
        if "target.mappedExternalUrl" not in content_src:
            fail(name, "rename-subdomain does not branch on mappedExternalUrl"); return
        if "ensureMappedUrlIisSite(cleanSlug, newFqdn, target.mappedExternalUrl)" not in content_src:
            fail(name, "rename-subdomain does not rebind the reverse-proxy IIS site for mapped-URL solutions"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui55_repository_table_excludes_hidden_from_repository_solutions():
    name = "MSUI55 (static): the Solution Repository table/counts exclude solutions with hiddenFromRepository set"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if "const repositorySolutions = solutions.filter((s) => !s.hiddenFromRepository);" not in src:
            fail(name, "repositorySolutions does not filter out hiddenFromRepository solutions"); return
        idx = src.index("const totalCount = repositorySolutions.length;")
        body = src[idx:idx + 400]
        if "repositorySolutions.filter((s) => !!s.deployedSlug).length" not in body:
            fail(name, "deployedCount is not computed from the filtered repository list"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui56_onboard_card_renamed_and_popup_has_two_panels():
    name = "MSUI56 (static): the onboard card is renamed to 'Map/Onboard Solution' and its popup has a Map Subdomain panel alongside the onboarding form"
    try:
        src = read_file("frontend/src/components/AdminOnboardSolutionPage.tsx")
        if "Map/Onboard Solution</h4>" not in src:
            fail(name, "card title was not renamed to 'Map/Onboard Solution'"); return
        if "import { MapSubdomainPanel }" not in src:
            fail(name, "AdminOnboardSolutionPage.tsx does not import MapSubdomainPanel"); return
        idx = src.index('max-w-7xl max-h-[88vh]')
        body = src[idx:idx + 700]
        if "<MapSubdomainPanel" not in body:
            fail(name, "MapSubdomainPanel is not rendered inside the onboard popup"); return
        if "<AdminSolutions" not in body:
            fail(name, "the onboarding form is not still rendered alongside the Map Subdomain panel"); return
        if "grid grid-cols-1 md:grid-cols-2" not in src:
            fail(name, "popup is not laid out as two side-by-side panels"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui57_map_subdomain_panel_locks_subdomain_until_url_tests_public():
    name = "MSUI57 (static): MapSubdomainPanel's subdomain field stays disabled until the URL test reports public, and shows green/red outline"
    try:
        src = read_file("frontend/src/components/MapSubdomainPanel.tsx")
        if "disabled={testState !== \"public\"}" not in src:
            fail(name, "subdomain field is not gated on the URL test passing"); return
        if "border-emerald-500" not in src or "border-red-500" not in src:
            fail(name, "URL field does not show a green/red outline based on the test result"); return
        if "setTestState(\"idle\")" not in src:
            fail(name, "changing the URL after a test does not invalidate the previous result"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui58_map_subdomain_panel_has_repository_checkbox_ticked_by_default():
    name = "MSUI58 (static): the 'Map to solution repository' checkbox defaults to ticked and is sent as addToRepository"
    try:
        src = read_file("frontend/src/components/MapSubdomainPanel.tsx")
        if "useState(true)" not in src:
            fail(name, "addToRepository state does not default to true"); return
        if "Map to solution repository" not in src:
            fail(name, "no 'Map to solution repository' checkbox label"); return
        if "addToRepository," not in src:
            fail(name, "addToRepository is not sent in the map-subdomain request body"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI59: day-scoped session cache; MSUI61: bottom footer removed ──

def test_msui59_login_writes_a_calendar_day_stamp():
    name = "MSUI59 (static): AccessWall.tsx stamps mobius_login_date on successful login"
    try:
        src = read_file("frontend/src/components/AccessWall.tsx")
        idx = src.index('localStorage.setItem("mobius_work_email", data.email);')
        body = src[idx:idx + 300]
        if 'localStorage.setItem("mobius_login_date", new Date().toDateString());' not in body:
            fail(name, "login success does not stamp mobius_login_date"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui60_stale_cached_session_from_a_previous_day_is_not_restored():
    name = "MSUI60 (static): App.tsx only restores the cached session if mobius_login_date matches today, and clears it otherwise"
    try:
        src = read_file("frontend/src/App.tsx")
        idx = src.index('const cached = localStorage.getItem("mobius_work_email");')
        body = src[idx:idx + 900]
        if 'const today = new Date().toDateString();' not in body:
            fail(name, "no calendar-day comparison against today"); return
        if "if (cached && cachedLoginDate === today)" not in body:
            fail(name, "session restore is not gated on matching today's login date"); return
        if 'localStorage.removeItem("mobius_login_date")' not in body:
            fail(name, "stale (previous-day) cached session is not cleared, so it would linger unused"); return
        signout_idx = src.index("const handleSignOut = async () => {")
        signout_body = src[signout_idx:signout_idx + 500]
        if 'localStorage.removeItem("mobius_login_date")' not in signout_body:
            fail(name, "sign out does not clear mobius_login_date"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui61_bottom_visual_footer_removed_from_hub():
    name = "MSUI61 (static): the bottom 'Host instance / System Active' footer bar is removed from App.tsx"
    try:
        src = read_file("frontend/src/App.tsx")
        if "Host instance:" in src:
            fail(name, "footer's 'Host instance:' text is still present"); return
        if "Gemini AI Engine Connected" in src:
            fail(name, "footer's 'Gemini AI Engine Connected' text is still present"); return
        if "Visual Footer" in src:
            fail(name, "Visual Footer block/comment is still present"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI62: customer-portal login proxies to the hub ─────────────────

def test_msui62_portal_login_proxy_uses_admin_token_and_hub_port():
    name = "MSUI62 (static): portal-server.ts's /api/login proxy authenticates itself to the hub with ADMIN_TOKEN over loopback"
    try:
        src = read_file("backend/portal-server.ts")
        idx = src.index('app.post("/api/login"')
        body = src[idx:idx + 2000]
        if 'hostname: "127.0.0.1"' not in body:
            fail(name, "login proxy does not target the hub over loopback"); return
        if '"X-Admin-Token": ADMIN_TOKEN' not in body:
            fail(name, "login proxy does not authenticate with ADMIN_TOKEN"); return
        if 'path: "/api/internal/verify-credentials"' not in body:
            fail(name, "login proxy does not call the hub's internal verify-credentials endpoint"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui63_internal_verify_credentials_double_guarded():
    name = "MSUI63 (static): /api/internal/verify-credentials is double-guarded (loopback IP AND ADMIN_TOKEN), same as /api/reload"
    try:
        src = read_file("backend/routes/auth.routes.ts")
        idx = src.index('router.post("/api/internal/verify-credentials"')
        body = src[idx:idx + 500]
        if 'remote === "127.0.0.1"' not in body:
            fail(name, "no loopback IP check"); return
        if 'req.headers["x-admin-token"] !== effectiveAdminToken' not in body:
            fail(name, "no ADMIN_TOKEN check"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui64_portal_server_no_longer_relies_on_local_users_replica():
    name = "MSUI64 (static): portal-server.ts no longer fetches/merges a separate users.json — the hub is now the single source of truth for login"
    try:
        src = read_file("backend/portal-server.ts")
        if "/users.json" in src:
            fail(name, "portal-server.ts still fetches the separate users.json replica"); return
        if "portalData.users" in src or "portalData?.users" in src:
            fail(name, "portal-server.ts still reads a locally-replicated users list"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI65: import password from Mobius/TechMobius ───────────────────

def test_msui65_external_import_carries_password_prefill():
    name = "MSUI65 (static): importing a solution from Mobius/TechMobius now populates passwordPrefill instead of hardcoding it empty"
    try:
        src = read_file("backend/routes/external-portals.routes.ts")
        if 'passwordPrefill: "",' in src:
            fail(name, "passwordPrefill is still hardcoded empty on import"); return
        if 'pick(s, ["default_password"' not in src:
            fail(name, "passwordPrefill is not resolved via the pick() fallback-candidate helper"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ── Feature — MSUI66: collateral thumbnails use type icons, not letters ────────

def test_msui66_pattern_thumbnail_supports_kind_icon():
    name = "MSUI66 (static): PatternThumbnail renders a type icon (video/document/deck/webpage) instead of a letter when a kind is given"
    try:
        src = read_file("frontend/src/components/PatternThumbnail.tsx")
        if "KIND_ICONS" not in src:
            fail(name, "no KIND_ICONS icon map"); return
        for icon in ["Video", "FileText", "Presentation", "Globe"]:
            if icon not in src:
                fail(name, f"missing icon import/usage: {icon}"); return
        if "kind?: CollateralFilterType" not in src:
            fail(name, "PatternThumbnail does not accept an optional kind prop"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui67_safe_image_forwards_kind_to_pattern_thumbnail():
    name = "MSUI67 (static): SafeImage accepts and forwards the kind prop to PatternThumbnail"
    try:
        src = read_file("frontend/src/components/SafeImage.tsx")
        if "kind?: CollateralFilterType" not in src:
            fail(name, "SafeImage does not accept a kind prop"); return
        if "<PatternThumbnail title={title} kind={kind} />" not in src:
            fail(name, "SafeImage does not forward kind to PatternThumbnail"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_msui68_collateral_thumbnails_pass_classified_kind_not_solutions():
    name = "MSUI68 (static): collateral SafeImage call sites pass a classified kind; solution thumbnails are untouched (still letter-based)"
    try:
        app_src = read_file("frontend/src/App.tsx")
        idx = app_src.index("src={col.thumbnail}")
        body = app_src[idx:idx + 400]
        if "kind={classifyCollateralType(col)}" not in body:
            fail(name, "collateral tile SafeImage does not pass a classified kind"); return
        # A solution thumbnail call site must NOT have a kind prop
        sol_idx = app_src.index("src={sol.thumbnail}")
        sol_body = app_src[sol_idx:sol_idx + 400]
        if "kind=" in sol_body:
            fail(name, "a solution thumbnail unexpectedly passes a kind prop"); return
        admin_src = read_file("frontend/src/components/AdminCollaterals.tsx")
        if "kind={classifyCollateralType(coll)}" not in admin_src:
            fail(name, "AdminCollaterals.tsx thumbnail does not pass a classified kind"); return
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
    test_auth_modal_is_single_column_with_no_demo_credentials_panel,
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
    test_portal_server_proxies_login_to_hub,
    test_hub_internal_verify_credentials_uses_bcrypt_aware_check,
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
    # Feature — HUBREPO: onboarding always saves unmapped to the Hub Repository
    test_hubrepo4_submit_no_longer_defaults_customer_name_to_all,
    test_hubrepo8_map_badge_no_longer_defaults_to_all,
    # Feature — MSUI: Portal Domains landing page, Onboard/Map Solutions split
    test_msui1_portal_domains_is_default_landing_tab,
    test_msui2_nav_has_onboard_and_map_solutions_tabs,
    test_msui3_map_solutions_page_has_no_onboard_deploy_buttons_or_filter_bar,
    test_msui4_map_solutions_portal_rows_have_clickable_name_and_map_button,
    test_msui5_view_popup_close_button_right_of_map_solution,
    test_msui6_view_popup_two_column_grid_with_hide_edit_delete,
    test_msui7_onboard_page_has_two_themed_cards,
    test_msui8_popups_use_shared_layoutid_for_seamless_animation,
    test_msui9_deploy_subdomain_optional_frontend,
    test_msui10_deploy_subdomain_optional_backend,
    test_msui11_popups_are_landscape_with_internal_scroll,
    test_msui12_deploy_solution_defaults_to_no_checkbox_ticked,
    test_msui13_deploy_backend_allows_empty_target_portals,
    test_msui14_map_solution_popup_shows_only_the_solution_repository,
    test_msui15_import_from_portal_panel_fully_removed,
    test_msui16_portal_row_has_external_link_opening_in_new_tab,
    test_msui17_search_bar_and_portal_checkbox_filter_left_of_refresh,
    test_msui18_view_popup_shares_layoutid_with_its_row_for_seamless_transition,
    test_msui19_onboard_deploy_cards_are_shorter,
    test_msui20_solution_repository_section_below_cards,
    test_msui21_repository_update_button_syncs_from_both_portals,
    test_msui22_external_import_empty_customer_names_means_unmapped_not_all,
    test_msui23_map_solution_popup_has_checkbox_column_and_is_larger,
    test_msui24_map_solution_popup_preticks_already_mapped_solutions,
    test_msui25_map_selected_syncs_both_additions_and_removals,
    test_msui26_onboard_form_has_no_step1_or_import_section,
    test_msui27_new_solutions_always_land_unmapped,
    test_msui28_editing_still_preserves_existing_mapping_silently,
    test_msui29_repository_row_has_edit_button,
    test_msui30_quick_edit_popup_has_title_url_thumbnail_only,
    test_msui31_quick_edit_locks_url_for_deployed_solutions,
    test_msui32_quick_edit_submits_minimal_partial_payload,
    test_msui33_repository_edit_button_renamed_to_modify_no_icon,
    test_msui34_quick_edit_has_delete_solution_button_opposite_apply,
    test_msui35_delete_warns_about_unassigning_subdomain_when_deployed,
    test_msui36_edit_subdomain_button_toggles_to_save_changes,
    test_msui37_backend_rename_subdomain_decommissions_old_subdomain_first_creates_new,
    test_msui38_repo_filter_widget_left_of_update_with_three_segments,
    test_msui39_repo_filter_defaults_to_total_and_actually_filters_rows,
    test_msui40_repo_filter_segments_share_layoutid_for_seamless_slide,
    test_msui41_deploy_in_process_decouples_process_id_from_content_slug,
    test_msui42_toggle_and_delete_use_current_name_for_dns_not_permanent_id,
    test_msui43_backend_portal_rename_migrates_dns_and_iis_then_cascades_mappings,
    test_msui44_portal_rename_rejects_dummy_portals_and_taken_slugs,
    test_msui45_portal_settings_has_edit_subdomain_toggle,
    test_msui46_portal_rename_posts_rename_subdomain_action_and_closes_on_success,
    test_msui47_bottom_right_toast_shared_by_both_edit_subdomain_flows,
    test_msui48_deployed_solution_subdomain_save_now_closes_popup,
    test_msui49_solution_type_tracks_mapped_external_url_and_hidden_flag,
    test_msui50_iis_has_reverse_proxy_to_arbitrary_origin_helpers,
    test_msui51_test_public_url_rejects_private_and_loopback_addresses,
    test_msui52_map_subdomain_route_creates_dns_iis_and_optional_solution,
    test_msui53_map_subdomain_rejects_taken_slugs_and_mounted_in_server,
    test_msui54_cascade_delete_and_rename_branch_on_mapped_external_url,
    test_msui55_repository_table_excludes_hidden_from_repository_solutions,
    test_msui56_onboard_card_renamed_and_popup_has_two_panels,
    test_msui57_map_subdomain_panel_locks_subdomain_until_url_tests_public,
    test_msui58_map_subdomain_panel_has_repository_checkbox_ticked_by_default,
    test_msui59_login_writes_a_calendar_day_stamp,
    test_msui60_stale_cached_session_from_a_previous_day_is_not_restored,
    test_msui61_bottom_visual_footer_removed_from_hub,
    test_msui62_portal_login_proxy_uses_admin_token_and_hub_port,
    test_msui63_internal_verify_credentials_double_guarded,
    test_msui64_portal_server_no_longer_relies_on_local_users_replica,
    test_msui65_external_import_carries_password_prefill,
    test_msui66_pattern_thumbnail_supports_kind_icon,
    test_msui67_safe_image_forwards_kind_to_pattern_thumbnail,
    test_msui68_collateral_thumbnails_pass_classified_kind_not_solutions,
    test_msui69_external_import_matches_existing_solution_by_source_not_title,
    test_msui70_external_import_deploys_updates_to_mapped_live_portals,
    test_msui71_solution_and_collateral_types_track_import_source,
    test_msui72_upload_storage_mode_is_configurable,
    test_msui73_uploads_module_switches_backend_and_falls_back_on_read,
    test_msui74_upload_and_import_routes_use_the_switchable_storage_module,
    test_msui75_external_import_captures_solution_description_separately_from_credentials_note,
    test_msui76_verified_node_ingress_replaced_with_solutions_search,
    test_msui77_solution_search_does_not_affect_collateral_grouping,
    test_msui78_solution_card_shows_collateral_icons_with_hover_view_button,
    test_msui79_view_collaterals_scrolls_to_and_highlights_the_solutions_row,
    test_msui80_no_featured_external_new_badges_on_solution_cards,
    test_msui81_login_rate_limit_raised_to_50_on_hub_and_portals,
    test_msui82_solution_card_thumbnail_and_description_sized_to_match_reference,
    test_msui83_access_wall_has_abstract_orange_white_background,
    test_msui84_access_wall_props_and_call_sites_no_longer_carry_removed_solutions_data,
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
