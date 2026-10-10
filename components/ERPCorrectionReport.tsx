import React, { useState, useMemo, useRef, useEffect } from "react";
import { User, ERPCorrectionRecord, ERPCorrectionTab } from "../types";
import { parseCSVRobustly } from "../utils/csvUtils";
import FeedbackMessage from "./FeedbackMessage";
import _ from "lodash";
import ERPAnalysisReport from "./ERPAnalysisReport";

// For TypeScript to recognize libraries loaded from CDN
declare global {
  interface Window {
    Papa: any;
  }
}

const MOCK_DATA: ERPCorrectionRecord[] = [];

const CSV_HEADERS = [
  "Officers",
  "Dept.",
  "Designation",
  "Project Name",
  "D.Type",
  "Traking Number",
  "Correction Type",
  "Entry Date",
  "Entry Time",
  "Status",
  "Completed Date",
  "Completed Time",
  "Old Data",
  "New Data",
  "Remarks",
];

interface ERPCorrectionReportProps {
  currentUser: User;
  reports: ERPCorrectionRecord[];
  onUpdateReports: React.Dispatch<React.SetStateAction<ERPCorrectionRecord[]>>;
  activeTab: ERPCorrectionTab;
  onTabChange: (tab: ERPCorrectionTab) => void;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) to DD-MMM-YYYY format.
 * @param dateStr Date string.
 * @returns Formatted date string (e.g., 29-Apr-2024).
 */
const formatDateToDDMMMYYYY = (dateStr: string): string => {
  if (!dateStr || dateStr === "N/A") return dateStr || "";

  let datePart = dateStr;
  if (dateStr.includes("T")) {
    datePart = dateStr.split("T")[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [year, month, day] = datePart.split("-");
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
    const mIdx = parseInt(month, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${day}-${monthNames[mIdx]}-${year}`;
    }
  }

  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = d.getUTCDate().toString().padStart(2, "0");
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
      const month = monthNames[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (e) {}

  return dateStr;
};

const getStatusClass = (status: ERPCorrectionRecord["status"]) => {
  switch (status) {
    case "Completed":
      return {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-200",
      };
    case "Pending":
      return {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        border: "border-yellow-200",
      };
    case "In Progress":
      return {
        bg: "bg-blue-100",
        text: "text-blue-800",
        border: "border-blue-200",
      };
    case "Rejected":
      return {
        bg: "bg-red-100",
        text: "text-red-800",
        border: "border-red-200",
      };
    default:
      return {
        bg: "bg-slate-100",
        text: "text-slate-800",
        border: "border-slate-200",
      };
  }
};

const ERPCorrectionReport: React.FC<ERPCorrectionReportProps> = ({
  currentUser,
  reports,
  onUpdateReports,
  activeTab,
}) => {
  const canEdit = currentUser.permissions?.erpCorrectionReport?.edit || 
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const filteredReports = useMemo(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    if (!lowercasedQuery) return reports;

    return reports.filter((report) => {
      return Object.values(report).some((value) =>
        String(value).toLowerCase().includes(lowercasedQuery),
      );
    });
  }, [reports, searchQuery]);

  const handleDownloadTemplate = () => {
    if (typeof window.Papa === "undefined") {
      setFeedback({ message: "CSV library is not available.", type: "error" });
      return;
    }
    const exampleData = [
      [
        "Ruhul Amen",
        "MIS",
        "Officer",
        "Lake Lofts",
        "Voucher",
        "V-30001",
        "Incorrect Amount",
        "2024-09-01",
        "10:00",
        "Pending",
        "",
        "",
        "Amount: 1000",
        "Amount: 1200",
        "Typo in amount field",
      ],
    ];
    const csv = window.Papa.unparse({ fields: CSV_HEADERS, data: exampleData });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "erp_correction_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (typeof window.Papa === "undefined") {
      setFeedback({
        message: "CSV parsing library is not available.",
        type: "error",
      });
      return;
    }

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const headers = results.meta.fields;
        if (!CSV_HEADERS.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              "CSV is missing required headers or has incorrect names. Please use the template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const newReports: ERPCorrectionRecord[] = [];
        let errorOccurred = false;

        results.data.forEach((row: any, index: number) => {
          if (errorOccurred) return;
          // Check first 9 required fields
          if (!CSV_HEADERS.slice(0, 9).every((h) => row[h])) {
            setFeedback({
              message: `Row ${index + 2}: Missing data for a required field.`,
              type: "error",
            });
            errorOccurred = true;
            return;
          }

          newReports.push({
            id: _.uniqueId("erp_"),
            officers: row["Officers"],
            department: row["Dept."],
            designation: row["Designation"],
            projectName: row["Project Name"],
            documentType: row["D.Type"],
            trackingNumber: row["Traking Number"],
            correctionType: row["Correction Type"],
            entryDate: row["Entry Date"],
            entryTime: row["Entry Time"],
            status: row["Status"],
            completedDate: row["Completed Date"] || undefined,
            completedTime: row["Completed Time"] || undefined,
            oldData: row["Old Data"],
            newData: row["New Data"],
            remarks: row["Remarks"] || undefined,
          });
        });

        if (!errorOccurred) {
          onUpdateReports((prev) =>
            _.orderBy([...prev, ...newReports], ["entryDate"], ["desc"]),
          );
          setFeedback({
            message: `Successfully imported ${newReports.length} records.`,
            type: "success",
          });
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

  const handleToggleFullScreen = () => {
    const elem = tableContainerRef.current;
    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch((err) => {
        alert(
          `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
        );
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
  }, []);

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden">
          <div className="bg-transparent">
            {activeTab === "records" && (
              <div className="fade-in">
                {/* Control Bar */}
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex-grow">
                      <label htmlFor="erp-search" className="sr-only">
                        Search Reports
                      </label>
                      <input
                        type="text"
                        id="erp-search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search across all fields..."
                        className="w-full max-w-lg px-4 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {canEdit && (
                        <>
                          <label
                            htmlFor="erp-csv-upload"
                            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Import CSV
                          </label>
                          <input
                            id="erp-csv-upload"
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
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Download Template
                          </button>
                        </>
                      )}
                      <button
                        onClick={handleToggleFullScreen}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                      >
                        {isFullScreen ? (
                          <>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M15 5a1 1 0 011 1v3a1 1 0 11-2 0V7.414l-3.293 3.293a1 1 0 11-1.414-1.414L12.586 6H10a1 1 0 110-2h5zM5 15a1 1 0 01-1-1v-3a1 1 0 112 0v1.586l3.293-3.293a1 1 0 111.414 1.414L7.414 13H9a1 1 0 110 2H5z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Exit Full Screen
                          </>
                        ) : (
                          <>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5 10a1 1 0 011-1h3a1 1 0 110 2H7.414l3.293 3.293a1 1 0 11-1.414-1.414L6 12.586V14a1 1 0 11-2 0v-3a1 1 0 011-1zm10-1a1 1 0 010 2h-3a1 1 0 110-2h3zm-3 6a1 1 0 011-1h3a1 1 0 110 2h-1.586l-3.293 3.293a1 1 0 11-1.414-1.414L13.414 16H12a1 1 0 01-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Full Screen View
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  ref={tableContainerRef}
                  className="fullscreen-container bg-white flex flex-col px-6 pb-6"
                >
                  <div className="overflow-auto flex-grow border border-slate-200 rounded-lg">
                    {filteredReports.length > 0 ? (
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                          <tr>
                            {CSV_HEADERS.map((header) => (
                              <th
                                key={header}
                                scope="col"
                                className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {filteredReports.map((report) => {
                            const statusClasses = getStatusClass(report.status);
                            return (
                              <tr
                                key={report.id}
                                className="transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-amber-50"
                              >
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs font-semibold text-slate-800">
                                  {report.officers}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.department}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.designation}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.projectName}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.documentType}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.trackingNumber}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.correctionType}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {formatDateToDDMMMYYYY(report.entryDate)}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.entryTime}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${statusClasses.bg} ${statusClasses.text} ${statusClasses.border}`}
                                  >
                                    {report.status}
                                  </span>
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.completedDate
                                    ? formatDateToDDMMMYYYY(
                                        report.completedDate,
                                      )
                                    : "N/A"}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.completedTime || "N/A"}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-red-600/90 line-through">
                                  {report.oldData}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-green-700 font-semibold">
                                  {report.newData}
                                </td>
                                <td className="px-2 py-2 whitespace-normal break-words align-top text-xs text-slate-500">
                                  {report.remarks || "N/A"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="p-6 text-center text-slate-500">
                        {reports.length === 0
                          ? "No data available. Please import a CSV file to get started."
                          : "No reports found matching your search criteria."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activeTab === "analysis" && (
              <div className="p-6 fade-in">
                <ERPAnalysisReport
                  reports={reports}
                  currentUser={currentUser}
                />
              </div>
            )}
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
    </>
  );
};

export default ERPCorrectionReport;
