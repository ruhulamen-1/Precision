import React, { useState, useEffect, useRef } from "react";
import {
  User,
  RubbishVerification as RubbishVerificationType,
  RubbishStatus,
  Project,
  AllEmployee,
} from "../types";
import {
  Save,
  Plus,
  Edit2,
  X,
  Check,
  Trash2,
  Calendar,
  ClipboardList,
  Loader2,
  Upload,
  Search,
  ChevronDown,
} from "lucide-react";
import { getEffectivePermissions } from "../utils/permissionUtils";

const getLocalDateString = () => {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().split("T")[0];
};

const formatToDDMMMYYYY = (dateStr: string) => {
  if (!dateStr) return "";
  // Only format if it's a standard YYYY-MM-DD string
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${String(date.getDate()).padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
  }
  // Return raw string otherwise (e.g. while typing "14 May")
  return dateStr;
};

const getLocalTimeString = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

interface Props {
  currentUser: User;
  allProjects?: Project[];
  allEmployees?: AllEmployee[];
}

const RubbishVerification: React.FC<Props> = ({
  currentUser,
  allProjects = [],
  allEmployees = [],
}) => {
  const permissions = getEffectivePermissions(currentUser).rubbishVerification;
  const canEdit = permissions?.edit || currentUser.role === "super_admin";
  const canAudit = permissions?.audit || currentUser.role === "super_admin";

  const [keepCommonFields, setKeepCommonFields] = useState(false);
  const [lastSharedData, setLastSharedData] =
    useState<Partial<RubbishVerificationType> | null>(null);

  const [records, setRecords] = useState<RubbishVerificationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isBulkUploading, setIsBulkUploading] = useState(false);

  // Project Search State
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectList, setShowProjectList] = useState(false);

  // Officers Suggestion State
  const [officerSearch, setOfficerSearch] = useState("");
  const [showOfficerList, setShowOfficerList] = useState(false);

  // Status Suggestion State
  const [showStatusList, setShowStatusList] = useState(false);

  // Form Refs for navigation
  const inputRefs = {
    project_name: useRef<HTMLInputElement>(null),
    officers: useRef<HTMLInputElement>(null),
    designation: useRef<HTMLInputElement>(null),
    bill_no: useRef<HTMLInputElement>(null),
    bill: useRef<HTMLInputElement>(null),
    gp_no: useRef<HTMLInputElement>(null),
    truck_no: useRef<HTMLInputElement>(null),
    date: useRef<HTMLInputElement>(null),
    check_date: useRef<HTMLInputElement>(null),
    in_time: useRef<HTMLInputElement>(null),
    out_time: useRef<HTMLInputElement>(null),
    status: useRef<HTMLInputElement>(null),
    sg_presence: useRef<HTMLInputElement>(null),
    remarks: useRef<HTMLTextAreaElement>(null),
  };

  // Form States
  const [formData, setFormData] = useState<Partial<RubbishVerificationType>>({
    project_name: "",
    officers: "",
    designation: "",
    bill_no: "",
    bill: "",
    gp_no: "",
    truck_no: "",
    date: getLocalDateString(),
    in_time: getLocalTimeString(),
    out_time: "",
    status: "Pending",
    sg_presence: "",
    remarks: "",
    checked_by: "",
    check_date: getLocalDateString(),
  });

  const statusOptions: RubbishStatus[] = [
    "Fine",
    "Offline",
    "Failed",
    "Hand Over",
    "GP Missing",
    "No Recorded",
    "Pending",
    "Camera Missing",
  ];

  const parseDateInput = (value: string) => {
    if (!value) return getLocalDateString();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Try standard YYYY-MM-DD first
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    // Day only: "14"
    if (/^\d{1,2}$/.test(value)) {
      const day = parseInt(value);
      return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    let day,
      month,
      year = currentYear;
    // Match day and month part: "14-5", "14/5", "14 5", "14 May", "14May"
    const match = value.match(/^(\d{1,2})[\s\-\/\.]*([a-zA-Z]+|[0-9]{1,2})$/);
    if (match) {
      day = parseInt(match[1]);
      const monthPart = match[2].toLowerCase();
      if (isNaN(parseInt(monthPart))) {
        const mos = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];
        month = mos.findIndex((m) => monthPart.startsWith(m));
      } else {
        month = parseInt(monthPart) - 1;
      }
      if (month >= 0 && month < 12 && day > 0 && day <= 31) {
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    // Day Month Year: "14-5-2024", "14 May 2024", "14-5-24"
    const fullMatch = value.match(
      /^(\d{1,2})[\s\-\/\.]*([a-zA-Z]+|[0-9]{1,2})[\s\-\/\.]*(\d{2,4})$/,
    );
    if (fullMatch) {
      day = parseInt(fullMatch[1]);
      const monthPart = fullMatch[2].toLowerCase();
      year = parseInt(fullMatch[3]);
      if (year < 100) year += 2000;
      if (isNaN(parseInt(monthPart))) {
        const mos = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];
        month = mos.findIndex((m) => monthPart.startsWith(m));
      } else {
        month = parseInt(monthPart) - 1;
      }
      if (month >= 0 && month < 12 && day > 0 && day <= 31) {
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    return value;
  };

  const parseTimeInput = (value: string) => {
    if (!value) return "";
    let clean = value.replace(":", "");
    if (clean.length === 1) clean = "0" + clean + "00";
    if (clean.length === 2) clean = clean + "00";
    if (clean.length === 3) clean = "0" + clean;
    if (clean.length === 4) {
      const h = clean.substring(0, 2);
      const m = clean.substring(2, 4);
      return `${h}:${m}`;
    }
    return value;
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: keyof typeof inputRefs,
  ) => {
    if (e.key === "Tab") {
      // Autocomplete logic for Project and Officer
      if (field === "project_name" && showProjectList) {
        const matches = allProjects.filter((p) =>
          p.name
            .toLowerCase()
            .includes(
              (projectSearch || formData.project_name || "").toLowerCase(),
            ),
        );
        if (matches.length > 0) {
          e.preventDefault();
          setFormData({ ...formData, project_name: matches[0].name });
          setProjectSearch(matches[0].name);
          setShowProjectList(false);
          inputRefs.officers.current?.focus();
        }
      } else if (field === "officers" && showOfficerList) {
        const matches = allEmployees.filter((emp) =>
          emp.name
            .toLowerCase()
            .includes((officerSearch || formData.officers || "").toLowerCase()),
        );
        if (matches.length > 0) {
          e.preventDefault();
          setFormData({
            ...formData,
            officers: matches[0].name,
            designation: matches[0].designation,
          });
          setOfficerSearch(matches[0].name);
          setShowOfficerList(false);
          inputRefs.bill_no.current?.focus();
        }
      } else if (field === "status" && showStatusList) {
        const matches = statusOptions.filter((opt) =>
          opt.toLowerCase().includes((formData.status || "").toLowerCase()),
        );
        if (matches.length > 0) {
          e.preventDefault();
          const newStatus = matches[0];
          setFormData({
            ...formData,
            status: newStatus,
            checked_by: newStatus !== "Pending" ? currentUser.name : "",
          });
          setShowStatusList(false);
          inputRefs.sg_presence.current?.focus();
        }
      }
    }

    if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
      // Specific overrides already handled above
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rubbish-verification");
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (error) {
      console.error("Failed to fetch records", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const resetForm = (preservedData?: Partial<RubbishVerificationType>) => {
    const dataToUse =
      preservedData || (keepCommonFields ? lastSharedData : null);
    setFormData({
      project_name: dataToUse?.project_name || "",
      officers: dataToUse?.officers || "",
      designation: dataToUse?.designation || "",
      bill_no: dataToUse?.bill_no || "",
      bill: dataToUse?.bill || "",
      gp_no: "",
      truck_no: "",
      date: getLocalDateString(),
      in_time: getLocalTimeString(),
      out_time: "",
      status: "Pending",
      sg_presence: "",
      remarks: "",
      checked_by: "",
      check_date: getLocalDateString(),
    });
    setProjectSearch(dataToUse?.project_name || "");
    setOfficerSearch(dataToUse?.officers || "");
    setIsAdding(false);
    setEditingId(null);
  };

  const downloadTemplate = () => {
    const headers = [
      "Project Name",
      "Officers",
      "Designation",
      "Bill No",
      "Bill",
      "GP No",
      "Truck No",
      "Date",
      "Check Date",
      "In Time",
      "Out Time",
      "Status",
      "SG Presence",
      "Remarks",
    ];
    const csvContent =
      headers.join(",") +
      "\n" +
      "Example Project,John Doe,Manager,B-1234,Bill-001,GP-5678,TR-9012,14 May 2024,14 May 2024,08:30,17:30,Fine,Present,Example Remarks";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "rubbish_verification_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBulkUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = text.split("\n").map((row) => row.split(","));

      // Assume header: Project Name, Officers, Designation, Bill No, GP No, Truck No, Date, Check Date, In Time, Out Time, Status, SG Presence, Remarks
      const recordsToUpload: Partial<RubbishVerificationType>[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 1) continue;

        const [
          projectName,
          officers,
          designation,
          billNo,
          bill,
          gpNo,
          truckNo,
          date,
          checkDate,
          inTime,
          outTime,
          status,
          sgPresence,
          remarks,
        ] = row.map((s) => s?.trim());

        if (!projectName) continue;

        recordsToUpload.push({
          project_name: projectName,
          officers: officers || "",
          designation: designation || "",
          bill_no: billNo || "",
          bill: bill || "",
          gp_no: gpNo || "",
          truck_no: truckNo || "",
          date: parseDateInput(date),
          check_date: parseDateInput(checkDate),
          in_time: parseTimeInput(inTime),
          out_time: parseTimeInput(outTime),
          status: (status as RubbishStatus) || "Pending",
          sg_presence: sgPresence || "",
          remarks: remarks || "",
          checked_by: currentUser.name,
        });
      }

      if (recordsToUpload.length > 0) {
        try {
          // We can either send multiple requests or create a bulk endpoint.
          // For simplicity, let's send one by one or suggest a bulk endpoint.
          // Given the server.ts structure, I'll update server.ts later for bulk or just loop here.
          // Loop for now:
          for (const rec of recordsToUpload) {
            await fetch("/api/rubbish-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(rec),
            });
          }
          await fetchRecords();
          alert(`Successfully uploaded ${recordsToUpload.length} records`);
        } catch (error) {
          console.error("Bulk upload failed", error);
          alert("Bulk upload failed");
        }
      }
      setIsBulkUploading(false);
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `/api/rubbish-verification/${editingId}`
        : "/api/rubbish-verification";

      // If status is changed from Pending, auto-fill checked_by
      const finalData = { ...formData };
      if (finalData.status !== "Pending" && !finalData.checked_by) {
        finalData.checked_by = currentUser.name;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData),
      });

      if (res.ok) {
        let preserved = null;
        if (keepCommonFields) {
          preserved = {
            project_name: formData.project_name,
            officers: formData.officers,
            designation: formData.designation,
            bill_no: formData.bill_no,
            bill: formData.bill,
          };
          setLastSharedData(preserved);
        }
        await fetchRecords();
        resetForm(preserved || undefined);

        // If keepCommonFields is on and we were adding, reopen the add row
        if (keepCommonFields && method === "POST") {
          setIsAdding(true);
          setTimeout(() => inputRefs.gp_no.current?.focus(), 100);
        }
      } else {
        alert("Failed to save record");
      }
    } catch (error) {
      console.error("Error saving record:", error);
      alert("Error saving record");
    }
  };

  const handleDelete = async (id: number) => {
    if (currentUser.role !== "super_admin") {
      alert("Only super admins can delete records");
      return;
    }

    if (window.confirm("Are you sure you want to delete this record?")) {
      try {
        const res = await fetch(`/api/rubbish-verification/${id}`, {
          method: "DELETE",
        });
        if (res.ok) fetchRecords();
      } catch (error) {
        console.error("Error deleting record", error);
      }
    }
  };

  const handleEdit = (record: RubbishVerificationType) => {
    setEditingId(record.id || null);
    setFormData({
      ...record,
      date: record.date
        ? new Date(record.date).toISOString().split("T")[0]
        : getLocalDateString(),
    });
    setIsAdding(false);
  };

  const filteredRecords = records.filter(
    (r) =>
      r.project_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.bill_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.truck_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.officers?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="p-6 md:p-8 max-w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="w-full sm:w-auto">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Rubbish Verification
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage rubbish disposal verification records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-grow sm:flex-grow-0 min-w-[200px]">
            <input
              type="text"
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-200 shadow-sm transition-all"
          >
            <ChevronDown className="w-4 h-4" />
            Template
          </button>
          {canEdit && (
            <label className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-200 shadow-sm cursor-pointer transition-all">
              <Upload className="w-4 h-4" />
              {isBulkUploading ? "Uploading..." : "Bulk Upload"}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleBulkUpload}
                disabled={isBulkUploading}
              />
            </label>
          )}
          {canEdit && (
            <label className="flex items-center gap-2 cursor-pointer select-none bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 hover:bg-indigo-100/50 transition-all">
              <input
                type="checkbox"
                checked={keepCommonFields}
                onChange={(e) => setKeepCommonFields(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">
                Keep Shared Info
              </span>
            </label>
          )}
          {!isAdding && !editingId && canEdit && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Entry
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[11px] font-bold uppercase tracking-widest border-b border-slate-100">
                <th className="py-2 px-4 pl-6">Project Name</th>
                <th className="py-2 px-4">Officers</th>
                <th className="py-2 px-4">Designation</th>
                <th className="py-2 px-4">Bill No</th>
                <th className="py-2 px-4">Bill</th>
                <th className="py-2 px-4">GP No</th>
                <th className="py-2 px-4">Truck No</th>
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Check Date</th>
                <th className="py-2 px-4">In Time</th>
                <th className="py-2 px-4">Out Time</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">SG Presence</th>
                <th className="py-2 px-4">Remarks</th>
                <th className="py-2 px-4">Checked By</th>
                <th className="py-2 px-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isAdding && (
                <tr className="bg-indigo-50/50 animate-in fade-in duration-300">
                  <td className="p-3 pl-6 relative">
                    <div className="relative">
                      <input
                        ref={inputRefs.project_name}
                        type="text"
                        placeholder="Project"
                        value={projectSearch || formData.project_name}
                        onFocus={(e) => {
                          setShowProjectList(true);
                          e.target.select();
                        }}
                        onChange={(e) => {
                          setProjectSearch(e.target.value);
                          setFormData({
                            ...formData,
                            project_name: e.target.value,
                          });
                          setShowProjectList(true);
                        }}
                        onKeyDown={(e) => handleKeyDown(e, "project_name")}
                        className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                      />
                      {showProjectList && (
                        <div className="absolute z-10 w-64 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {allProjects
                            .filter((p) =>
                              p.name
                                .toLowerCase()
                                .includes(
                                  (
                                    projectSearch ||
                                    formData.project_name ||
                                    ""
                                  ).toLowerCase(),
                                ),
                            )
                            .slice(0, 10)
                            .map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    project_name: p.name,
                                  });
                                  setProjectSearch(p.name);
                                  setShowProjectList(false);
                                  inputRefs.officers.current?.focus();
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 font-medium border-b border-slate-50 last:border-0"
                              >
                                {p.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <input
                        ref={inputRefs.officers}
                        type="text"
                        placeholder="Officers"
                        value={formData.officers || officerSearch}
                        onFocus={(e) => {
                          setShowOfficerList(true);
                          e.target.select();
                        }}
                        onChange={(e) => {
                          setOfficerSearch(e.target.value);
                          setFormData({
                            ...formData,
                            officers: e.target.value,
                          });
                          setShowOfficerList(true);
                        }}
                        onKeyDown={(e) => handleKeyDown(e, "officers")}
                        className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                      />
                      {showOfficerList && (
                        <div className="absolute z-10 w-64 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {allEmployees
                            .filter(
                              (emp) =>
                                emp.name
                                  .toLowerCase()
                                  .includes(
                                    (
                                      officerSearch ||
                                      formData.officers ||
                                      ""
                                    ).toLowerCase(),
                                  ) ||
                                emp.employee_id
                                  .toLowerCase()
                                  .includes(
                                    (
                                      officerSearch ||
                                      formData.officers ||
                                      ""
                                    ).toLowerCase(),
                                  ),
                            )
                            .slice(0, 10)
                            .map((emp) => (
                              <button
                                key={emp.id}
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    officers: emp.name,
                                    designation: emp.designation,
                                  });
                                  setOfficerSearch(emp.name);
                                  setShowOfficerList(false);
                                  inputRefs.bill_no.current?.focus();
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 font-medium border-b border-slate-50 last:border-0"
                              >
                                <div className="font-bold">{emp.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {emp.designation} | {emp.employee_id}
                                </div>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.designation}
                      type="text"
                      placeholder="Designation"
                      value={formData.designation}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          designation: e.target.value,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") {
                          e.preventDefault();
                          inputRefs.bill_no.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.bill_no}
                      type="text"
                      placeholder="Bill No"
                      value={formData.bill_no}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({ ...formData, bill_no: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") {
                          e.preventDefault();
                          inputRefs.bill.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.officers.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.bill}
                      type="text"
                      placeholder="Bill"
                      value={formData.bill}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({ ...formData, bill: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") {
                          e.preventDefault();
                          inputRefs.gp_no.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.bill_no.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.gp_no}
                      type="text"
                      placeholder="GP No"
                      value={formData.gp_no}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({ ...formData, gp_no: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") {
                          e.preventDefault();
                          inputRefs.truck_no.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.bill.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.truck_no}
                      type="text"
                      placeholder="Truck No"
                      value={formData.truck_no}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({ ...formData, truck_no: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") {
                          e.preventDefault();
                          inputRefs.date.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.gp_no.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.date}
                      type="text"
                      placeholder="Date"
                      value={formatToDDMMMYYYY(formData.date || "")}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) =>
                        setFormData({
                          ...formData,
                          date: parseDateInput(e.target.value),
                        })
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "Tab" ||
                          e.key === "ArrowRight"
                        ) {
                          e.preventDefault();
                          setFormData({
                            ...formData,
                            date: parseDateInput(
                              (e.target as HTMLInputElement).value,
                            ),
                          });
                          inputRefs.check_date.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.truck_no.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.check_date}
                      type="text"
                      placeholder="Check Date"
                      value={formatToDDMMMYYYY(formData.check_date || "")}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) =>
                        setFormData({
                          ...formData,
                          check_date: parseDateInput(e.target.value),
                        })
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, check_date: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "Tab" ||
                          e.key === "ArrowRight"
                        ) {
                          e.preventDefault();
                          setFormData({
                            ...formData,
                            check_date: parseDateInput(
                              (e.target as HTMLInputElement).value,
                            ),
                          });
                          inputRefs.in_time.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.date.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.in_time}
                      type="text"
                      placeholder="HH:MM"
                      value={formData.in_time}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) =>
                        setFormData({
                          ...formData,
                          in_time: parseTimeInput(e.target.value),
                        })
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, in_time: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "Tab" ||
                          e.key === "ArrowRight"
                        ) {
                          e.preventDefault();
                          setFormData({
                            ...formData,
                            in_time: parseTimeInput(
                              (e.target as HTMLInputElement).value,
                            ),
                          });
                          inputRefs.out_time.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.check_date.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.out_time}
                      type="text"
                      placeholder="HH:MM"
                      value={formData.out_time}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) =>
                        setFormData({
                          ...formData,
                          out_time: parseTimeInput(e.target.value),
                        })
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, out_time: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "Tab" ||
                          e.key === "ArrowRight"
                        ) {
                          e.preventDefault();
                          setFormData({
                            ...formData,
                            out_time: parseTimeInput(
                              (e.target as HTMLInputElement).value,
                            ),
                          });
                          inputRefs.status.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.in_time.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <input
                        ref={inputRefs.status}
                        type="text"
                        placeholder="Status"
                        value={formData.status}
                        onFocus={(e) => {
                          if (canAudit) setShowStatusList(true);
                          e.target.select();
                        }}
                        onChange={(e) => {
                          if (!canAudit) return;
                          setFormData({
                            ...formData,
                            status: e.target.value as RubbishStatus,
                          });
                          setShowStatusList(true);
                        }}
                        onKeyDown={(e) => handleKeyDown(e, "status")}
                        readOnly={!canAudit}
                        className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm font-bold uppercase ${!canAudit ? "bg-slate-50" : ""}`}
                      />
                      {showStatusList && canAudit && (
                        <div className="absolute z-10 w-48 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {statusOptions
                            .filter((opt) =>
                              opt
                                .toLowerCase()
                                .includes(
                                  (formData.status || "").toLowerCase(),
                                ),
                            )
                            .map((opt) => (
                              <button
                                key={opt}
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    status: opt,
                                    checked_by:
                                      opt !== "Pending" ? currentUser.name : "",
                                  });
                                  setShowStatusList(false);
                                  inputRefs.sg_presence.current?.focus();
                                }}
                                className="w-full text-left px-3 py-2 text-[10px] hover:bg-slate-50 text-slate-700 font-bold border-b border-slate-50 last:border-0 uppercase"
                              >
                                {opt}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <input
                      ref={inputRefs.sg_presence}
                      type="text"
                      placeholder="SG Presence"
                      value={formData.sg_presence}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sg_presence: e.target.value,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") {
                          e.preventDefault();
                          inputRefs.remarks.current?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          inputRefs.status.current?.focus();
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <textarea
                      ref={inputRefs.remarks}
                      rows={1}
                      placeholder="Remarks"
                      value={formData.remarks}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setFormData({ ...formData, remarks: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSave();
                        } else if (e.key === "ArrowLeft") {
                          // Only go back if cursor is at start
                          if (
                            (e.target as HTMLTextAreaElement).selectionStart ===
                            0
                          ) {
                            e.preventDefault();
                            inputRefs.sg_presence.current?.focus();
                          }
                        }
                      }}
                      className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      placeholder="Checked By"
                      value={formData.checked_by}
                      className="w-full text-xs p-1.5 border rounded-lg bg-slate-50 shadow-sm"
                      readOnly
                    />
                  </td>
                  <td className="p-3 pr-6 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={handleSave}
                        className="p-1.5 text-emerald-600 bg-white border border-emerald-100 rounded-lg shadow-sm hover:bg-emerald-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => resetForm()}
                        className="p-1.5 text-slate-400 bg-white border border-slate-100 rounded-lg shadow-sm hover:bg-rose-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {loading ? (
                <tr>
                  <td colSpan={15} className="p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-sm font-medium text-slate-400 mt-2">
                      Loading records...
                    </p>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ClipboardList className="w-8 h-8 opacity-20" />
                      <p className="text-sm font-medium">No records found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) =>
                  r.id === editingId ? (
                    <tr key={r.id} className="bg-amber-50/50 transition-colors">
                      <td className="p-3 pl-6 relative">
                        <div className="relative">
                          <input
                            ref={inputRefs.project_name}
                            type="text"
                            placeholder="Project"
                            value={projectSearch || formData.project_name}
                            onFocus={(e) => {
                              setShowProjectList(true);
                              e.target.select();
                            }}
                            onChange={(e) => {
                              setProjectSearch(e.target.value);
                              setFormData({
                                ...formData,
                                project_name: e.target.value,
                              });
                              setShowProjectList(true);
                            }}
                            onKeyDown={(e) => handleKeyDown(e, "project_name")}
                            readOnly={!canEdit}
                            className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                          />
                          {showProjectList && canEdit && (
                            <div className="absolute z-10 w-64 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                              {allProjects
                                .filter((p) =>
                                  p.name
                                    .toLowerCase()
                                    .includes(
                                      (
                                        projectSearch ||
                                        formData.project_name ||
                                        ""
                                      ).toLowerCase(),
                                    ),
                                )
                                .slice(0, 10)
                                .map((p) => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        project_name: p.name,
                                      });
                                      setProjectSearch(p.name);
                                      setShowProjectList(false);
                                      inputRefs.officers.current?.focus();
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 font-medium border-b border-slate-50 last:border-0"
                                  >
                                    {p.name}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="relative">
                          <input
                            ref={inputRefs.officers}
                            type="text"
                            placeholder="Officers"
                            value={formData.officers || officerSearch}
                            onFocus={(e) => {
                              setShowOfficerList(true);
                              e.target.select();
                            }}
                            onChange={(e) => {
                              setOfficerSearch(e.target.value);
                              setFormData({
                                ...formData,
                                officers: e.target.value,
                              });
                              setShowOfficerList(true);
                            }}
                            onKeyDown={(e) => handleKeyDown(e, "officers")}
                            readOnly={!canEdit}
                            className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                          />
                          {showOfficerList && canEdit && (
                            <div className="absolute z-10 w-64 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                              {allEmployees
                                .filter(
                                  (emp) =>
                                    emp.name
                                      .toLowerCase()
                                      .includes(
                                        (
                                          officerSearch ||
                                          formData.officers ||
                                          ""
                                        ).toLowerCase(),
                                      ) ||
                                    emp.employee_id
                                      .toLowerCase()
                                      .includes(
                                        (
                                          officerSearch ||
                                          formData.officers ||
                                          ""
                                        ).toLowerCase(),
                                      ),
                                )
                                .slice(0, 10)
                                .map((emp) => (
                                  <button
                                    key={emp.id}
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        officers: emp.name,
                                        designation: emp.designation,
                                      });
                                      setOfficerSearch(emp.name);
                                      setShowOfficerList(false);
                                      inputRefs.bill_no.current?.focus();
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 font-medium border-b border-slate-50 last:border-0"
                                  >
                                    <div className="font-bold">{emp.name}</div>
                                    <div className="text-[10px] text-slate-500">
                                      {emp.designation} | {emp.employee_id}
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.designation}
                          type="text"
                          placeholder="Designation"
                          value={formData.designation}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                designation: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "Tab") {
                              e.preventDefault();
                              inputRefs.bill_no.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.bill_no}
                          type="text"
                          placeholder="Bill No"
                          value={formData.bill_no}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                bill_no: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "Tab") {
                              e.preventDefault();
                              inputRefs.bill.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.officers.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.bill}
                          type="text"
                          placeholder="Bill"
                          value={formData.bill}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                bill: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "Tab") {
                              e.preventDefault();
                              inputRefs.gp_no.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.bill_no.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.gp_no}
                          type="text"
                          placeholder="GP No"
                          value={formData.gp_no}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                gp_no: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "Tab") {
                              e.preventDefault();
                              inputRefs.truck_no.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.bill.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.truck_no}
                          type="text"
                          placeholder="Truck No"
                          value={formData.truck_no}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                truck_no: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "Tab") {
                              e.preventDefault();
                              inputRefs.date.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.gp_no.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.date}
                          type="text"
                          placeholder="Date"
                          value={formatToDDMMMYYYY(formData.date || "")}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                date: parseDateInput(e.target.value),
                              });
                          }}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                date: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === "Tab" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              if (canEdit)
                                setFormData({
                                  ...formData,
                                  date: parseDateInput(
                                    (e.target as HTMLInputElement).value,
                                  ),
                                });
                              inputRefs.check_date.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.truck_no.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.check_date}
                          type="text"
                          placeholder="Check Date"
                          value={formatToDDMMMYYYY(formData.check_date || "")}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (canAudit)
                              setFormData({
                                ...formData,
                                check_date: parseDateInput(e.target.value),
                              });
                          }}
                          onChange={(e) => {
                            if (canAudit)
                              setFormData({
                                ...formData,
                                check_date: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === "Tab" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              if (canAudit)
                                setFormData({
                                  ...formData,
                                  check_date: parseDateInput(
                                    (e.target as HTMLInputElement).value,
                                  ),
                                });
                              inputRefs.in_time.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.date.current?.focus();
                            }
                          }}
                          readOnly={!canAudit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canAudit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.in_time}
                          type="text"
                          placeholder="HH:MM"
                          value={formData.in_time}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                in_time: parseTimeInput(e.target.value),
                              });
                          }}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                in_time: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === "Tab" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              if (canEdit)
                                setFormData({
                                  ...formData,
                                  in_time: parseTimeInput(
                                    (e.target as HTMLInputElement).value,
                                  ),
                                });
                              inputRefs.out_time.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.check_date.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.out_time}
                          type="text"
                          placeholder="HH:MM"
                          value={formData.out_time}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                out_time: parseTimeInput(e.target.value),
                              });
                          }}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                out_time: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === "Tab" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              if (canEdit)
                                setFormData({
                                  ...formData,
                                  out_time: parseTimeInput(
                                    (e.target as HTMLInputElement).value,
                                  ),
                                });
                              inputRefs.status.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.in_time.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="relative">
                          <input
                            ref={inputRefs.status}
                            type="text"
                            placeholder="Status"
                            value={formData.status}
                            onFocus={(e) => {
                              if (canAudit) setShowStatusList(true);
                              e.target.select();
                            }}
                            onChange={(e) => {
                              if (!canAudit) return;
                              setFormData({
                                ...formData,
                                status: e.target.value as RubbishStatus,
                              });
                              setShowStatusList(true);
                            }}
                            onKeyDown={(e) => handleKeyDown(e, "status")}
                            readOnly={!canAudit}
                            className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm font-bold uppercase ${!canAudit ? "bg-slate-50" : ""}`}
                          />
                          {showStatusList && canAudit && (
                            <div className="absolute z-10 w-48 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                              {statusOptions
                                .filter((opt) =>
                                  opt
                                    .toLowerCase()
                                    .includes(
                                      (formData.status || "").toLowerCase(),
                                    ),
                                )
                                .map((opt) => (
                                  <button
                                    key={opt}
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        status: opt,
                                        checked_by:
                                          opt !== "Pending"
                                            ? currentUser.name
                                            : "",
                                      });
                                      setShowStatusList(false);
                                      inputRefs.sg_presence.current?.focus();
                                    }}
                                    className="w-full text-left px-3 py-2 text-[10px] hover:bg-slate-50 text-slate-700 font-bold border-b border-slate-50 last:border-0 uppercase"
                                  >
                                    {opt}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <input
                          ref={inputRefs.sg_presence}
                          type="text"
                          placeholder="SG Presence"
                          value={formData.sg_presence}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                sg_presence: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "Tab") {
                              e.preventDefault();
                              inputRefs.remarks.current?.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              inputRefs.status.current?.focus();
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <textarea
                          ref={inputRefs.remarks}
                          rows={1}
                          placeholder="Remarks"
                          value={formData.remarks}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            if (canEdit)
                              setFormData({
                                ...formData,
                                remarks: e.target.value,
                              });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSave();
                            } else if (e.key === "ArrowLeft") {
                              if (
                                (e.target as HTMLTextAreaElement)
                                  .selectionStart === 0
                              ) {
                                e.preventDefault();
                                inputRefs.sg_presence.current?.focus();
                              }
                            }
                          }}
                          readOnly={!canEdit}
                          className={`w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm ${!canEdit ? "bg-slate-50" : ""}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Checked By"
                          value={formData.checked_by}
                          readOnly
                          className="w-full text-[10px] p-1 border rounded bg-slate-50 shadow-sm"
                        />
                      </td>
                      <td className="py-1.5 px-4 pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={handleSave}
                            className="p-1 text-emerald-600 bg-white border border-emerald-100 rounded shadow-sm hover:bg-emerald-50"
                            title="Save Changes"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => resetForm()}
                            className="p-1 text-slate-400 bg-white border border-slate-100 rounded shadow-sm hover:bg-rose-50"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-1.5 px-4 pl-6 text-[11px] font-semibold text-slate-700">
                        {r.project_name}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-600">
                        {r.officers}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-500">
                        {r.designation}
                      </td>
                      <td className="py-1.5 px-4 text-[10px] font-mono text-slate-600">
                        {r.bill_no}
                      </td>
                      <td className="py-1.5 px-4 text-[10px] font-mono text-slate-600">
                        {r.bill}
                      </td>
                      <td className="py-1.5 px-4 text-[10px] font-mono text-slate-600">
                        {r.gp_no}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] font-bold text-slate-700">
                        {r.truck_no}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-600">
                        {r.date
                          ? new Date(r.date).toLocaleDateString("en-GB")
                          : "-"}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-600">
                        {r.check_date
                          ? new Date(r.check_date).toLocaleDateString("en-GB")
                          : "-"}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-600">
                        {r.in_time ? r.in_time.substring(0, 5) : "-"}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-600">
                        {r.out_time ? r.out_time.substring(0, 5) : "-"}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] font-semibold">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[9px] tracking-wider uppercase ${
                            r.status === "Fine"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.status === "Failed"
                                ? "bg-rose-100 text-rose-700"
                                : r.status === "Pending"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-600">
                        {r.sg_presence}
                      </td>
                      <td className="py-1.5 px-4 text-[11px] text-slate-500">
                        <div
                          className="truncate max-w-[120px]"
                          title={r.remarks || ""}
                        >
                          {r.remarks || "-"}
                        </div>
                      </td>
                      <td className="py-1.5 px-4 text-[11px] font-medium text-slate-700">
                        {r.checked_by || "-"}
                      </td>
                      <td className="py-1.5 px-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(canEdit || canAudit) && (
                            <button
                              onClick={() => handleEdit(r)}
                              className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition"
                              title="Edit Entry"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {currentUser.role === "super_admin" && (
                            <button
                              onClick={() => r.id && handleDelete(r.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RubbishVerification;
