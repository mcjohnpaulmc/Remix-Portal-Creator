/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Compass, 
  Briefcase, 
  Settings, 
  LogOut, 
  Lock, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  CheckCircle2, 
  Server, 
  ShieldCheck, 
  Terminal, 
  SlidersHorizontal,
  Info,
  Globe,
  Database,
  Search,
  BookOpen,
  X,
  Sparkles,
  Trash2,
  Check,
  FileUp,
  Image,
  Play,
  Film,
  FileText,
  Presentation,
  Eye,
  EyeOff,
  Copy,
  Key,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Solution, Collateral, UserLog, AppState, CurrentProject, UpcomingProject, CarouselItem, SubdomainPortal, PortalUser } from "../../shared/types";

// Import API helpers
import { adminFetch } from "./api/client";

// Import custom parts
import { AccessWall } from "./components/AccessWall";
import { SafeImage } from "./components/SafeImage";
import { SolutionLaunchModal } from "./components/SolutionLaunchModal";
import { CollateralDetailModal } from "./components/CollateralDetailModal";
import { AdminSolutions } from "./components/AdminSolutions";
import { AdminCollaterals } from "./components/AdminCollaterals";
import { AdminLogs } from "./components/AdminLogs";
import { AdminProjects } from "./components/AdminProjects";
import { CurrentProjectsDashboard } from "./components/CurrentProjectsDashboard";
import { UpcomingProjectsDashboard } from "./components/UpcomingProjectsDashboard";
import { HeroCarousel } from "./components/HeroCarousel";
import { AdminUsers } from "./components/AdminUsers";

export default function App() {
  // Global API states
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [collaterals, setCollaterals] = useState<Collateral[]>([]);
  const [currentProjects, setCurrentProjects] = useState<CurrentProject[]>([]);
  const [upcomingProjects, setUpcomingProjects] = useState<UpcomingProject[]>([]);
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [heroText, setHeroText] = useState("");
  const [heroPrompt, setHeroPrompt] = useState("");
  const [logo, setLogo] = useState("");
  const [carousel, setCarousel] = useState<CarouselItem[]>([]);
  const [editCarousel, setEditCarousel] = useState<CarouselItem[]>([]);

  const [selectedAdminSubdomain, setSelectedAdminSubdomain] = useState<string>("all");

  useEffect(() => {
    if (carousel) {
      const subSlides = carousel.filter((item) => item.customerName === selectedAdminSubdomain);
      if (subSlides.length > 0) {
        setEditCarousel(subSlides);
      } else {
        setEditCarousel([
          {
            id: `car-${selectedAdminSubdomain}-1`,
            title: `Logistics & Telemetry Platform: ${selectedAdminSubdomain.toUpperCase()}`,
            description: `Bespoke, hyperlocal warehousing telemetry designed specifically for ${selectedAdminSubdomain} workflows.`,
            imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800",
            linkType: "none",
            linkTarget: ""
          },
          {
            id: `car-${selectedAdminSubdomain}-2`,
            title: `${selectedAdminSubdomain.toUpperCase()} Grounding Research Study`,
            description: "Explore how we streamlined logistics and reduced overheads dynamically.",
            imageUrl: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=800",
            linkType: "none",
            linkTarget: ""
          },
          {
            id: `car-${selectedAdminSubdomain}-3`,
            title: `${selectedAdminSubdomain.toUpperCase()} Active Deliverables`,
            description: "Assess critical SLA turnaround times and live delivery tracking.",
            imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800",
            linkType: "none",
            linkTarget: ""
          }
        ]);
      }
    }
  }, [carousel, selectedAdminSubdomain]);

  const [subdomain, setSubdomain] = useState("unilever");
  const [subdomainsList, setSubdomainsList] = useState<SubdomainPortal[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [prefilledSubdomain, setPrefilledSubdomain] = useState<string | null>(null);
  const [newSubdomainSlug, setNewSubdomainSlug] = useState("");
  const [newSubdomainDisplayName, setNewSubdomainDisplayName] = useState("");
  const [showDummyForm, setShowDummyForm] = useState(false);
  const [dummyPortalName, setDummyPortalName] = useState("");
  const [creatingDummy, setCreatingDummy] = useState(false);
  const [startingPortals, setStartingPortals] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // true = this is the Hub (has admin console); false = customer portal instance (read-only)
  const [isHub, setIsHub] = useState(true);

  // Authentication/Identity states
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authNeededItem, setAuthNeededItem] = useState<{ type: "sol" | "col"; id: string } | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Layout navigation states
  const [currentTab, setCurrentTab] = useState<"solutions" | "collaterals" | "currentProjects" | "upcomingProjects" >("solutions");
  const [viewMode, setViewMode] = useState<"user" | "admin">("user"); // user, admin
  const [adminActiveTab, setAdminActiveTab] = useState<"solutions" | "collaterals" | "projects" | "hero" | "subdomain" | "branding" | "users" | "logs">("solutions");

  // Selection modal items
  const [selectedSolution, setSelectedSolution] = useState<Solution | null>(null);
  const [selectedCollateral, setSelectedCollateral] = useState<Collateral | null>(null);

  // Filter lists down to those enabled for standard user views
  const visibleSolutions = solutions.filter((sol) => sol.enabled !== false);
  const visibleCollaterals = collaterals
    .filter((col) => col.enabled !== false)
    .filter((col) => subdomain === "all" || !col.customerName || col.customerName === "all" || col.customerName.toLowerCase() === subdomain.toLowerCase());
  const visibleCurrentProjects = currentProjects
    .filter((proj) => proj.enabled !== false)
    .filter((proj) => subdomain === "all" || proj.customerName.toLowerCase() === subdomain.toLowerCase());
  const visibleUpcomingProjects = upcomingProjects
    .filter((proj) => proj.enabled !== false)
    .filter((proj) => subdomain === "all" || proj.customerName.toLowerCase() === subdomain.toLowerCase());

  // Solution card credentials states
  const [cardExpandedCreds, setCardExpandedCreds] = useState<Record<string, boolean>>({});
  const [cardUnmaskedCreds, setCardUnmaskedCreds] = useState<Record<string, boolean>>({});
  const [copiedCardUser, setCopiedCardUser] = useState<Record<string, boolean>>({});
  const [copiedCardPass, setCopiedCardPass] = useState<Record<string, boolean>>({});

  const handleCopyCardCred = (text: string, solId: string, type: "user" | "pass") => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        if (type === "user") {
          setCopiedCardUser((prev) => ({ ...prev, [solId]: true }));
          setTimeout(() => setCopiedCardUser((prev) => ({ ...prev, [solId]: false })), 2000);
        } else {
          setCopiedCardPass((prev) => ({ ...prev, [solId]: true }));
          setTimeout(() => setCopiedCardPass((prev) => ({ ...prev, [solId]: false })), 2000);
        }
      })
      .catch(() => {
        try {
          const el = document.createElement("textarea");
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
          if (type === "user") {
            setCopiedCardUser((prev) => ({ ...prev, [solId]: true }));
            setTimeout(() => setCopiedCardUser((prev) => ({ ...prev, [solId]: false })), 2000);
          } else {
            setCopiedCardPass((prev) => ({ ...prev, [solId]: true }));
            setTimeout(() => setCopiedCardPass((prev) => ({ ...prev, [solId]: false })), 2000);
          }
        } catch (e) {
          // Silent fallback
        }
      });
  };

  // Admin Customizer states
  const [adminHeroPrompt, setAdminHeroPrompt] = useState("");
  const [adminSubdomainInput, setAdminSubdomainInput] = useState("");
  const [updatingHero, setUpdatingHero] = useState(false);
  const [updatingSubdomain, setUpdatingSubdomain] = useState(false);
  const [simulatedLaunchStatus, setSimulatedLaunchStatus] = useState<"idle" | "launching" | "ready">("idle");

  // Fetch initial portal configuration from the database endpoints
  const fetchPortalData = async () => {
    try {
      // Detect hub vs customer portal
      const infoRes = await fetch("/api/portal-info").then(r => r.json()).catch(() => ({ isHub: true }));
      const hubMode = infoRes.isHub !== false;
      setIsHub(hubMode);
      if (!hubMode) {
        // Lock to user mode on customer portal instances — admin console not available
        setViewMode("user");
      }

      const res = await fetch("/api/database");
      const data = await res.json();
      setSolutions(data.solutions || []);
      setCollaterals(data.collaterals || []);
      setSubdomainsList(data.subdomains || []);
      setCurrentProjects(data.currentProjects || []);
      setUpcomingProjects(data.upcomingProjects || []);
      setLogs(data.userLogs || []);
      setHeroText(data.heroText || "");
      setHeroPrompt(data.heroPrompt || "");
      setLogo(data.logo || "");
      setCarousel(data.carousel || []);
      setSubdomain(data.subdomain || "unilever");
      setPortalUsers(data.users || []);
      setAdminHeroPrompt(data.heroPrompt || "");
      setAdminSubdomainInput(data.subdomain || "unilever");
    } catch (err) {
      console.error("Failed to load initial portal data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check path or hash dynamically for initial administrative routing & path triggers
    const handleUrlChange = () => {
      if (
        window.location.pathname === "/admin" ||
        window.location.hash === "#/admin" ||
        window.location.hash === "#admin"
      ) {
        setViewMode("admin");
      } else {
        setViewMode("user");
      }
    };

    window.addEventListener("hashchange", handleUrlChange);
    window.addEventListener("popstate", handleUrlChange);
    handleUrlChange();

    // Restore session from localStorage
    const cached = localStorage.getItem("mobius_work_email");
    if (cached) {
      setUserEmail(cached);
      setUserName(localStorage.getItem("mobius_user_name") || null);
      setUserRole(localStorage.getItem("mobius_user_role") || null);
    }

    fetchPortalData();

    return () => {
      window.removeEventListener("hashchange", handleUrlChange);
      window.removeEventListener("popstate", handleUrlChange);
    };
  }, []);

  // Close auth overlays on Escape key
  useEffect(() => {
    if (!authNeededItem && !showLoginModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAuthNeededItem(null);
        setShowLoginModal(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authNeededItem, showLoginModal]);

  // Post dynamic analytic page-view logs directly to server
  const logUserAction = async (action: string, details: string) => {
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, action, details, subdomain }),
      });
      // Fetch fresh dataset update without blocking
      const res = await fetch("/api/database");
      const data = await res.json();
      setLogs(data.userLogs || []);
    } catch (err) {
      console.warn("Telemetry log could not reach endpoint:", err);
    }
  };

  // Log on user identity authentication
  const handleAuthSuccess = (email: string, name?: string, role?: string) => {
    setUserEmail(email);
    setUserName(name || null);
    setUserRole(role || null);
    setShowLoginModal(false);
    logUserAction("User Login", `User "${name || email}" authenticated successfully.`);
    
    // Resume opening previously blocked resource
    if (authNeededItem) {
      if (authNeededItem.type === "sol") {
        const solObj = solutions.find(s => s.id === authNeededItem.id);
        if (solObj) {
          triggerSolutionRedirect(solObj);
        }
      } else {
        const colObj = collaterals.find(c => c.id === authNeededItem.id);
        if (colObj) {
          setSelectedCollateral(colObj);
          logUserAction("View Collateral Report", `Accessed dynamic case report for: ${colObj.title}`);
        }
      }
      setAuthNeededItem(null);
    }
  };

  // Sign out
  const handleSignOut = () => {
    localStorage.removeItem("mobius_work_email");
    localStorage.removeItem("mobius_user_name");
    localStorage.removeItem("mobius_user_role");
    localStorage.removeItem("mobius_admin_token");
    setUserEmail(null);
    setUserName(null);
    setUserRole(null);
    logUserAction("Portal Logout", "User logged out of core portal dashboard.");
  };

  const triggerSolutionRedirect = (sol: Solution) => {
    if (sol.url) {
      window.open(sol.url, "_blank", "noopener,noreferrer");
    }
    logUserAction("Redirect to Solution", `Opened solution portal: ${sol.title}`);
  };

  // Handle Clicking on Solution Tiles
  const handleSolutionClick = (sol: Solution) => {
    if (!userEmail) {
      setAuthNeededItem({ type: "sol", id: sol.id });
      return;
    }
    triggerSolutionRedirect(sol);
  };

  // Handle Clicking on Collateral Tiles
  const handleCollateralClick = (col: Collateral) => {
    if (!userEmail) {
      setAuthNeededItem({ type: "col", id: col.id });
      return;
    }
    if (col.googleDriveUrl) {
      window.open(col.googleDriveUrl, "_blank");
      logUserAction("Open Google Drive Asset", `Opened Google Drive URL link for collateral: ${col.title}`);
    } else {
      setSelectedCollateral(col);
      logUserAction("View Collateral Report", `Accessed dynamic case report for: ${col.title}`);
    }
  };

  // Onboarder/AI updater callback for Solutions & Collaterals
  const handleAdminDatabaseUpdate = async (endpoint: "solutions" | "collaterals", action: string, data: any) => {
    try {
      const res = await adminFetch(`/api/admin/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ action, [endpoint === "solutions" ? "solution" : "collateral"]: data })
      });
      const resData = await res.json();
      if (resData.success) {
        await fetchPortalData();
      } else {
        alert("Encountered failure during database persistence updates.");
      }
    } catch (err) {
      console.error("Administrative update failed:", err);
    }
  };

  // Admin updater callback for Current Projects
  const handleAdminCurrentProjectUpdate = async (action: string, data: any) => {
    try {
      const res = await adminFetch("/api/admin/projects/current", {
        method: "POST",
        body: JSON.stringify({ action, project: data })
      });
      const resData = await res.json();
      if (resData.success) {
        await fetchPortalData();
      } else {
        alert("Encountered failure updating core projects datastore.");
      }
    } catch (err) {
      console.error("Administrative project update failed:", err);
    }
  };

  // Admin updater callback for Upcoming Opportunities
  const handleAdminUpcomingProjectUpdate = async (action: string, data: any) => {
    try {
      const res = await adminFetch("/api/admin/projects/upcoming", {
        method: "POST",
        body: JSON.stringify({ action, project: data })
      });
      const resData = await res.json();
      if (resData.success) {
        await fetchPortalData();
      } else {
        alert("Encountered failure updating core proposal datastore.");
      }
    } catch (err) {
      console.error("Administrative proposal update failed:", err);
    }
  };

  // Regenerate Hero Marketing Block via Gemini
  const handleRegenerateHero = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingHero(true);
    try {
      const res = await adminFetch("/api/admin/generate-hero", {
        method: "POST",
        body: JSON.stringify({ prompt: adminHeroPrompt })
      });
      const data = await res.json();
      if (res.ok) {
        setHeroText(data.heroText);
        setLogs(data.database.userLogs || []);
      } else {
        alert(data.error || "Failed to update hero.");
      }
    } catch (err) {
      alert("Error regenerating main marketing text block.");
    } finally {
      setUpdatingHero(false);
    }
  };

  // Create or Delete dynamic subdomains
  const handleManageSubdomains = async (action: "create" | "delete", subdomainName: string, displayName?: string) => {
    try {
      const res = await adminFetch("/api/admin/subdomains", {
        method: "POST",
        body: JSON.stringify({ action, subdomain: subdomainName, displayName })
      });
      const resData = await res.json();
      if (resData.success) {
        await fetchPortalData();
        if (action === "create") {
          setNewSubdomainSlug("");
          setNewSubdomainDisplayName("");
        }
      } else {
        alert(resData.error || "Persistence mismatch handling portal list.");
      }
    } catch (err) {
      console.error("Management error for customer portals:", err);
    }
  };

  const handleCreateDummy = async () => {
    setCreatingDummy(true);
    try {
      const res = await adminFetch("/api/admin/subdomains", {
        method: "POST",
        body: JSON.stringify({ action: "create-dummy", displayName: dummyPortalName || "New Portal" }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPortalData();
        setDummyPortalName("");
        setShowDummyForm(false);
      } else {
        alert(data.error || "Failed to create dummy portal.");
      }
    } catch {
      alert("Server error creating dummy portal.");
    } finally {
      setCreatingDummy(false);
    }
  };

  const handleTogglePortal = async (portalId: string, targetStatus: "live" | "sleep", port?: number) => {
    if (targetStatus === "live" && port) {
      setStartingPortals(prev => new Set(prev).add(portalId));
    }
    try {
      const res = await adminFetch("/api/admin/subdomains", {
        method: "POST",
        body: JSON.stringify({ action: "toggle", id: portalId, targetStatus }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPortalData();
        // Poll the portal port until it responds (up to 20s)
        if (targetStatus === "live" && port) {
          const url = `http://${window.location.hostname}:${port}/api/portal-info`;
          const deadline = Date.now() + 20000;
          const poll = async () => {
            try {
              const r = await fetch(url);
              if (r.ok) { setStartingPortals(prev => { const s = new Set(prev); s.delete(portalId); return s; }); return; }
            } catch {}
            if (Date.now() < deadline) setTimeout(poll, 1500);
            else setStartingPortals(prev => { const s = new Set(prev); s.delete(portalId); return s; });
          };
          setTimeout(poll, 1500);
        }
      } else {
        setStartingPortals(prev => { const s = new Set(prev); s.delete(portalId); return s; });
        alert(data.error || "Failed to toggle portal status.");
      }
    } catch {
      setStartingPortals(prev => { const s = new Set(prev); s.delete(portalId); return s; });
      alert("Server error toggling portal status.");
    }
  };

  const [refreshingDns, setRefreshingDns] = useState(false);
  const handleRefreshDns = async () => {
    setRefreshingDns(true);
    try {
      const res = await adminFetch("/api/admin/refresh-dns", { method: "POST" });
      const data = await res.json();
      if (data.success) await fetchPortalData();
      else alert(data.error || "DNS refresh failed.");
    } catch {
      alert("Server error during DNS refresh.");
    } finally {
      setRefreshingDns(false);
    }
  };

  // Update subdomain
  const handleUpdateSubdomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSubdomain(true);
    try {
      const res = await adminFetch("/api/admin/subdomain", {
        method: "POST",
        body: JSON.stringify({ subdomain: adminSubdomainInput })
      });
      const data = await res.json();
      if (res.ok) {
        setSubdomain(data.subdomain);
        setLogs(data.database.userLogs || []);
        alert(`Host subdomain pointing set to: ${data.subdomain}.mobiusservices.io`);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Error defining routing subdomains.");
    } finally {
      setUpdatingSubdomain(false);
    }
  };

  // Deploy portal — writes config snapshot to data/portals/<slug>/portal.json and pings reload
  const [deployingPortals, setDeployingPortals] = useState<Set<string>>(new Set());
  const [heroPublishDone, setHeroPublishDone] = useState(false);

  // Portal Settings modal
  const [portalSettingsTarget, setPortalSettingsTarget] = useState<SubdomainPortal | null>(null);
  const [settingsDisplayName, setSettingsDisplayName] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSavePortalSettings = async () => {
    if (!portalSettingsTarget) return;
    setSettingsSaving(true);
    setSettingsSaved(false);
    try {
      const res = await adminFetch("/api/admin/subdomains", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          id: portalSettingsTarget.id,
          displayName: settingsDisplayName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPortalData();
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      } else {
        alert(data.error || "Failed to save portal settings.");
      }
    } catch {
      alert("Server error saving portal settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDeployPortal = async (portalSlug: string) => {
    if (!portalSlug || portalSlug === "all") return;
    setDeployingPortals(prev => new Set(prev).add(portalSlug));
    logUserAction("Portal Deploy Requested", `Deploying portal: ${portalSlug}`);
    try {
      const res = await adminFetch("/api/admin/deploy", {
        method: "POST",
        body: JSON.stringify({ portalSlug }),
      });
      const data = await res.json();
      if (data.success) {
        logUserAction("Portal Deployed", `Config snapshot written for ${portalSlug}`);
      } else {
        alert(data.error || "Deploy failed.");
      }
    } catch (err) {
      console.error("Deploy error:", err);
      alert("Server error during deploy.");
    } finally {
      setDeployingPortals(prev => { const s = new Set(prev); s.delete(portalSlug); return s; });
    }
  };

  // Legacy: deploy using global subdomain state (kept for backward compat with any remaining callers)
  const handleSimulatedDeploymentLaunch = () => handleDeployPortal(subdomain);

  // Helper parser to render hero description cleanly (converts markdown headers/paragraphs to elegant elements)
  const renderHeroText = (text: string) => {
    if (!text) return null;
    const lines = text.trim().split("\n");
    const h2Lines = lines.filter(l => l.startsWith("##"));
    const otherLines = lines.filter(l => !l.startsWith("##"));

    const titleStr = h2Lines.length > 0 ? h2Lines[0].replace("##", "").trim() : "Mobius Solutions & Catalog Portal";
    const bodyStr = otherLines.join("\n").trim();

    return (
      <div className="space-y-3 relative z-10 text-left">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">
          {titleStr}
        </h2>
        <p className="text-orange-100 opacity-90 leading-relaxed text-xs md:text-sm max-w-2xl">
          {bodyStr}
        </p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <svg className="animate-spin h-8 w-8 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="font-mono text-xs text-slate-400">Loading Mobius Services Catalog...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 text-slate-900 relative">
      {/* Visual background gradient accents */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-slate-100 rounded-full blur-3xl pointer-events-none opacity-50 z-0" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-orange-50 rounded-full blur-3xl pointer-events-none opacity-40 z-0" />

      {/* Corporate Header */}
      <header className="sticky top-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-40 backdrop-blur-md">
        <div className="flex items-center gap-3 select-none">
          {logo ? (
            <img 
              src={logo} 
              alt="Mobius Knowledge Services Logo" 
              className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 shadow-xs shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <img src="/Logo.png" alt="Mobius Logo" className="w-10 h-10 rounded-lg object-contain shrink-0" />
          )}
          <div>
            <h1 className="font-bold text-base md:text-lg tracking-tight text-slate-855">
              Mobius <span className="text-orange-600 font-bold">Knowledge Services</span>
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 mt-0.5 select-none text-left">
              <span className="text-[10px] font-mono text-slate-400 leading-none">
                Portal: <strong className="text-orange-600 font-mono">{subdomain}</strong>.mobiusservices.io
              </span>
            </div>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-4">
          {/* Identity details */}
          {userEmail ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-xs font-semibold text-slate-800">{userName || userEmail.split("@")[0]}</span>
                <span className="text-[10px] text-slate-400 font-mono">{userEmail}</span>
              </div>
              <div className="h-8 w-8 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center text-xs font-bold text-orange-700 uppercase shrink-0 select-none">
                {(userName || userEmail).charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all cursor-pointer"
                title="Log off"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Log off</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold rounded-lg transition-all shadow-xs cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              Login
            </button>
          )}

          {/* Discreet Admin Toggle — only shown on the Hub, never on customer portals */}
          {isHub && viewMode === "admin" && (
            <button
              onClick={() => {
                setViewMode("user");
                if (window.location.pathname === "/admin") {
                  window.history.pushState(null, "", "/");
                }
                window.location.hash = "";
              }}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Compass className="h-3.5 w-3.5 text-slate-400" />
              Exit Admin Console
            </button>
          )}
        </div>
      </header>

      {/* Header Login modal */}
      <AnimatePresence>
        {showLoginModal && !userEmail && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-3xl"
            >
              <AccessWall
                onSuccess={handleAuthSuccess}
                onClose={() => setShowLoginModal(false)}
                solutions={solutions}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Authentication Block overlay — opened when user tries to access a gated resource */}
      <AnimatePresence>
        {authNeededItem && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-3xl"
            >
              <AccessWall
                onSuccess={handleAuthSuccess}
                onClose={() => setAuthNeededItem(null)}
                solutions={solutions}
                targetSolutionId={authNeededItem && authNeededItem.type === "sol" ? authNeededItem.id : null}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Core Layout */}
      <main className="flex-1 w-full relative z-10 flex flex-col">

        {viewMode === "user" ? (
          // ============================== PUBLIC VISITOR VIEW ==============================
          <div className="max-w-7xl mx-auto w-full px-6 py-10 space-y-6 flex-1 flex flex-col justify-between">
            {/* Spotlight Carousel */}
            <div className="w-full shrink-0">
              <HeroCarousel
                items={
                  carousel.filter((item) => item.customerName === subdomain).length > 0
                    ? carousel.filter((item) => item.customerName === subdomain)
                    : carousel.filter((item) => !item.customerName)
                }
                onLink={(type, target) => {
                  if (type === "subdomain") {
                    setSubdomain(target);
                  } else if (type === "solution") {
                    const sol = solutions.find((s) => s.id === target);
                    if (sol) {
                      if (sol.url) {
                        window.open(sol.url, "_blank");
                      } else {
                        setSelectedSolution(sol);
                      }
                    } else {
                      alert(`Solution '${target}' was not located on this client portal.`);
                    }
                  } else if (type === "collateral") {
                    const col = collaterals.find((c) => c.id === target);
                    if (col) {
                      setSelectedCollateral(col);
                    } else {
                      alert(`Grounding case study '${target}' was not found.`);
                    }
                  } else if (type === "project-current") {
                    const proj = currentProjects.find((p) => p.id === target);
                    if (proj) {
                      setSubdomain(proj.customerName);
                      setCurrentTab("currentProjects");
                    } else {
                      alert(`Active engagement for '${target}' was not found.`);
                    }
                  } else if (type === "project-upcoming") {
                    const proj = upcomingProjects.find((p) => p.id === target);
                    if (proj) {
                      setSubdomain(proj.customerName);
                      setCurrentTab("upcomingProjects");
                    } else {
                      alert(`Upcoming proposal for '${target}' was not found.`);
                    }
                  }
                }}
              />
            </div>

            {/* Menu tab selection */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-3 mt-6 gap-3">
              <nav className="flex flex-wrap gap-1 items-center bg-slate-100 border border-slate-200/50 p-1 rounded-xl md:rounded-full self-start shadow-2xs">
                <button
                  type="button"
                  onClick={() => setCurrentTab("solutions")}
                  className={`px-4 py-1.5 rounded-lg md:rounded-full text-xs font-semibold tracking-tight transition-all duration-200 ${
                    currentTab === "solutions"
                      ? "bg-white text-orange-700 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Solutions Hub
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab("collaterals")}
                  className={`px-4 py-1.5 rounded-lg md:rounded-full text-xs font-semibold tracking-tight transition-all duration-200 ${
                    currentTab === "collaterals"
                      ? "bg-white text-orange-700 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Collaterals Catalogue
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab("currentProjects")}
                  className={`px-4 py-1.5 rounded-lg md:rounded-full text-xs font-semibold tracking-tight transition-all duration-200 ${
                    currentTab === "currentProjects"
                      ? "bg-white text-orange-700 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Active Engagements
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab("upcomingProjects")}
                  className={`px-4 py-1.5 rounded-lg md:rounded-full text-xs font-semibold tracking-tight transition-all duration-200 ${
                    currentTab === "upcomingProjects"
                      ? "bg-white text-orange-700 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Upcoming Opportunities
                </button>
              </nav>

              <span className="hidden md:inline-flex items-center text-[10px] uppercase tracking-wider font-mono text-slate-400 gap-1.5 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Verified Node Ingress
              </span>
            </div>             {/* Grid Container */}
            <div className="flex-1 pt-4 text-left">
              <AnimatePresence mode="wait">
                {currentTab === "solutions" ? (
                  // Solutions Catalogue Grid
                  <motion.div
                    key="solutions-grid"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  >
                    {visibleSolutions.map((sol) => (
                      <div
                        key={sol.id}
                        id={`sol-card-${sol.id}`}
                        onClick={() => handleSolutionClick(sol)}
                        className="group bg-white rounded-xl border border-slate-200 p-5 flex flex-col hover:border-orange-400 transition-all cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 duration-205 justify-between"
                      >
                        {/* Visual Image */}
                        <div className="w-full h-32 bg-slate-50 rounded-lg mb-4 overflow-hidden border border-slate-150 relative shrink-0">
                          <SafeImage
                            src={sol.thumbnail}
                            alt={sol.title}
                            title={sol.title}
                            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                          />
                          <div className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm px-2 py-0.5 rounded-sm text-[8px] text-white font-mono uppercase tracking-widest font-semibold select-none">
                            Active App
                          </div>
                        </div>

                        {/* Text and meta values */}
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="space-y-2">
                            <h3 className="font-bold text-slate-800 text-sm tracking-tight leading-snug group-hover:text-orange-600 transition-colors">
                              {sol.title}
                            </h3>
                            <p className="text-[10px] text-slate-450 font-mono truncate leading-none">
                              {sol.url ? `Target: ${sol.url}` : "No URL configured"}
                            </p>
                            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                              {sol.credentialsDescription || "Gated enterprise intelligence hub."}
                            </p>

                            {/* Card Credentials Panel */}
                            {(sol.usernamePrefill || sol.passwordPrefill) && (
                              <div onClick={(e) => e.stopPropagation()} className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardExpandedCreds(prev => ({ ...prev, [sol.id]: !prev[sol.id] }));
                                  }}
                                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-50 hover:bg-orange-50/50 rounded-lg text-[10.5px] font-bold text-orange-700 transition-colors border border-slate-200 cursor-pointer select-none"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Key className="h-3 w-3 text-orange-505" />
                                    {cardExpandedCreds[sol.id] ? "Hide Credentials" : "Show Credentials"}
                                  </span>
                                  {cardExpandedCreds[sol.id] ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-orange-500" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                                  )}
                                </button>
                                
                                {cardExpandedCreds[sol.id] && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-2 bg-orange-50/40 p-2.5 rounded-lg border border-orange-100/50 text-left space-y-2 select-text"
                                  >
                                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                                      {/* Username */}
                                      <div className="bg-white p-1.5 rounded border border-slate-100 flex items-center justify-between min-w-0">
                                        <div className="truncate flex-1">
                                          <span className="text-[8px] font-semibold text-slate-400 uppercase block leading-none">User</span>
                                          <span className="font-mono text-slate-800 truncate font-semibold block mt-0.5">
                                            {sol.usernamePrefill || "Not set"}
                                          </span>
                                        </div>
                                        <button
                                          onClick={() => handleCopyCardCred(sol.usernamePrefill || "", sol.id, "user")}
                                          disabled={!sol.usernamePrefill}
                                          className={`p-1 rounded shrink-0 transition-colors cursor-pointer ml-1 ${
                                            copiedCardUser[sol.id] ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                          }`}
                                          title="Copy Username"
                                        >
                                          {copiedCardUser[sol.id] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                        </button>
                                      </div>

                                      {/* Password */}
                                      <div className="bg-white p-1.5 rounded border border-slate-100 flex items-center justify-between min-w-0">
                                        <div className="truncate flex-1">
                                          <span className="text-[8px] font-semibold text-slate-400 uppercase block leading-none">Pass</span>
                                          <span className="font-mono text-slate-800 truncate font-semibold block mt-0.5">
                                            {sol.passwordPrefill || "Not set"}
                                          </span>
                                        </div>
                                        <button
                                          onClick={() => handleCopyCardCred(sol.passwordPrefill || "", sol.id, "pass")}
                                          disabled={!sol.passwordPrefill}
                                          className={`p-1 rounded shrink-0 transition-colors cursor-pointer ml-1 ${
                                            copiedCardPass[sol.id] ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                          }`}
                                          title="Copy Password"
                                        >
                                          {copiedCardPass[sol.id] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-sm uppercase tracking-wide">
                              Solution
                            </span>
                            <button className="text-xs font-bold text-slate-650 flex items-center gap-1 group-hover:text-orange-600 transition-colors">
                              Open App 
                              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {visibleSolutions.length === 0 && (
                      <div className="md:col-span-3 text-center p-12 bg-white rounded-xl border border-dashed border-slate-350 shadow-2xs">
                        <Compass className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <h4 className="font-bold text-slate-700 text-sm">No solutions onboarded</h4>
                        <p className="text-slate-400 text-xs mt-1">Visit the administrator dashboard to build out the app catalog.</p>
                      </div>
                    )}
                  </motion.div>
                ) : currentTab === "collaterals" ? (
                  // Collateral Research Grid grouped by dynamic document category tag/flag
                  <motion.div
                    key="collaterals-grid"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="space-y-6 text-left"
                  >
                    {(() => {
                      // Extract unique dynamic categories based on tag/flag of visible collaterals
                      const categories = Array.from(
                        new Set(visibleCollaterals.map((col) => (col.tag || "case study").toLowerCase().trim()))
                      ) as string[];

                      categories.sort((a, b) => {
                        if (a === "case study") return -1;
                        if (b === "case study") return 1;
                        return a.localeCompare(b);
                      });

                      if (visibleCollaterals.length === 0) {
                        return (
                          <div className="text-center p-12 bg-white rounded-xl border border-dashed border-slate-350 shadow-2xs w-full">
                            <Compass className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                            <h4 className="font-bold text-slate-700 text-sm">No collaterals compiled</h4>
                            <p className="text-slate-400 text-xs mt-1">Visit the administrator dashboard to index custom documents for this subdomain workspace.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                          {categories.map((cat) => {
                            const items = visibleCollaterals.filter(
                              (col) => (col.tag || "case study").toLowerCase().trim() === cat
                            );

                            const catLabel = cat.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

                            // Determine dynamic section icons based on the document category/flag
                            let catIcon = <BookOpen className="h-5 w-5 text-orange-500" />;
                            if (cat.includes("study")) {
                              catIcon = <BookOpen className="h-5 w-5 text-orange-500" />;
                            } else if (cat.includes("doc") || cat.includes("brief") || cat.includes("report") || cat.includes("paper")) {
                              catIcon = <FileText className="h-5 w-5 text-emerald-500" />;
                            } else if (cat.includes("video") || cat.includes("demo") || cat.includes("walkthrough") || cat.includes("play")) {
                              catIcon = <Film className="h-5 w-5 text-amber-500" />;
                            } else if (cat.includes("sheet") || cat.includes("xlsx") || cat.includes("model") || cat.includes("data")) {
                              catIcon = <Database className="h-5 w-5 text-sky-500" />;
                            } else {
                              catIcon = <Briefcase className="h-5 w-5 text-slate-500" />;
                            }

                            // Determine dynamic descriptions for the section headers
                            let catDesc = "Assorted customer-facing materials and structured deployment assets.";
                            if (cat.includes("study")) {
                              catDesc = "In-depth case evaluations, architectural patterns, and business KPIs.";
                            } else if (cat.includes("doc")) {
                              catDesc = "Enterprise draft briefs, scope summaries, and compliance specifications.";
                            } else if (cat.includes("video") || cat.includes("play")) {
                              catDesc = "Interactive screen demos, product walks, and interface guides.";
                            } else if (cat.includes("sheet") || cat.includes("model")) {
                              catDesc = "Calculators, telemetry history trackers, and budget sheets.";
                            }

                            return (
                              <div key={cat} className="space-y-4 text-left bg-slate-50/50 p-4.5 rounded-2xl border border-slate-200">
                                {/* Section Header */}
                                <div className="border-b border-slate-105 pb-3 flex items-center justify-between">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="p-2 bg-white border border-slate-150 rounded-xl shrink-0">
                                      {catIcon}
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="font-display font-bold text-xs text-slate-900 uppercase tracking-widest truncate">
                                        {catLabel}
                                      </h3>
                                      <p className="text-[10px] text-slate-400 leading-snug line-clamp-1">
                                        {catDesc}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold bg-white border border-slate-205 text-orange-700 px-2 py-0.5 rounded-md select-none shrink-0 shadow-3xs">
                                    {items.length}
                                  </span>
                                </div>

                                {/* Stack list inside this column */}
                                <div className="space-y-4">
                                  {items.map((col) => {
                                    return (
                                      <div
                                        key={col.id}
                                        onClick={() => handleCollateralClick(col)}
                                        className="group bg-white rounded-xl border border-slate-200 p-4 flex flex-col hover:border-orange-400 transition-all cursor-pointer shadow-3xs hover:shadow-md hover:-translate-y-0.5 duration-205 justify-between gap-3"
                                      >
                                        {/* Thumbnail image */}
                                        <div className="w-full h-28 bg-slate-50 rounded-lg overflow-hidden border border-slate-150 relative shrink-0">
                                          <SafeImage
                                            src={col.thumbnail}
                                            alt={col.title}
                                            title={col.title}
                                            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                                          />
                                          <div className="absolute top-2 right-2 bg-slate-900/65 backdrop-blur-xs px-2.5 py-0.5 rounded text-[8px] text-white font-mono uppercase tracking-widest font-bold select-none">
                                            {col.fileType || "doc"}
                                          </div>
                                        </div>

                                        {/* Title details */}
                                        <div className="flex-1 flex flex-col justify-between">
                                          <div className="space-y-1">
                                            <span className="text-[8px] font-mono font-bold uppercase text-slate-400 tracking-wider block">
                                              📁 {col.googleDriveUrl ? "Active Cloud Reference" : "Integrated Report Summary"}
                                            </span>
                                            <h4 className="font-bold text-slate-800 text-xs tracking-tight leading-snug group-hover:text-orange-600 transition-colors line-clamp-2">
                                              {col.title}
                                            </h4>
                                            <p className="text-[11px] text-slate-500 leading-normal line-clamp-2 mt-0.5">
                                              {col.prompt || col.generatedContent?.replace(/[#*`_]/g, "").slice(0, 100) || "Browse custom digital files linked securely on our drive."}
                                            </p>
                                          </div>

                                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-sm uppercase tracking-wide">
                                              {col.googleDriveUrl ? "Drive Link" : "Dossier"}
                                            </span>
                                            <button className="text-[11px] font-bold text-slate-650 flex items-center gap-0.5 group-hover:text-orange-600 transition-colors">
                                              {col.googleDriveUrl ? "Launch" : "Read Brief"}
                                              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </motion.div>
                ) : currentTab === "currentProjects" ? (
                  // Active Multi-tenant Engagements Dashboard
                  <CurrentProjectsDashboard 
                    projects={visibleCurrentProjects} 
                    userEmail={userEmail} 
                  />
                ) : (
                  // Upcoming Opportunities & Pending Approvals
                  <UpcomingProjectsDashboard 
                    projects={visibleUpcomingProjects} 
                    userEmail={userEmail} 
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : !userEmail ? (
          // ============================== ADMIN LOGIN GATE ==============================
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-lg w-full space-y-4">
              <div className="text-center space-y-1">
                <ShieldCheck className="h-10 w-10 text-orange-600 mx-auto" />
                <h2 className="text-lg font-bold text-slate-900">Admin Access Required</h2>
                <p className="text-xs text-slate-500">Sign in with an admin account to access the control console.</p>
              </div>
              <AccessWall
                onSuccess={handleAuthSuccess}
                solutions={solutions}
              />
            </div>
          </div>
        ) : userRole !== "admin" ? (
          // ============================== NOT AN ADMIN ==============================
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-8 max-w-sm w-full text-center space-y-4">
              <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">Access Denied</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Your account (<span className="font-mono text-slate-700">{userEmail}</span>) does not have admin privileges. Contact your administrator to request access.
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg transition-all"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          // ============================== ADMINISTRATIVE CONTROL CONSOLE ==============================
          <div className="mx-4 my-6 bg-white border border-slate-100 shadow-lg rounded-3xl overflow-hidden flex-1 flex flex-col md:flex-row text-left">
            {/* Sidebar navigation */}
            <div className="w-full md:w-64 bg-slate-950 text-slate-200 border-r border-slate-900 p-6 flex flex-col justify-between shrink-0">
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-semibold">
                    System Control Suite
                  </span>
                  <h2 className="font-display text-base font-bold text-slate-100 mt-1">
                    Control Console
                  </h2>
                </div>

                {/* Tab selectors */}
                <nav className="space-y-1.5 flex flex-col">
                  {[
                    { id: "subdomain", label: "Portal Domains" },
                    { id: "solutions", label: "Solutions Onboard" },
                    { id: "collaterals", label: "Collateral Catalogue" },
                    { id: "projects", label: "Projects & Portals" },
                    { id: "branding", label: "Hero section" },
                    { id: "users", label: "User Management" },
                    { id: "logs", label: "Visitor Telemetry" }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setAdminActiveTab(tab.id as any)}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold text-left transition-all ${
                        adminActiveTab === tab.id
                          ? "bg-slate-900 text-white shadow-xs border-l-2 border-orange-500"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Status footer inside sidebar */}
              <div className="pt-6 border-t border-slate-900">
                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div className="text-[10px] font-mono">
                    <span className="block text-slate-500 uppercase">Cloud Deployments</span>
                    <span className="text-slate-200">Active Node 12-US</span>
                  </div>
                </div>
              </div>
            </div>

             {/* Central console body */}
            <div className="flex-1 p-6 md:p-8 bg-slate-50/40 overflow-y-auto max-h-160 custom-scroll flex flex-col justify-between">
              
              {/* Horizontal Subdomain Switcher tabs bar (Interactive Top Bar) */}
              <div className="mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs text-left animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 right-0 h-12 w-12 bg-orange-50/50 rounded-full blur-xl pointer-events-none" />
                <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block mb-2.5">
                  🌍 ACTIVE TENANT PORTAL CONTEXT FILTER (CLICK SUBDOMAIN CARD TO FILTER ASSETS)
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAdminSubdomain("all");
                      setPrefilledSubdomain(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedAdminSubdomain === "all"
                        ? "bg-orange-600 text-white shadow-xs border-b border-orange-700 font-sans"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-205 font-sans"
                    }`}
                  >
                    All Portals & Assets (Global View)
                  </button>
                  {subdomainsList.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setSelectedAdminSubdomain(sub.name);
                        setPrefilledSubdomain(sub.name);
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 font-sans ${
                        selectedAdminSubdomain === sub.name
                          ? "bg-slate-900 text-white shadow-xs border-b border-slate-950"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-205"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-550" />
                      {sub.displayName} ({sub.name})
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={adminActiveTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex-1"
                >
                  {/* Case 1: Solutions Onboarder */}
                  {adminActiveTab === "solutions" && (
                    <AdminSolutions
                      solutions={selectedAdminSubdomain === "all" ? solutions : solutions.filter((s) => {
                        const names = s.customerNames || (s.customerName ? [s.customerName] : ["all"]);
                        return names.includes(selectedAdminSubdomain) || names.includes("all");
                      })}
                      subdomains={subdomainsList}
                      prefilledSubdomain={selectedAdminSubdomain === "all" ? null : selectedAdminSubdomain}
                      onRefresh={async (action, data) => handleAdminDatabaseUpdate("solutions", action, data)}
                      adminUserEmail={userEmail || ""}
                    />
                  )}

                  {/* Case 2: Ingest & AI Collaterals */}
                  {adminActiveTab === "collaterals" && (
                    <AdminCollaterals
                      collaterals={selectedAdminSubdomain === "all" ? collaterals : collaterals.filter((c) => {
                        const names = c.customerNames || (c.customerName ? [c.customerName] : ["all"]);
                        return names.includes(selectedAdminSubdomain) || names.includes("all");
                      })}
                      subdomains={subdomainsList}
                      prefilledSubdomain={selectedAdminSubdomain === "all" ? null : selectedAdminSubdomain}
                      onRefresh={async (action, data) => handleAdminDatabaseUpdate("collaterals", action, data)}
                      adminUserEmail={userEmail || ""}
                    />
                  )}

                  {/* Case 3: Admin Multi-tenant Projects and Proposals */}
                  {adminActiveTab === "projects" && (
                    <AdminProjects
                      currentProjects={selectedAdminSubdomain === "all" ? currentProjects : currentProjects.filter((p) => {
                        const names = p.customerNames || (p.customerName ? [p.customerName] : ["all"]);
                        return names.includes(selectedAdminSubdomain) || names.includes("all");
                      })}
                      upcomingProjects={selectedAdminSubdomain === "all" ? upcomingProjects : upcomingProjects.filter((p) => {
                        const names = p.customerNames || (p.customerName ? [p.customerName] : ["all"]);
                        return names.includes(selectedAdminSubdomain) || names.includes("all");
                      })}
                      subdomains={subdomainsList}
                      prefilledSubdomain={selectedAdminSubdomain === "all" ? null : selectedAdminSubdomain}
                      onRefreshCurrent={handleAdminCurrentProjectUpdate}
                      onRefreshUpcoming={handleAdminUpcomingProjectUpdate}
                      adminUserEmail={userEmail || ""}
                    />
                  )}

                  {/* Case 4: Hosting Subdomains Customizer */}
                  {adminActiveTab === "subdomain" && (
                    <div className="space-y-6">
                      <div className="text-left">
                        <h3 className="font-display text-base font-bold text-slate-950 flex items-center gap-1.5">
                          🚀 Customer Portals Launch Pad
                        </h3>
                        <p className="text-xs text-slate-500">
                          Configure tenant subdomains under <strong className="font-semibold text-slate-500">mobiusservices.io</strong>. Create a subdomain first, prefill assets context, then proceed to organize Solutions, Case Studies, and Projects.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Provisioning Form */}
                        <div className="lg:col-span-5 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4 h-fit text-left">
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-sm font-mono tracking-widest uppercase inline-block">
                            Step 1: Create New Portal
                          </span>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!newSubdomainSlug || !newSubdomainDisplayName) {
                                alert("Please provide both friendly display name and alpha-numeric slug!");
                                return;
                              }
                              const formattedSlug = newSubdomainSlug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "");
                              handleManageSubdomains("create", formattedSlug, newSubdomainDisplayName);
                            }}
                            className="space-y-4"
                          >
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">
                                Customer / Client Name
                              </label>
                              <input
                                type="text"
                                value={newSubdomainDisplayName}
                                onChange={(e) => setNewSubdomainDisplayName(e.target.value)}
                                placeholder="E.g., Unilever APAC"
                                className="w-full px-3 py-2 border border-slate-205 rounded-lg text-xs text-slate-905 focus:outline-hidden"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">
                                Unique Slotted Subdomain Slug
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={newSubdomainSlug}
                                  onChange={(e) => setNewSubdomainSlug(e.target.value)}
                                  placeholder="unilever"
                                  className="w-full pl-3 pr-36 py-2 border border-slate-205 rounded-lg text-xs text-slate-905 font-mono focus:outline-hidden"
                                  required
                                />
                                <div className="absolute right-3 top-2.5 text-[9.5px] font-mono text-slate-400 select-none">
                                  .mobiusservices.io
                                </div>
                              </div>
                              <span className="block text-[9.5px] text-slate-400 leading-normal mt-1">
                                Lowercase alphanumeric letters only. Becomes the customized entryway URL for the portal.
                              </span>
                            </div>

                            <button
                              type="submit"
                              className="w-full py-2 bg-gradient-to-r from-orange-600 to-orange-800 hover:from-orange-700 hover:to-orange-900 text-white font-semibold text-xs rounded-lg transition-all"
                            >
                              🌟 Create Portal with Subdomain
                            </button>
                          </form>

                          {/* Dummy portal */}
                          <div className="pt-3 border-t border-slate-100">
                            {!showDummyForm ? (
                              <button
                                type="button"
                                onClick={() => setShowDummyForm(true)}
                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5"
                              >
                                Create Portal without Subdomain
                              </button>
                            ) : (
                              <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-500">
                                  Portal Name <span className="text-slate-400 font-normal">(optional)</span>
                                </label>
                                <input
                                  type="text"
                                  value={dummyPortalName}
                                  onChange={(e) => setDummyPortalName(e.target.value)}
                                  placeholder="Portal Name"
                                  className="w-full px-3 py-2 border border-slate-205 rounded-lg text-xs text-slate-905 focus:outline-hidden"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={handleCreateDummy}
                                    disabled={creatingDummy}
                                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs rounded-lg transition-all disabled:opacity-50"
                                  >
                                    {creatingDummy ? "Creating..." : "Create Portal"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setShowDummyForm(false); setDummyPortalName(""); }}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs rounded-lg transition-all"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Creates a portal without a subdomain on an auto-assigned port. Accessible at <code className="font-mono">{window.location.hostname}:PORT</code> and manageable from this hub.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* List of active customer portals */}
                        <div className="lg:col-span-7 p-6 bg-slate-900 text-slate-105 border border-slate-800 rounded-2xl shadow-md text-left space-y-4 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] bg-slate-800 text-white px-2.5 py-0.5 rounded-sm font-mono tracking-widest uppercase inline-block">
                                Step 2: Onboard Assets & Configure
                              </span>
                              <button
                                type="button"
                                onClick={handleRefreshDns}
                                disabled={refreshingDns}
                                title="Refresh DNS status for pending subdomains"
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`h-3 w-3 ${refreshingDns ? "animate-spin" : ""}`} />
                                {refreshingDns ? "Checking…" : "Refresh DNS"}
                              </button>
                            </div>

                            <div className="mt-3 space-y-3 max-h-80 overflow-y-auto custom-scroll pr-1.5 font-mono text-xs">
                              {subdomainsList.map((portal) => (
                                <div
                                  key={portal.id}
                                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <h4 className="font-display font-bold text-white text-xs">
                                        {portal.displayName}
                                      </h4>
                                      {/* DNS status badge */}
                                      {!portal.isDummy && portal.dnsStatus === "pending" && (
                                        <span className="px-1.5 py-0.5 bg-amber-900/60 text-amber-300 border border-amber-700 text-[8px] font-bold uppercase rounded tracking-wider">
                                          DNS Pending
                                        </span>
                                      )}
                                      {!portal.isDummy && portal.dnsStatus === "active" && (
                                        <span className="px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 border border-emerald-800 text-[8px] font-bold uppercase rounded tracking-wider">
                                          DNS Active
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-orange-400 font-mono text-[10px] block mt-0.5 truncate">
                                      {portal.isDummy
                                        ? `${window.location.hostname}:${portal.port}`
                                        : `${portal.name}.${portal.domain || "mobiusservices.io"}`}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0 font-sans">
                                    {/* Live / Sleep toggle */}
                                    {(() => {
                                      const isStarting = startingPortals.has(portal.id);
                                      const isLive = portal.status === "live";
                                      return (
                                        <>
                                          <button
                                            type="button"
                                            disabled={isStarting}
                                            onClick={() => handleTogglePortal(portal.id, isLive ? "sleep" : "live", portal.port)}
                                            title={isStarting ? "Starting…" : isLive ? "Click to stop portal" : "Click to start portal"}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                              isStarting
                                                ? "bg-amber-900/50 border-amber-700 text-amber-300 cursor-wait"
                                                : isLive
                                                  ? "bg-emerald-900/60 border-emerald-700 text-emerald-300 hover:bg-emerald-900 cursor-pointer"
                                                  : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 cursor-pointer"
                                            }`}
                                          >
                                            <span className={`h-2 w-2 rounded-full shrink-0 ${
                                              isStarting ? "bg-amber-400 animate-ping" : isLive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                                            }`} />
                                            {isStarting ? "Starting…" : isLive ? "Live" : "Sleep"}
                                          </button>

                                          {/* Access — only when live, not starting, and DNS confirmed */}
                                          {(() => {
                                            const dnsPending = !portal.isDummy && portal.dnsStatus === "pending";
                                            return (
                                          <button
                                            type="button"
                                            disabled={!isLive || isStarting || dnsPending}
                                            onClick={() => {
                                              const url = portal.isDummy
                                                ? `http://${window.location.hostname}:${portal.port}`
                                                : `https://${portal.name}.${portal.domain || "mobiusservices.io"}`;
                                              window.open(url, "_blank");
                                            }}
                                            className={`px-2.5 py-1 font-semibold text-[10px] rounded-lg transition-colors flex items-center gap-1 ${
                                              isLive && !isStarting && !dnsPending
                                                ? "bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer"
                                                : "bg-slate-800 text-slate-600 cursor-not-allowed opacity-50"
                                            }`}
                                            title={dnsPending ? "DNS not yet active — click Refresh DNS" : !isLive ? "Start portal first" : isStarting ? "Starting…" : "Open portal"}
                                          >
                                            <Globe className="h-3 w-3" /> {dnsPending ? "DNS Pending" : "Access"}
                                          </button>
                                          );
                                          })()}
                                        </>
                                      );
                                    })()}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPortalSettingsTarget(portal);
                                        setSettingsDisplayName(portal.displayName);
                                        setSettingsSaved(false);
                                      }}
                                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-[10px] rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                      title="Portal settings"
                                    >
                                      <Settings className="h-3 w-3" /> Settings
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm(`Delete portal "${portal.displayName}"?\n\nThis will stop the process and permanently delete all local files for this portal. This cannot be undone.`)) {
                                          handleManageSubdomains("delete", portal.name);
                                        }
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-450 transition-colors cursor-pointer"
                                      title="Delete portal and all its files"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-800/80 text-[10px] text-slate-400 leading-normal font-sans">
                            💡 <strong>Getting started</strong>: Create a portal above — with or without a subdomain. Then use the context filter bar on other tabs to scope solutions, collaterals, and projects to a specific portal. Changes deploy automatically to live portals.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Case 4.5: Custom Branding Suite */}
                  {adminActiveTab === "branding" && (
                    <div className="space-y-6 animate-fade-in text-left">
                      <div>
                        <h3 className="font-display text-base font-bold text-slate-950 flex items-center gap-1.5">
                          👑 Hero Spotlight Slides Configuration
                        </h3>
                        <p className="text-xs text-slate-500">
                          Configure three interactive spotlight slides for the hero section to guide clients directly to active deliverables, grounding studies, or newly launched solutions.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Carousel Spotlight Slider configuration panel */}
                        <div className="lg:col-span-3 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                              🎠 Dynamic Hero Spotlight Slides (3 Slots)
                            </h4>
                            <span className="text-[9px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-mono font-bold">
                              {carousel.length} Slide Definitions Active
                            </span>
                          </div>

                          {/* Subdomain Selection Dropdown (Visibility Context) */}
                          <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2">
                            <label className="block text-xs font-bold text-slate-700 font-sans">
                              🔗 Linked Customer Subdomain Portal (Visibility context)
                            </label>
                            <select
                              value={selectedAdminSubdomain}
                              onChange={(e) => setSelectedAdminSubdomain(e.target.value)}
                              className="w-full max-w-md px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs text-slate-800 font-sans focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                            >
                              <option value="all">All Portals (Global)</option>
                              {subdomainsList.map((sub) => (
                                <option key={sub.id} value={sub.name}>
                                  {sub.displayName} ({sub.name}.mobiusservices.io)
                                </option>
                              ))}
                            </select>
                            <p className="text-[10px] text-slate-400 leading-normal font-sans">
                              Select which client portal these spotlight slides belong to. The slides configured below will automatically display only when a visitor accesses this specific subdomain workspace.
                            </p>
                          </div>

                          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                            {[0, 1, 2].map((idx) => {
                              const slide = editCarousel[idx] || {
                                title: `Spotlight Slide ${idx + 1}`,
                                description: "Configure dynamic spotlight links inside the administration portal customizer.",
                                imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800",
                                linkType: "none",
                                linkTarget: ""
                              };

                              const updateSlideField = (field: string, val: any) => {
                                const copy = [...editCarousel];
                                while (copy.length <= idx) {
                                  copy.push({
                                    title: `Spotlight Slide ${copy.length + 1}`,
                                    description: "Standard descriptive tagline.",
                                    imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800",
                                    linkType: "none",
                                    linkTarget: ""
                                  });
                                }
                                copy[idx] = { ...copy[idx], [field]: val };
                                setEditCarousel(copy);
                              };

                              return (
                                <div key={idx} className="p-4 bg-slate-50/80 border border-slate-200/60 rounded-xl space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="h-5 w-5 rounded bg-orange-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                                      {idx + 1}
                                    </span>
                                    <span className="text-xs font-bold text-slate-800">
                                      Spotlight Configuration slot
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                        Slide Headline Heading title
                                      </label>
                                      <input 
                                        type="text"
                                        value={slide.title}
                                        onChange={(e) => updateSlideField("title", e.target.value)}
                                        className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-xs"
                                        placeholder="E.g. Unilever replenishment portal live"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                        Backdrop Showcase Image URL
                                      </label>
                                      <select
                                        value={slide.imageUrl}
                                        onChange={(e) => updateSlideField("imageUrl", e.target.value)}
                                        className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-xs text-slate-700"
                                      >
                                        <option value="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800">
                                          🏭 Logistics Warehouse Grid preset
                                        </option>
                                        <option value="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800">
                                          ⚡ Modern AI Data Grid preset
                                        </option>
                                        <option value="https://images.unsplash.com/photo-1431540015161-0bf868a2d407?auto=format&fit=crop&q=80&w=800">
                                          👔 Global Corporate Boardroom preset
                                        </option>
                                        <option value="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=800">
                                          💻 Enterprise Analytics Consulting preset
                                        </option>
                                      </select>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                      Tagline Slide Description
                                    </label>
                                    <input 
                                      type="text"
                                      value={slide.description}
                                      onChange={(e) => updateSlideField("description", e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-xs"
                                      placeholder="E.g. Seamless telemetry tracking across EMEA global dispatch centers."
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                        Call-to-Action Link Target Category
                                      </label>
                                      <select
                                        value={slide.linkType}
                                        onChange={(e) => {
                                          updateSlideField("linkType", e.target.value);
                                          updateSlideField("linkTarget", "");
                                        }}
                                        className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-xs text-slate-700"
                                      >
                                        <option value="none">No Link (Static Slide Display)</option>
                                        <option value="subdomain">Simulate Subdomain Portal change</option>
                                        <option value="solution">Launch Onboarded Solution Modal</option>
                                        <option value="collateral">Launch Compiled Case Study Modal</option>
                                        <option value="project-current">View Active Engagement details</option>
                                        <option value="project-upcoming">View Upcoming Proposal pipeline</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                        CTA Target Destination Item
                                      </label>
                                      {slide.linkType === "none" ? (
                                        <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-400 font-mono select-none">
                                          No linking assigned
                                        </div>
                                      ) : (
                                        <select
                                          value={slide.linkTarget}
                                          onChange={(e) => updateSlideField("linkTarget", e.target.value)}
                                          className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-xs text-slate-700"
                                        >
                                          <option value="">-- Choose destination entity --</option>
                                          {slide.linkType === "subdomain" && 
                                            subdomainsList.map((sub) => (
                                              <option key={sub.name} value={sub.name}>
                                                Portal: {sub.displayName} ({sub.name})
                                              </option>
                                            ))
                                          }
                                          {slide.linkType === "solution" && 
                                            solutions.map((sol) => (
                                              <option key={sol.id} value={sol.id}>
                                                Solution: {sol.title}
                                              </option>
                                            ))
                                          }
                                          {slide.linkType === "collateral" && 
                                            collaterals.map((col) => (
                                              <option key={col.id} value={col.id}>
                                                Case Study: {col.title}
                                              </option>
                                            ))
                                          }
                                          {slide.linkType === "project-current" && 
                                            currentProjects.map((p) => (
                                              <option key={p.id} value={p.id}>
                                                Active Proj: {p.name} [{p.customerName}]
                                              </option>
                                            ))
                                          }
                                          {slide.linkType === "project-upcoming" && 
                                            upcomingProjects.map((p) => (
                                              <option key={p.id} value={p.id}>
                                                Proposal: {p.name} [{p.customerName}]
                                              </option>
                                            ))
                                          }
                                        </select>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="pt-2 flex items-center justify-end gap-3">
                            {heroPublishDone && (
                              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in">
                                <Check className="h-3.5 w-3.5" /> Published & deployed!
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                setHeroPublishDone(false);
                                try {
                                  const updatedCarousel = [
                                    ...carousel.filter((item) => item.customerName !== selectedAdminSubdomain),
                                    ...editCarousel.map((slide) => {
                                      const key = slide.id || `car-${selectedAdminSubdomain}-${Math.random().toString(36).substr(2, 9)}`;
                                      return { ...slide, id: key, customerName: selectedAdminSubdomain };
                                    })
                                  ];
                                  const res = await adminFetch("/api/admin/update-carousel", {
                                    method: "POST",
                                    body: JSON.stringify({ carousel: updatedCarousel })
                                  });
                                  if (res.ok) {
                                    // Update hub carousel state immediately so the preview refreshes
                                    setCarousel(updatedCarousel);
                                    logUserAction("Carousel Update", `Updated carousel for portal: ${selectedAdminSubdomain}.`);
                                    if (selectedAdminSubdomain && selectedAdminSubdomain !== "all") {
                                      await handleDeployPortal(selectedAdminSubdomain);
                                    }
                                    // Refresh full hub data so hero text + all content reflects latest DB state
                                    await fetchPortalData();
                                    setHeroPublishDone(true);
                                    setTimeout(() => setHeroPublishDone(false), 4000);
                                  } else {
                                    alert("Failed to save carousel to server database.");
                                  }
                                } catch (err) {
                                  alert("Network error saving carousel.");
                                }
                              }}
                              disabled={deployingPortals.has(selectedAdminSubdomain)}
                              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
                            >
                              {deployingPortals.has(selectedAdminSubdomain) ? (
                                <>
                                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Publishing & Deploying…
                                </>
                              ) : "Publish & Deploy to Portal"}
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                  {adminActiveTab === "users" && (
                    <AdminUsers
                      users={portalUsers}
                      adminFetch={adminFetch}
                      onRefresh={fetchPortalData}
                    />
                  )}
                  {adminActiveTab === "logs" && (
                    <AdminLogs logs={logs} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* LaunchPad Solution Modal Details */}
      <AnimatePresence>
        {selectedSolution && (
          <SolutionLaunchModal
            solution={selectedSolution}
            onClose={() => setSelectedSolution(null)}
          />
        )}
      </AnimatePresence>

      {/* Dynamic Collateral Reader Panel Details */}
      <AnimatePresence>
        {selectedCollateral && (
          <CollateralDetailModal
            collateral={selectedCollateral}
            onClose={() => setSelectedCollateral(null)}
          />
        )}
      </AnimatePresence>

      {/* Portal Settings Modal */}
      <AnimatePresence>
        {portalSettingsTarget && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Portal Settings</h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{portalSettingsTarget.id}</p>
                </div>
                <button
                  onClick={() => setPortalSettingsTarget(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Rename */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Portal Display Name</label>
                  <input
                    type="text"
                    value={settingsDisplayName}
                    onChange={(e) => setSettingsDisplayName(e.target.value)}
                    placeholder="e.g. Unilever India"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-400"
                  />
                  <p className="text-[10px] text-slate-400">This name appears on portal cards and in the admin console.</p>
                </div>

                {/* Subdomain / Slug */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    {portalSettingsTarget.isDummy ? "Portal Slug" : "Subdomain Slug"}
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-xs font-mono text-slate-500 select-none">
                      {portalSettingsTarget.isDummy ? "local-portal/" : `${portalSettingsTarget.domain || "mobiusservices.io"}/`}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">{portalSettingsTarget.id}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Slug is immutable after creation. Contact admin to migrate.</p>
                </div>

                {/* Access URL */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Access URL</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                      <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs font-mono text-orange-600 truncate">
                        {portalSettingsTarget.isDummy
                          ? `http://${window.location.hostname}:${portalSettingsTarget.port}`
                          : `https://${portalSettingsTarget.name}.${portalSettingsTarget.domain || "mobiusservices.io"}`}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const url = portalSettingsTarget.isDummy
                          ? `http://${window.location.hostname}:${portalSettingsTarget.port}`
                          : `https://${portalSettingsTarget.name}.${portalSettingsTarget.domain || "mobiusservices.io"}`;
                        navigator.clipboard.writeText(url).catch(() => {});
                      }}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                      title="Copy URL"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const url = portalSettingsTarget.isDummy
                          ? `http://${window.location.hostname}:${portalSettingsTarget.port}`
                          : `https://${portalSettingsTarget.name}.${portalSettingsTarget.domain || "mobiusservices.io"}`;
                        window.open(url, "_blank");
                      }}
                      disabled={portalSettingsTarget.status !== "live"}
                      className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={portalSettingsTarget.status !== "live" ? "Start portal first" : "Open portal"}
                    >
                      Open
                    </button>
                  </div>
                  {portalSettingsTarget.status !== "live" && (
                    <p className="text-[10px] text-amber-600">Portal is currently sleeping — start it from the portal card to access the URL.</p>
                  )}
                </div>

                {/* Onboard Assets shortcut */}
                <div className="pt-1 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setSelectedAdminSubdomain(portalSettingsTarget.name);
                      setPrefilledSubdomain(portalSettingsTarget.name);
                      setAdminActiveTab("solutions");
                      setPortalSettingsTarget(null);
                    }}
                    className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Onboard Assets for this Portal
                  </button>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                <button
                  onClick={() => setPortalSettingsTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-100 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePortalSettings}
                  disabled={settingsSaving || !settingsDisplayName.trim()}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {settingsSaving ? (
                    <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Saving…</>
                  ) : settingsSaved ? (
                    <><Check className="h-3.5 w-3.5 text-emerald-400" /> Saved!</>
                  ) : (
                    "Save Settings"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Visual Footer — only shown to logged-in admin users */}
      {userEmail && userRole === "admin" && isHub && <footer className="w-full h-12 bg-slate-900 flex items-center justify-between px-8 text-slate-400 shrink-0 font-mono text-[10px] border-t border-slate-850 relative z-30 mt-auto select-none">
        <div className="flex items-center space-x-6">
          <span className="text-[10px] font-medium tracking-widest uppercase text-slate-450 leading-none">
            Host instance: {subdomain}.mobiusservices.io
          </span>
          <div className="hidden md:flex space-x-4 border-l border-slate-800 pl-6 leading-none">
            <span className="text-[10px] flex items-center text-slate-400">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span> System Active
            </span>
            <span className="text-[10px] flex items-center text-slate-400">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-2 animate-pulse"></span> Gemini AI Engine Connected
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              if (viewMode === "admin") {
                setViewMode("user");
                window.location.hash = "";
              } else {
                setViewMode("admin");
                window.location.hash = "/admin";
                setAdminActiveTab("logs");
              }
            }}
            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            User Activity Logs
          </button>
          {isHub && (
            <button
              onClick={() => {
                if (viewMode === "user") {
                  setViewMode("admin");
                  window.location.hash = "/admin";
                } else {
                  setViewMode("user");
                  window.location.hash = "";
                }
              }}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-slate-800 rounded border border-slate-750 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              {viewMode === "user" ? "Admin Console" : "Public Hub Portal"}
            </button>
          )}
        </div>
      </footer>}
    </div>
  );
}
