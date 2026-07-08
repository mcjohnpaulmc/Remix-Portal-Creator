/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Plus, Edit2, Sparkles, X, Check, FileText, FileUp, Trash2, 
  BarChart3, RefreshCw, Eye, EyeOff, LayoutTemplate, 
  MessageSquare, TrendingUp, HelpCircle, ShieldCheck,
  Link, Upload, FolderOpen, Folder
} from "lucide-react";
import { CurrentProject, UpcomingProject } from "../../../shared/types";
import { motion, AnimatePresence } from "motion/react";

interface AdminProjectsProps {
  currentProjects: CurrentProject[];
  upcomingProjects: UpcomingProject[];
  onRefreshCurrent: (action: string, project: any) => Promise<void>;
  onRefreshUpcoming: (action: string, project: any) => Promise<void>;
  subdomains?: { id: string; name: string; displayName: string }[];
  prefilledSubdomain?: string | null;
  adminUserEmail?: string;
}

export function AdminProjects({
  currentProjects,
  upcomingProjects,
  onRefreshCurrent,
  onRefreshUpcoming,
  subdomains = [],
  prefilledSubdomain,
  adminUserEmail = ""
}: AdminProjectsProps) {
  const [activeSubTab, setActiveSubTab] = useState<"current" | "upcoming">("current");
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // AI Generation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNameInput, setAiNameInput] = useState("");

  // Common fields
  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("unilever"); // unilever, reliance, retail etc.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");

  const [pubEnabled, setPubEnabled] = useState(true);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);

  React.useEffect(() => {
    if (prefilledSubdomain) {
      setCustomerNames([prefilledSubdomain]);
      setCustomerName(prefilledSubdomain);
    } else {
      setCustomerNames(["unilever"]);
      setCustomerName("unilever");
    }
  }, [prefilledSubdomain]);

  // -- CURRENT PROJECT exclusive fields --
  // Trends metrics as comma-separated or list states
  const [deliveryLabelsStr, setDeliveryLabelsStr] = useState("Jan, Feb, Mar, Apr, May, Jun");
  const [deliveryValuesStr, setDeliveryValuesStr] = useState("240, 280, 290, 310, 340, 380");
  const [qualityLabelsStr, setQualityLabelsStr] = useState("Jan, Feb, Mar, Apr, May, Jun");
  const [qualityValuesStr, setQualityValuesStr] = useState("98.2, 98.7, 98.1, 99.0, 99.4, 99.6");

  // TAT exclusive
  const [tatTarget, setTatTarget] = useState("24 hours");
  const [tatActual, setTatActual] = useState("18.5 hours");
  const [tatLabelsStr, setTatLabelsStr] = useState("Jan, Feb, Mar, Apr, May, Jun");
  const [tatValuesStr, setTatValuesStr] = useState("22, 21, 20.5, 19.8, 19.1, 18.5");

  // Innovations sublist state
  const [innovations, setInnovations] = useState<{ title: string; impact: string }[]>([]);
  const [newInnTitle, setNewInnTitle] = useState("");
  const [newInnImpact, setNewInnImpact] = useState("");

  // Feedback repo sublist state
  const [feedbackRepo, setFeedbackRepo] = useState<
    { id: string; description: string; reportedDate: string; resolvedDate: string | null; status: "Open" | "Resolved" }[]
  >([]);
  const [newFbDesc, setNewFbDesc] = useState("");
  const [newFbReportDate, setNewFbReportDate] = useState("");
  const [newFbResolvedDate, setNewFbResolvedDate] = useState("");
  const [newFbStatus, setNewFbStatus] = useState<"Open" | "Resolved">("Open");

  // Uploaded files mockup
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: string; type: string }[]>([]);
  const [newFileName, setNewFileName] = useState("");
  const [newFileType, setNewFileType] = useState("document");
  const [assetAttachmentMode, setAssetAttachmentMode] = useState<"local" | "drive">("drive");
  const [googleDriveUrlInput, setGoogleDriveUrlInput] = useState("");

  // -- UPCOMING PROJECT exclusive fields --
  const [status, setStatus] = useState<"Requirement gathering" | "POC / pilot" | "Proposal" | "Awaiting approval">("Requirement gathering");
  const [scope, setScope] = useState("");
  const [solution, setSolution] = useState("");
  const [timelines, setTimelines] = useState("");
  
  // Documents categorized
  const [upcomingDocs, setUpcomingDocs] = useState<
    { name: string; size: string; type: string; category: "Sample Data" | "Pricing" | "Proposal" | "Solution Approach" }[]
  >([]);
  const [newUpDocName, setNewUpDocName] = useState("");
  const [newUpDocCat, setNewUpDocCat] = useState<"Sample Data" | "Pricing" | "Proposal" | "Solution Approach">("Solution Approach");

  const [submitting, setSubmitting] = useState(false);

  const handleSubdomainCheckboxChange = (name: string) => {
    if (name === "all") {
      setCustomerNames(["all"]);
      return;
    }
    let updated = customerNames.filter((n) => n !== "all");
    if (updated.includes(name)) {
      updated = updated.filter((n) => n !== name);
    } else {
      updated.push(name);
    }
    if (updated.length === 0) {
      updated = [prefilledSubdomain || "unilever"];
    }
    setCustomerNames(updated);
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["unilever"]);
    setCustomerName(prefilledSubdomain || "unilever");
    setName("");
    setDescription("");
    setDepartment("");
    setPubEnabled(true);
    setHiddenSections([]);

    // Current reset
    setDeliveryLabelsStr("Jan, Feb, Mar, Apr, May, Jun");
    setDeliveryValuesStr("240, 280, 290, 310, 340, 380");
    setQualityLabelsStr("Jan, Feb, Mar, Apr, May, Jun");
    setQualityValuesStr("98.2, 98.7, 98.1, 99.0, 99.4, 99.6");
    setTatTarget("24 hours");
    setTatActual("18.5 hours");
    setTatLabelsStr("Jan, Feb, Mar, Apr, May, Jun");
    setTatValuesStr("22, 21, 20.5, 19.8, 19.1, 18.5");
    setInnovations([]);
    setFeedbackRepo([]);
    setUploadedFiles([]);
    setNewFileName("");

    // Upcoming reset
    setStatus("Requirement gathering");
    setScope("");
    setSolution("");
    setTimelines("");
    setUpcomingDocs([]);
    setNewUpDocName("");
  };

  const handleGenerateAIProject = async () => {
    if (!aiNameInput) {
      alert("Please provide a core project title for AI Generation scoping.");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/generate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-User": adminUserEmail },
        body: JSON.stringify({
          name: aiNameInput,
          customerName,
          templateType: activeSubTab
        })
      });
      if (!res.ok) throw new Error("Gemini generation failed");
      const data = await res.json();
      
      setName(data.name || aiNameInput);
      setDescription(data.description || "");
      setDepartment(data.department || "");

      if (activeSubTab === "current") {
        if (data.deliveryValues) {
          setDeliveryValuesStr(data.deliveryValues.join(", "));
          setDeliveryLabelsStr((data.deliveryLabels || ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]).join(", "));
        }
        if (data.qualityValues) {
          setQualityValuesStr(data.qualityValues.join(", "));
          setQualityLabelsStr((data.qualityLabels || ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]).join(", "));
        }
        if (data.innovations) setInnovations(data.innovations);
        if (data.tatTarget) setTatTarget(data.tatTarget);
        if (data.tatActual) setTatActual(data.tatActual);
        if (data.tatValues) {
          setTatValuesStr(data.tatValues.join(", "));
          setTatLabelsStr((data.tatLabels || ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]).join(", "));
        }
        if (data.feedbackRepo) {
          setFeedbackRepo(data.feedbackRepo.map((f: any, idx: number) => ({
            ...f,
            id: f.id || `fb-gen-${idx}`
          })));
        }
        // Hydrate double dummy files
        setUploadedFiles([
          { name: `${aiNameInput.toLowerCase().replace(/\s+/g, "_")}_sla_spec.pdf`, size: "1.8 MB", type: "application/pdf" },
          { name: "telemetry_volume_metrics.docx", size: "900 KB", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
        ]);
      } else {
        setStatus(data.status || "Requirement gathering");
        setScope(data.scope || "");
        setSolution(data.solution || "");
        setTimelines(data.timelines || "");
        setUpcomingDocs([
          { name: `opportunity_${aiNameInput.toLowerCase().replace(/\s+/g, "_")}_approach.pdf`, size: "2.4 MB", type: "application/pdf", category: "Solution Approach" },
          { name: `pricing_sheet_${customerName}.xlsx`, size: "750 KB", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", category: "Pricing" }
        ]);
      }
      setAiNameInput("");
    } catch (err) {
      alert("Encountered network block compiling dynamic project metrics.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCurrentProjRealFilesUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const name = file.name;
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`;
      const fileTypeLower = file.type.toLowerCase();
      const fileNameLower = name.toLowerCase();
      let detectedType = "application/octet-stream";
      if (fileTypeLower.includes("spreadsheet") || fileTypeLower.includes("csv") || fileTypeLower.includes("excel") || fileNameLower.endsWith(".xlsx") || fileNameLower.endsWith(".xls") || fileNameLower.endsWith(".csv") || fileNameLower.endsWith(".gsheet")) {
        detectedType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (fileTypeLower.includes("presentation") || fileTypeLower.includes("powerpoint") || fileNameLower.endsWith(".pptx") || fileNameLower.endsWith(".ppt") || fileNameLower.endsWith(".gslides")) {
        detectedType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else if (fileTypeLower.includes("document") || fileTypeLower.includes("word") || fileTypeLower.includes("text") || fileNameLower.endsWith(".docx") || fileNameLower.endsWith(".doc") || fileNameLower.endsWith(".txt") || fileNameLower.endsWith(".gdoc")) {
        detectedType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileNameLower.endsWith(".pdf")) {
        detectedType = "application/pdf";
      }
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", headers: { "X-Admin-User": adminUserEmail }, body: formData });
        const data = await res.json();
        setUploadedFiles((prev) => [...prev, { name, size: sizeStr, type: detectedType, url: data.url }]);
      } catch {
        setUploadedFiles((prev) => [...prev, { name, size: sizeStr, type: detectedType }]);
      }
    }
  };

  const handleUpcomingProjRealFilesUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const name = file.name;
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`;
      const fileTypeLower = file.type.toLowerCase();
      const fileNameLower = name.toLowerCase();
      let detectedType = "application/octet-stream";
      if (fileTypeLower.includes("spreadsheet") || fileTypeLower.includes("csv") || fileTypeLower.includes("excel") || fileNameLower.endsWith(".xlsx") || fileNameLower.endsWith(".xls") || fileNameLower.endsWith(".csv") || fileNameLower.endsWith(".gsheet")) {
        detectedType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (fileTypeLower.includes("presentation") || fileTypeLower.includes("powerpoint") || fileNameLower.endsWith(".pptx") || fileNameLower.endsWith(".ppt") || fileNameLower.endsWith(".gslides")) {
        detectedType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else if (fileTypeLower.includes("document") || fileTypeLower.includes("word") || fileTypeLower.includes("text") || fileNameLower.endsWith(".docx") || fileNameLower.endsWith(".doc") || fileNameLower.endsWith(".txt") || fileNameLower.endsWith(".gdoc")) {
        detectedType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileNameLower.endsWith(".pdf")) {
        detectedType = "application/pdf";
      }
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", headers: { "X-Admin-User": adminUserEmail }, body: formData });
        const data = await res.json();
        setUpcomingDocs((prev) => [...prev, { name, size: sizeStr, type: detectedType, category: newUpDocCat, url: data.url }]);
      } catch {
        setUpcomingDocs((prev) => [...prev, { name, size: sizeStr, type: detectedType, category: newUpDocCat }]);
      }
    }
  };

  const handleAddCurrentWorkspaceMock = (workspaceType: string, filename: string, mime: string, content: string) => {
    const newFileObj = {
      name: filename,
      size: "12 KB",
      type: mime,
      content: `[Synthesized template for ${workspaceType}]\n\n${content}`
    };
    setUploadedFiles((prev) => [...prev, newFileObj]);
  };

  const handleAddUpcomingWorkspaceMock = (workspaceType: string, filename: string, mime: string, content: string) => {
    const newFileObj = {
      name: filename,
      size: "15 KB",
      type: mime,
      category: newUpDocCat,
      content: `[Synthesized template for ${workspaceType}]\n\n${content}`
    };
    setUpcomingDocs((prev) => [...prev, newFileObj]);
  };

  const handleAddFileMock = () => {
    if (!newFileName) return;
    const size = newFileType === "deck" ? "3.2 MB" : "1.4 MB";
    const mime = newFileType === "deck" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const extension = newFileType === "deck" ? ".pdf" : ".docx";

    const clean = newFileName.includes(".") ? newFileName : `${newFileName.replace(/\s+/g, "_")}${extension}`;
    setUploadedFiles([...uploadedFiles, { name: clean, size, type: mime }]);
    setNewFileName("");
  };

  const handleAddUpcomingDocMock = () => {
    if (!newUpDocName) return;
    const size = "1.5 MB";
    const mime = "application/pdf";
    const clean = newUpDocName.includes(".") ? newUpDocName : `${newUpDocName.replace(/\s+/g, "_")}.pdf`;

    setUpcomingDocs([...upcomingDocs, {
      name: clean,
      size,
      type: mime,
      category: newUpDocCat
    }]);
    setNewUpDocName("");
  };

  const handleAddInnovation = () => {
    if (!newInnTitle || !newInnImpact) return;
    setInnovations([...innovations, { title: newInnTitle, impact: newInnImpact }]);
    setNewInnTitle("");
    setNewInnImpact("");
  };

  const handleAddFeedback = () => {
    if (!newFbDesc) return;
    const rawReport = newFbReportDate || new Date().toISOString().split("T")[0];
    setFeedbackRepo([...feedbackRepo, {
      id: `fb-${Date.now()}`,
      description: newFbDesc,
      reportedDate: rawReport,
      resolvedDate: newFbStatus === "Resolved" ? (newFbResolvedDate || rawReport) : null,
      status: newFbStatus
    }]);
    setNewFbDesc("");
    setNewFbReportDate("");
    setNewFbResolvedDate("");
  };

  const handleToggleFeedFeedbackStatus = (id: string) => {
    setFeedbackRepo(feedbackRepo.map(f => {
      if (f.id === id) {
        const next = f.status === "Open" ? "Resolved" : "Open";
        return {
          ...f,
          status: next,
          resolvedDate: next === "Resolved" ? new Date().toISOString().split("T")[0] : null
        };
      }
      return f;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !description || !department) {
      alert("Please fill out all administrative core fields.");
      return;
    }

    setSubmitting(true);

    try {
      if (activeSubTab === "current") {
        const payload = {
          id: editingId || undefined,
          customerName: customerNames[0] || "unilever",
          customerNames,
          name,
          description,
          department,
          deliveryLabels: deliveryLabelsStr.split(",").map(s => s.trim()),
          deliveryValues: deliveryValuesStr.split(",").map(s => Number(s.trim())),
          qualityLabels: qualityLabelsStr.split(",").map(s => s.trim()),
          qualityValues: qualityValuesStr.split(",").map(s => Number(s.trim())),
          innovations,
          tatTarget,
          tatActual,
          tatLabels: tatLabelsStr.split(",").map(s => s.trim()),
          tatValues: tatValuesStr.split(",").map(s => Number(s.trim())),
          feedbackRepo,
          documents: uploadedFiles,
          enabled: pubEnabled,
          hiddenSections: hiddenSections
        };
        await onRefreshCurrent(editingId ? "update" : "create", payload);
      } else {
        const payload = {
          id: editingId || undefined,
          customerName: customerNames[0] || "unilever",
          customerNames,
          name,
          description,
          department,
          status,
          scope,
          solution,
          timelines,
          documents: upcomingDocs,
          enabled: pubEnabled,
          hiddenSections: hiddenSections
        };
        await onRefreshUpcoming(editingId ? "update" : "create", payload);
      }
      resetForm();
    } catch (err) {
      alert("Failed to persist details to operations datastore.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCurrentClick = (proj: CurrentProject) => {
    setEditingId(proj.id);
    const names = proj.customerNames || (proj.customerName ? [proj.customerName] : ["unilever"]);
    setCustomerNames(names);
    setCustomerName(names[0] || "unilever");
    setName(proj.name);
    setDescription(proj.description);
    setDepartment(proj.department);
    setPubEnabled(proj.enabled !== false);
    setHiddenSections(proj.hiddenSections || []);

    setDeliveryLabelsStr(proj.deliveryLabels.join(", "));
    setDeliveryValuesStr(proj.deliveryValues.join(", "));
    setQualityLabelsStr(proj.qualityLabels.join(", "));
    setQualityValuesStr(proj.qualityValues.join(", "));
    setTatTarget(proj.tatTarget || "");
    setTatActual(proj.tatActual || "");
    setTatLabelsStr(proj.tatLabels ? proj.tatLabels.join(", ") : "");
    setTatValuesStr(proj.tatValues ? proj.tatValues.join(", ") : "");
    setInnovations(proj.innovations || []);
    setFeedbackRepo(proj.feedbackRepo || []);
    setUploadedFiles(proj.documents || []);
    
    setActiveSubTab("current");
    setIsEditing(true);
  };

  const handleEditUpcomingClick = (proj: UpcomingProject) => {
    setEditingId(proj.id);
    const names = proj.customerNames || (proj.customerName ? [proj.customerName] : ["unilever"]);
    setCustomerNames(names);
    setCustomerName(names[0] || "unilever");
    setName(proj.name);
    setDescription(proj.description);
    setDepartment(proj.department);
    setPubEnabled(proj.enabled !== false);
    setHiddenSections(proj.hiddenSections || []);

    setStatus(proj.status);
    setScope(proj.scope);
    setSolution(proj.solution);
    setTimelines(proj.timelines);
    setUpcomingDocs(proj.documents || []);

    setActiveSubTab("upcoming");
    setIsEditing(true);
  };

  const handleToggleCurrentEnable = async (proj: CurrentProject) => {
    const nextState = proj.enabled === false ? true : false;
    await onRefreshCurrent("update", { ...proj, enabled: nextState });
  };

  const handleToggleUpcomingEnable = async (proj: UpcomingProject) => {
    const nextState = proj.enabled === false ? true : false;
    await onRefreshUpcoming("update", { ...proj, enabled: nextState });
  };

  return (
    <div id="admin-projects-panel" className="space-y-6 text-left">
      {/* Upper Title Description segment */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-display font-bold text-base text-slate-900 leading-tight">
            Client Subdomain Portals & Engagement Desks
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Publish client-specific delivery timelines, SLA volume metrics, audit clarifications, and upcoming pilot scopes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsEditing(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-xl tracking-wide transition-all shadow-sm cursor-pointer shrink-0 font-sans"
        >
          ➕ Publish Project Card
        </button>
      </div>

      {/* EDIT / CREATE WORKSPACE */}
      {isEditing && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in bg-slate-50/40 p-5 rounded-2xl border border-slate-150">
        {/* Form Operations Context Header */}
        <div className="lg:col-span-12">
          <div className="p-3.5 bg-white border border-slate-200/60 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-3xs">
            <div>
              <span className="text-xs font-bold text-slate-900 block font-display">
                {editingId ? `✏️ Editing Active Engagement Card: "${name}"` : "➕ Onboard & Publish New Engagement Card"}
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {editingId 
                  ? "Overwriting active engagement charts will update client-facing graphs instantly." 
                  : "Fill in delivery timelines and map Google Drive documents to provision a new desk."}
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 text-[10px] bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-lg hover:bg-rose-100 transition-all font-mono uppercase tracking-wider"
              >
                Cancel Edit Mode
              </button>
            )}
          </div>
        </div>

        {/* Metadata Controls on Left Column */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
             <span className="text-[10px] font-mono font-bold text-orange-650 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
              📍 STEP 1: Select Target Subdomains (Multi-Select)
            </span>

              {/* Selector for portals */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-500">
                  Target Project Portals
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-205 flex flex-col gap-2 max-h-36 overflow-y-auto">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={customerNames.includes("all")}
                      onChange={() => handleSubdomainCheckboxChange("all")}
                      className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
                    />
                    <span className="text-slate-900 font-mono font-bold">All (Global)</span>
                  </label>
                  {subdomains.map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={customerNames.includes(sub.name)}
                        onChange={() => handleSubdomainCheckboxChange(sub.name)}
                        className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
                      />
                      <span className="text-slate-700 font-mono text-[10px]">{sub.displayName}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="E.g., Automated Bottling Pipeline Analytics"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="E.g. Logistics Maintenance APAC"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Strategic Brief Overview
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Short business case scope..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden"
                  required
                />
              </div>
            </div>

            {/* Show / Hide (Publish state) toggle & Checkboxes configurator */}
            <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Portal Publish State
                  </span>
                  <span className="text-[10px] text-slate-450 block leading-tight">
                    Show or hide this project in client portals.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPubEnabled(!pubEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    pubEnabled ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      pubEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-150 px-2.5 py-1.5 rounded-lg text-xs leading-none">
                {pubEnabled ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-650 shrink-0" />
                    <span className="font-semibold text-emerald-700">Publish State: SHOW (Active)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-500">Publish State: HIDE (Draft Mode)</span>
                  </>
                )}
              </div>
            </div>

            {/* Sections to Hide Checkbox configurator */}
            {activeSubTab === "current" && (
              <div className="p-5 bg-orange-50/40 border border-orange-100 rounded-2xl shadow-3xs space-y-3 text-left">
                <span className="block text-xs font-bold text-orange-950 uppercase tracking-wide">
                  📊 Toggle Section Visibility
                </span>
                <span className="text-[10px] text-orange-700/80 block leading-normal">
                  Toggle visibility for individual charts or modules on the project details scorecard below:
                </span>

                <div className="space-y-2 mt-2">
                  {[
                    { id: "deliveryVolumeChart", label: "Hide Delivery Volumes Graph" },
                    { id: "qualitySLAChart", label: "Hide SLA fulfillment Graph" },
                    { id: "tatChart", label: "Hide Turnaround Time (TAT) Graph" },
                    { id: "governanceDocs", label: "Hide Agreements & Telemetry" },
                    { id: "innovations", label: "Hide Innovations & Impact" },
                    { id: "feedbackRepo", label: "Hide Feedback repository ticket" },
                  ].map((item) => {
                    const isChecked = hiddenSections.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 text-xs font-medium text-slate-705 hover:text-slate-900 cursor-pointer select-none leading-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setHiddenSections(hiddenSections.filter((id) => id !== item.id));
                            } else {
                              setHiddenSections([...hiddenSections, item.id]);
                            }
                          }}
                          className="rounded text-orange-600 border-slate-300 focus:ring-orange-500 h-3.5 w-3.5 mt-0.5 shrink-0"
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Metric Details Form Columns on Right */}
          <div className="lg:col-span-8 space-y-4">
            {/* CURRENT ENGAGEMENT CONDITIONAL FIELDS */}
            {activeSubTab === "current" && (
              <div className="space-y-4">
                {/* SLA Graph inputs */}
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <h4 className="text-xs font-mono font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2 mb-2">
                      📈 Live Volumes & SLA Quality Trends (comma separated values)
                    </h4>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                      Delivery Monthly Months
                    </label>
                    <input
                      type="text"
                      value={deliveryLabelsStr}
                      onChange={(e) => setDeliveryLabelsStr(e.target.value)}
                      placeholder="Jan, Feb, Mar, Apr, May, Jun"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                      Delivery Values (Volume Packets)
                    </label>
                    <input
                      type="text"
                      value={deliveryValuesStr}
                      onChange={(e) => setDeliveryValuesStr(e.target.value)}
                      placeholder="180, 210, 240, 220, 280, 310"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                      Quality Monthly Months
                    </label>
                    <input
                      type="text"
                      value={qualityLabelsStr}
                      onChange={(e) => setQualityLabelsStr(e.target.value)}
                      placeholder="Jan, Feb, Mar, Apr, May, Jun"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                      Quality complianceValues %
                    </label>
                    <input
                      type="text"
                      value={qualityValuesStr}
                      onChange={(e) => setQualityValuesStr(e.target.value)}
                      placeholder="98.5, 99.1, 98.4, 99.2, 99.5, 99.8"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                {/* TAT exclusive details */}
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-3">
                    <h4 className="text-xs font-mono font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2 mb-2">
                      ⏱️ Turnaround Time (TAT) Performance metrics
                    </h4>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Target TAT Bound
                    </label>
                    <input
                      type="text"
                      value={tatTarget}
                      onChange={(e) => setTatTarget(e.target.value)}
                      placeholder="E.g., 24 Hours or 2 Hours"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Current Actual Average
                    </label>
                    <input
                      type="text"
                      value={tatActual}
                      onChange={(e) => setTatActual(e.target.value)}
                      placeholder="E.g., 18.5 Hours"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      TAT Values (Trend hours over time)
                    </label>
                    <input
                      type="text"
                      value={tatValuesStr}
                      onChange={(e) => setTatValuesStr(e.target.value)}
                      placeholder="23, 21.5, 20, 19.8, 19.1, 18.5"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Innovations with impact Sub Form */}
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
                  <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                    💡 Innovations & Enhancements Impact Catalog
                  </h4>

                  <div className="flex flex-col md:flex-row gap-3">
                    <input
                      type="text"
                      value={newInnTitle}
                      onChange={(e) => setNewInnTitle(e.target.value)}
                      placeholder="Innovation (e.g. Automated routing optimizer)"
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                    <input
                      type="text"
                      value={newInnImpact}
                      onChange={(e) => setNewInnImpact(e.target.value)}
                      placeholder="Business impact description (e.g., cut driver routing hours by 11%)"
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddInnovation}
                      className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                    >
                      Add Title
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scroll">
                    {innovations.map((inn, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs border border-slate-100">
                        <div className="text-left">
                          <span className="font-bold text-slate-800 block">{inn.title}</span>
                          <span className="text-slate-500 text-[11px]">{inn.impact}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInnovations(innovations.filter((_, i) => i !== idx))}
                          className="p-1 hover:text-rose-600 text-slate-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {innovations.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">No innovations listed. Use the entry creator below to add items.</p>
                    )}
                  </div>
                </div>

                {/* Feedback / Quality repository list */}
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
                  <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                    💬 Feedback & Clarification Repository Log
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pb-3 border-b border-slate-50">
                    <div className="md:col-span-6">
                      <input
                        type="text"
                        value={newFbDesc}
                        onChange={(e) => setNewFbDesc(e.target.value)}
                        placeholder="Feedback raised (e.g. latency, formatting)..."
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <input
                        type="date"
                        value={newFbReportDate}
                        onChange={(e) => setNewFbReportDate(e.target.value)}
                        title="Reported Date"
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <select
                        value={newFbStatus}
                        onChange={(e) => setNewFbStatus(e.target.value as any)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                      >
                        <option value="Open">Open</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddFeedback}
                        className="w-full px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scroll">
                    {feedbackRepo.map((fb, idx) => (
                      <div key={fb.id || idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs border border-slate-100 font-sans">
                        <div className="text-left space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide border ${
                              fb.status === "Resolved" 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {fb.status}
                            </span>
                            <span className="font-semibold text-slate-850 leading-relaxed">{fb.description}</span>
                          </div>
                          <div className="flex gap-4 text-[10px] text-slate-400 font-mono">
                            <span>Reported: {fb.reportedDate}</span>
                            {fb.resolvedDate && <span>Resolved: {fb.resolvedDate}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleFeedFeedbackStatus(fb.id)}
                            className="text-[10px] font-semibold border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded"
                          >
                            Toggle Status
                          </button>
                          <button
                            type="button"
                            onClick={() => setFeedbackRepo(feedbackRepo.filter(f => f.id !== fb.id))}
                            className="p-1 hover:text-rose-600 text-slate-400 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {feedbackRepo.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">No feedback tickets logged. Use AI generator to prefill.</p>
                    )}
                  </div>
                </div>

                {/* Specialized Google Drive Links Cabinet for Current Engagements */}
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4 text-left">
                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                      <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest font-sans">
                        🔗 Step 3: Map Google Drive Worksheets & SLA Documents
                      </span>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                        DRIVE SECURE ACTIVE
                      </span>
                    </div>

                    {/* Redesigned Asset Attachment section matching original screenshot request */}
                    <div className="space-y-3 text-left">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-900 tracking-wide uppercase">
                        <span>📁 Asset Attachment Mode</span>
                      </div>

                      {/* Side-by-side beautiful selective action buttons */}
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => setAssetAttachmentMode("local")}
                          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                            assetAttachmentMode === "local"
                              ? "bg-[#0d1527] border-transparent text-white shadow-xs"
                              : "bg-[#f1f5f9] border-[#e2e8f0] text-slate-700 hover:bg-[#e2e8f0]"
                          }`}
                        >
                          <Folder className="h-4 w-4" />
                          <span>Local Computer File</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssetAttachmentMode("drive")}
                          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                            assetAttachmentMode === "drive"
                              ? "bg-[#0d1527] border-transparent text-white shadow-xs"
                              : "bg-[#f1f5f9] border-[#e2e8f0] text-slate-700 hover:bg-[#e2e8f0]"
                          }`}
                        >
                          <Link className="h-4 w-4" />
                          <span>Google Drive Link URL</span>
                        </button>
                      </div>
                    </div>

                      {/* Redesigned dashed border panel centered style containing input fields */}
                      {assetAttachmentMode === "drive" ? (
                        <div className="border border-dashed border-slate-300 rounded-2xl p-5 bg-white space-y-4">
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                              INPUT DOCUMENT, SLIDE, VIDEO, SHEET LINK
                            </label>
                            <input
                              type="url"
                              value={googleDriveUrlInput}
                              onChange={(e) => setGoogleDriveUrlInput(e.target.value)}
                              placeholder="https://drive.google.com/your-document-link"
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white shadow-3xs"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1 font-mono uppercase">Asset Name override</label>
                              <input
                                type="text"
                                id="current-proj-drive-title"
                                placeholder="E.g., SLA_Logistics_Dashboard"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-3xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1 font-mono uppercase">Document Extension Type</label>
                              <select
                                id="current-proj-drive-type"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 shadow-3xs"
                              >
                                <option value="spreadsheet">Google Sheets Workbook (.gsheet)</option>
                                <option value="document">Google Doc specification (.gdoc)</option>
                                <option value="deck">Google Slides Presentation Outline (.gslides)</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const titleEl = document.getElementById("current-proj-drive-title") as HTMLInputElement;
                              const typeEl = document.getElementById("current-proj-drive-type") as HTMLSelectElement;
                              
                              const dUrl = googleDriveUrlInput;
                              if (!dUrl) {
                                alert("Please type or paste a valid Google Drive link first.");
                                return;
                              }

                              const dTitle = titleEl?.value || "Google Drive Reference Pointer";
                              const dType = typeEl?.value || "spreadsheet";

                              let resolvedMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                              let ext = ".gsheet";
                              if (dType === "document" || dUrl.includes("document")) {
                                resolvedMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                                ext = ".gdoc";
                              } else if (dType === "deck" || dUrl.includes("presentation") || dUrl.includes("slide")) {
                                resolvedMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
                                ext = ".gslides";
                              }

                              const finalName = dTitle.toLowerCase().endsWith(ext) ? dTitle : `${dTitle}${ext}`;

                              const newFileObj = {
                                name: finalName,
                                size: "Google Drive link",
                                type: resolvedMime,
                                content: `[Google Workspace Link: ${dUrl}]`
                              };
                              
                              setUploadedFiles((prev) => [...prev, newFileObj]);
                              setGoogleDriveUrlInput("");
                              if (titleEl) titleEl.value = "";
                            }}
                            className="w-full py-2 bg-black hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition duration-150 uppercase tracking-wider cursor-pointer"
                          >
                            ➕ Map Google Drive Link
                          </button>
                        </div>
                      ) : (
                        /* Local computer file selection option inside redesigned dashed container */
                        <div className="border border-dashed border-slate-300 rounded-2xl p-5 bg-white space-y-4 text-center">
                          <div className="py-2 space-y-1.5">
                            <Upload className="h-7 w-7 text-slate-400 mx-auto" />
                            <p className="text-xs text-slate-800 font-bold">Local File Simulator</p>
                            <p className="text-[10px] text-slate-450">Drag & drop files or click below to simulate direct localized assets upload.</p>
                          </div>

                          <input
                            type="file"
                            id="current-proj-real-file-input"
                            multiple
                            onChange={(e) => {
                              if (e.target.files) handleCurrentProjRealFilesUpload(e.target.files);
                            }}
                            className="hidden"
                          />

                          <button
                            type="button"
                            onClick={() => document.getElementById("current-proj-real-file-input")?.click()}
                            className="w-full py-2 bg-black hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition duration-150 uppercase tracking-wider cursor-pointer"
                          >
                            📁 Browse Local Computer Files
                          </button>
                        </div>
                      )}

                    {/* Pre-registered Fast Simulators */}
                    <div className="bg-slate-50 p-2.5 border border-slate-100 rounded-xl space-y-1.5 text-left">
                      <span className="text-[10px] font-semibold text-slate-600 block">⚡ Pre-populate Simulated Reference Pointer:</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddCurrentWorkspaceMock("Google Doc", "SLA_logistics_deliverables.gdoc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "SLA contract:\nTurnaround target: under 24 hours.")}
                          className="text-[9px] px-2 py-1 bg-white hover:bg-slate-101 border border-slate-200 rounded text-slate-650 font-medium transition-colors"
                        >
                          📝 SLA Doc
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddCurrentWorkspaceMock("Google Sheet", "logistics_sla_metrics.gsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Telemetry metrics:\nQ1 actual: 98.7%")}
                          className="text-[9px] px-2 py-1 bg-white hover:bg-slate-101 border border-slate-200 rounded text-slate-650 font-medium transition-colors"
                        >
                          📊 Quality Sheet
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddCurrentWorkspaceMock("Google Slide", "replenishment_overview.gslides", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Overview Slides:\nPipeline telemetry structure.")}
                          className="text-[9px] px-2 py-1 bg-white hover:bg-slate-101 border border-slate-200 rounded text-slate-650 font-medium transition-colors"
                        >
                          🖼️ Review Slide
                        </button>
                      </div>
                    </div>

                    {/* File Badges */}
                    <div className="flex flex-wrap gap-2 pt-1 text-left">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-150 rounded-lg text-[11px] text-slate-600 animate-fade-in">
                          <FileText className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="font-semibold">{file.name}</span>
                          <span className="text-[9px] text-slate-450 font-mono">({file.size})</span>
                          <button
                            type="button"
                            onClick={() => setUploadedFiles(uploadedFiles.filter((_, i) => i !== idx))}
                            className="hover:text-rose-600 text-slate-350 ml-1 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {uploadedFiles.length === 0 && (
                        <p className="text-[10px] text-slate-405 italic">No Google Drive reference pointers mapped yet.</p>
                      )}
                    </div>
                  </div>
               </div>
            )}

            {/* UPCOMING PIPELINES CONDITIONAL FIELDS */}
            {activeSubTab === "upcoming" && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
                  <h4 className="text-xs font-mono font-semibold text-slate-900 border-b border-slate-50 pb-2 mb-2 uppercase tracking-wide">
                    📦 Proposal Pipeline & Opportunities Specifics
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Current Lifecycle Status
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900"
                      >
                        <option value="Requirement gathering">Requirement gathering</option>
                        <option value="POC / pilot">POC / pilot</option>
                        <option value="Proposal">Proposal</option>
                        <option value="Awaiting approval">Awaiting approval</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Deployment Target Timelines
                      </label>
                      <input
                        type="text"
                        value={timelines}
                        onChange={(e) => setTimelines(e.target.value)}
                        placeholder="E.g., Discovery ends mid-July; Launch scheduled Sept 2026"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Business Scope parameters (Full View)
                    </label>
                    <textarea
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      rows={4}
                      placeholder="Detailing exact user journeys, volumes, and requirements mapped from initial discussions..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Proposed Solution Architecture
                    </label>
                    <textarea
                      value={solution}
                      onChange={(e) => setSolution(e.target.value)}
                      rows={4}
                      placeholder="Explain the machine learning pipelines, dashboard portals, dynamic APIs, or logistics modules proposed..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                  </div>
                </div>

                 {/* Categorized Document Upload shelf */}
                 <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
                   <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                     <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                       📝 Proposal Phase Collateral Upload (with Category labels)
                     </h4>
                     <div className="flex items-center gap-1.5 shrink-0">
                       <label className="text-[10px] text-slate-450 font-medium">Selected Category:</label>
                       <select
                         value={newUpDocCat}
                         onChange={(e) => setNewUpDocCat(e.target.value as any)}
                         className="px-2 py-0.5 border border-slate-205 rounded text-[10px] bg-orange-50/50 text-orange-850 font-semibold"
                       >
                         <option value="Sample Data">Sample Data</option>
                         <option value="Pricing">Pricing</option>
                         <option value="Proposal">Proposal Document</option>
                         <option value="Solution Approach">Solution Approach</option>
                       </select>
                     </div>
                   </div>

                   {/* Hidden File Input */}
                   <input
                     type="file"
                     id="upcoming-proj-real-file-input"
                     multiple
                     accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                     onChange={(e) => {
                       if (e.target.files) {
                         handleUpcomingProjRealFilesUpload(e.target.files);
                       }
                     }}
                     className="hidden"
                   />

                   {/* Drag and Drop Zone */}
                   <div
                     id="upcoming-proj-drop-zone"
                     onDragOver={(e) => {
                       e.preventDefault();
                       e.currentTarget.classList.add("border-orange-550", "bg-orange-50/20");
                     }}
                     onDragLeave={(e) => {
                       e.preventDefault();
                       e.currentTarget.classList.remove("border-orange-550", "bg-orange-50/20");
                     }}
                     onDrop={(e) => {
                       e.preventDefault();
                       e.currentTarget.classList.remove("border-orange-550", "bg-orange-50/20");
                       if (e.dataTransfer.files) {
                         handleUpcomingProjRealFilesUpload(e.dataTransfer.files);
                       }
                     }}
                     onClick={() => {
                       document.getElementById("upcoming-proj-real-file-input")?.click();
                     }}
                     className="border-2 border-dashed border-slate-200 hover:border-orange-550 hover:bg-slate-50/50 rounded-xl p-5 text-center cursor-pointer transition-all space-y-2 select-none"
                   >
                     <div className="mx-auto w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-650">
                       <FileUp className="h-5 w-5" />
                     </div>
                     <div>
                       <p className="text-[11px] font-semibold text-slate-700">Click to browse or drag file here</p>
                       <p className="text-[9px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                         Upload actual materials e.g. Google Doc (.gdoc/docx), Google Sheet (.gsheet/xlsx) or Google Slide (.gslides/pptx) to assign to the <strong>{newUpDocCat}</strong> slot.
                       </p>
                     </div>
                   </div>

                   {/* Add by Google Drive Link */}
                   <div className="bg-white p-3.5 border border-slate-200 rounded-xl space-y-2 text-left mb-3">
                     <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block">
                       🔗 Or attach via Google Drive Link URL:
                     </span>
                     <div className="flex gap-2">
                       <input
                         type="url"
                         id="upcoming-proj-drive-url"
                         placeholder="https://drive.google.com/open?id=..."
                         className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-slate-800 focus:outline-none bg-white text-slate-900"
                       />
                       <button
                         type="button"
                         onClick={() => {
                           const urlEl = document.getElementById("upcoming-proj-drive-url") as HTMLInputElement;
                           if (urlEl && urlEl.value) {
                             const driveVal = urlEl.value;
                             let filename = "google_drive_attachment.gdoc";
                             if (driveVal.includes("presentation") || driveVal.includes("slide")) filename = "google_slide_presentation.gslides";
                             else if (driveVal.includes("spreadsheet") || driveVal.includes("sheet")) filename = "google_sheet.gsheet";
                             else if (driveVal.includes("mp4") || driveVal.includes("video")) filename = "google_video.mp4";
                             
                             const newDoc = {
                               name: filename,
                               type: "application/vnd.google-apps",
                               category: newUpDocCat,
                               content: `Attached from Google Drive link: ${driveVal}`
                             };
                             setUpcomingDocs([...upcomingDocs, newDoc]);
                             urlEl.value = "";
                             alert("Google Drive document attached successfully onto current proposal slot!");
                           } else {
                             alert("Please enter a valid Google Drive link URL first.");
                           }
                         }}
                         className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition-all shrink-0 cursor-pointer text-center"
                       >
                         Attach Link
                       </button>
                     </div>
                   </div>

                   {/* Fast Simulators */}
                   <div className="bg-slate-50 p-2.5 border border-slate-100 rounded-xl space-y-1.5">
                     <span className="text-[10px] font-semibold text-slate-600 block">⚡ Simulate Customer Assets Upload:</span>
                     <div className="flex flex-wrap gap-1.5">
                       <button
                         type="button"
                         onClick={() => handleAddUpcomingWorkspaceMock("Google Doc", "unilever_proposal_v4.gdoc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "High-level Unilever executive proposal for automatic replenishment rollout.")}
                         className="text-[9px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-205 rounded text-slate-600 font-medium transition-colors"
                       >
                         📝 Proposal Doc
                       </button>
                       <button
                         type="button"
                         onClick={() => handleAddUpcomingWorkspaceMock("Google Sheet", "detailed_pricing_worksheet.gsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Total license pricing: v1 - $4,500/mo.\npilot fee $10,000.")}
                         className="text-[9px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-205 rounded text-slate-600 font-medium transition-colors"
                       >
                         📊 Pricing Sheet
                       </button>
                       <button
                         type="button"
                         onClick={() => handleAddUpcomingWorkspaceMock("Google Slide", "proposed_architecture.gslides", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Proposed system pipelines:\nSlide 1: Ingest telemetry.\nSlide 2: Trigger predictions.")}
                         className="text-[9px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-205 rounded text-slate-600 font-medium transition-colors"
                       >
                         🖼️ Architecture Pitch
                       </button>
                     </div>
                   </div>

                   {/* File List */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                     {upcomingDocs.map((doc, idx) => (
                       <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-150 rounded-xl text-xs">
                         <div className="flex items-center gap-2 min-w-0">
                           <FileText className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                           <div className="truncate text-left">
                             <span className="font-semibold text-slate-850 truncate block">{doc.name}</span>
                             <span className="text-[9px] px-1.5 py-0.2 bg-orange-50/80 rounded text-orange-650 uppercase tracking-widest font-bold text-[8px] mt-0.5 inline-block">
                               Category: {doc.category}
                             </span>
                           </div>
                         </div>
                         <button
                           type="button"
                           onClick={() => setUpcomingDocs(upcomingDocs.filter((_, i) => i !== idx))}
                           className="text-slate-350 hover:text-rose-600 transition-colors ml-2"
                         >
                           <X className="h-4 w-4" />
                         </button>
                       </div>
                     ))}
                     {upcomingDocs.length === 0 && (
                       <p className="text-[10px] text-slate-400 italic md:col-span-2">No documents submitted during requirement gathering.</p>
                     )}
                   </div>
                 </div>
              </div>
            )}

            {/* Bottom action bar */}
            <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-slate-250 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancel and Reset
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer font-sans uppercase tracking-wider disabled:opacity-50"
              >
                {submitting ? "Publishing..." : editingId ? "Publish Project Card (Save)" : "Publish Project Card"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Sub tabs selectors */}
      <div className="flex bg-slate-100 p-1 rounded-xl max-w-sm mt-8 mb-4">
        <button
          type="button"
          onClick={() => setActiveSubTab("current")}
          className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all ${
            activeSubTab === "current" ? "bg-white text-slate-900 shadow-3xs" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          📊 Current Engagements ({currentProjects.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("upcoming")}
          className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all ${
            activeSubTab === "upcoming" ? "bg-white text-slate-900 shadow-3xs" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          💡 Upcoming Pipelines ({upcomingProjects.length})
        </button>
      </div>

      {/* RENDER CURRENT PROJECTS DIRECTORY */}
      {activeSubTab === "current" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentProjects.map((proj) => (
              <div 
                key={proj.id}
                className={`p-5 rounded-2xl border transition-all ${
                  proj.enabled === false ? "bg-slate-50/50 border-slate-200 opacity-70" : "bg-white border-slate-100 shadow-3xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[8px] font-mono font-bold uppercase tracking-wider bg-slate-100 border px-2 py-0.5 rounded text-slate-500">
                      Client ID Context: {proj.customerName}
                    </span>
                    {proj.customerNames && proj.customerNames.map((n) => (
                      <span key={n} className="bg-orange-50 text-orange-600 font-semibold px-1 py-0.5 rounded text-[8px] uppercase">{n}</span>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {proj.enabled === false ? (
                      <span className="px-1.5 py-0.5 bg-amber-50 rounded text-[9px] uppercase tracking-wide font-mono font-semibold text-amber-600 border border-amber-200">
                        Hidden
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-emerald-50 rounded text-[9px] uppercase tracking-wide font-mono font-semibold text-emerald-600 border border-emerald-200">
                        Live User view
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-left">
                  <h4 className="font-display font-bold text-sm text-slate-900 leading-snug">
                    {proj.name}
                  </h4>
                  <span className="text-[10px] font-semibold text-orange-600 block mt-0.5">
                    🏢 Dept: {proj.department}
                  </span>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                    {proj.description}
                  </p>
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-50 flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <div className="flex gap-4">
                    <span>📊 Delivery: {proj.deliveryValues.length} months</span>
                    <span>💡 Innovations: {proj.innovations?.length || 0}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleCurrentEnable(proj)}
                      className="px-2.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 border border-slate-200"
                    >
                      {proj.enabled === false ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      <span>{proj.enabled === false ? "Show" : "Hide"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditCurrentClick(proj)}
                      className="p-1 hover:text-orange-600 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"
                      title="Edit project details"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Confirm permanent removal?")) {
                          onRefreshCurrent("delete", proj);
                        }
                      }}
                      className="p-1 hover:text-rose-600 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"
                      title="Delete card"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {currentProjects.length === 0 && (
            <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-205">
              <p className="text-xs text-slate-450 font-mono">No ongoing engagements configured yet.</p>
            </div>
          )}
        </div>
      )}

      {/* RENDER UPCOMING PROJECTS DIRECTORY */}
      {activeSubTab === "upcoming" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingProjects.map((proj) => (
              <div 
                key={proj.id}
                className={`p-5 rounded-2xl border transition-all ${
                  proj.enabled === false ? "bg-slate-50/50 border-slate-200 opacity-70" : "bg-white border-slate-100 shadow-3xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[8px] font-mono font-bold uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded text-orange-700">
                      Tenant Target: {proj.customerName}
                    </span>
                    {proj.customerNames && proj.customerNames.map((n) => (
                      <span key={n} className="bg-orange-50 text-orange-600 font-semibold px-1 py-0.5 rounded text-[8px] uppercase">{n}</span>
                    ))}
                  </div>
                  
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 rounded">
                    {proj.status}
                  </span>
                </div>

                <div className="mt-3 text-left">
                  <h4 className="font-display font-bold text-sm text-slate-900 leading-snug">
                    {proj.name}
                  </h4>
                  <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">
                    🏢 Proposed Dept: {proj.department}
                  </span>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                    {proj.description}
                  </p>
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-50 flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span className="font-mono text-[10px] bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded border border-sky-100">
                    ⏱️ timelines: {proj.timelines || "Not declared"}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleUpcomingEnable(proj)}
                      className="px-2.5 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 border border-slate-200"
                    >
                      {proj.enabled === false ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      <span>{proj.enabled === false ? "Show" : "Hide"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditUpcomingClick(proj)}
                      className="p-1 hover:text-orange-600 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Permanently drop upcoming proposal?")) {
                          onRefreshUpcoming("delete", proj);
                        }
                      }}
                      className="p-1 hover:text-rose-600 border border-slate-200 rounded  hover:bg-slate-50 text-slate-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {upcomingProjects.length === 0 && (
            <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-205 font-sans">
              <p className="text-xs text-slate-450 font-mono">No upcoming opportunity cards published yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
