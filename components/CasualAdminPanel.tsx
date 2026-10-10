import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, UserPlus, Shield, Trash2, Key, ChevronDown, RefreshCw,
} from "lucide-react";
import { DEPARTMENTS } from "../constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CasualProfile {
  id: number | string;
  email: string;
  full_name?: string;
  name?: string;
  role: string;
  permissions?: Record<string, any>;
  accessible_departments?: string | string[];
}

interface CasualAdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: { id: number | string; role: string; name: string; email: string };
  allEmployees: { employee_id: string; name: string; department: string; designation: string; email?: string }[];
  onRecycleBin?: () => void;
  onForceSyncMedia?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const safeParseArr = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
};

const safeParseObj = (val: any): Record<string, any> => {
  if (!val) return {};
  if (typeof val === "object" && !Array.isArray(val)) return val;
  try { return JSON.parse(val) || {}; } catch { return {}; }
};

// ─── DepartmentMultiSelect ────────────────────────────────────────────────────

const DepartmentMultiSelect: React.FC<{
  selected: string[];
  onChange: (vals: string[]) => void;
}> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (dept: string) => {
    onChange(selected.includes(dept) ? selected.filter(d => d !== dept) : [...selected, dept]);
  };

  const filtered = DEPARTMENTS.filter(d => d.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
      >
        {selected.length === 0
          ? "No Access"
          : selected.length === DEPARTMENTS.length
          ? "All Depts"
          : `${selected.length} Dept${selected.length > 1 ? "s" : ""}`}
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[200] overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              placeholder="Search..."
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={selected.length === DEPARTMENTS.length}
                onChange={() => onChange(selected.length === DEPARTMENTS.length ? [] : [...DEPARTMENTS])}
                className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
              />
              <span className="text-xs font-bold text-orange-600">All Departments</span>
            </label>
            <div className="my-1 border-t border-slate-50" />
            {filtered.map(dept => (
              <label key={dept} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(dept)}
                  onChange={() => toggle(dept)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                />
                <span className={`text-xs ${selected.includes(dept) ? "font-bold text-orange-600" : "text-slate-700"}`}>{dept}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Add User Modal ───────────────────────────────────────────────────────────

const AddUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (form: any) => Promise<{ success: boolean; error?: string }>;
  allEmployees: CasualAdminPanelProps["allEmployees"];
}> = ({ isOpen, onClose, onSubmit, allEmployees }) => {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "user", department: "", designation: "", username: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<typeof allEmployees>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggRef.current && !suggRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isOpen) return null;

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setForm(prev => {
      const next = { ...prev, email };
      if (email) {
        const match = allEmployees.find(emp => emp.email?.toLowerCase() === email.toLowerCase());
        if (match) {
          next.full_name = match.name || "";
          next.username = match.name || "";
          next.department = match.department || "";
          next.designation = match.designation || "";
        }
      }
      return next;
    });
    if (email.trim()) {
      const filtered = allEmployees.filter(emp => emp.email?.toLowerCase().includes(email.toLowerCase())).slice(0, 5);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelect = (emp: typeof allEmployees[0]) => {
    setForm(prev => ({ ...prev, email: emp.email || "", full_name: emp.name || "", username: emp.name || "", department: emp.department || "", designation: emp.designation || "" }));
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(form);
    if (result.success) {
      onClose();
      setForm({ email: "", password: "", full_name: "", role: "user", department: "", designation: "", username: "" });
    } else {
      setError(result.error || "Failed to create user.");
    }
    setSubmitting(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-orange-500" /> Create New User
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Add a user who can access Casual Activities</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100">{error}</div>}

          {/* Email with suggestions */}
          <div className="relative" ref={suggRef}>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Email Address</label>
            <input
              required type="email" value={form.email} onChange={handleEmailChange}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 border-l-4 border-l-orange-400"
              placeholder="john@example.com"
            />
            {showSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-[110] overflow-hidden">
                {suggestions.map((emp, idx) => (
                  <button key={idx} type="button" onClick={() => handleSelect(emp)}
                    className="w-full text-left px-4 py-2.5 hover:bg-orange-50 flex flex-col transition-colors border-b last:border-0 border-slate-50">
                    <span className="text-sm font-bold text-slate-800">{emp.name}</span>
                    <span className="text-xs text-slate-500">{emp.email}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1 ml-1">If email matches an employee, details will auto-fill.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Full Name</label>
              <input required type="text" value={form.full_name}
                onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value, username: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Full Name" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Role</label>
              <select value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Temporary Password</label>
            <input required type="password" value={form.password} minLength={6}
              onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Min. 6 characters" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Department</label>
              <input type="text" value={form.department}
                onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Engineering" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Designation</label>
              <input type="text" value={form.designation}
                onChange={e => setForm(prev => ({ ...prev, designation: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Executive" />
            </div>
          </div>

          <div className="pt-2">
            <button disabled={submitting} type="submit"
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-orange-500/25">
              {submitting ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Creating...</>
              ) : (
                <><UserPlus className="h-4 w-4" /> Create User</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ─── Permission Row ───────────────────────────────────────────────────────────

const PermCheckbox: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onChange: (val: boolean) => void;
  label: string;
}> = ({ checked, disabled, onChange, label }) => (
  <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
    />
    <span>{label}</span>
  </label>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const CasualAdminPanel: React.FC<CasualAdminPanelProps> = ({
  isOpen,
  onClose,
  currentUser,
  allEmployees,
  onRecycleBin,
  onForceSyncMedia,
}) => {
  const [profiles, setProfiles] = useState<CasualProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const isAdmin = ["Admin", "Super Admin", "admin", "super_admin"].includes(currentUser.role ?? "");

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data: CasualProfile[] = await res.json();
        setProfiles(data);
      }
    } catch (err) {
      console.error("Failed to fetch profiles", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchProfiles();
  }, [isOpen, fetchProfiles]);

  const handleUpdatePermission = useCallback(async (profileId: number | string, key: string, value: any) => {
    setSaving(String(profileId));
    // Optimistic update
    setProfiles(prev => prev.map(p => {
      if (String(p.id) !== String(profileId)) return p;
      const perms = safeParseObj(p.permissions);
      if (key === "accessible_departments") {
        return { ...p, accessible_departments: value };
      }
      return { ...p, permissions: { ...perms, [key]: value } };
    }));

    try {
      const profile = profiles.find(p => String(p.id) === String(profileId));
      if (!profile) return;

      if (key === "accessible_departments") {
        await fetch(`/api/users/${profileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessible_departments: JSON.stringify(value) }),
        });
      } else {
        const perms = safeParseObj(profile.permissions);
        const updatedPerms = { ...perms, [key]: value };
        await fetch(`/api/users/${profileId}/permissions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: updatedPerms }),
        });
      }
    } catch (err) {
      console.error("Permission update failed", err);
      fetchProfiles(); // re-fetch on failure
    } finally {
      setSaving(null);
    }
  }, [profiles, fetchProfiles]);

  const handleAddUser = async (form: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await fetchProfiles();
        return { success: true };
      }
      const err = await res.json();
      return { success: false, error: err.message || "Failed to create user." };
    } catch (e) {
      return { success: false, error: "Network error." };
    }
  };

  const handleDeleteUser = async (profileId: number | string) => {
    if (!window.confirm("এই user টি delete করবেন?")) return;
    try {
      await fetch(`/api/users/${profileId}`, { method: "DELETE" });
      setProfiles(prev => prev.filter(p => String(p.id) !== String(profileId)));
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  if (!isOpen) return null;

  const filtered = profiles.filter(p =>
    (p.email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.full_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.role?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-xl">
            <Shield className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Casual Activities — User Management</h2>
            <p className="text-xs text-slate-500">Manage access, permissions & department visibility</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onForceSyncMedia && (
            <button onClick={onForceSyncMedia}
              className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl text-sm font-bold hover:bg-sky-100 transition-all border border-sky-200">
              <RefreshCw className="h-4 w-4" /> Sync Media
            </button>
          )}
          {onRecycleBin && (
            <button onClick={onRecycleBin}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all border border-red-200">
              <Trash2 className="h-4 w-4" /> Recycle Bin
            </button>
          )}
          <button onClick={() => setIsAddingUser(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/25 active:scale-95">
            <UserPlus className="h-4 w-4" /> Add User
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text" placeholder="Search by name, email or role..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Loading users...
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-4">User</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Logger Access</th>
                    <th className="px-5 py-4">Employees</th>
                    <th className="px-5 py-4">Remarks</th>
                    <th className="px-5 py-4">Reports & Analytics</th>
                    <th className="px-5 py-4">Department Access</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length > 0 ? filtered.map(profile => {
                    const perms = safeParseObj(profile.permissions);
                    const isProfileAdmin = ["admin", "super_admin", "Admin", "Super Admin"].includes(profile.role);
                    const displayName = profile.full_name || profile.name || "No Name";
                    const isSavingThis = saving === String(profile.id);

                    return (
                      <tr key={profile.id} className={`text-sm transition-colors ${isSavingThis ? "bg-orange-50/50" : "hover:bg-slate-50/50"}`}>
                        {/* User */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{displayName}</span>
                            <span className="text-xs text-slate-500">{profile.email}</span>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-5 py-4">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${isProfileAdmin ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"}`}>
                            {profile.role}
                          </span>
                        </td>

                        {/* Logger Access */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-2">
                            <PermCheckbox label="Open Logger" checked={perms.can_open_logger || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_open_logger", v)} />
                            <PermCheckbox label="View All" checked={perms.can_view_all_activities || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_view_all_activities", v)} />
                            <PermCheckbox label="Add/Edit" checked={perms.can_edit_activity || perms.can_edit_data || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_edit_activity", v)} />
                            <PermCheckbox label="Delete" checked={perms.can_delete_activity || perms.can_edit_data || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_delete_activity", v)} />
                          </div>
                        </td>

                        {/* Employees */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-2">
                            <PermCheckbox label="View List" checked={perms.can_view_employee_list || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_view_employee_list", v)} />
                            <PermCheckbox label="Add/Edit" checked={perms.can_edit_employee || perms.can_edit_data || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_edit_employee", v)} />
                            <PermCheckbox label="Delete" checked={perms.can_delete_employee || perms.can_edit_data || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_delete_employee", v)} />
                          </div>
                        </td>

                        {/* Remarks */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-2">
                            <PermCheckbox label="View" checked={perms.can_view_remarks_list || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_view_remarks_list", v)} />
                            <PermCheckbox label="Add/Edit" checked={perms.can_edit_remark || perms.can_edit_data || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_edit_remark", v)} />
                            <PermCheckbox label="Delete" checked={perms.can_delete_remark || perms.can_edit_data || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_delete_remark", v)} />
                          </div>
                        </td>

                        {/* Reports & Analytics */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-2">
                            <PermCheckbox label="Generate Reports" checked={perms.can_generate_reports || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_generate_reports", v)} />
                            <PermCheckbox label="Send Email" checked={perms.can_send_email || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_send_email", v)} />
                            <PermCheckbox label="View Analytics" checked={perms.can_view_analytics || isProfileAdmin} disabled={isProfileAdmin}
                              onChange={v => handleUpdatePermission(profile.id, "can_view_analytics", v)} />
                          </div>
                        </td>

                        {/* Department Access */}
                        <td className="px-5 py-4">
                          {isProfileAdmin ? (
                            <span className="text-[10px] text-slate-400 italic">All Access</span>
                          ) : (
                            <DepartmentMultiSelect
                              selected={safeParseArr(profile.accessible_departments)}
                              onChange={vals => handleUpdatePermission(profile.id, "accessible_departments", vals)}
                            />
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            {isSavingThis && <RefreshCw className="h-3.5 w-3.5 text-orange-400 animate-spin" />}
                            {isAdmin && !isProfileAdmin && (
                              <button onClick={() => handleDeleteUser(profile.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete User">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 italic text-sm">
                        No users found{searchTerm ? ` matching "${searchTerm}"` : ""}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Users: {filtered.length}</p>
              <button onClick={fetchProfiles} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider transition-colors">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddingUser}
        onClose={() => setIsAddingUser(false)}
        onSubmit={handleAddUser}
        allEmployees={allEmployees}
      />
    </div>,
    document.body
  );
};

export default CasualAdminPanel;
