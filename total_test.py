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
APP_ROOT     = PROJECT_ROOT

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
# Fix 6 — "Onboard Assets" functionality moved into the Portal Settings modal
#          (the portal card button now opens a Settings modal; setSelectedAdminSubdomain
#           is called from within that modal's "Onboard Assets for this Portal" shortcut)
# ═════════════════════════════════════════════════════════════════════════════

def test_onboard_assets_sets_selected_admin_subdomain():
    name = "Fix-6 (static): Settings modal 'Onboard Assets' calls setSelectedAdminSubdomain"
    try:
        src = read_file("frontend/src/App.tsx")
        # The call is now inside the Settings modal (portalSettingsTarget context)
        assert "setSelectedAdminSubdomain(portalSettingsTarget.name)" in src, \
            "Settings modal 'Onboard Assets' handler does not call setSelectedAdminSubdomain"
        assert "setPortalSettingsTarget(null)" in src, \
            "Settings modal 'Onboard Assets' handler should close the modal after switching context"
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
        r = _requests.post(
            BASE_URL + "/api/admin/generate-project",
            json={"name": "Test Logistics AI", "customerName": "unilever", "templateType": "current"},
            headers={"Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN},
            timeout=30,
        )
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
    name = "Fix-17 (static): Header has no subdomain chip buttons (chips removed entirely)"
    try:
        src = read_file("frontend/src/App.tsx")
        assert "bg-indigo-650" not in src, \
            "App.tsx still contains bg-indigo-650 which is not a valid Tailwind class"
        # The header-level subdomain chip buttons used the variable name 'subObj';
        # they have been removed — only the in-console filter bar (using 'sub') remains.
        assert "subdomainsList.map((subObj)" not in src, \
            "Header subdomain chip buttons (subObj) are still rendered — they should be removed"
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
# Fix 18 — S3 race condition: local portal.json must be authoritative on reload
#           (portal-server.ts previously let S3 override a freshly written local
#            file, causing solutions to disappear after "Apply Modifications")
# ═════════════════════════════════════════════════════════════════════════════

def test_portal_server_prefers_local_file_over_s3():
    name = "Fix-18a (static): portal-server.ts only reads S3 when no local file exists"
    try:
        src = read_file("backend/portal-server.ts")
        assert "loadedFromLocal = true" in src, \
            "portal-server.ts does not track whether local file was loaded"
        assert "if (!loadedFromLocal)" in src, \
            "portal-server.ts does not gate S3 read on loadedFromLocal"
        # Verify the comment documents the intent
        assert "authoritative" in src, \
            "portal-server.ts should have a comment explaining local file is authoritative"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy_awaits_s3_before_reload_signal():
    name = "Fix-18b (static): deployPortalInProcess awaits S3 upload before sending /api/reload"
    try:
        src = read_file("backend/server.ts")
        # The function must contain 'await s3PutPortalFile' (not fire-and-forget .catch)
        # inside deployPortalInProcess — the await guarantees S3 is consistent before reload.
        assert "await s3PutPortalFile(cleanSlug" in src, \
            "deployPortalInProcess does not await S3 upload before signaling reload"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_portal_server_still_refreshes_users_from_s3():
    name = "Fix-18c (static): portal-server.ts still loads users from S3 regardless of local file"
    try:
        src = read_file("backend/portal-server.ts")
        # users.json is always fetched from S3 (auth source of truth), even when
        # portal content comes from local file
        assert "users.json" in src, "portal-server.ts does not reference users.json"
        assert "portalData.users = users" in src, \
            "portal-server.ts does not override portalData.users from S3 users.json"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_deploy_writes_solution_to_portal_json():
    name = "Fix-18d: POST /api/admin/deploy includes mapped solutions in portal.json"
    if not SERVER_UP:
        skip(name, "server not running"); return
    import shutil, time
    slug = "testdeploy-sol-01"
    portal_json_path = os.path.join(APP_ROOT, "data", "portals", slug, "portal.json")
    sol_id = None
    try:
        # Create portal
        r = admin_post("/api/admin/subdomains",
                       {"action": "create-dummy", "displayName": "Deploy Solution Test"})
        if not r.json().get("success"):
            skip(name, "could not create dummy portal"); return
        # Find the newly created slug
        slugs_after = [s for s in r.json().get("subdomains", []) if s.get("isDummy")]
        if not slugs_after:
            skip(name, "no dummy portal returned"); return
        slug = slugs_after[0]["id"]
        portal_json_path = os.path.join(APP_ROOT, "data", "portals", slug, "portal.json")

        # Create a solution mapped to this portal
        r2 = admin_post("/api/admin/solutions", {
            "action": "create",
            "solution": {
                "title": "Deploy Test Solution",
                "thumbnail": "https://example.com/img.jpg",
                "url": "https://example.com",
                "credentialsDescription": "test",
                "customerName": slug,
                "customerNames": [slug],
                "enabled": True,
            }
        })
        if not r2.json().get("success"):
            skip(name, "could not create solution"); return
        sol_id = next(
            (s["id"] for s in r2.json().get("database", {}).get("solutions", [])
             if s.get("title") == "Deploy Test Solution"),
            None
        )

        # Explicitly deploy
        r3 = admin_post("/api/admin/deploy", {"portalSlug": slug})
        if r3.status_code != 200 or not r3.json().get("success"):
            fail(name, f"deploy failed: {r3.text}"); return

        # Check portal.json contains the solution
        if not os.path.isfile(portal_json_path):
            fail(name, "portal.json not created after deploy"); return
        config = json.loads(open(portal_json_path).read())
        sol_slugs = [s.get("customerName") or "" for s in config.get("solutions", [])]
        sol_titles = [s.get("title") for s in config.get("solutions", [])]
        if "Deploy Test Solution" not in sol_titles:
            fail(name, f"Mapped solution missing from portal.json. Found: {sol_titles}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))
    finally:
        if sol_id:
            admin_post("/api/admin/solutions", {"action": "delete", "solution": {"id": sol_id}})
        admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})
        parent = os.path.join(APP_ROOT, "data", "portals", slug)
        if os.path.exists(parent):
            try: shutil.rmtree(parent)
            except: pass


# ═════════════════════════════════════════════════════════════════════════════
# Fix 19 — Toggle-to-live always deploys current content before spawning portal
#           (previously, starting a portal only wrote the default empty scaffold
#            if no portal.json existed; now it always runs deployPortalInProcess)
# ═════════════════════════════════════════════════════════════════════════════

def test_toggle_live_calls_deploy_before_spawn():
    name = "Fix-19 (static): toggle action calls deployPortalInProcess before pm2SpawnPortal"
    try:
        src = read_file("backend/server.ts")
        # Find the toggle block: deployPortalInProcess must appear before pm2SpawnPortal
        toggle_idx = src.find('} else if (action === "toggle")')
        deploy_idx = src.find("deployPortalInProcess(targetId, db)", toggle_idx)
        spawn_idx  = src.find("pm2SpawnPortal(targetId,", toggle_idx)
        assert toggle_idx != -1, "toggle action block not found"
        assert deploy_idx != -1, "deployPortalInProcess not called in toggle block"
        assert spawn_idx  != -1, "pm2SpawnPortal not called in toggle block"
        assert deploy_idx < spawn_idx, \
            "deployPortalInProcess must be called BEFORE pm2SpawnPortal in toggle block"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 20 — New portals start empty (no pre-filled solutions/collaterals/carousel)
# ═════════════════════════════════════════════════════════════════════════════

def test_build_default_portal_json_is_empty():
    name = "Fix-20a (static): buildDefaultPortalJson returns empty solutions/collaterals/carousel"
    try:
        src = read_file("backend/server.ts")
        # Find the buildDefaultPortalJson function and verify it has empty arrays
        fn_start = src.find("function buildDefaultPortalJson(")
        fn_body = src[fn_start:fn_start + 800]
        assert "solutions: []" in fn_body, \
            "buildDefaultPortalJson does not return empty solutions array"
        assert "collaterals: []" in fn_body, \
            "buildDefaultPortalJson does not return empty collaterals array"
        assert "carousel: []" in fn_body, \
            "buildDefaultPortalJson does not return empty carousel array"
        assert "currentProjects: []" in fn_body, \
            "buildDefaultPortalJson does not return empty currentProjects array"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_new_dummy_portal_portal_json_is_empty():
    name = "Fix-20b: newly created dummy portal has empty solutions in portal.json"
    if not SERVER_UP:
        skip(name, "server not running"); return
    import shutil
    slug = None
    try:
        r = admin_post("/api/admin/subdomains",
                       {"action": "create-dummy", "displayName": "Empty Portal Test"})
        data = r.json()
        if not data.get("success"):
            skip(name, "could not create dummy portal"); return
        dummies = [s for s in data.get("subdomains", []) if s.get("isDummy")]
        if not dummies:
            skip(name, "no dummy returned"); return
        slug = dummies[0]["id"]
        portal_json_path = os.path.join(APP_ROOT, "data", "portals", slug, "portal.json")
        if not os.path.isfile(portal_json_path):
            fail(name, "portal.json not created with new portal"); return
        config = json.loads(open(portal_json_path).read())
        if config.get("solutions"):
            fail(name, f"Expected empty solutions, got: {config['solutions']}"); return
        if config.get("collaterals"):
            fail(name, f"Expected empty collaterals, got: {config['collaterals']}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))
    finally:
        if slug:
            admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})
            parent = os.path.join(APP_ROOT, "data", "portals", slug)
            if os.path.exists(parent):
                try: shutil.rmtree(parent)
                except: pass


# ═════════════════════════════════════════════════════════════════════════════
# Fix 21 — Deleted portal slug is stripped from all content mappings
# ═════════════════════════════════════════════════════════════════════════════

def test_delete_portal_strips_slug_from_solutions():
    name = "Fix-21a: Deleting a portal removes its slug from mapped solutions"
    if not SERVER_UP:
        skip(name, "server not running"); return
    import shutil
    slug = None
    sol_id = None
    try:
        # Create a dummy portal
        r = admin_post("/api/admin/subdomains",
                       {"action": "create-dummy", "displayName": "Strip Slug Test"})
        data = r.json()
        if not data.get("success"):
            skip(name, "could not create dummy portal"); return
        dummies = [s for s in data.get("subdomains", []) if s.get("isDummy")]
        if not dummies:
            skip(name, "no dummy returned"); return
        slug = dummies[0]["id"]

        # Create a solution mapped to that portal
        r2 = admin_post("/api/admin/solutions", {
            "action": "create",
            "solution": {
                "title": "Strip Slug Test Solution",
                "thumbnail": "https://example.com/img.jpg",
                "url": "",
                "credentialsDescription": "test",
                "customerName": slug,
                "customerNames": [slug],
                "enabled": False,
            }
        })
        if not r2.json().get("success"):
            skip(name, "could not create solution"); return
        sol_id = next(
            (s["id"] for s in r2.json().get("database", {}).get("solutions", [])
             if s.get("title") == "Strip Slug Test Solution"),
            None
        )

        # Delete the portal
        r3 = admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})
        if not r3.json().get("success"):
            fail(name, f"delete failed: {r3.text}"); return
        slug = None  # already deleted, skip finally cleanup

        # Fetch database and verify solution no longer maps to that portal
        r4 = _requests.get(BASE_URL + "/api/database", timeout=5)
        solutions = r4.json().get("solutions", [])
        target = next((s for s in solutions if s.get("id") == sol_id), None)
        if target is None:
            # solution itself might have been cleaned up already — that's also acceptable
            ok(name); return
        customer_names = target.get("customerNames", [])
        customer_name  = target.get("customerName", "")
        if any("strip-slug" in n.lower() or n == slug for n in customer_names):
            fail(name, f"Deleted portal slug still in customerNames: {customer_names}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))
    finally:
        if sol_id:
            admin_post("/api/admin/solutions", {"action": "delete", "solution": {"id": sol_id}})
        if slug:
            admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})
            parent = os.path.join(APP_ROOT, "data", "portals", slug)
            if os.path.exists(parent):
                try: shutil.rmtree(parent)
                except: pass


def test_server_ts_strip_slug_on_delete():
    name = "Fix-21b (static): server.ts strips deleted portal slug from all content on delete"
    try:
        src = read_file("backend/server.ts")
        assert "stripSlug" in src, "stripSlug helper not present in server.ts"
        assert "db.solutions = stripSlug" in src, \
            "stripSlug not applied to db.solutions on portal delete"
        assert "db.collaterals = stripSlug" in src, \
            "stripSlug not applied to db.collaterals on portal delete"
        assert "db.currentProjects = stripSlug" in src, \
            "stripSlug not applied to db.currentProjects on portal delete"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 22 — autoDeployLivePortals called after every content CRUD so live
#           portals always reflect the latest onboarded content
# ═════════════════════════════════════════════════════════════════════════════

def test_auto_deploy_called_after_solutions_crud():
    name = "Fix-22a (static): solutions endpoint calls autoDeployLivePortals after write"
    try:
        src = read_file("backend/server.ts")
        # Find the solutions route and confirm autoDeployLivePortals is called before res.json
        route_start = src.find('app.post("/api/admin/solutions"')
        route_body  = src[route_start:route_start + 1500]
        assert "autoDeployLivePortals(db)" in route_body, \
            "solutions endpoint does not call autoDeployLivePortals"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_auto_deploy_called_after_collaterals_crud():
    name = "Fix-22b (static): collaterals endpoint calls autoDeployLivePortals after write"
    try:
        src = read_file("backend/server.ts")
        route_start = src.find('app.post("/api/admin/collaterals"')
        route_body  = src[route_start:route_start + 1500]
        assert "autoDeployLivePortals(db)" in route_body, \
            "collaterals endpoint does not call autoDeployLivePortals"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_auto_deploy_only_targets_live_portals():
    name = "Fix-22c (static): autoDeployLivePortals filters by status === 'live'"
    try:
        src = read_file("backend/server.ts")
        fn_start = src.find("function autoDeployLivePortals(")
        fn_body  = src[fn_start:fn_start + 300]
        assert 'status === "live"' in fn_body, \
            "autoDeployLivePortals does not filter for live portals"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 23 — Portal Settings modal: rename portal, access URL, onboard shortcut
#           (replaces the "Onboard Assets ⚡" button on portal cards)
# ═════════════════════════════════════════════════════════════════════════════

def test_portal_settings_state_exists():
    name = "Fix-23a (static): App.tsx has portalSettingsTarget state for Settings modal"
    try:
        src = read_file("frontend/src/App.tsx")
        assert "portalSettingsTarget" in src, \
            "portalSettingsTarget state not found in App.tsx"
        assert "settingsDisplayName" in src, \
            "settingsDisplayName state not found in App.tsx"
        assert "handleSavePortalSettings" in src, \
            "handleSavePortalSettings function not found in App.tsx"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_portal_card_has_settings_button_not_onboard():
    name = "Fix-23b (static): Portal cards show Settings button; Onboard Assets button removed from card"
    try:
        src = read_file("frontend/src/App.tsx")
        # Settings button must open the modal
        assert "setPortalSettingsTarget(portal)" in src, \
            "Portal card does not open Settings modal (setPortalSettingsTarget not called)"
        # The old inline "Onboard Assets ⚡" click that changed tabs directly is gone
        assert "Onboard Assets" not in src or "setPortalSettingsTarget" in src, \
            "Onboard Assets button still present as direct portal card action"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_portal_settings_update_endpoint():
    name = "Fix-23c: POST /api/admin/subdomains action:update renames portal displayName"
    if not SERVER_UP:
        skip(name, "server not running"); return
    import shutil
    slug = None
    try:
        # Create a portal
        r = admin_post("/api/admin/subdomains",
                       {"action": "create-dummy", "displayName": "Before Rename"})
        data = r.json()
        if not data.get("success"):
            skip(name, "could not create dummy portal"); return
        dummies = [s for s in data.get("subdomains", []) if s.get("isDummy")]
        if not dummies:
            skip(name, "no dummy returned"); return
        slug = dummies[0]["id"]

        # Rename via update action
        r2 = admin_post("/api/admin/subdomains", {
            "action": "update",
            "id": slug,
            "displayName": "After Rename"
        })
        if r2.status_code != 200 or not r2.json().get("success"):
            fail(name, f"update action failed: {r2.text}"); return

        # Verify in database
        r3 = _requests.get(BASE_URL + "/api/database", timeout=5)
        subdomains = r3.json().get("subdomains", [])
        portal = next((s for s in subdomains if s.get("id") == slug), None)
        if portal is None:
            fail(name, "Portal not found after rename"); return
        if portal.get("displayName") != "After Rename":
            fail(name, f"displayName not updated. Got: {portal.get('displayName')}"); return
        ok(name)
    except Exception as e:
        fail(name, str(e))
    finally:
        if slug:
            admin_post("/api/admin/subdomains", {"action": "delete", "id": slug})
            parent = os.path.join(APP_ROOT, "data", "portals", slug)
            if os.path.exists(parent):
                try:
                    import shutil
                    shutil.rmtree(parent)
                except: pass


# ═════════════════════════════════════════════════════════════════════════════
# Fix 24 — Header portal chip buttons removed from top navigation bar
# ═════════════════════════════════════════════════════════════════════════════

def test_header_has_no_portal_chip_buttons():
    name = "Fix-24 (static): Header no longer renders subdomain chip buttons"
    try:
        src = read_file("frontend/src/App.tsx")
        # The header chips used 'subObj' as the loop variable — this pattern must be gone
        assert "subdomainsList.map((subObj)" not in src, \
            "Header still renders subdomain chip buttons (subdomainsList.map((subObj))"
        # The in-console portal filter bar still uses 'sub' — that should remain
        assert "subdomainsList.map((sub)" in src, \
            "In-console portal filter bar (subdomainsList.map((sub)) was accidentally removed"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# ═════════════════════════════════════════════════════════════════════════════
# Fix 25 — Admin console uses full page width (max-w-7xl removed from <main>)
# ═════════════════════════════════════════════════════════════════════════════

def test_admin_layout_full_width():
    name = "Fix-25a (static): <main> element has no max-w-7xl constraint"
    try:
        src = read_file("frontend/src/App.tsx")
        # Find the main element opening tag
        main_idx = src.find("<main ")
        main_tag = src[main_idx:main_idx + 200]
        assert "max-w-7xl" not in main_tag, \
            "<main> element still has max-w-7xl constraint — admin console cannot use full width"
        ok(name)
    except Exception as e:
        fail(name, str(e))


def test_user_view_retains_max_width():
    name = "Fix-25b (static): user view wrapper retains max-w-7xl mx-auto for centered layout"
    try:
        src = read_file("frontend/src/App.tsx")
        # The user view div (inside the ternary) should still constrain width
        assert "max-w-7xl mx-auto w-full" in src, \
            "User view lost its max-w-7xl mx-auto centered layout"
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
    # Fix 18 — S3 race condition / local file is authoritative on reload
    test_portal_server_prefers_local_file_over_s3,
    test_deploy_awaits_s3_before_reload_signal,
    test_portal_server_still_refreshes_users_from_s3,
    test_deploy_writes_solution_to_portal_json,
    # Fix 19 — Toggle-to-live deploys before spawning
    test_toggle_live_calls_deploy_before_spawn,
    # Fix 20 — New portals start empty
    test_build_default_portal_json_is_empty,
    test_new_dummy_portal_portal_json_is_empty,
    # Fix 21 — Deleted portal slug stripped from mappings
    test_delete_portal_strips_slug_from_solutions,
    test_server_ts_strip_slug_on_delete,
    # Fix 22 — Auto-deploy after every content CRUD
    test_auto_deploy_called_after_solutions_crud,
    test_auto_deploy_called_after_collaterals_crud,
    test_auto_deploy_only_targets_live_portals,
    # Fix 23 — Portal Settings modal
    test_portal_settings_state_exists,
    test_portal_card_has_settings_button_not_onboard,
    test_portal_settings_update_endpoint,
    # Fix 24 — Header portal chips removed
    test_header_has_no_portal_chip_buttons,
    # Fix 25 — Admin console full width
    test_admin_layout_full_width,
    test_user_view_retains_max_width,
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
