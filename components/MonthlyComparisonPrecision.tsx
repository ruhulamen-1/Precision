import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  User,
  Project,
  EmployeeVisit,
  ReportData,
  MonthlyComparisonPrecisionTab,
  AllEmployee,
} from "../types";
import { DEPARTMENTS } from "../constants";
import FeedbackMessage from "./FeedbackMessage";
import AllDepartmentSummary from "./AllDepartmentSummary";
import DutyAnalysis from "./DutyAnalysis";
import EmployeeVisitSummary from "./EmployeeVisitSummary";
import _ from "lodash";
import { useLoading } from "../contexts/LoadingContext";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import { Upload, FileDown, Download, Trash2 } from "lucide-react";

/**
 * Parses a date string from various common formats and returns it in YYYY-MM-DD format.
 * @param dateString The date string to parse.
 * @returns The formatted date string, or an empty string if invalid.
 */
const parseAndFormatDate = (dateString: string): string => {
  if (!dateString || typeof dateString !== "string") return "";

  // Handle '1-Jul-25' format
  const excelDateMatch = dateString
    .trim()
    .match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (excelDateMatch) {
    const day = excelDateMatch[1];
    const monthStr = excelDateMatch[2];
    const year = `20${excelDateMatch[3]}`;
    const monthNames = [
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
    const monthIndex = monthNames.findIndex(
      (m) => m.toLowerCase() === monthStr.toLowerCase(),
    );
    if (monthIndex > -1) {
      const d = new Date(parseInt(year, 10), monthIndex, parseInt(day, 10));
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dayOfMonth = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dayOfMonth}`;
      }
    }
  }

  const date = new Date(dateString.trim());

  if (isNaN(date.getTime())) {
    const parts = dateString
      .trim()
      .match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const year = parseInt(parts[3], 10);
      const dmyDate = new Date(year, month, day);
      if (
        !isNaN(dmyDate.getTime()) &&
        dmyDate.getDate() === day &&
        dmyDate.getMonth() === month &&
        dmyDate.getFullYear() === year
      ) {
        const y = dmyDate.getFullYear();
        const m = String(dmyDate.getMonth() + 1).padStart(2, "0");
        const d = String(dmyDate.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
    console.warn(`Could not parse date: "${dateString}"`);
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

interface MonthlyComparisonPrecisionProps {
  currentUser: User;
  projects: Project[];
  visits: EmployeeVisit[];
  onUpdateVisits: React.Dispatch<React.SetStateAction<EmployeeVisit[]>>;
  activeTab: MonthlyComparisonPrecisionTab;
  onTabChange: (tab: MonthlyComparisonPrecisionTab) => void;
  allEmployees: AllEmployee[];
}

const MonthlyComparisonPrecision: React.FC<MonthlyComparisonPrecisionProps> = ({
  currentUser,
  projects,
  visits,
  onUpdateVisits,
  activeTab,
  onTabChange,
  allEmployees,
}) => {
  // --- STATE ---

  // State for Records Tab
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // --- STATE FOR SUMMARY TAB (LIFTED) ---
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [summarySelectedMonth, setSummarySelectedMonth] =
    useState(currentMonth);
  const [summarySelectedEmployee, setSummarySelectedEmployee] = useState("");
  const [summarySelectedDepartment, setSummarySelectedDepartment] =
    useState("");
  const [summaryReportData, setSummaryReportData] = useState<ReportData | null>(
    null,
  );
  const [summaryReportTitle, setSummaryReportTitle] = useState("");
  const [isSummaryReportGenerated, setIsSummaryReportGenerated] =
    useState(false);

  const isPrivileged =
    currentUser.role === "admin" || currentUser.role === "super_admin";

  // --- REFS & MEMOS ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showLoading, hideLoading } = useLoading();
  const projectNames = useMemo(
    () => _.uniq(projects.map((p) => p.name || "Unnamed")).sort(),
    [projects],
  );

  const filteredVisits = useMemo(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    return visits.filter((visit) => {
      const startDateMatch = !startDate || visit.date >= startDate;
      const endDateMatch = !endDate || visit.date <= endDate;
      const projectMatch =
        !projectFilter || visit.projectName === projectFilter;
      const departmentMatch =
        !departmentFilter || visit.department === departmentFilter;

      const searchMatch =
        !lowercasedQuery ||
        visit.visitorName.toLowerCase().includes(lowercasedQuery) ||
        visit.department.toLowerCase().includes(lowercasedQuery) ||
        visit.designation.toLowerCase().includes(lowercasedQuery) ||
        visit.projectName.toLowerCase().includes(lowercasedQuery) ||
        visit.date.toLowerCase().includes(lowercasedQuery) ||
        visit.entryTime.toLowerCase().includes(lowercasedQuery) ||
        visit.outTime.toLowerCase().includes(lowercasedQuery) ||
        visit.duration.toLowerCase().includes(lowercasedQuery) ||
        (visit.remarks &&
          visit.remarks.toLowerCase().includes(lowercasedQuery));

      return (
        startDateMatch &&
        endDateMatch &&
        projectMatch &&
        departmentMatch &&
        searchMatch
      );
    });
  }, [
    visits,
    startDate,
    endDate,
    projectFilter,
    departmentFilter,
    searchQuery,
  ]);

  // Handle page reset on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, projectFilter, departmentFilter, searchQuery]);

  const paginatedVisits = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredVisits.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredVisits, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredVisits.length / rowsPerPage);

  // --- Handlers for Records Tab ---
  const VISIT_REQUIRED_HEADERS = [
    "Sl No",
    "Date",
    "Visitor Name",
    "Department",
    "Designation",
    "Visited Project Name",
    "Entry Time",
    "Out Time",
    "Duration",
    "Formula",
  ];

  const handleClearRecords = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    onUpdateVisits([]);
    setFeedback({
      message: "All records have been cleared.",
      type: "info",
    });
    setShowClearConfirm(false);
  };

  const handleVisitFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    showLoading();

    if (typeof Papa === "undefined") {
      setFeedback({
        message: "CSV parsing library is not available.",
        type: "error",
      });
      hideLoading();
      return;
    }

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        try {
          const headers = results.meta.fields;
          const isValid =
            headers &&
            VISIT_REQUIRED_HEADERS.length === headers.length &&
            VISIT_REQUIRED_HEADERS.every((h, i) => headers[i]?.trim() === h);

          if (!isValid) {
            setFeedback({
              message:
                "CSV header mismatch. Please use the exact format from the downloaded template.",
              type: "error",
            });
            return;
          }

          const newVisits: EmployeeVisit[] = [];
          let hasError = false;

          results.data.forEach((row: any, index: number) => {
            if (hasError) return;

            const requiredDataFields = [
              "Date",
              "Visitor Name",
              "Department",
              "Designation",
              "Visited Project Name",
              "Entry Time",
              "Out Time",
              "Duration",
            ];
            for (const field of requiredDataFields) {
              if (!row[field]) {
                setFeedback({
                  message: `Missing required data for "${field}" in row ${index + 2}.`,
                  type: "error",
                });
                hasError = true;
                return;
              }
            }

            const formattedDate = parseAndFormatDate(row.Date);
            if (!formattedDate) {
              setFeedback({
                message: `Invalid date format in row ${index + 2}: "${row.Date}".`,
                type: "error",
              });
              hasError = true;
              return;
            }

            newVisits.push({
              id: Date.now() + index,
              date: formattedDate,
              visitorName: row["Visitor Name"],
              department: row["Department"],
              designation: row["Designation"],
              projectName: row["Visited Project Name"],
              entryTime: row["Entry Time"],
              outTime: row["Out Time"],
              duration: row["Duration"],
              remarks: row["Formula"] || "",
            });
          });

          if (!hasError) {
            onUpdateVisits((prev) =>
              _.orderBy([...prev, ...newVisits], ["date"], ["desc"]),
            );
            setFeedback({
              message: `Successfully imported ${newVisits.length} records.`,
              type: "success",
            });
          }
        } finally {
          hideLoading();
          if (event.target) event.target.value = "";
        }
      },
      error: (error: any) => {
        setFeedback({
          message: `CSV parsing error: ${error.message}`,
          type: "error",
        });
        hideLoading();
      },
    });
  };

  const handleDownloadRecordsCSV = () => {
    // User-defined headers
    const headers = [
      "Sl No",
      "Date",
      "Visitor Name",
      "Department",
      "Designation",
      "Visited Project Name",
      "Entry Time",
      "Out Time",
      "Duration",
      "Formula",
    ];

    // Map filtered data to an array of arrays, matching the header order
    const dataForCsv = filteredVisits.map((visit, index) => [
      index + 1,
      visit.date,
      visit.visitorName,
      visit.department,
      visit.designation,
      visit.projectName,
      visit.entryTime,
      visit.outTime,
      visit.duration,
      visit.remarks || "", // This now corresponds to the 'Formula' column
    ]);

    // Use Papa.unparse with the headers and the array-of-arrays data
    const csv = Papa.unparse({
      fields: headers,
      data: dataForCsv,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "employee_visits_export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadVisitTemplate = () => {
    if (typeof Papa === "undefined") {
      setFeedback({ message: "CSV library is not available.", type: "error" });
      return;
    }

    const exampleData = [
      [
        1,
        "1-Jul-25",
        "Wayes Ah",
        "HR & Adm",
        "Executive",
        "Castle Onamika",
        "2:11",
        "2:17",
        "0:06:00",
        "5 - 9 Minutes",
      ],
      [
        2,
        "1-Jul-25",
        "Md. Abul Emon",
        "HR & Adm",
        "Security Supervisor",
        "Castle Onamika",
        "2:38",
        "3:05",
        "0:27:00",
        "More Than 20 Minutes",
      ],
    ];

    const csv = Papa.unparse({
      fields: VISIT_REQUIRED_HEADERS,
      data: exampleData,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "visit_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback({
      message: "Template downloaded successfully!",
      type: "success",
    });
  };

  // --- HANDLERS FOR SUMMARY TAB ---
  const handleSummaryMonthChange = (month: string) => {
    setSummarySelectedMonth(month);
    setIsSummaryReportGenerated(false); // Reset report when filter changes
  };

  const handleSummaryEmployeeChange = (employeeNameValue: string) => {
    const employeeName =
      employeeNameValue === "All Employees" ? "" : employeeNameValue;
    setSummarySelectedEmployee(employeeName);

    if (employeeName) {
      const employeeVisit = visits.find((v) => v.visitorName === employeeName);
      setSummarySelectedDepartment(
        employeeVisit ? employeeVisit.department : "",
      );
    } else {
      setSummarySelectedDepartment("");
    }
    setIsSummaryReportGenerated(false); // Reset report when filter changes
  };

  const handleSummaryDepartmentChange = (departmentNameValue: string) => {
    const departmentName =
      departmentNameValue === "All Departments" ? "" : departmentNameValue;
    setSummarySelectedDepartment(departmentName);
    setIsSummaryReportGenerated(false); // Reset report when filter changes
  };

  // --- NEW HANDLERS FOR MONTHLY ATTENDANCE ---
  const handleMonthlyAttendanceFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    showLoading();

    if (typeof Papa === "undefined") {
      setFeedback({
        message: "CSV parsing library is not available.",
        type: "error",
      });
      hideLoading();
      return;
    }

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        try {
          const headersFromFile = results.meta.fields;
          if (!headersFromFile || headersFromFile.length < 5) {
            setFeedback({
              message:
                "Invalid CSV format. Please use the monthly attendance template.",
              type: "error",
            });
            return;
          }

          const requiredStaticHeaders = [
            "Emp. Name",
            "Emp. Code",
            "Designation",
            "Total Working Day",
          ];
          const hasRequiredHeaders = requiredStaticHeaders.every((h) =>
            headersFromFile.includes(h),
          );

          if (!hasRequiredHeaders) {
            setFeedback({
              message: `Monthly attendance CSV is missing required headers. It must contain at least: ${requiredStaticHeaders.join(", ")}.`,
              type: "error",
            });
            return;
          }

          const newAttendanceRecords = results.data
            .map((row: any) => ({
              "Emp. Name": row["Emp. Name"],
              "Emp. Code": row["Emp. Code"],
              Designation: row["Designation"],
            }))
            .filter((r: any) => r["Emp. Name"] && r["Emp. Code"]);

          if (newAttendanceRecords.length === 0) {
            setFeedback({
              message: `No valid employee records found in the CSV.`,
              type: "error",
            });
            return;
          }

          setAttendanceData((prev) =>
            _.unionBy(newAttendanceRecords, prev, "Emp. Name"),
          );

          setFeedback({
            message: `Successfully processed ${newAttendanceRecords.length} monthly attendance records.`,
            type: "success",
          });
        } finally {
          hideLoading();
          if (event.target) event.target.value = "";
        }
      },
      error: (error: any) => {
        setFeedback({
          message: `CSV parsing error: ${error.message}`,
          type: "error",
        });
        hideLoading();
      },
    });
  };

  const renderTab = () => {
    switch (activeTab) {
      case "records":
        return (
          <div className="fade-in">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 pb-6 border-b border-slate-200">
              <div>
                <label
                  htmlFor="start-date-filter"
                  className="block text-sm font-medium text-slate-700"
                >
                  Start Date
                </label>
                <input
                  type="date"
                  id="start-date-filter"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label
                  htmlFor="end-date-filter"
                  className="block text-sm font-medium text-slate-700"
                >
                  End Date
                </label>
                <input
                  type="date"
                  id="end-date-filter"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label
                  htmlFor="project-filter"
                  className="block text-sm font-medium text-slate-700"
                >
                  Project
                </label>
                <select
                  id="project-filter"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">All Projects</option>
                  {projectNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="dept-filter"
                  className="block text-sm font-medium text-slate-700"
                >
                  Department
                </label>
                <select
                  id="dept-filter"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">All Departments</option>
                  {_.uniq(DEPARTMENTS).map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <label
                  htmlFor="search-query"
                  className="block text-sm font-medium text-slate-700"
                >
                  Dynamic Search
                </label>
                <input
                  type="text"
                  id="search-query"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by visitor, project, remarks, etc..."
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>
            {/* Actions and Table */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                {isPrivileged ? (
                  <>
                    <label
                      htmlFor="csv-upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                    >
                      <Upload className="h-5 w-5" />
                      Import CSV File
                    </label>
                    <input
                      id="csv-upload"
                      type="file"
                      ref={fileInputRef}
                      onChange={handleVisitFileUpload}
                      className="sr-only"
                      accept=".csv"
                    />
                    <button
                      onClick={handleDownloadVisitTemplate}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                    >
                      <FileDown className="h-5 w-5" />
                      Download Template
                    </button>
                    <button
                      onClick={handleDownloadRecordsCSV}
                      disabled={filteredVisits.length === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      <Download className="h-5 w-5" />
                      Export
                    </button>
                  </>
                ) : (
                  <span className="text-slate-400 text-xs bg-slate-100 px-3 py-1.5 rounded-md border italic">
                    Admin Only
                  </span>
                )}
              </div>
              {isPrivileged && (
                <button
                  onClick={handleClearRecords}
                  disabled={visits.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200"
                >
                  <Trash2 className="h-5 w-5" />
                  Clear Records
                </button>
              )}
            </div>
            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4 px-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <div>
                  Page {currentPage} of {totalPages || 1} ({filteredVisits.length} Records)
                </div>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-orange-500 outline-none"
                >
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={500}>500 per page</option>
                </select>
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: "24rem" }}>
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Sl No
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Visitor Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Designation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Visited Project Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Entry Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Out Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Formula
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedVisits.length > 0 ? (
                    paginatedVisits.map((visit, index) => (
                      <tr key={visit.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {(currentPage - 1) * rowsPerPage + index + 1}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.date}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.visitorName}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.department}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.designation}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.projectName}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.entryTime}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.outTime}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                          {visit.duration}
                        </td>
                        <td
                          className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 truncate max-w-xs"
                          title={visit.remarks || ""}
                        >
                          {visit.remarks}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={10}
                        className="text-center py-8 text-slate-500"
                      >
                        No records match your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "departmentSummary":
        return (
          <div className="fade-in">
            <AllDepartmentSummary
              visits={visits}
              departments={DEPARTMENTS}
              currentUser={currentUser}
              analysisMode="multi-month"
            />
          </div>
        );
      case "dutyAnalysis":
        return (
          <div className="fade-in">
            <DutyAnalysis visits={visits} currentUser={currentUser} />
          </div>
        );
      case "summary":
        return (
          <div className="fade-in">
            <EmployeeVisitSummary
              currentUser={currentUser}
              visits={visits}
              allEmployees={allEmployees}
              attendanceData={attendanceData}
              onUpdateAttendanceData={setAttendanceData}
              reportData={summaryReportData}
              setReportData={setSummaryReportData}
              isReportGenerated={isSummaryReportGenerated}
              setIsReportGenerated={setIsSummaryReportGenerated}
              reportTitle={summaryReportTitle}
              setReportTitle={setSummaryReportTitle}
              selectedMonth={summarySelectedMonth}
              onMonthChange={handleSummaryMonthChange}
              selectedEmployee={summarySelectedEmployee}
              onEmployeeChange={handleSummaryEmployeeChange}
              selectedDepartment={summarySelectedDepartment}
              onDepartmentChange={handleSummaryDepartmentChange}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Page Content */}
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        {/* Gradient border container */}
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden text-slate-800">
          <div className="bg-transparent">
            <div className="p-6">{renderTab()}</div>
          </div>
        </div>
      </div>

      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-xl">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Clear all records?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-all"
              >
                Yes, clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MonthlyComparisonPrecision;
