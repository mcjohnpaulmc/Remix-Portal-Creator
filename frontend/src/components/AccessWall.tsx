import React, { useState } from "react";
import { ShieldCheck, Mail, AlertTriangle, Building, ArrowRight, Eye, EyeOff, X, Lock } from "lucide-react";
import { motion } from "motion/react";

interface AccessWallProps {
  onSuccess: (email: string, name?: string, role?: string) => void;
  onClose?: () => void;
}

export function AccessWall({ onSuccess, onClose }: AccessWallProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorString("");
    if (!email || !email.includes("@")) { setErrorString("Please enter a valid email address."); return; }
    if (!password) { setErrorString("Password is required."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorString(data.error || "Invalid credentials.");
      } else {
        localStorage.setItem("mobius_work_email", data.email);
        localStorage.setItem("mobius_user_name", data.name || "");
        localStorage.setItem("mobius_user_role", data.role || "viewer");
        localStorage.setItem("mobius_login_date", new Date().toDateString());
        onSuccess(data.email, data.name, data.role);
      }
    } catch {
      setErrorString("Server connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="access-wall" className="relative bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden w-full">
      {/* Abstract 3D-style backdrop — soft blurred orange blobs over white */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-gradient-to-br from-orange-300 via-orange-100 to-transparent opacity-60 blur-3xl" />
        <div className="absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-gradient-to-tr from-orange-400 via-orange-50 to-transparent opacity-50 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-56 w-56 rounded-full bg-gradient-to-b from-white via-orange-100 to-orange-200 opacity-40 blur-2xl" />
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-20 p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors border border-transparent hover:border-slate-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="relative z-10 p-7 md:p-9 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 tracking-tight leading-tight">
              Portal Login
            </h3>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">Use your registered credentials</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-1 focus:ring-orange-500 transition-all text-slate-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-1 focus:ring-orange-500 transition-all text-slate-900"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {errorString && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 text-xs leading-relaxed"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorString}</span>
            </motion.div>
          )}

          <button
            id="btn-authenticate"
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-medium text-sm rounded-xl transition-all disabled:opacity-50 hover:shadow-lg"
          >
            {loading ? "Verifying..." : "Sign In"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="text-[10px] text-slate-400 text-center">
          Contact your administrator to get access credentials.
        </p>
      </div>

      <div className="relative z-10 px-7 py-3 border-t border-slate-100 bg-white/80 backdrop-blur-sm flex items-center gap-2 text-xs text-slate-400">
        <Building className="h-3.5 w-3.5 shrink-0" />
        <span>Access restricted to registered portal users only</span>
      </div>
    </div>
  );
}
