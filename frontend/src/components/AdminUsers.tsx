import React, { useState } from "react";
import { Users, Plus, Trash2, Eye, EyeOff, Shield, User, Check, X, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PortalUser } from "../../../shared/types";

interface AdminUsersProps {
  users: PortalUser[];
  adminFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onRefresh: () => void;
}

const ROLES = ["viewer", "admin"] as const;

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-orange-100 text-orange-700 border-orange-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
};

export function AdminUsers({ users, adminFetch, onRefresh }: AdminUsersProps) {
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "viewer" as "viewer" | "admin" });
  const [showFormPw, setShowFormPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "viewer" as "viewer" | "admin", password: "" });
  const [showEditPw, setShowEditPw] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!form.email || !form.name || !form.password) {
      setFormError("All fields are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ action: "create", user: form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create user.");
      } else {
        setFormSuccess(`User "${form.name}" created.`);
        setForm({ email: "", name: "", password: "", role: "viewer" });
        onRefresh();
        setTimeout(() => setFormSuccess(""), 3000);
      }
    } catch {
      setFormError("Server error. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const res = await adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        action: "update",
        user: { id, name: editForm.name, role: editForm.role, ...(editForm.password ? { password: editForm.password } : {}) },
      }),
    });
    if (res.ok) { setEditId(null); onRefresh(); }
  };

  const handleToggleEnabled = async (user: PortalUser) => {
    await adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ action: "update", user: { id: user.id, enabled: !user.enabled } }),
    });
    onRefresh();
  };

  const handleDelete = async (user: PortalUser) => {
    if (!confirm(`Delete user "${user.name}" (${user.email})? This cannot be undone.`)) return;
    await adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ action: "delete", user: { id: user.id } }),
    });
    onRefresh();
  };

  const startEdit = (user: PortalUser) => {
    setEditId(user.id);
    setEditForm({ name: user.name, role: user.role, password: "" });
    setShowEditPw(false);
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      <div>
        <h3 className="font-display text-base font-bold text-slate-950 flex items-center gap-2">
          <Users className="h-4.5 w-4.5 text-orange-500" />
          User Management
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Onboard portal users who can log in to view solutions and collaterals. Roles: <strong>viewer</strong> (read-only access) · <strong>admin</strong> (full access).
        </p>
      </div>

      {/* Add User Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
          <Plus className="h-4 w-4 text-orange-500" /> Onboard New User
        </h4>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
            <input
              type="text"
              placeholder="John Smith"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
            <input
              type="email"
              placeholder="user@company.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Password</label>
            <div className="relative">
              <input
                type={showFormPw ? "text" : "password"}
                placeholder="Set a secure password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                required
              />
              <button type="button" onClick={() => setShowFormPw(p => !p)} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                {showFormPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as "viewer" | "admin" }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
            >
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>

          {formError && (
            <div className="sm:col-span-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="sm:col-span-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> {formSuccess}
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">Registered Users</span>
          <span className="text-xs text-slate-400 font-mono">{users.length} user{users.length !== 1 ? "s" : ""}</span>
        </div>

        {users.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No users yet. Add one above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <AnimatePresence>
              {users.map(user => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`px-5 py-3.5 ${user.enabled === false && !user.isSystem ? "opacity-50" : ""}`}
                >
                  {editId === user.id ? (
                    // Inline edit row
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold w-36 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <select
                        value={editForm.role}
                        onChange={e => setEditForm(f => ({ ...f, role: e.target.value as "viewer" | "admin" }))}
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div className="relative">
                        <input
                          type={showEditPw ? "text" : "password"}
                          placeholder="New password (optional)"
                          value={editForm.password}
                          onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                          className="px-2.5 py-1.5 pr-8 border border-slate-200 rounded-lg text-xs w-44 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                        <button type="button" onClick={() => setShowEditPw(p => !p)} className="absolute right-2 top-1.5 text-slate-400" tabIndex={-1}>
                          {showEditPw ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                      <button onClick={() => handleUpdate(user.id)} className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-500 transition-colors flex items-center gap-1">
                        <Check className="h-3 w-3" /> Save
                      </button>
                      <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${user.isSystem ? "bg-orange-600" : "bg-orange-100"}`}>
                          <span className={`text-xs font-bold ${user.isSystem ? "text-white" : "text-orange-700"}`}>{user.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 truncate">{user.name}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${ROLE_BADGE[user.role] || ROLE_BADGE.viewer}`}>
                              {user.role}
                            </span>
                            {user.isSystem && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-0.5">
                                <Shield className="h-2.5 w-2.5 inline" /> System
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-mono truncate block">{user.email}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {user.isSystem ? (
                          <span className="text-[10px] text-slate-400 italic select-none px-2">Protected</span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleEnabled(user)}
                              title={user.enabled === false ? "Enable user" : "Disable user"}
                              className="p-1.5 text-slate-400 hover:text-orange-500 transition-colors"
                            >
                              {user.enabled === false
                                ? <ToggleLeft className="h-4 w-4" />
                                : <ToggleRight className="h-4 w-4 text-emerald-500" />
                              }
                            </button>
                            <button
                              onClick={() => startEdit(user)}
                              className="p-1.5 text-slate-400 hover:text-orange-500 transition-colors"
                              title="Edit user"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(user)}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete user"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-400 leading-relaxed p-3 bg-slate-50 rounded-xl border border-slate-100">
        <Shield className="h-3 w-3 inline mr-1 text-orange-400" />
        <strong>Permissions:</strong> Viewer users can log in and view solutions/collaterals. Admin users have full read access and can be granted additional privileges. Passwords are stored as SHA-256 hashes. After creating or updating users, use <strong>Deploy</strong> on the Portal Domains page so that portal instances pick up the new credentials.
      </div>
    </div>
  );
}
