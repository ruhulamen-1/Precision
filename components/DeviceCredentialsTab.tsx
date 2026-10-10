import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import _ from "lodash";
import {
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  X,
  Search,
  ShieldCheck,
  Upload,
  Download,
} from "lucide-react";
import { DeviceCredential, User } from "../types";
import FeedbackMessage from "./FeedbackMessage";
import { parseCSVRobustly } from "../utils/csvUtils";

interface DeviceCredentialsTabProps {
  currentUser: User;
}

interface CredentialFormState {
  id: number | null;
  zone: string;
  projectName: string;
  deviceSlNo: string;
  username: string;
  password: string;
}

const emptyForm: CredentialFormState = {
  id: null,
  zone: "",
  projectName: "",
  deviceSlNo: "",
  username: "",
  password: "",
};

const CredentialModal: React.FC<{
  initial: CredentialFormState;
  existingZones: string[];
  onClose: () => void;
  onSave: (form: CredentialFormState) => Promise<void>;
}> = ({ initial, existingZones, onClose, onSave }) => {
  const [form, setForm] = useState<CredentialFormState>(initial);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isEdit = initial.id !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.zone.trim() || !form.projectName.trim() || !form.deviceSlNo.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        ...form,
        zone: form.zone.trim(),
        projectName: form.projectName.trim(),
        deviceSlNo: form.deviceSlNo.trim(),
        username: form.username.trim(),
        password: form.password,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-orange-500" />
            {isEdit ? "Edit Device Credential" : "Add Device Credential"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form
          id="device-credential-form"
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto"
        >
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Zone <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              list="device-credential-zones"
              required
              value={form.zone}
              onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
              placeholder="e.g. Zone A"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
            />
            <datalist id="device-credential-zones">
              {existingZones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Project Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.projectName}
              onChange={(e) =>
                setForm((f) => ({ ...f, projectName: e.target.value }))
              }
              placeholder="e.g. Credence Nandan"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Device SL No <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.deviceSlNo}
              onChange={(e) =>
                setForm((f) => ({ ...f, deviceSlNo: e.target.value }))
              }
              placeholder="e.g. DVR-01"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                placeholder="admin"
                className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="••••••••"
                  className="w-full text-sm p-2.5 pr-9 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="device-credential-form"
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-md shadow-orange-100 hover:shadow-lg hover:shadow-orange-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const DeviceCredentialsTab: React.FC<DeviceCredentialsTabProps> = ({
  currentUser,
}) => {
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Set<number>>(
    new Set(),
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CredentialFormState>(emptyForm);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit =
    currentUser.permissions?.itResponseTimeline?.edit ||
    currentUser.role === "super_admin" ||
    currentUser.role === "admin";

  const fetchCredentials = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/device-credentials");
      if (res.ok) {
        const data = await res.json();
        setCredentials(data);
      } else {
        setFeedback({ message: "Failed to load device credentials.", type: "error" });
      }
    } catch (err) {
      setFeedback({ message: "Network error while loading device credentials.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const existingZones = useMemo(
    () => _.uniq(credentials.map((c) => c.zone)).filter(Boolean).sort(),
    [credentials],
  );

  const filteredCredentials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return credentials.filter((c) => {
      const zoneMatch = !zoneFilter || c.zone === zoneFilter;
      const searchMatch =
        !q ||
        c.projectName?.toLowerCase().includes(q) ||
        c.deviceSlNo?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.zone?.toLowerCase().includes(q);
      return zoneMatch && searchMatch;
    });
  }, [credentials, searchQuery, zoneFilter]);

  const groupedByZone = useMemo(() => {
    return _.chain(filteredCredentials)
      .groupBy("zone")
      .map((items, zone) => ({
        zone,
        items: _.orderBy(items, ["projectName", "deviceSlNo"], ["asc", "asc"]),
      }))
      .orderBy(["zone"], ["asc"])
      .value();
  }, [filteredCredentials]);

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch (err) {
      setFeedback({ message: "Could not copy to clipboard.", type: "error" });
    }
  };

  const openAddModal = () => {
    setEditingRecord(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (record: DeviceCredential) => {
    setEditingRecord({
      id: record.id,
      zone: record.zone,
      projectName: record.projectName,
      deviceSlNo: record.deviceSlNo,
      username: record.username || "",
      password: record.password || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async (form: CredentialFormState) => {
    const isEdit = form.id !== null;
    try {
      const res = await fetch(
        isEdit ? `/api/device-credentials/${form.id}` : "/api/device-credentials",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone: form.zone,
            projectName: form.projectName,
            deviceSlNo: form.deviceSlNo,
            username: form.username,
            password: form.password,
          }),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save device credential.");
      }
      setFeedback({
        message: isEdit ? "Device credential updated." : "Device credential added.",
        type: "success",
      });
      setIsModalOpen(false);
      fetchCredentials();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : "Failed to save device credential.",
        type: "error",
      });
    }
  };

  const handleDelete = async (record: DeviceCredential) => {
    if (
      !window.confirm(
        `Delete credential for "${record.projectName}" (${record.deviceSlNo})? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/device-credentials/${record.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete.");
      setFeedback({ message: "Device credential deleted.", type: "info" });
      setCredentials((prev) => prev.filter((c) => c.id !== record.id));
    } catch (err) {
      setFeedback({ message: "Failed to delete device credential.", type: "error" });
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ["Zone", "Project Name", "Device SL No", "Username", "Password"];
    const sampleRow = ["Zone A", "Credence Nandan", "DVR-01", "admin", "admin123"];
    const csvContent = [headers.join(","), sampleRow.join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "device_credentials_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback({ message: "Template downloaded successfully!", type: "success" });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFeedback({ message: "Parsing and uploading data...", type: "info" });

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const requiredHeaders = ["Zone", "Project Name", "Device SL No"];
        const headers = results.meta.fields || [];

        if (!requiredHeaders.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              "CSV is missing required headers. Please use the template (Zone, Project Name, Device SL No, Username, Password).",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const newRecords: {
          zone: string;
          projectName: string;
          deviceSlNo: string;
          username: string;
          password: string;
        }[] = [];
        let errorOccurred = false;

        for (const [index, row] of results.data.entries()) {
          if (errorOccurred) break;

          for (const field of requiredHeaders) {
            if (!row[field]) {
              setFeedback({
                message: `Row ${index + 2}: Missing data for required field "${field}".`,
                type: "error",
              });
              errorOccurred = true;
              break;
            }
          }
          if (errorOccurred) continue;

          newRecords.push({
            zone: row["Zone"],
            projectName: row["Project Name"],
            deviceSlNo: row["Device SL No"],
            username: row["Username"] || "",
            password: row["Password"] || "",
          });
        }

        if (!errorOccurred && newRecords.length > 0) {
          try {
            const response = await fetch("/api/device-credentials/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newRecords),
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error || `Failed to save: ${response.status}`);
            }

            setFeedback({
              message: `Successfully imported ${newRecords.length} device credential(s).`,
              type: "success",
            });
            fetchCredentials();
          } catch (error) {
            setFeedback({
              message:
                error instanceof Error
                  ? error.message
                  : "Error saving imported records.",
              type: "error",
            });
          }
        }
      },
      error: (err: any) => {
        setFeedback({
          message: `Error parsing CSV: ${err.message}`,
          type: "error",
        });
      },
    });

    if (event.target) event.target.value = "";
  };

  return (
    <div className="fade-in">
      <div className="p-6 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-4 flex-grow">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by project, device SL, username, zone..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
              >
                <option value="">All Zones</option>
                {existingZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <label
                htmlFor="device-credentials-csv-upload"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50"
              >
                <Upload className="h-4 w-4" />
                Import (CSV)
              </label>
              <input
                id="device-credentials-csv-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="sr-only"
                accept=".csv"
              />
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Template
              </button>
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-sm font-medium rounded-md shadow-sm text-white"
              >
                <Plus className="h-4 w-4" />
                Add Credential
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <p className="p-6 text-center text-slate-500">Loading device credentials...</p>
        ) : groupedByZone.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {groupedByZone.map(({ zone, items }) => (
              <div key={zone}>
                <div className="px-4 py-2 bg-slate-100/70 backdrop-blur-sm sticky top-0 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    {zone || "Unassigned Zone"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {items.length} device{items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50/60">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Project Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Device SL No
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Password
                      </th>
                      {canEdit && (
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {items.map((record) => {
                      const isPwVisible = visiblePasswordIds.has(record.id);
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                            {record.projectName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                            {record.deviceSlNo}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span>{record.username || "—"}</span>
                              {record.username && (
                                <button
                                  onClick={() => handleCopy(record.username, `u-${record.id}`)}
                                  className="text-slate-400 hover:text-orange-500"
                                  title="Copy username"
                                >
                                  {copiedKey === `u-${record.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span>
                                {record.password
                                  ? isPwVisible
                                    ? record.password
                                    : "••••••••"
                                  : "—"}
                              </span>
                              {record.password && (
                                <>
                                  <button
                                    onClick={() => togglePasswordVisibility(record.id)}
                                    className="text-slate-400 hover:text-orange-500"
                                    title={isPwVisible ? "Hide password" : "Show password"}
                                  >
                                    {isPwVisible ? (
                                      <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                      <Eye className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleCopy(record.password, `p-${record.id}`)}
                                    className="text-slate-400 hover:text-orange-500"
                                    title="Copy password"
                                  >
                                    {copiedKey === `p-${record.id}` ? (
                                      <Check className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          {canEdit && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditModal(record)}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(record)}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-6 text-center text-slate-500">
            No device credentials found. {canEdit ? 'Click "Add Credential" to save one.' : ""}
          </p>
        )}
      </div>

      {isModalOpen && (
        <CredentialModal
          initial={editingRecord}
          existingZones={existingZones}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}
    </div>
  );
};

export default DeviceCredentialsTab;