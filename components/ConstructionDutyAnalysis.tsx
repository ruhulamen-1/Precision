import React, { useState, useMemo, useRef } from "react";
import { EmployeeVisit, ConstructionDutyAnalysisTab, User } from "../types";
import { parseCSVRobustly } from "../utils/csvUtils";
import FeedbackMessage from "./FeedbackMessage";
import _ from "lodash";
import Spinner from "./Spinner";

// For TypeScript to recognize libraries loaded from CDN
declare global {
  interface Window {
    Papa: any;
  }
}

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

const MATERIAL_REQUIRED_HEADERS = [
  "Project Name",
  "MRF NO",
  "Supplier Name",
  "Material Name",
  "Quantity",
  "Unit",
  "Receiving Date",
  "Receiving Time",
];

interface AnalysisResult extends Record<string, any> {
  id: number;
  analysisStatus:
    | "Visit Found"
    | "No Visit in Window"
    | "Invalid Material Time";
  matchingVisit: EmployeeVisit | null;
}

/**
 * Parses a date string from various common formats and returns it in YYYY-MM-DD format.
 */
const parseAndFormatDate = (dateString: string): string => {
  if (!dateString || typeof dateString !== "string") return "";

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

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * Parses a date and time string into a Date object.
 * @param dateStr The date string in YYYY-MM-DD format.
 * @param timeStr The time string in HH:MM format.
 * @returns A Date object or null if parsing fails.
 */
const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (
    !dateStr ||
    !timeStr ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
    !/^\d{1,2}:\d{2}/.test(timeStr)
  )
    return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(d.getTime())) return null;
  return d;
};

/**
 * Consistently formats a Date object or a date string into DD-MMM-YYYY format using UTC.
 * @param date The date to format.
 * @returns The formatted date string.
 */
const formatDateDDMMMYYYY = (date: Date | string | null): string => {
  if (!date) return "";
  try {
    // If the input is a string that looks like YYYY-MM-DD, treat it as UTC.
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = `${date}T00:00:00Z`;
    }
    const d = new Date(date);

    if (isNaN(d.getTime())) return String(date);

    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const year = d.getUTCFullYear();

    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(date); // Fallback
  }
};

interface ConstructionDutyAnalysisProps {
  currentUser: User;
  activeTab: ConstructionDutyAnalysisTab;
  onTabChange: (tab: ConstructionDutyAnalysisTab) => void;
  allEmployeeVisits?: EmployeeVisit[];
}

const ConstructionDutyAnalysis: React.FC<ConstructionDutyAnalysisProps> = ({
  currentUser,
  activeTab,
  allEmployeeVisits,
}) => {
  const canEdit = currentUser.permissions?.constructionDutyAnalysis?.edit || 
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';
  const [visits, setVisits] = useState<EmployeeVisit[]>([]);
  const [materialData, setMaterialData] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const visitFileInputRef = useRef<HTMLInputElement>(null);
  const materialFileInputRef = useRef<HTMLInputElement>(null);
  const [visitSearchQuery, setVisitSearchQuery] = useState("");
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");

  // Automatically import from employee visits when they become available
  React.useEffect(() => {
    if (allEmployeeVisits && allEmployeeVisits.length > 0) {
      const constructionVisits = allEmployeeVisits.filter(
        (visit) => visit.department?.trim() === "Construction",
      );

      if (constructionVisits.length > 0) {
        setVisits((prev) => {
          const merged = _.unionBy(prev, constructionVisits, "id");
          return _.orderBy(merged, ["date"], ["desc"]);
        });
      }
    }
  }, [allEmployeeVisits]);

  // State for the new analysis tab
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [analysisSearchQuery, setAnalysisSearchQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const filteredVisits = useMemo(() => {
    const lowercasedQuery = visitSearchQuery.toLowerCase();
    if (!lowercasedQuery) return visits;

    return visits.filter((visit) => {
      return Object.values(visit).some((value) =>
        String(value).toLowerCase().includes(lowercasedQuery),
      );
    });
  }, [visits, visitSearchQuery]);

  const offHourVisits = useMemo(() => {
    return visits.filter((visit) => {
      const entryTime = visit.entryTime; // HH:MM format
      if (!entryTime || !/^\d{1,2}:\d{2}/.test(entryTime)) {
        return false;
      }
      // Check if time is 18:00 or later, or before 09:00
      // String comparison works for zero-padded HH:MM format.
      return entryTime >= "18:00" || entryTime < "09:00";
    });
  }, [visits]);

  const filteredMaterialData = useMemo(() => {
    const lowercasedQuery = materialSearchQuery.toLowerCase();
    if (!lowercasedQuery) return materialData;

    return materialData.filter((row) => {
      return Object.values(row).some((value) =>
        String(value).toLowerCase().includes(lowercasedQuery),
      );
    });
  }, [materialData, materialSearchQuery]);

  const filteredAnalysisResults = useMemo(() => {
    const lowercasedQuery = analysisSearchQuery.toLowerCase();
    if (!lowercasedQuery) return analysisResults;

    return analysisResults.filter((result) => {
      // Search in material data
      const materialMatch = Object.entries(result).some(([key, value]) => {
        if (key === "matchingVisit" || key === "analysisStatus") return false;
        return String(value).toLowerCase().includes(lowercasedQuery);
      });
      if (materialMatch) return true;

      // Search in matching visit data
      if (result.matchingVisit) {
        const visitMatch = Object.values(result.matchingVisit).some((value) =>
          String(value).toLowerCase().includes(lowercasedQuery),
        );
        if (visitMatch) return true;
      }

      // Search in status
      if (result.analysisStatus.toLowerCase().includes(lowercasedQuery))
        return true;

      return false;
    });
  }, [analysisResults, analysisSearchQuery]);

  const handleVisitFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
        const isValid =
          headers &&
          VISIT_REQUIRED_HEADERS.length === headers.length &&
          VISIT_REQUIRED_HEADERS.every((h, i) => headers[i]?.trim() === h);

        if (!isValid) {
          setFeedback({
            message:
              "CSV header mismatch. Please use the exact format from the employee visit template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const constructionVisits: EmployeeVisit[] = [];
        let hasError = false;

        results.data.forEach((row: any, index: number) => {
          if (hasError) return;

          if (row["Department"]?.trim() !== "Construction") {
            return;
          }

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

          constructionVisits.push({
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
          setVisits((prev) =>
            _.orderBy([...prev, ...constructionVisits], ["date"], ["desc"]),
          );
          setFeedback({
            message: `Successfully imported ${constructionVisits.length} records for the Construction department.`,
            type: "success",
          });
        }
      },
      error: (error: any) => {
        setFeedback({
          message: `CSV parsing error: ${error.message}`,
          type: "error",
        });
      },
    });

    if (event.target) event.target.value = "";
  };

  const handleMaterialFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const headers = results.meta.fields;
        if (!MATERIAL_REQUIRED_HEADERS.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              "Material CSV is missing required headers. Please use the material template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }
        const newMaterialData = results.data.map((row: any, index: number) => ({
          id: Date.now() + index,
          ...row,
        }));
        setMaterialData((prev) => [...prev, ...newMaterialData]);
        setFeedback({
          message: `Successfully imported ${newMaterialData.length} material records.`,
          type: "success",
        });
      },
      error: (error: any) => {
        setFeedback({
          message: `CSV parsing error: ${error.message}`,
          type: "error",
        });
      },
    });

    if (event.target) event.target.value = "";
  };

  const handleRunAnalysis = async () => {
    if (visits.length === 0 || materialData.length === 0) {
      setFeedback({
        message:
          "Please import both visit and material data before running the analysis.",
        type: "info",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResults([]);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const rmcData = materialData.filter(
      (material) =>
        material["Material Name"] &&
        String(material["Material Name"]).toLowerCase().includes("rmc"),
    );

    if (rmcData.length === 0) {
      setFeedback({
        message:
          "No RMC materials found in the imported data. Please check the 'Material Name' column.",
        type: "info",
      });
      setIsAnalyzing(false);
      return;
    }

    const results: AnalysisResult[] = rmcData.map((material) => {
      const materialDateTime = parseDateTime(
        material["Receiving Date"],
        material["Receiving Time"],
      );

      if (!materialDateTime) {
        return {
          ...material,
          analysisStatus: "Invalid Material Time",
          matchingVisit: null,
        };
      }

      const analysisWindowStart = new Date(
        materialDateTime.getTime() - 30 * 60 * 1000,
      );
      const analysisWindowEnd = new Date(
        materialDateTime.getTime() + 30 * 60 * 1000,
      );

      const matchingVisit = visits.find((visit) => {
        if (
          visit.projectName !== material["Project Name"] ||
          visit.date !== material["Receiving Date"]
        ) {
          return false;
        }

        const visitStart = parseDateTime(visit.date, visit.entryTime);
        const visitEnd = parseDateTime(visit.date, visit.outTime);

        if (!visitStart || !visitEnd) return false;

        return (
          visitStart <= analysisWindowEnd && visitEnd >= analysisWindowStart
        );
      });

      return {
        ...material,
        analysisStatus: matchingVisit ? "Visit Found" : "No Visit in Window",
        matchingVisit: matchingVisit || null,
      };
    });

    setAnalysisResults(results);
    setIsAnalyzing(false);
    setFeedback({
      message: `Analysis complete. Found ${results.filter((r) => r.matchingVisit).length} matching visits for ${rmcData.length} RMC deliveries.`,
      type: "success",
    });
  };

  const handleVisitTemplateDownload = () => {
    if (typeof window.Papa === "undefined") {
      return;
    }
    const exampleData = [
      [
        1,
        "1-Jul-25",
        "Ruhul Amen",
        "Construction",
        "Executive",
        "Lake Lofts",
        "10:00",
        "14:30",
        "4:30:00",
        "",
      ],
      [
        2,
        "1-Jul-25",
        "John Doe",
        "HR & Admin",
        "Manager",
        "Gladiolus",
        "11:00",
        "12:00",
        "1:00:00",
        "",
      ],
    ];
    const csv = window.Papa.unparse({
      fields: VISIT_REQUIRED_HEADERS,
      data: exampleData,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "employee_visit_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMaterialTemplateDownload = () => {
    if (typeof window.Papa === "undefined") {
      return;
    }
    const exampleData = [
      [
        "Lake Lofts",
        "MRF-001",
        "ABC Cement",
        "RMC C30",
        "200",
        "Bags",
        "2024-08-25",
        "10:30",
      ],
      [
        "Gladiolus",
        "MRF-002",
        "XYZ Steel",
        "60-Grade Rebar",
        "5",
        "Ton",
        "2024-08-25",
        "11:00",
      ],
    ];
    const csv = window.Papa.unparse({
      fields: MATERIAL_REQUIRED_HEADERS,
      data: exampleData,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "material_analysis_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearVisitRecords = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all imported visit records for this analysis?",
      )
    ) {
      setVisits([]);
      setFeedback({
        message: "All visit records have been cleared.",
        type: "info",
      });
    }
  };

  const handleClearMaterialRecords = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all imported material records for this analysis?",
      )
    ) {
      setMaterialData([]);
      setFeedback({
        message: "All material records have been cleared.",
        type: "info",
      });
    }
  };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden text-slate-800">
          <div className="bg-transparent">
            {activeTab === "visit" && (
              <div className="fade-in">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex-grow">
                      <input
                        type="text"
                        value={visitSearchQuery}
                        onChange={(e) => setVisitSearchQuery(e.target.value)}
                        placeholder="Search construction visit records..."
                        className="w-full max-w-lg px-4 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {canEdit && (
                        <>
                          <label
                            htmlFor="visit-csv-upload"
                            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50"
                          >
                            Import CSV
                          </label>
                          <input
                            id="visit-csv-upload"
                            type="file"
                            ref={visitFileInputRef}
                            onChange={handleVisitFileUpload}
                            className="sr-only"
                            accept=".csv"
                          />
                          <button
                            onClick={handleVisitTemplateDownload}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                          >
                            Template
                          </button>
                          <button
                            onClick={handleClearVisitRecords}
                            disabled={visits.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {filteredVisits.length > 0 ? (
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          {VISIT_REQUIRED_HEADERS.map((header) => (
                            <th
                              key={header}
                              className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {filteredVisits.map((visit, index) => (
                          <tr key={visit.id} className="hover:bg-slate-50">
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                              {formatDateDDMMMYYYY(visit.date)}
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
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-8 text-center text-slate-500">
                      {visits.length === 0
                        ? "No data imported yet. Please import an employee visit CSV."
                        : "No records match your search."}
                    </p>
                  )}
                </div>
                {offHourVisits.length > 0 && (
                  <div className="mt-8 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">
                      Off-Hour & Night Duty Visits ({offHourVisits.length})
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      This table shows visits that started between 6:00 PM and
                      9:00 AM.
                    </p>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            {VISIT_REQUIRED_HEADERS.map((header) => (
                              <th
                                key={header}
                                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                          {offHourVisits.map((visit, index) => (
                            <tr
                              key={visit.id}
                              className="bg-yellow-50 hover:bg-yellow-100"
                            >
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {index + 1}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {formatDateDDMMMYYYY(visit.date)}
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
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-700">
                                {visit.entryTime}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-700">
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "material" && (
              <div className="fade-in">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex-grow">
                      <input
                        type="text"
                        value={materialSearchQuery}
                        onChange={(e) => setMaterialSearchQuery(e.target.value)}
                        placeholder="Search material records..."
                        className="w-full max-w-lg px-4 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {canEdit && (
                        <>
                          <label
                            htmlFor="material-csv-upload"
                            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50"
                          >
                            Import Materials
                          </label>
                          <input
                            id="material-csv-upload"
                            type="file"
                            ref={materialFileInputRef}
                            onChange={handleMaterialFileUpload}
                            className="sr-only"
                            accept=".csv"
                          />
                          <button
                            onClick={handleMaterialTemplateDownload}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                          >
                            Template
                          </button>
                          <button
                            onClick={handleClearMaterialRecords}
                            disabled={materialData.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {filteredMaterialData.length > 0 ? (
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          {MATERIAL_REQUIRED_HEADERS.map((header) => (
                            <th
                              key={header}
                              className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {filteredMaterialData.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            {MATERIAL_REQUIRED_HEADERS.map((header) => (
                              <td
                                key={header}
                                className="px-4 py-4 whitespace-nowrap text-sm text-slate-500"
                              >
                                {header === "Receiving Date"
                                  ? formatDateDDMMMYYYY(row[header])
                                  : row[header]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-8 text-center text-slate-500">
                      {materialData.length === 0
                        ? "No data imported yet. Please import a material analysis CSV."
                        : "No records match your search."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "analysis" && (
              <div className="p-6 space-y-6 fade-in">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 bg-slate-50 rounded-lg border">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                      RMC Delivery & Visit Cross-Analysis
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Checks if a construction employee visited a project within
                      30 minutes (before or after) of an RMC (Ready-Mix
                      Concrete) delivery.
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      onClick={handleRunAnalysis}
                      disabled={
                        isAnalyzing ||
                        visits.length === 0 ||
                        materialData.length === 0
                      }
                      className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400"
                    >
                      {isAnalyzing ? (
                        <>
                          <Spinner className="w-5 h-5 mr-2" /> Analyzing...
                        </>
                      ) : (
                        "Run Analysis"
                      )}
                    </button>
                  ) : (
                    <span className="text-slate-400 text-sm bg-slate-100 px-4 py-2 rounded-md border text-center">
                      Analysis (Admin Only)
                    </span>
                  )}
                </div>

                {analysisResults.length > 0 && (
                  <div>
                    <input
                      type="text"
                      value={analysisSearchQuery}
                      onChange={(e) => setAnalysisSearchQuery(e.target.value)}
                      placeholder="Search analysis results..."
                      className="w-full max-w-lg mb-4 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500"
                    />
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Project
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              MRF No.
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Material (RMC)
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Receiving Time (Shared by ME)
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Analysis Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Visitor Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Visit Time
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                          {filteredAnalysisResults.map((result) => (
                            <tr key={result.id}>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                                {result["Project Name"]}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {result["MRF NO"]}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {result["Material Name"]}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {formatDateDDMMMYYYY(result["Receiving Date"])}{" "}
                                @ {result["Receiving Time"]}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm">
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${result.analysisStatus === "Visit Found" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                                >
                                  {result.analysisStatus}
                                </span>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {result.matchingVisit?.visitorName || "N/A"}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {result.matchingVisit
                                  ? `${result.matchingVisit.entryTime} - ${result.matchingVisit.outTime}`
                                  : "N/A"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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

export default ConstructionDutyAnalysis;
