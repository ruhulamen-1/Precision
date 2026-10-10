import React, { useState, useEffect } from "react";
import {
  User as UserType,
  CCTVFootageCheckReport,
  AllEmployee,
} from "../types";
import {
  Video,
  Plus,
  Search,
  FileEdit,
  Trash2,
  X,
  Download,
  Printer,
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";

interface Props {
  currentUser: UserType;
  allEmployees: AllEmployee[];
}

const CCTVFootageCheckReports: React.FC<Props> = ({
  currentUser,
  allEmployees,
}) => {
  const [reports, setReports] = useState<CCTVFootageCheckReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReport, setEditingReport] =
    useState<CCTVFootageCheckReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const permissions = (currentUser as any).permissions;
  const canEdit = permissions?.cctvFootageCheckReports?.edit ||
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';

  // Form inputs
  const [requisitionDate, setRequisitionDate] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [checkingCode, setCheckingCode] = useState("");
  const [checkingDate, setCheckingDate] = useState("");
  const [projectName, setProjectName] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [checkingPurpose, setCheckingPurpose] = useState("");
  const [reportLink, setReportLink] = useState("");
  const [cameraCheckComments, setCameraCheckComments] = useState("");

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/cctv-footage-reports");
      if (!res.ok) throw new Error("Failed to fetch reports");
      const data = await res.json();
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const employeeOptions = Array.from(
    new Set(allEmployees.map((emp) => emp.name || "")),
  ).filter((n) => typeof n === "string" && n.trim() !== "");

  const handleEmployeeSelect = (val: string) => {
    setRequestedBy(val);
    const emp = allEmployees.find((e) => e.name === val);
    if (emp) {
      if (emp.designation) setDesignation(emp.designation);
      if (emp.department) setDepartment(emp.department);
    }
  };

  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const normalizeDate = (dateVal: any): string => {
    if (!dateVal) return "";
    if (typeof dateVal === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
      if (dateVal.includes("T")) return dateVal.split("T")[0];
    }
    if (dateVal instanceof Date) {
      return dateVal.toISOString().split("T")[0];
    }
    try {
      const date = new Date(dateVal);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    } catch (e) {}
    return String(dateVal);
  };

  const formatDateDisplay = (dateVal: any) => {
    const norm = normalizeDate(dateVal);
    if (!norm) return "-";
    const match = norm.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [_, year, month, day] = match;
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
      return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
    }
    return norm;
  };

  const openForm = (report?: CCTVFootageCheckReport) => {
    if (report) {
      setEditingReport(report);
      setRequisitionDate(normalizeDate(report.requisition_date));
      setRequestedBy(report.requested_by || "");
      setDesignation(report.designation || "");
      setDepartment(report.department || "");
      setCheckingCode(report.checking_code || "");
      setCheckingDate(normalizeDate(report.checking_date));
      setProjectName(report.project_name || "");
      setFromTime(report.from_time || "");
      setToTime(report.to_time || "");
      setCheckingPurpose(report.checking_purpose || "");
      setReportLink(report.report_link || "");
      setCameraCheckComments(report.camera_check_comments || "");
    } else {
      setEditingReport(null);
      setRequisitionDate(getLocalDateString());
      setRequestedBy("");
      setDesignation("");
      setDepartment("");

      // Checking Code Logic
      if (reports.length === 0) {
        setCheckingCode("");
      } else {
        const today = new Date();
        const yy = String(today.getFullYear()).slice(-2);
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const prefix = `${yy}${mm}`;

        const existingCodes = reports
          .map((r) => r.checking_code)
          .filter((c) => c && c.startsWith(prefix));

        if (existingCodes.length > 0) {
          let maxSeq = 0;
          for (const code of existingCodes) {
            const seqStr = code!.substring(prefix.length);
            const seqMatch = seqStr.match(/^(\d+)$/);
            if (seqMatch) {
              const seq = parseInt(seqMatch[1], 10);
              if (seq > maxSeq) maxSeq = seq;
            }
          }
          setCheckingCode(`${prefix}${String(maxSeq + 1).padStart(2, "0")}`);
        } else {
          setCheckingCode(`${prefix}01`);
        }
      }

      setCheckingDate(getLocalDateString());
      setProjectName("");
      setFromTime("");
      setToTime("");
      setCheckingPurpose("");
      setReportLink("");
      setCameraCheckComments("");
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingReport(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        requisition_date: requisitionDate,
        requested_by: requestedBy,
        designation,
        department,
        checking_code: checkingCode,
        checking_date: checkingDate,
        project_name: projectName,
        from_time: fromTime,
        to_time: toTime,
        checking_purpose: checkingPurpose,
        report_link: reportLink,
        camera_check_comments: cameraCheckComments,
        checked_by: editingReport ? editingReport.checked_by : currentUser.name,
      };

      let res;
      if (editingReport) {
        res = await fetch(`/api/cctv-footage-reports/${editingReport.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/cctv-footage-reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error("Failed to save report");
      await fetchReports();
      closeForm();
    } catch (error) {
      console.error("Error saving report:", error);
      alert("Failed to save record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`/api/cctv-footage-reports/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete report");
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Error deleting report:", error);
      alert("Failed to delete record.");
    }
  };

  const handlePrintRow = (report: CCTVFootageCheckReport) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>CCTV Footage Report - ${report.checking_code}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    @media print {
                        body { padding: 0 !important; margin: 0 !important; }
                        .no-print { display: none !important; }
                        @page { margin: 1.5cm; }
                    }
                    body { font-family: 'Inter', sans-serif; }
                    .entry-label { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
                    .entry-value { font-size: 10px; font-weight: 600; color: #0f172a; }
                </style>
            </head>
            <body class="bg-white p-6">
                <div class="max-w-[850px] mx-auto p-4">
                    <!-- Header -->
                    <div class="flex justify-between items-start mb-6 border-b pb-4">
                        <div class="flex items-center gap-4">
                            <!-- Company Logo -->
                            <img src="https://www.credencehousingltd.com/admin/settings_images/flogo-1692106120.svg" class="h-12 w-auto" alt="Credence Logo" />
                            <div>
                                <h1 class="text-lg font-black text-slate-800 uppercase tracking-tight leading-tight">Credence Housing Limited</h1>
                                <p class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Checking Code</p>
                            <p class="text-lg font-black text-indigo-600">#${report.checking_code}</p>
                        </div>
                    </div>

                    <!-- Report Title -->
                    <div class="text-center mb-8">
                        <h2 class="text-md font-black text-slate-900 uppercase tracking-[0.25em] bg-slate-50 py-2 border-y-2 border-slate-200">CCTV Camera Footage Check Reply</h2>
                    </div>

                    <!-- Info Grid -->
                    <div class="grid grid-cols-2 gap-x-12 gap-y-4 mb-8 px-2">
                        <div class="space-y-3">
                            <div class="border-l-2 border-slate-100 pl-4">
                                <p class="entry-label">Requisition Data</p>
                                <p class="entry-value">${formatDateDisplay(report.requisition_date)}</p>
                            </div>
                            <div class="border-l-2 border-slate-100 pl-4">
                                <p class="entry-label">Requested By</p>
                                <p class="entry-value">${report.requested_by || "-"}</p>
                            </div>
                            <div class="border-l-2 border-slate-100 pl-4">
                                <p class="entry-label">Designation</p>
                                <p class="entry-value">${report.designation || "-"}</p>
                            </div>
                            <div class="border-l-2 border-slate-100 pl-4">
                                <p class="entry-label">Department</p>
                                <p class="entry-value">${report.department || "-"}</p>
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="border-l-2 border-indigo-200 pl-4">
                                <p class="entry-label">Checking Date From</p>
                                <p class="entry-value">${formatDateDisplay(report.checking_date)}</p>
                            </div>
                            <div class="border-l-2 border-indigo-200 pl-4">
                                <p class="entry-label">Project Name</p>
                                <p class="entry-value">${report.project_name || "-"}</p>
                            </div>
                            <div class="border-l-2 border-indigo-200 pl-4">
                                <p class="entry-label">Purpose of Checking</p>
                                <p class="entry-value leading-tight">${report.checking_purpose || "-"}</p>
                            </div>
                            <div class="border-l-2 border-indigo-200 pl-4">
                                <p class="entry-label">Checking Time Range</p>
                                <p class="entry-value">${report.from_time || "-"} to ${report.to_time || "-"}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Observations -->
                    <div class="mb-10 mt-8">
                        <div class="bg-indigo-50/20 p-6 rounded-2xl border border-indigo-100/30 min-h-[140px]">
                            <h3 class="text-[9px] font-bold text-indigo-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                                <span class="w-1.5 h-1.5 bg-indigo-300 rounded-full"></span>
                                After camera check surveillance remarks
                            </h3>
                            <p class="text-[10px] font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">${report.camera_check_comments || "-"}</p>
                        </div>

                        ${
                          report.report_link
                            ? `
                            <div class="mt-4 px-6">
                                <p class="entry-label mb-1">Evidence / Report Link</p>
                                <a href="${report.report_link}" target="_blank" class="text-[9px] text-indigo-500 font-bold break-all hover:underline">${report.report_link}</a>
                            </div>
                        `
                            : ""
                        }
                    </div>

                    <!-- Footer -->
                    <div class="mt-20 grid grid-cols-3 gap-12 px-4">
                        <div class="text-center pt-3 border-t border-slate-200">
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Report Generated By</p>
                            <p class="text-[10px] font-bold text-slate-600">${report.checked_by || "-"}</p>
                        </div>
                        <div class="text-center pt-3 border-t border-slate-200">
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Checked By</p>
                            <p class="text-[10px] font-bold text-slate-600 tracking-tight">CCTV Surveillance</p>
                        </div>
                        <div class="text-center pt-3 border-t border-slate-200">
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Signature</p>
                            <p class="text-[10px] font-black text-slate-800 uppercase tracking-tighter">(Head of Dept.)</p>
                        </div>
                    </div>

                    <div class="mt-16 text-center text-[8px] text-slate-300 font-black uppercase tracking-[0.5em]">
                        CONFIDENTIAL DOCUMENT &bull; CREDENCE HOUSING LTD.
                    </div>
                </div>

                <div class="no-print print:hidden fixed bottom-8 right-8 flex gap-3">
                    <button onclick="window.print()" class="bg-indigo-600 text-white px-8 py-3 rounded-full font-bold shadow-2xl hover:bg-indigo-700 scale-110 active:scale-100 transition-all">
                        Download / Print PDF
                    </button>
                    <button onclick="window.close()" class="bg-slate-900 text-white px-8 py-3 rounded-full font-bold shadow-2xl hover:bg-black transition-all">
                        Close
                    </button>
                </div>
            </body>
            </html>
        `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const filteredReports = reports.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.requested_by?.toLowerCase().includes(q) ||
      r.project_name?.toLowerCase().includes(q) ||
      r.checking_code?.toLowerCase().includes(q) ||
      r.checking_purpose?.toLowerCase().includes(q)
    );
  });

  const exportToCSV = () => {
    const headers = [
      "SL. No",
      "Requisition Date",
      "Requested By",
      "Designation",
      "Department",
      "Checking Code",
      "Checking Date",
      "Project Name",
      "From Time",
      "To Time",
      "Checking Purpose",
      "Report Link",
      "Camera Check Coments",
      "Checked By",
    ];
    let csvContent = headers.join(",") + "\n";

    filteredReports.forEach((r, idx) => {
      const row = [
        idx + 1,
        normalizeDate(r.requisition_date),
        `"${r.requested_by || ""}"`,
        `"${r.designation || ""}"`,
        `"${r.department || ""}"`,
        `"${r.checking_code || ""}"`,
        normalizeDate(r.checking_date),
        `"${r.project_name || ""}"`,
        r.from_time || "",
        r.to_time || "",
        `"${(r.checking_purpose || "").replace(/"/g, '""')}"`,
        `"${(r.report_link || "").replace(/"/g, '""')}"`,
        `"${(r.camera_check_comments || "").replace(/"/g, '""')}"`,
        `"${r.checked_by || ""}"`,
      ];
      csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `CCTV_Footage_Check_Reports_${getLocalDateString()}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50 pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold tracking-wide uppercase mb-2 border border-indigo-100">
            <Video size={14} /> CCTV Analytics
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            CCTV Footage Reports
          </h1>
          <p className="text-slate-500 font-medium">
            Manage and review CCTV footage checking logs
          </p>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row gap-3">
          <button
            onClick={exportToCSV}
            className="px-5 py-3 bg-white text-slate-700 font-bold rounded-xl md:rounded-2xl shadow-sm border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 h-12 md:h-14 mt-auto"
          >
            <Download size={18} /> Export
          </button>
          {canEdit && (
            <button
              onClick={() => openForm()}
              className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl md:rounded-2xl shadow-sm shadow-indigo-200 hover:shadow-md border border-indigo-500 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 h-12 md:h-14 mt-auto"
            >
              <Plus size={18} className="text-indigo-100" /> New Report
            </button>
          )}
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search by requested by, project, or checking code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 outline-none"
          />
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden relative z-10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest w-12">
                  #
                </th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest min-w-[220px]">
                  Requester & Department
                </th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest min-w-[180px]">
                  Checking Info
                </th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest min-w-[160px]">
                  Project & Time
                </th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest min-w-[220px]">
                  Purpose & Comments
                </th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest min-w-[140px]">
                  Checked By
                </th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right pr-6">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-400 font-medium">
                    Loading records...
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                        <Video size={24} className="text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-500">No CCTV footage reports found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((report, idx) => (
                  <tr
                    key={`${report.id}-${idx}`}
                    className="hover:bg-slate-50/60 transition-colors group"
                  >
                    {/* # */}
                    <td className="px-6 py-5 text-xs font-black text-slate-400 tabular-nums">
                      {idx + 1}
                    </td>

                    {/* Requester & Department */}
                    <td className="px-6 py-5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 flex-shrink-0">
                            {report.requested_by ? report.requested_by.charAt(0).toUpperCase() : "?"}
                          </div>
                          <span className="text-sm font-bold text-slate-800">
                            {report.requested_by || "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-0.5 flex-wrap">
                          {report.designation && (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {report.designation}
                            </span>
                          )}
                          {report.designation && report.department && (
                            <span className="text-slate-300">·</span>
                          )}
                          {report.department && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                              {report.department}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                          Req: {formatDateDisplay(report.requisition_date)}
                        </div>
                      </div>
                    </td>

                    {/* Checking Info */}
                    <td className="px-6 py-5">
                      <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-[11px] font-black uppercase tracking-widest border border-indigo-100/50">
                          <div className="h-1 w-1 rounded-full bg-indigo-400" />
                          {report.checking_code || "-"}
                        </span>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          {formatDateDisplay(report.checking_date)}
                        </div>
                        {report.report_link ? (
                          <a
                            href={report.report_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold hover:underline flex items-center gap-1"
                          >
                            View Report ↗
                          </a>
                        ) : null}
                      </div>
                    </td>

                    {/* Project & Time */}
                    <td className="px-6 py-5">
                      <div className="space-y-1.5">
                        <div className="text-sm font-bold text-slate-700">
                          {report.project_name || <span className="text-slate-300">—</span>}
                        </div>
                        {(report.from_time || report.to_time) && (
                          <div className="flex items-center gap-1 text-[11px] font-black text-slate-400 font-mono">
                            <span>{report.from_time || "-"}</span>
                            <span className="text-slate-300">→</span>
                            <span>{report.to_time || "-"}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Purpose & Comments */}
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        {report.checking_purpose && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Purpose</span>
                            <p className="text-[12px] text-slate-600 leading-relaxed line-clamp-2">
                              {report.checking_purpose}
                            </p>
                          </div>
                        )}
                        {report.camera_check_comments && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Comments</span>
                            <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-2">
                              {report.camera_check_comments}
                            </p>
                          </div>
                        )}
                        {!report.checking_purpose && !report.camera_check_comments && (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    </td>

                    {/* Checked By */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-black text-emerald-700 flex-shrink-0">
                          {report.checked_by ? report.checked_by.charAt(0).toUpperCase() : "?"}
                        </div>
                        <span className="text-sm font-bold text-slate-700">
                          {report.checked_by || "-"}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5 pr-6">
                      <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handlePrintRow(report)}
                          className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                          title="Download PDF"
                        >
                          <Printer size={15} />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => openForm(report)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                              title="Edit record"
                            >
                              <FileEdit size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(report.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                              title="Delete record"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 p-4 overflow-y-auto">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={closeForm}
          />

          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] antialiased overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  {editingReport ? "Edit" : "New"} CCTV Footage Report
                </h3>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  Enter details of the footage check.
                </p>
              </div>
              <button
                onClick={closeForm}
                className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 overflow-y-auto bg-slate-50/50">
              <form
                id="cctv-report-form"
                onSubmit={handleSubmit}
                className="space-y-8"
              >
                {/* Info Group 1 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Requisition Date
                    </label>
                    <input
                      type="date"
                      required
                      value={requisitionDate}
                      onChange={(e) => setRequisitionDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Requested By
                    </label>
                    <SearchableSelect
                      id="requestedBy"
                      label="Requested By"
                      options={employeeOptions}
                      value={requestedBy}
                      onChange={handleEmployeeSelect}
                      placeholder="Select or type..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                      placeholder="e.g. Sales Executive"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                      placeholder="e.g. Sales"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1 mr-1">
                      <label className="text-[13px] font-bold text-slate-700">
                        Checking Code
                      </label>
                      {!editingReport && reports.length > 0 && (
                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Automated
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={checkingCode}
                      onChange={(e) => setCheckingCode(e.target.value)}
                      readOnly={!editingReport && reports.length > 0}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm ${!editingReport && reports.length > 0 ? "bg-slate-50 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                      placeholder={
                        reports.length === 0 ? "e.g. 240501" : "Code..."
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Checking Date
                    </label>
                    <input
                      type="date"
                      required
                      value={checkingDate}
                      onChange={(e) => setCheckingDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                      placeholder="Project..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      From Time
                    </label>
                    <input
                      type="time"
                      value={fromTime}
                      onChange={(e) => setFromTime(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      To Time
                    </label>
                    <input
                      type="time"
                      value={toTime}
                      onChange={(e) => setToTime(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-200/60 mt-6">
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Checking Purpose
                    </label>
                    <textarea
                      value={checkingPurpose}
                      onChange={(e) => setCheckingPurpose(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm min-h-[80px] resize-y"
                      placeholder="Purpose of footage checking..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Camera Check Comments
                    </label>
                    <textarea
                      value={cameraCheckComments}
                      onChange={(e) => setCameraCheckComments(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm min-h-[80px] resize-y"
                      placeholder="Comments or findings..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 ml-1">
                      Report Link
                    </label>
                    <input
                      type="text"
                      value={reportLink}
                      onChange={(e) => setReportLink(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 shadow-sm font-mono text-xs"
                      placeholder="https://"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={closeForm}
                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors text-sm"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="cctv-report-form"
                disabled={isSaving}
                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition-all text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
              >
                {isSaving
                  ? "Saving..."
                  : editingReport
                    ? "Update Record"
                    : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CCTVFootageCheckReports;