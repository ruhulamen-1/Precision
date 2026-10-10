import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  SalesPersonVisit,
  User,
  Project,
  SalesPersonVisitTab,
  KpiData,
  SalesTeam,
  SalesEmployee,
  SaleableProject,
  AllEmployee,
} from "../types";
import FeedbackMessage from "./FeedbackMessage";
import _ from "lodash";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import { SkeletonRow } from "./TableSkeleton";

const REQUIRED_HEADERS = [
  "Sl No",
  "Employee ID",
  "Date",
  "Name (Sales Person)",
  "Designation",
  "Customer Name",
  "Customer ID",
  "Project Name",
  "Project Location",
  "In Time",
  "Out Time",
];

const KPI_REQUIRED_HEADERS = [
  "SL",
  "Employee ID",
  "Associate",
  "Date",
  "Project Info",
  "With (Lead Info)",
];

/**
 * Parses a date string from various common formats and returns it in YYYY-MM-DD format.
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
        return d.toISOString().split("T")[0];
      }
    }
  }

  // Handle formats like DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = dateString
    .trim()
    .match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const d = new Date(
      parseInt(dmyMatch[3], 10),
      parseInt(dmyMatch[2], 10) - 1,
      parseInt(dmyMatch[1], 10),
    );
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  }

  // Handle standard ISO and common formats
  const date = new Date(dateString.trim());
  if (!isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  console.warn(`Could not parse date: "${dateString}"`);
  return "";
};

/**
 * Formats a date string (YYYY-MM-DD or ISO) to DD-MMM-YYYY format.
 * @param dateStr Date string.
 * @returns Formatted date string (e.g., 29-Apr-2024).
 */
const formatDateToDDMMMYYYY = (dateStr: string): string => {
  if (!dateStr) return "";

  // If it's strictly YYYY-MM-DD, process manually to avoid timezone shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-");
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

  // Attempt to handle ISO or other Date strings
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = d.getDate().toString().padStart(2, "0");
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
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (e) {
    // Fallback
  }

  return dateStr;
};

const calculateDurationInMinutes = (
  inTime: string,
  outTime: string,
): number | null => {
  if (
    !inTime ||
    !outTime ||
    inTime.toLowerCase() === "n/a" ||
    outTime.toLowerCase() === "n/a"
  ) {
    return null;
  }

  const timeRegex = /^(\d{1,2}):(\d{2})/;
  const inMatch = String(inTime).match(timeRegex);
  const outMatch = String(outTime).match(timeRegex);

  if (!inMatch || !outMatch) {
    return null;
  }

  const inDate = new Date(0);
  inDate.setHours(parseInt(inMatch[1], 10), parseInt(inMatch[2], 10), 0, 0);

  const outDate = new Date(0);
  outDate.setHours(parseInt(outMatch[1], 10), parseInt(outMatch[2], 10), 0, 0);

  if (outDate < inDate) {
    return null;
  }

  const diffMs = outDate.getTime() - inDate.getTime();
  return Math.round(diffMs / 60000);
};

interface SalesPersonProjectVisitProps {
  currentUser: User;
  projects: Project[];
  visits: SalesPersonVisit[];
  onUpdateVisits: React.Dispatch<React.SetStateAction<SalesPersonVisit[]>>;
  activeTab: SalesPersonVisitTab;
  onTabChange: (tab: SalesPersonVisitTab) => void;
  salesTeams: SalesTeam[];
  onUpdateTeams: React.Dispatch<React.SetStateAction<SalesTeam[]>>;
}

// Reusable component for the small summary cards
const SummaryCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: "blue" | "purple" | "green" | "amber" | "rose" | "teal";
}> = ({ title, value, icon, color }) => {
  const colorSchemes = {
    blue: {
      gradient: "from-blue-50 to-indigo-100",
      iconBg: "bg-blue-200/80",
      iconText: "text-blue-600",
      valueText: "text-blue-900",
      labelText: "text-blue-800/90",
    },
    purple: {
      gradient: "from-purple-50 to-violet-100",
      iconBg: "bg-purple-200/80",
      iconText: "text-purple-600",
      valueText: "text-purple-900",
      labelText: "text-purple-800/90",
    },
    green: {
      gradient: "from-green-50 to-emerald-100",
      iconBg: "bg-green-200/80",
      iconText: "text-green-600",
      valueText: "text-green-900",
      labelText: "text-green-800/90",
    },
    amber: {
      gradient: "from-amber-50 to-orange-100",
      iconBg: "bg-amber-200/80",
      iconText: "text-amber-600",
      valueText: "text-amber-900",
      labelText: "text-amber-800/90",
    },
    rose: {
      gradient: "from-rose-50 to-red-100",
      iconBg: "bg-rose-200/80",
      iconText: "text-rose-600",
      valueText: "text-rose-900",
      labelText: "text-rose-800/90",
    },
    teal: {
      gradient: "from-teal-50 to-cyan-100",
      iconBg: "bg-teal-200/80",
      iconText: "text-teal-600",
      valueText: "text-teal-900",
      labelText: "text-teal-800/90",
    },
  };
  const scheme = colorSchemes[color] || colorSchemes.blue;

  return (
    <div
      className={`bg-gradient-to-br ${scheme.gradient} p-4 rounded-xl shadow-lg border border-black/5 flex items-center gap-4 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl`}
    >
      <div
        className={`flex-shrink-0 h-12 w-12 rounded-lg ${scheme.iconBg} ${scheme.iconText} flex items-center justify-center shadow-inner`}
      >
        {icon}
      </div>
      <div>
        <p className={`text-xs font-semibold uppercase ${scheme.labelText}`}>
          {title}
        </p>
        <p
          className={`text-2xl font-extrabold truncate ${scheme.valueText}`}
          title={String(value)}
        >
          {value}
        </p>
      </div>
    </div>
  );
};

// Reusable component to display a single report section in the consolidated view
const ReportSection: React.FC<{ report: any; allowWrap?: boolean }> = ({
  report,
  allowWrap = true,
}) => {
  if (!report) return null;

  if (report.type === "summaryCards" && report.cards) {
    const icons: React.ReactNode[] = [
      // Avg. Duration
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z"
          clipRule="evenodd"
        />
      </svg>,
      // < 5 min
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l6-6a1 1 0 00-1.414-1.414L9 11.586l-1.293-1.293z"
          clipRule="evenodd"
        />
      </svg>,
      // 5-10 min
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
      </svg>,
      // 10-20 min
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M10 2a6 6 0 00-6 6v3.586l-1.293 1.293a1 1 0 001.414 1.414L5 13.586V16a1 1 0 001 1h8a1 1 0 001-1v-2.414l.293.293a1 1 0 001.414-1.414L15 11.586V8a6 6 0 00-6-6zm2 10a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>,
      // 20+ min
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
      </svg>,
    ];
    const cardColors: Array<"blue" | "rose" | "amber" | "teal" | "green"> = [
      "blue",
      "rose",
      "amber",
      "teal",
      "green",
    ];

    return (
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <h4 className="text-lg font-semibold text-slate-700 mb-3">
          {report.title}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {report.cards.map((card: any, index: number) => (
            <SummaryCard
              key={index}
              title={card.label}
              value={card.value}
              icon={icons[index % icons.length]}
              color={cardColors[index % cardColors.length]}
            />
          ))}
        </div>
      </div>
    );
  }

  const tableClass = allowWrap
    ? "min-w-full text-sm table-fixed"
    : "min-w-full text-sm";
  const cellClass = allowWrap
    ? "px-3 py-2 whitespace-normal break-words text-slate-600"
    : "px-3 py-2 whitespace-nowrap text-slate-600";
  const headerClass = (h: string) => {
    let classes =
      "px-3 py-2 text-left text-xs font-medium text-slate-600 uppercase";
    if (allowWrap && (h === "Project Names" || h === "Project Name")) {
      classes += " w-2/5";
    }
    return classes;
  };

  return (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
      <h4 className="text-lg font-semibold text-slate-700 mb-3">
        {report.title}
      </h4>

      {report.headers && report.rows && (
        <div className="overflow-auto max-h-80">
          <table className={tableClass}>
            <thead className="bg-slate-200 sticky top-0">
              <tr>
                {report.headers.map((h: string) => (
                  <th key={h} className={headerClass(h)}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {report.rows.length > 0 ? (
                report.rows.map((row: any[], rIndex: number) => (
                  <tr key={rIndex}>
                    {row.map((cell: any, cIndex: number) => {
                      if (
                        typeof cell === "object" &&
                        cell !== null &&
                        cell.colSpan
                      ) {
                        let cellClasses = allowWrap
                          ? "px-3 py-2 whitespace-normal break-words"
                          : "px-3 py-2 whitespace-nowrap";
                        if (cell.isTeamHeader) {
                          cellClasses +=
                            " font-bold bg-indigo-100 text-indigo-900 text-sm text-left";
                        } else if (cell.isTeamSummary) {
                          cellClasses +=
                            " font-bold bg-indigo-200 text-indigo-900 text-xs text-center";
                        } else if (cell.isSummary) {
                          cellClasses +=
                            " font-semibold bg-orange-50 text-orange-900 text-xs text-center";
                        }
                        return (
                          <td
                            key={cIndex}
                            colSpan={cell.colSpan}
                            className={cellClasses}
                          >
                            {cell.content}
                          </td>
                        );
                      }
                      return (
                        <td key={cIndex} className={cellClass}>
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={report.headers.length}
                    className="text-center py-4 text-slate-500"
                  >
                    No data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// --- PDF HELPER FUNCTION ---
/**
 * Adds a standardized, compact header and footer to every page of a jsPDF document.
 * @param doc The jsPDF document instance.
 * @param title The title of the report to display in the header.
 */
const addPdfHeaderAndFooter = (doc: any, title: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
  const pageCount = (doc as any).internal.getNumberOfPages();

  // --- HEADER ---
  const headerStartY = 15;

  // Logo removed as per request

  doc.setFont("Merriweather", "bold");
  doc.setFontSize(14);
  doc.setTextColor(40);
  doc.text("Credence Housing Limited", pageWidth / 2, headerStartY, {
    align: "center",
  });

  doc.setFont("Trebuchet MS", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
    pageWidth / 2,
    headerStartY + 6,
    { align: "center" },
  );

  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(margin, 28, pageWidth - margin, 28);

  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(0);
  doc.text(title, pageWidth / 2, 34, { align: "center" });

  // --- FOOTER ---
  doc.setFont("Trebuchet MS", "normal");
  doc.setFontSize(9).setTextColor(150);
  const preparedByStr = `Prepared by: MIS`;
  doc.text(preparedByStr, margin, pageHeight - 10);

  // Dept. HOD removed as per request

  const pageStr = `Page ${pageNumber} of ${pageCount}`;
  doc.text(pageStr, pageWidth - margin, pageHeight - 10, { align: "right" });

  const now = new Date();
  const dateTimeStr = `Generated on: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  doc.setFontSize(7).setTextColor(180);
  doc.text(dateTimeStr, pageWidth / 2, pageHeight - 10, { align: "center" });
};

const invalidCustomerNames = new Set(["self", "n/a", "-", ""]);

const generateTeamVisitList = (
  analysisVisits: SalesPersonVisit[],
  externalVisits: SalesPersonVisit[],
  salesTeams: SalesTeam[],
) => {
  const teamVisitListRows: any[] = [];
  const groupedBySalesperson = _.groupBy(analysisVisits, "salesPersonName");
  const externalVisitsBySalesperson = _.groupBy(
    externalVisits,
    "salesPersonName",
  );

  salesTeams.forEach((team: SalesTeam) => {
    teamVisitListRows.push([
      {
        content: `Team: ${team.teamName} (Leader: ${team.leader})`,
        colSpan: 4,
        isTeamHeader: true,
      },
    ]);

    let teamTotalVisits = 0;
    let teamUniqueCustomers = new Set<string>();
    let teamUniqueProjects = new Set<string>();

    team.members.forEach((member: string) => {
      const memberVisits = _.orderBy(groupedBySalesperson[member] || [], [
        "date",
        "projectName",
      ]);
      if (memberVisits.length > 0) {
        const externalMemberVisits = externalVisitsBySalesperson[member] || [];

        memberVisits.forEach((visit, index) => {
          const isExternal =
            visit.customerName &&
            !invalidCustomerNames.has(visit.customerName.trim().toLowerCase());
          teamVisitListRows.push([
            index === 0 ? member : "",
            visit.projectName,
            isExternal ? visit.customerName : "Not Found",
            isExternal ? visit.customerId || "N/A" : "Not Found",
          ]);
        });

        const totalVisits = memberVisits.length;
        const uniqueCustomers = new Set(
          externalMemberVisits.map((v) => `${v.customerId}-${v.customerName}`),
        ).size;
        const uniqueProjects = new Set(memberVisits.map((v) => v.projectName))
          .size;

        teamVisitListRows.push([
          {
            content: `Total Visits: ${totalVisits}`,
            colSpan: 1,
            isSummary: true,
          },
          {
            content: `Unique Projects: ${uniqueProjects}`,
            colSpan: 1,
            isSummary: true,
          },
          {
            content: `Unique Customers: ${uniqueCustomers}`,
            colSpan: 2,
            isSummary: true,
          },
        ]);

        teamTotalVisits += totalVisits;
        externalMemberVisits.forEach((v) =>
          teamUniqueCustomers.add(`${v.customerId}-${v.customerName}`),
        );
        memberVisits.forEach((v) => teamUniqueProjects.add(v.projectName));
      }
    });

    teamVisitListRows.push([
      {
        content: `Team Total Visits: ${teamTotalVisits}`,
        colSpan: 1,
        isTeamSummary: true,
      },
      {
        content: `Team Unique Projects: ${teamUniqueProjects.size}`,
        colSpan: 1,
        isTeamSummary: true,
      },
      {
        content: `Team Unique Customers: ${teamUniqueCustomers.size}`,
        colSpan: 2,
        isTeamSummary: true,
      },
    ]);
  });

  return {
    title: "Team-wise Visit List",
    headers: ["Sales Person", "Project Name", "Customer Name", "Customer ID"],
    rows: teamVisitListRows,
  };
};

const SalesPersonProjectVisit: React.FC<SalesPersonProjectVisitProps> = ({
  currentUser,
  projects,
  visits,
  onUpdateVisits,
  activeTab,
  onTabChange,
  salesTeams,
  onUpdateTeams,
}) => {
  const canEdit = currentUser.permissions?.salesPersonProjectVisit?.edit || 
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kpiFileInputRef = useRef<HTMLInputElement>(null);
  const employeeFileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [salesEmployees, setSalesEmployees] = useState<SalesEmployee[]>([]);
  const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);
  const [isTeamFormOpen, setIsTeamFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<SalesEmployee | null>(
    null,
  );
  const [editingTeam, setEditingTeam] = useState<SalesTeam | null>(null);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch("/api/sales-employees")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/kpi-data")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/saleable-projects")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/all-employees")
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([employees, kpi, saleable, allEmp]) => {
        setSalesEmployees(employees);

        if (Array.isArray(kpi)) {
          const formattedData = kpi.map((item: any) => ({
            id: item.id,
            sl: item.sl,
            empId: item.emp_id,
            associate: item.associate,
            date: item.date,
            projectInfo: item.project_info,
            leadInfo: item.lead_info,
          }));
          setKpiData(formattedData);
        } else {
          setKpiData(kpi);
        }

        setSaleableProjects(saleable);
        setAllEmployees(allEmp);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Filters for Records Tab
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [salesPersonFilter, setSalesPersonFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  // State for Analysis Tab
  const [analysisStartDate, setAnalysisStartDate] = useState("");
  const [analysisEndDate, setAnalysisEndDate] = useState("");
  const [selectedReports, setSelectedReports] = useState<string[]>([
    "consolidated-report",
  ]);
  const [reportData, setReportData] = useState<any | null>(null);
  const [kpiData, setKpiData] = useState<KpiData[]>([]);
  const [showKpiTable, setShowKpiTable] = useState(false);
  const [saleableProjects, setSaleableProjects] = useState<SaleableProject[]>(
    [],
  );
  const [allEmployees, setAllEmployees] = useState<AllEmployee[]>([]);
  const [editingKpiId, setEditingKpiId] = useState<string | number | null>(
    null,
  );
  const [editKpiData, setEditKpiData] = useState<Partial<KpiData>>({});

  const projectNames = useMemo(
    () => _.uniq(projects.map((p) => p.name)).sort(),
    [projects],
  );

  const salesPersonNames = useMemo(() => {
    const allNames = _.uniq(visits.map((v) => v.salesPersonName)).sort();
    if (!teamFilter) {
      return allNames;
    }
    const selectedTeam = salesTeams.find((t) => t.teamName === teamFilter);
    if (selectedTeam) {
      const teamMemberSet = new Set(selectedTeam.members);
      return allNames.filter((name) => teamMemberSet.has(name));
    }
    return []; // No matching team, so no salespeople to show
  }, [visits, teamFilter]);

  useEffect(() => {
    setSalesPersonFilter(""); // Reset salesperson filter when team changes
  }, [teamFilter]);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        console.log("[FRONTEND DEBUG] Health Response Status:", res.status);
        return res.json();
      })
      .then((data) => console.log("[FRONTEND DEBUG] API Health Data:", data))
      .catch((err) =>
        console.error("[FRONTEND DEBUG] API Health Fetch Fail:", err),
      );
  }, []);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const startDateMatch = !startDate || visit.date >= startDate;
      const endDateMatch = !endDate || visit.date <= endDate;
      const projectMatch =
        !projectFilter || visit.projectName === projectFilter;

      let teamMembers: string[] | null = null;
      if (teamFilter) {
        const selectedTeam = salesTeams.find((t) => t.teamName === teamFilter);
        if (selectedTeam) {
          teamMembers = selectedTeam.members;
        } else {
          return false; // Team selected but not found, show no results
        }
      }

      const teamMatch =
        !teamMembers || teamMembers.includes(visit.salesPersonName);
      const salesPersonMatch =
        !salesPersonFilter || visit.salesPersonName === salesPersonFilter;

      return (
        startDateMatch &&
        endDateMatch &&
        projectMatch &&
        teamMatch &&
        salesPersonMatch
      );
    });
  }, [
    visits,
    startDate,
    endDate,
    projectFilter,
    salesPersonFilter,
    teamFilter,
  ]);

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
      complete: async (results: any) => {
        const headers = results.meta.fields;
        const isValid =
          headers && REQUIRED_HEADERS.every((h) => headers.includes(h.trim()));

        if (!isValid) {
          setFeedback({
            message:
              "CSV header mismatch. Please use the exact format from the template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const newVisits: SalesPersonVisit[] = [];
        let hasError = false;

        results.data.forEach((row: any, index: number) => {
          if (hasError) return;
          if (
            !row["Sl No"] ||
            !row["Date"] ||
            !row["Name (Sales Person)"] ||
            !row["Project Name"]
          ) {
            setFeedback({
              message: `Missing essential data in row ${index + 2}.`,
              type: "error",
            });
            hasError = true;
            return;
          }

          const formattedDate = parseAndFormatDate(row["Date"]);
          if (!formattedDate) {
            setFeedback({
              message: `Invalid date format in row ${index + 2}: "${row["Date"]}". Skipping row.`,
              type: "error",
            });
            hasError = true;
            return;
          }

          newVisits.push({
            id: Date.now() + index, // Temp ID
            slNo: row["Sl No"],
            employeeId: row["Employee ID"],
            date: formattedDate,
            salesPersonName: row["Name (Sales Person)"],
            designation: row["Designation"] || "N/A",
            customerName: row["Customer Name"] || "N/A",
            customerId: row["Customer ID"] || "N/A",
            projectName: row["Project Name"],
            projectLocation: row["Project Location"] || "N/A",
            inTime: row["In Time"] || "N/A",
            outTime: row["Out Time"] || "N/A",
          });
        });

        if (!hasError && newVisits.length > 0) {
          try {
            const response = await fetch("/api/sales-person-visits/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newVisits),
            });

            if (!response.ok) {
              const errTxt = await response.text();
              console.error("Server error response:", response.status, errTxt);
              throw new Error(
                `Failed to save to database: ${response.status} ${errTxt}`,
              );
            }

            // Re-fetch to get accurate DB IDs, or just append since we generated temp IDs
            // appending local for immediate UI update:
            onUpdateVisits((prev) =>
              _.orderBy([...prev, ...newVisits], ["date"], ["desc"]),
            );
            setFeedback({
              message: `Successfully imported and saved ${newVisits.length} records.`,
              type: "success",
            });
          } catch (error) {
            setFeedback({
              message:
                error instanceof Error
                  ? error.message
                  : "Error saving imported records to database.",
              type: "error",
            });
            console.error(error);
          }
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

  const handleDownloadTemplate = () => {
    if (typeof window.Papa === "undefined") {
      setFeedback({ message: "CSV library is not available.", type: "error" });
      return;
    }
    const exampleData = [
      [
        "1",
        "EMP-001",
        "01-Sep-24",
        "John Doe",
        "Sales Executive",
        "Mr. Smith",
        "CUST-001",
        "Lake Lofts",
        "Dhanmondi",
        "10:00",
        "11:00",
      ],
    ];

    const csv = window.Papa.unparse({
      fields: REQUIRED_HEADERS,
      data: exampleData,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "sales_person_visit_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAutoCreateTeams = () => {
    // Group employees by teamLeader
    const grouped = _.groupBy(salesEmployees || [], "teamLeader");

    const newTeams = Object.entries(grouped)
      .filter(
        ([leader]) => leader && leader.trim() !== "" && leader !== "undefined",
      )
      .map(([leader, employees]) => {
        const empArray = employees as SalesEmployee[];
        return {
          teamName: `Team ${leader}`,
          leader: leader,
          members: empArray.map((e) => e.name),
        };
      });

    // Send newTeams to backend
    Promise.all(
      newTeams.map((team) =>
        fetch("/api/sales-teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(team),
        }).then((r) => r.json()),
      ),
    )
      .then((teams) => {
        onUpdateTeams((prev) => [...prev, ...teams]);
        setFeedback({
          message: "Teams auto-created successfully!",
          type: "success",
        });
      })
      .catch((err) => {
        console.error(err);
        setFeedback({ message: "Error auto-creating teams", type: "error" });
      });
  };

  const handleDownloadEmployeeTemplate = () => {
    if (typeof window.Papa === "undefined") {
      setFeedback({ message: "CSV library is not available.", type: "error" });
      return;
    }
    const headers = [
      "empId",
      "name",
      "designation",
      "position",
      "teamLeader",
      "departmentHod",
    ];
    const exampleData = [
      [
        "EMP-001",
        "John Doe",
        "Sales Executive",
        "Sales",
        "Team Leader A",
        "HOD B",
      ],
    ];

    const csv = window.Papa.unparse({ fields: headers, data: exampleData });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "employee_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    const dataForCsv = filteredVisits.map((v) => ({
      "Sl No": v.slNo,
      "Employee ID": v.employeeId || "",
      Date: v.date,
      "Name (Sales Person)": v.salesPersonName,
      Designation: v.designation,
      "Customer Name": v.customerName,
      "Customer ID": v.customerId,
      "Project Name": v.projectName,
      "Project Location": v.projectLocation || "N/A",
      "In Time": v.inTime,
      "Out Time": v.outTime,
    }));

    const csv = Papa.unparse(dataForCsv);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "sales_person_visits_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const reportTitle = "Sales Person Visit Report";

    const tableColumn = [
      "Sl",
      "Emp ID",
      "Date",
      "Salesperson",
      "Designation",
      "Customer (ID)",
      "Project",
      "Location",
      "In",
      "Out",
    ];
    const tableRows = filteredVisits.map((v) => [
      v.slNo,
      v.employeeId || "",
      v.date,
      v.salesPersonName,
      v.designation,
      `${v.customerName} (${v.customerId})`,
      v.projectName,
      v.projectLocation || "N/A",
      v.inTime,
      v.outTime,
    ]);

    // @ts-ignore
    autoTable(doc as any, {
      head: [tableColumn],
      body: tableRows,
      startY: 38,
      theme: "grid" as any,
      headStyles: {
        fillColor: [173, 216, 230],
        fontSize: 8,
        fontStyle: "bold",
        textColor: 0,
      },
      bodyStyles: {
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      styles: {
        cellPadding: 1.5,
        overflow: "linebreak",
      },
      margin: { top: 40, bottom: 30, left: 14, right: 14 },
      didDrawPage: (data: any) => {
        addPdfHeaderAndFooter(doc, reportTitle);
      },
    });

    doc.save(
      `Sales-person-visits-${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  const handleExportTeamListCSV = () => {
    if (typeof window.Papa === "undefined") {
      setFeedback({ message: "CSV library is not available.", type: "error" });
      return;
    }

    const analysisVisits = visits.filter((visit) => {
      const startDateMatch =
        !analysisStartDate || visit.date >= analysisStartDate;
      const endDateMatch = !analysisEndDate || visit.date <= analysisEndDate;
      return startDateMatch && endDateMatch;
    });

    if (analysisVisits.length === 0) {
      setFeedback({
        message: "No data available in the selected date range to export.",
        type: "info",
      });
      return;
    }

    const headers = [
      "Team Name",
      "Team Leader",
      "Employee ID",
      "Sales Person",
      "Date",
      "Project Name",
      "Customer Name",
      "Customer ID",
    ];
    const csvData: any[] = [];
    const visitsBySalesperson = _.groupBy(analysisVisits, "salesPersonName");

    salesTeams.forEach((team) => {
      team.members.forEach((member) => {
        const memberVisits = visitsBySalesperson[member];
        if (memberVisits && memberVisits.length > 0) {
          memberVisits.forEach((visit) => {
            csvData.push([
              team.teamName,
              team.leader,
              visit.employeeId || "",
              member,
              visit.date,
              visit.projectName,
              visit.customerName,
              visit.customerId,
            ]);
          });
        }
      });
    });

    const csv = window.Papa.unparse({ fields: headers, data: csvData });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `team_visit_list_${analysisStartDate || "all"}_to_${analysisEndDate || "all"}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateConsolidatedData = (analysisVisits: SalesPersonVisit[]) => {
    const externalVisits = analysisVisits.filter(
      (v) =>
        v.customerName &&
        !invalidCustomerNames.has(v.customerName.trim().toLowerCase()),
    );

    const visitsBySalesperson = _.groupBy(analysisVisits, "salesPersonName");
    const externalVisitsBySalesperson = _.groupBy(
      externalVisits,
      "salesPersonName",
    );
    const salespersonStats = Object.keys(visitsBySalesperson)
      .map((salesperson) => {
        const totalVisits = visitsBySalesperson[salesperson]?.length || 0;
        const uniqueCustomers = _.uniqBy(
          externalVisitsBySalesperson[salesperson] || [],
          (v) => `${v.customerId}-${v.customerName}`,
        ).length;
        const uniqueProjects = _.uniqBy(
          visitsBySalesperson[salesperson],
          "projectName",
        );
        const uniqueProjectsCount = uniqueProjects.length;
        const uniqueProjectNames = uniqueProjects
          .map((p) => p.projectName)
          .sort()
          .join(", ");
        return {
          salesperson,
          totalVisits,
          uniqueCustomers,
          uniqueProjectsCount,
          uniqueProjectNames,
        };
      })
      .sort((a, b) => a.totalVisits - b.totalVisits); // Ascending as requested

    const visitsPerSalesperson = {
      title: "Total Visits per Sales Person",
      headers: [
        "Sales Person",
        "Total Visits",
        "Total Customers",
        "Unique Projects",
        "Project Names",
      ],
      rows: salespersonStats.map((s) => [
        s.salesperson,
        s.totalVisits,
        s.uniqueCustomers,
        s.uniqueProjectsCount,
        s.uniqueProjectNames,
      ]),
    };

    const customerProjectGrouped = _.countBy(
      externalVisits,
      (v) => `${v.customerName} (${v.customerId})|${v.projectName}`,
    );
    const visitsPerCustomerAndProject = {
      title: "Visits per Customer & Project",
      headers: ["Customer", "Project Name", "Total Visits"],
      rows: Object.entries(customerProjectGrouped)
        .map(([key, count]) => {
          const [customer, project] = key.split("|");
          return [customer, project, count];
        })
        .sort((a, b) => Number(b[2]) - Number(a[2])),
    };

    const projectGrouped = _.countBy(analysisVisits, "projectName");
    const visitsPerProject = {
      title: "Total Visits per Project",
      headers: ["Project", "Total Visits"],
      rows: Object.entries(projectGrouped).sort(
        (a, b) => Number(b[1]) - Number(a[1]),
      ),
    };

    const locationGrouped = _.countBy(analysisVisits, "projectLocation");
    const visitsPerProjectLocation = {
      title: "Total Visits per Project Location",
      headers: ["Location", "Total Visits"],
      rows: Object.entries(locationGrouped).sort(
        (a, b) => Number(b[1]) - Number(a[1]),
      ),
    };

    const uniqueCustomersPerSalespersonGrouped = _.groupBy(
      externalVisits,
      "salesPersonName",
    );
    const uniqueCustomersPerSalesperson = {
      title: "Unique Customers per Salesperson (External)",
      headers: ["Sales Person", "Unique External Customers"],
      rows: Object.entries(uniqueCustomersPerSalespersonGrouped)
        .map(([salesperson, visits]) => {
          const uniqueCustomerCount = _.uniqBy(
            visits,
            (v) => `${v.customerId}-${v.customerName}`,
          ).length;
          return [salesperson, uniqueCustomerCount];
        })
        .sort((a, b) => Number(b[1]) - Number(a[1])),
    };

    const groupedBySalespersonAllVisits = _.groupBy(
      analysisVisits,
      "salesPersonName",
    );
    const groupedBySalespersonExternal = _.groupBy(
      externalVisits,
      "salesPersonName",
    );

    const salespersonCustomerVisitsRows: any[] = [];
    const sortedSalespeople = Object.keys(groupedBySalespersonAllVisits).sort();

    sortedSalespeople.forEach((salesperson) => {
      const allVisitsForPerson = _.orderBy(
        groupedBySalespersonAllVisits[salesperson] || [],
        ["date", "projectName"],
      );
      const externalVisitsForPerson =
        groupedBySalespersonExternal[salesperson] || [];

      if (allVisitsForPerson.length > 0) {
        allVisitsForPerson.forEach((visit, index) => {
          const isExternal =
            visit.customerName &&
            !invalidCustomerNames.has(visit.customerName.trim().toLowerCase());
          salespersonCustomerVisitsRows.push([
            index === 0 ? salesperson : "",
            visit.projectName,
            isExternal ? visit.customerName : "Not Found",
            isExternal ? visit.customerId || "N/A" : "Not Found",
          ]);
        });
      }

      const totalVisits = allVisitsForPerson.length;
      const uniqueCustomers = _.uniqBy(
        externalVisitsForPerson,
        (v) => `${v.customerId}-${v.customerName}`,
      ).length;
      const uniqueProjects = _.uniqBy(allVisitsForPerson, "projectName").length;

      salespersonCustomerVisitsRows.push([
        {
          content: `Total Visits: ${totalVisits}`,
          colSpan: 1,
          isSummary: true,
        },
        {
          content: `Unique Projects: ${uniqueProjects}`,
          colSpan: 1,
          isSummary: true,
        },
        {
          content: `Unique Customers: ${uniqueCustomers}`,
          colSpan: 2,
          isSummary: true,
        },
      ]);
    });

    const salespersonCustomerVisits = {
      title: "Salesperson-wise Customer & Project Visits (List)",
      headers: ["Sales Person", "Project Name", "Customer Name", "Customer ID"],
      rows: salespersonCustomerVisitsRows,
    };

    const withDuration = analysisVisits
      .map((v) => ({
        ...v,
        duration: calculateDurationInMinutes(v.inTime, v.outTime),
      }))
      .filter((v) => v.duration !== null && v.duration >= 0);
    const avgDuration = withDuration.length
      ? _.sumBy(withDuration, "duration") / withDuration.length
      : 0;
    const timeAnalysis = {
      title: "Visit Duration Analysis",
      type: "summaryCards",
      cards: [
        { label: "Avg. Duration (min)", value: avgDuration.toFixed(2) },
        {
          label: "< 5 min Visits",
          value: withDuration.filter((v) => v.duration! < 5).length,
        },
        {
          label: "5-10 min Visits",
          value: withDuration.filter(
            (v) => v.duration! >= 5 && v.duration! < 10,
          ).length,
        },
        {
          label: "10-20 min Visits",
          value: withDuration.filter(
            (v) => v.duration! >= 10 && v.duration! < 20,
          ).length,
        },
        {
          label: "20+ min Visits",
          value: withDuration.filter((v) => v.duration! >= 20).length,
        },
      ],
    };

    const topPerformers = {
      title: "Top 5 Sales Persons (by Visits)",
      headers: [
        "Sales Person",
        "Total Visits",
        "Total Customers",
        "Unique Projects",
        "Project Names",
      ],
      rows: [...salespersonStats]
        .sort((a, b) => b.totalVisits - a.totalVisits)
        .slice(0, 5)
        .map((s) => [
          s.salesperson,
          s.totalVisits,
          s.uniqueCustomers,
          s.uniqueProjectsCount,
          s.uniqueProjectNames,
        ]),
    };

    const missing = analysisVisits.filter(
      (v) => !v.outTime || v.outTime.toLowerCase() === "n/a",
    );
    const missingOutTime = {
      title: "Visits with Missing Out Time",
      headers: ["Date", "Sales Person", "Project", "Customer", "In Time"],
      rows: missing.map((v) => [
        v.date,
        v.salesPersonName,
        v.projectName,
        v.customerName,
        v.inTime,
      ]),
    };

    return {
      type: "consolidated",
      title: "Consolidated Visit Report",
      visitsPerSalesperson,
      visitsPerCustomer: visitsPerCustomerAndProject,
      visitsPerProject,
      visitsPerProjectLocation,
      uniqueCustomersPerSalesperson,
      salespersonCustomerVisits,
      teamVisitList: generateTeamVisitList(
        analysisVisits,
        externalVisits,
        salesTeams,
      ),
      timeAnalysis,
      topPerformers,
      missingOutTime,
    };
  };

  const handleGenerateReport = () => {
    const analysisVisits = visits.filter((visit) => {
      const startDateMatch =
        !analysisStartDate || visit.date >= analysisStartDate;
      const endDateMatch = !analysisEndDate || visit.date <= analysisEndDate;
      return startDateMatch && endDateMatch;
    });

    if (selectedReports.length === 0) {
      setFeedback({
        message: "Please select at least one report type.",
        type: "error",
      });
      setReportData(null);
      return;
    }

    // --- Overall Summary Calculation ---
    const externalVisitsForSummary = analysisVisits.filter(
      (v) =>
        v.customerName &&
        !invalidCustomerNames.has(v.customerName.trim().toLowerCase()),
    );
    const overallSummary = {
      totalSalesPersons: _.uniqBy(analysisVisits, "salesPersonName").length,
      totalTeamMembers: new Set(salesTeams.flatMap((t) => t.members)).size,
      totalVisits: analysisVisits.length,
      totalUniqueCustomers: _.uniqBy(
        externalVisitsForSummary,
        (v) => `${v.customerId}-${v.customerName}`,
      ).length,
      totalUniqueProjects: _.uniqBy(analysisVisits, "projectName").length,
      topVisitedProject:
        _.chain(analysisVisits)
          .countBy("projectName")
          .toPairs()
          .maxBy(1)
          .value()?.[0] || "N/A",
    };
    // --- End Summary Calculation ---

    const generateKpiComparison = (
      analysisVisits: SalesPersonVisit[],
      kpiData: KpiData[],
    ) => {
      const employeeVisitsCount = _.countBy(analysisVisits, "salesPersonName");
      const allEmployeeNames = _.union(
        Object.keys(employeeVisitsCount),
        kpiData.map((k) => k.associate),
      );

      // Sort by Actual Visits descending
      const sortedEmployeeNames = _.orderBy(
        allEmployeeNames,
        [(name) => employeeVisitsCount[name] || 0],
        ["desc"],
      );

      const rows = sortedEmployeeNames.map((name) => {
        const kpiEntries = kpiData.filter((k) => k.associate === name);
        const erpVisitCount = kpiEntries.length;
        const actualVisits = employeeVisitsCount[name] || 0;
        const difference = actualVisits - erpVisitCount;
        const achievement =
          erpVisitCount > 0
            ? (actualVisits / erpVisitCount) * 100
            : actualVisits > 0
              ? Infinity
              : 0;

        let achievementText = `${achievement.toFixed(1)}%`;
        if (achievement === Infinity) achievementText = "∞%";

        return [
          name,
          erpVisitCount,
          actualVisits,
          `${difference > 0 ? "+" : ""}${difference}`,
          achievementText,
        ];
      });

      return {
        title: "KPI (ERP) vs Actual Visit (Book) Comparison",
        headers: [
          "Employee Name",
          "ERP Entry Count",
          "Actual Visits (Book)",
          "Difference",
          "Accuracy %",
        ],
        rows: rows,
      };
    };

    const generateCombinedKpiSummary = (
      analysisVisits: SalesPersonVisit[],
      kpiData: KpiData[],
    ) => {
      const visitsBySalesperson = _.groupBy(analysisVisits, "salesPersonName");
      const allEmployeeNames = _.union(
        Object.keys(visitsBySalesperson),
        kpiData.map((k) => k.associate),
      );

      // Sort by actual visits descending
      const sortedEmployeeNames = _.orderBy(
        allEmployeeNames,
        [(name) => (visitsBySalesperson[name] || []).length],
        ["desc"],
      );

      const rows = sortedEmployeeNames.map((name, index) => {
        const employeeVisits = visitsBySalesperson[name] || [];
        const actualVisits = employeeVisits.length;
        const uniqueProjects = _.uniqBy(employeeVisits, "projectName");
        const uniqueProjectsCount = uniqueProjects.length;

        const kpiEntries = kpiData.filter((k) => k.associate === name);
        const erpVisitCount = kpiEntries.length;
        const erpProjectInfo = kpiEntries
          .map((k) => k.projectInfo)
          .filter(Boolean)
          .join("; ");

        return [
          index + 1,
          name,
          actualVisits,
          erpVisitCount,
          erpProjectInfo,
          uniqueProjectsCount,
          uniqueProjects.map((p) => p.projectName).join(", "),
        ];
      });

      return {
        title: "Combined ERP Data & Actual Visit Summary",
        headers: [
          "SL",
          "Sales Person",
          "Actual Visit (Book)",
          "ERP Visit Count",
          "ERP Project Info",
          "Unique Projects (Book)",
          "Book Project Names",
        ],
        rows,
      };
    };

    const generateSaleableProjectAnalysis = (
      analysisVisits: SalesPersonVisit[],
      saleableProjects: SaleableProject[],
    ) => {
      if (saleableProjects.length === 0) return null;

      const visitCountsByName = _.countBy(analysisVisits, "projectName");

      // Map each saleable project to its visit data
      const rows = saleableProjects.map((p, index) => {
        const count = visitCountsByName[p.project_name] || 0;
        let status = "Not Visited";
        if (count > 5) status = "High Visibility";
        else if (count > 0) status = "Low Visibility";

        return [index + 1, p.project_name, count, status];
      });

      // Sort rows: 1. Zero visits first, 2. then lowest visits to highest
      const sortedRows = _.sortBy(rows, (r) => r[2]);

      return {
        title: "Saleable Preferred Project Visit Analysis",
        headers: [
          "SL",
          "Project Name",
          "Visit Count (Actual Book)",
          "Visit Status",
        ],
        rows: sortedRows,
      };
    };

    const generateKpiGapReport = (
      analysisVisits: SalesPersonVisit[],
      kpiData: KpiData[],
      saleableProjects: SaleableProject[],
    ) => {
      if (!kpiData || !saleableProjects) return null;
      if (kpiData.length === 0 && saleableProjects.length === 0) return null;

      const detailRows: any[] = [];

      // 1. Employee Self-Entry (KPI) vs Verified Actual Comparison Detail
      const visitsMap = _.groupBy(
        analysisVisits,
        (v) => `${v.salesPersonName}|${v.date}`,
      );

      kpiData.forEach((kpi, idx) => {
        const kpiDate = parseAndFormatDate(kpi.date);
        const possibleVisits = visitsMap[`${kpi.associate}|${kpiDate}`] || [];

        // Match by project name (fuzzy match)
        const projectSearch = kpi.projectInfo.toLowerCase();
        const matchedVisit = possibleVisits.find(
          (v) =>
            v.projectName.toLowerCase().includes(projectSearch) ||
            projectSearch.includes(v.projectName.toLowerCase()),
        );

        detailRows.push([
          idx + 1,
          kpi.associate,
          kpi.projectInfo,
          kpi.date,
          matchedVisit ? matchedVisit.date : "No Match",
          matchedVisit ? "Matched" : "Unverified",
        ]);
      });

      // 2. 3-Way Project Coverage Gap (Master vs Self-Entry vs Verified)
      const projectVisitsCount = _.countBy(analysisVisits, "projectName");
      const projectKpiCount = _.countBy(kpiData, "projectInfo");

      const coverageRows = saleableProjects.map((sp, idx) => {
        const actualCount = projectVisitsCount[sp.project_name] || 0;
        const kpiCount = projectKpiCount[sp.project_name] || 0;

        let gapStatus = "OK";
        if (actualCount === 0 && kpiCount === 0)
          gapStatus = "Critical Gap (No Activity)";
        else if (actualCount === 0)
          gapStatus = "Verified Visit Gap (Claimed but not Verified)";
        else if (kpiCount === 0)
          gapStatus = "Reporting Gap (Verified but not in KPI)";

        return [idx + 1, sp.project_name, kpiCount, actualCount, gapStatus];
      });

      const sortedCoverage = _.sortBy(coverageRows, (r) => {
        if (r[4].startsWith("Critical")) return 0;
        if (r[4].startsWith("Verified")) return 1;
        if (r[4].startsWith("Reporting")) return 2;
        return 3;
      });

      // 3. Non-Preferred Projects in KPI Entry (Projects in Self-Entry but not in Master/Preferred List)
      const preferredProjectNames = new Set(
        saleableProjects.map((sp) => sp.project_name.toLowerCase()),
      );
      const nonPreferredRows: any[] = [];
      let npIdx = 1;

      kpiData.forEach((kpi) => {
        if (!preferredProjectNames.has(kpi.projectInfo.toLowerCase())) {
          nonPreferredRows.push([
            npIdx++,
            kpi.associate,
            kpi.projectInfo,
            kpi.date,
            "Out of List",
          ]);
        }
      });

      const uniqueNonPreferred = _.uniqBy(
        nonPreferredRows,
        (r) => `${r[1]}|${r[2]}`,
      );

      return [
        {
          title: "Self-Entry vs Verified Visit Match Report (Detail)",
          headers: [
            "SL",
            "Sales Person",
            "Project (Self-Entry)",
            "Entry Date",
            "Verified Date",
            "Status",
          ],
          rows: detailRows,
        },
        {
          title:
            "3-Way Project Coverage & Gap Analysis (Master vs KPI vs Verified)",
          headers: [
            "SL",
            "Project Name",
            "Employee Entry Count (Self)",
            "Verified Visit Count",
            "Gap Status",
          ],
          rows: sortedCoverage,
        },
        {
          title: "Non-Preferred Projects in Self-Entry (Out of Master List)",
          headers: [
            "SL",
            "Sales Person",
            "Project Name (Self-Entry)",
            "Date",
            "Status",
          ],
          rows: uniqueNonPreferred,
        },
      ];
    };

    const reportIdToDataMap: { [key: string]: any } = {
      "visits-per-salesperson":
        generateConsolidatedData(analysisVisits).visitsPerSalesperson,
      "visits-per-customer":
        generateConsolidatedData(analysisVisits).visitsPerCustomer,
      "unique-customers-per-salesperson":
        generateConsolidatedData(analysisVisits).uniqueCustomersPerSalesperson,
      "salesperson-customer-visits":
        generateConsolidatedData(analysisVisits).salespersonCustomerVisits,
      "team-visit-list": generateTeamVisitList(
        analysisVisits,
        analysisVisits.filter(
          (v) =>
            v.customerName &&
            !invalidCustomerNames.has(v.customerName.trim().toLowerCase()),
        ),
        salesTeams,
      ),
      "visits-per-project":
        generateConsolidatedData(analysisVisits).visitsPerProject,
      "visits-per-project-location":
        generateConsolidatedData(analysisVisits).visitsPerProjectLocation,
      "time-analysis": generateConsolidatedData(analysisVisits).timeAnalysis,
      "top-performers": generateConsolidatedData(analysisVisits).topPerformers,
      "missing-out-time":
        generateConsolidatedData(analysisVisits).missingOutTime,
      "kpi-visit-comparison":
        kpiData.length > 0
          ? generateKpiComparison(analysisVisits, kpiData)
          : null,
      "combined-kpi-summary":
        kpiData.length > 0
          ? generateCombinedKpiSummary(analysisVisits, kpiData)
          : null,
      "saleable-project-analysis":
        saleableProjects.length > 0
          ? generateSaleableProjectAnalysis(analysisVisits, saleableProjects)
          : null,
      "kpi-gap-analysis":
        kpiData.length > 0 || saleableProjects.length > 0
          ? generateKpiGapReport(analysisVisits, kpiData, saleableProjects)
          : null,
    };

    if (selectedReports.includes("consolidated-report")) {
      const consolidatedData = generateConsolidatedData(analysisVisits);
      const kpiComparisonData = reportIdToDataMap["kpi-visit-comparison"];
      const combinedKpiSummaryData = reportIdToDataMap["combined-kpi-summary"];
      const kpiGapAnalysisData = reportIdToDataMap["kpi-gap-analysis"];

      setReportData({
        ...consolidatedData,
        kpiVisitComparison: kpiComparisonData,
        combinedKpiSummary: combinedKpiSummaryData,
        saleableProjectAnalysis: reportIdToDataMap["saleable-project-analysis"],
        kpiGapAnalysis: kpiGapAnalysisData,
        overallSummary,
      });
    } else {
      const selectedReportData = _.flatten(
        selectedReports.map((id) => reportIdToDataMap[id]).filter(Boolean),
      );
      setReportData({
        title: "Projects Visits Analysis Report",
        reports: selectedReportData,
        overallSummary,
      });
    }
  };

  const handleExportReportPDF = () => {
    if (!reportData) {
      alert("Generate a report first.");
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageHeight = doc.internal.pageSize.getHeight();
      const headerHeight = 40; // Space for header
      const footerHeight = 30; // Space for footer

      const didParseCellHook = function (data: any) {
        const sourceRow = data.row.raw;
        if (!sourceRow) return;

        if (
          Array.isArray(sourceRow) &&
          sourceRow.some(
            (cell) => typeof cell === "object" && cell?.isTeamHeader,
          )
        ) {
          Object.values(data.row.cells).forEach((cell: any) => {
            cell.styles.fillColor = [67, 56, 202]; // Indigo-700
            cell.styles.textColor = [0, 0, 0];
            cell.styles.fontStyle = "bold";
            cell.styles.halign = "left";
          });
        } else if (
          Array.isArray(sourceRow) &&
          sourceRow.some(
            (cell) => typeof cell === "object" && cell?.isTeamSummary,
          )
        ) {
          Object.values(data.row.cells).forEach((cell: any) => {
            cell.styles.fillColor = [199, 210, 254]; // Indigo-200
            cell.styles.textColor = [49, 46, 129]; // Indigo-900
            cell.styles.fontStyle = "bold";
            cell.styles.halign = "center";
          });
        } else if (
          Array.isArray(sourceRow) &&
          sourceRow.some((cell) => typeof cell === "object" && cell?.isSummary)
        ) {
          Object.values(data.row.cells).forEach((cell: any) => {
            cell.styles.fillColor = [255, 247, 237];
            cell.styles.textColor = [124, 45, 18];
            cell.styles.fontStyle = "bold";
            cell.styles.halign = "center";
          });
        }
      };

      const addSection = (sectionData: any, startY: number): number => {
        if (!sectionData) return startY;
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        const contentWidth = pageWidth - margin * 2;

        // Handle summary cards type
        if (
          sectionData.type === "summaryCards" &&
          Array.isArray(sectionData.cards)
        ) {
          doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(40);
          doc.text(sectionData.title, margin, startY);

          const cardWidth = (contentWidth - 2 * 4) / 3; // 3 cards per row, 4mm gap
          const cardHeight = 15;
          let currentX = margin;
          let currentY = startY + 5;

          sectionData.cards.forEach((card: any, index: number) => {
            if (index > 0 && index % 3 === 0) {
              currentX = margin;
              currentY += cardHeight + 4;
            }

            doc.setFillColor(241, 245, 249); // slate-100
            doc.setDrawColor(226, 232, 240); // slate-200
            doc.roundedRect(
              currentX,
              currentY,
              cardWidth,
              cardHeight,
              2,
              2,
              "FD",
            );

            doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
            doc.text(
              String(card.value),
              currentX + cardWidth / 2,
              currentY + 8,
              { align: "center" },
            );

            doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100);
            doc.text(card.label, currentX + cardWidth / 2, currentY + 12, {
              align: "center",
            });

            currentX += cardWidth + 4;
          });

          return currentY + cardHeight;
        }

        // Guard against missing headers or rows for table sections
        if (
          !Array.isArray(sectionData.headers) ||
          !Array.isArray(sectionData.rows)
        ) {
          console.warn(
            `Skipping section "${sectionData.title}" due to missing headers or rows for table generation.`,
          );
          return startY;
        }

        let specificColumnStyles: any = {};
        // Add fixed column widths for specific reports to ensure alignment
        if (sectionData.title.includes("List")) {
          // Targets both "Team-wise Visit List" and "Salesperson-wise...List"
          specificColumnStyles = {
            0: { cellWidth: 50 }, // Sales Person or Team
            1: { cellWidth: 45 }, // Project Name
            2: { cellWidth: 50 }, // Customer Name
            3: { cellWidth: 25 }, // Customer ID
          };
        }

        const commonOptions = {
          theme: "grid" as any,
          styles: {
            fontSize: 7,
            cellPadding: 1.2,
            overflow: "linebreak" as any,
            lineWidth: 0.1,
            lineColor: [200, 200, 200] as any,
          },
          headStyles: {
            fillColor: [173, 216, 230] as any,
            fontSize: 7.5,
            fontStyle: "bold" as any,
            lineWidth: 0.1,
            lineColor: [200, 200, 200] as any,
          },
          margin: { top: headerHeight, bottom: footerHeight },
          didDrawPage: (data: any) =>
            addPdfHeaderAndFooter(doc, reportData.title),
          didParseCell: didParseCellHook,
          columnStyles: specificColumnStyles,
        };

        if (sectionData.title.includes("List")) {
          const groups: any[][] = [];
          let currentGroup: any[] = [];
          sectionData.rows.forEach((row: any) => {
            currentGroup.push(row);
            if (
              Array.isArray(row) &&
              row.some(
                (cell: any) =>
                  typeof cell === "object" &&
                  (cell?.isSummary || cell?.isTeamSummary),
              )
            ) {
              groups.push(currentGroup);
              currentGroup = [];
            }
          });
          if (currentGroup.length > 0) groups.push(currentGroup);

          let currentY = startY;

          groups.forEach((group) => {
            const isTeamHeader = group[0]?.[0]?.isTeamHeader;
            const estimatedGroupHeight = group.length * 5; // 5mm per row estimate
            const remainingPageSpace = pageHeight - currentY - footerHeight;

            const isFirstOnPage =
              currentY === startY || currentY === headerHeight;
            if (!isFirstOnPage && estimatedGroupHeight > remainingPageSpace) {
              doc.addPage();
              currentY = headerHeight;
            }

            const body = group.filter((row: any) => !row[0]?.isTeamHeader);
            const head = isTeamHeader
              ? [
                  [
                    {
                      content: group[0][0].content,
                      colSpan: sectionData.headers.length,
                      styles: { ...group[0][0], fontStyle: "bold" },
                    },
                  ],
                  sectionData.headers,
                ]
              : [sectionData.headers];

            // @ts-ignore
            autoTable(doc as any, {
              ...commonOptions,
              head: head,
              body: body,
              startY: currentY,
            });
            currentY = (doc as any).lastAutoTable.finalY + 4;
          });
          return currentY;
        }

        // Default logic for other tables
        autoTable(doc as any, {
          ...commonOptions,
          head: [
            [
              {
                content: sectionData.title,
                colSpan: sectionData.headers.length,
                styles: { halign: "center" as any, fillColor: [52, 73, 94] },
              },
            ],
            sectionData.headers,
          ],
          body: sectionData.rows,
          startY: startY,
          styles: {
            ...commonOptions.styles,
            overflow: "linebreak" as any,
          },
        });
        return (doc as any).lastAutoTable.finalY;
      };

      let lastY = headerHeight;

      let reportsToRender: any[] = [];
      if (reportData.type === "consolidated") {
        reportsToRender = [
          reportData.timeAnalysis,
          reportData.topPerformers,
          reportData.visitsPerSalesperson,
          reportData.visitsPerCustomer,
          reportData.uniqueCustomersPerSalesperson,
          reportData.visitsPerProject,
          reportData.visitsPerProjectLocation,
          reportData.teamVisitList,
          reportData.salespersonCustomerVisits,
          reportData.kpiVisitComparison,
          reportData.combinedKpiSummary,
          reportData.saleableProjectAnalysis,
          ...(Array.isArray(reportData.kpiGapAnalysis)
            ? reportData.kpiGapAnalysis
            : [reportData.kpiGapAnalysis]),
          reportData.missingOutTime,
        ];
      } else {
        reportsToRender = reportData.reports;
      }

      reportsToRender.forEach((report) => {
        if (report) {
          const remainingPageSpace = pageHeight - lastY - footerHeight;
          if (lastY > headerHeight && remainingPageSpace < 20) {
            // Check if space is too small for a new section
            doc.addPage();
            lastY = headerHeight;
          }
          lastY = addSection(report, lastY) + 5;
        }
      });

      doc.save(
        `report_${selectedReports.join("_") || "consolidated"}_${new Date().toISOString().split("T")[0]}.pdf`,
      );
    } catch (error) {
      console.error("PDF Generation Error:", error);
      setFeedback({
        message: `Failed to generate PDF. Error: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    }
  };

  const handleExportReportCSV = () => {
    if (!reportData) {
      alert("Generate a report first.");
      return;
    }
    if (typeof window.Papa === "undefined") {
      alert("CSV Export library is not available.");
      return;
    }

    let csvContent = "";
    const { Papa } = window;

    const addSectionToCsv = (report: any): string => {
      if (!report) return "";
      let sectionCsv = "";
      sectionCsv += `"${report.title}"\n`;

      if (report.overallSummary && Array.isArray(report.overallSummary)) {
        const summaryLine = report.overallSummary
          .map((s: any) => `${s.label}: ${s.value}`)
          .join(" | ");
        sectionCsv += `"${summaryLine}"\n`;
      }
      sectionCsv += "\n";

      if (report.type === "summaryCards" && report.cards) {
        sectionCsv += Papa.unparse({
          fields: ["Metric", "Value"],
          data: report.cards.map((c: any) => [c.label, c.value]),
        });
      } else if (report.headers && report.rows) {
        const cleanRows = report.rows.map((row: any[]) => {
          if (
            Array.isArray(row) &&
            row.some(
              (cell) =>
                typeof cell === "object" &&
                (cell?.isSummary || cell?.isTeamSummary || cell?.isTeamHeader),
            )
          ) {
            if (row[0]?.isTeamHeader) return [row[0].content];
            return row.map((cell) =>
              typeof cell === "object" ? cell.content : cell,
            );
          }
          return row;
        });
        sectionCsv += Papa.unparse({
          fields: report.headers,
          data: cleanRows,
        });
      }
      return sectionCsv + "\n\n";
    };

    const reportTitle = reportData.title || "Analysis Report";
    csvContent += `"${reportTitle}"\n\n`;

    if (reportData.type === "consolidated") {
      csvContent += addSectionToCsv(reportData.timeAnalysis);
      csvContent += addSectionToCsv(reportData.topPerformers);
      csvContent += addSectionToCsv(reportData.visitsPerSalesperson);
      csvContent += addSectionToCsv(reportData.visitsPerCustomer);
      csvContent += addSectionToCsv(reportData.uniqueCustomersPerSalesperson);
      csvContent += addSectionToCsv(reportData.visitsPerProject);
      csvContent += addSectionToCsv(reportData.visitsPerProjectLocation);
      csvContent += addSectionToCsv(reportData.teamVisitList);
      csvContent += addSectionToCsv(reportData.salespersonCustomerVisits);
      csvContent += addSectionToCsv(reportData.kpiVisitComparison);
      csvContent += addSectionToCsv(reportData.combinedKpiSummary);
      if (Array.isArray(reportData.kpiGapAnalysis)) {
        reportData.kpiGapAnalysis.forEach((r: any) => {
          csvContent += addSectionToCsv(r);
        });
      } else {
        csvContent += addSectionToCsv(reportData.kpiGapAnalysis);
      }
      csvContent += addSectionToCsv(reportData.saleableProjectAnalysis);
      csvContent += addSectionToCsv(reportData.missingOutTime);
    } else if (reportData.reports) {
      reportData.reports.forEach((report: any) => {
        csvContent += addSectionToCsv(report);
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const reportName = reportTitle
      .toLowerCase()
      .replace(/[\s&()]+/g, "_")
      .replace(/_+/g, "_");
    link.setAttribute(
      "download",
      `${reportName}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reportOptions = {
    Overview: [
      { id: "consolidated-report", label: "Consolidated Report (All-in-One)" },
    ],
    "KPI Analysis": [
      {
        id: "kpi-visit-comparison",
        label: "KPI vs Actual Visit Comparison",
        disabled: kpiData.length === 0,
      },
      {
        id: "combined-kpi-summary",
        label: "Combined KPI & Visit Summary",
        disabled: kpiData.length === 0,
      },
      {
        id: "kpi-gap-analysis",
        label: "KPI vs Visit Gap Analysis (3-Way)",
        disabled: kpiData.length === 0 && saleableProjects.length === 0,
      },
    ],
    "Attendance / Visit Summary": [
      { id: "visits-per-salesperson", label: "Total Visits per Sales Person" },
    ],
    "Customer Analysis": [
      { id: "visits-per-customer", label: "Visits per Customer & Project" },
      {
        id: "unique-customers-per-salesperson",
        label: "Unique Customers per Salesperson (External)",
      },
      {
        id: "salesperson-customer-visits",
        label: "Salesperson-wise Customer & Project Visits (List)",
      },
    ],
    "Team Analysis": [{ id: "team-visit-list", label: "Team-wise Visit List" }],
    "Project Analysis": [
      { id: "visits-per-project", label: "Visits per Project" },
      {
        id: "visits-per-project-location",
        label: "Visits per Project Location",
      },
      {
        id: "saleable-project-analysis",
        label: "Saleable Preferred Project Analysis",
        disabled: saleableProjects.length === 0,
      },
    ],
    "Performance & Time": [
      { id: "time-analysis", label: "Visit Duration Analysis" },
      { id: "top-performers", label: "Top 5 Sales Persons (by Visits)" },
    ],
    "Exception Reports": [
      { id: "missing-out-time", label: "Visits with Missing Out Time" },
    ],
  };

  const handleReportSelectionChange = (reportId: string) => {
    const option = Object.values(reportOptions)
      .flat()
      .find((o) => o.id === reportId);
    // FIX: Accessing 'disabled' on a union type where not all members have the property.
    // Casting to any to bypass the split type check, as the logic correctly handles undefined.
    if ((option as any)?.disabled) return;

    if (reportId === "consolidated-report") {
      setSelectedReports((prev) =>
        prev.includes(reportId) ? [] : ["consolidated-report"],
      );
      return;
    }

    setSelectedReports((prev) => {
      const withoutConsolidated = prev.filter(
        (r) => r !== "consolidated-report",
      );
      if (withoutConsolidated.includes(reportId)) {
        return withoutConsolidated.filter((r) => r !== reportId);
      } else {
        return [...withoutConsolidated, reportId];
      }
    });
  };

  const handleDownloadKpiTemplate = () => {
    if (typeof window.Papa === "undefined") {
      return;
    }
    const exampleData = [
      [
        "1",
        "EMP-001",
        "John Doe",
        "01-Sep-25",
        "Lake Lofts Project",
        "Mr. Smith (Manager)",
      ],
    ];
    const csv = window.Papa.unparse({
      fields: KPI_REQUIRED_HEADERS,
      data: exampleData,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "kpi_erp_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleKpiFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      complete: async (results: any) => {
        const headers = results.meta.fields;
        if (!KPI_REQUIRED_HEADERS.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              "KPI CSV is missing required headers. Please use the template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        let hasError = false;
        const newKpiData = results.data
          .map((row: any, index: number) => {
            if (hasError) return null;
            if (!row["Associate"]) {
              setFeedback({
                message: `Row ${index + 2}: Missing 'Associate' name.`,
                type: "error",
              });
              hasError = true;
              return null;
            }
            return {
              id: `kpi-temp-${Date.now() + index}`,
              sl: row["SL"] || "",
              empId: row["Employee ID"] || "",
              associate: row["Associate"],
              date: row["Date"] || "",
              projectInfo: row["Project Info"] || "",
              leadInfo: row["With (Lead Info)"] || "",
            };
          })
          .filter((item: any): item is KpiData => item !== null);

        if (!hasError && newKpiData.length > 0) {
          try {
            const response = await fetch("/api/kpi-data/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newKpiData),
            });

            if (!response.ok) {
              throw new Error("Failed to save KPI data to database.");
            }

            // Update local state (you might want to re-fetch to get real IDs,
            // but setting directly for immediate feedback is common)
            setKpiData(newKpiData);
            setShowKpiTable(true);
            setFeedback({
              message: `Successfully imported ${newKpiData.length} KPI records.`,
              type: "success",
            });
          } catch (error) {
            setFeedback({
              message:
                error instanceof Error
                  ? error.message
                  : "Error saving KPI data.",
              type: "error",
            });
            console.error(error);
          }
        }
      },
      error: (err: any) => {
        setFeedback({
          message: `Error parsing KPI CSV: ${err.message}`,
          type: "error",
        });
      },
    });

    if (event.target) event.target.value = "";
  };

  const handleClearKpiData = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear all KPI data from the database?",
      )
    )
      return;

    try {
      const response = await fetch("/api/kpi-data/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([]), // Sending empty array to clear (truncated in backend)
      });
      if (response.ok) {
        setKpiData([]);
        setFeedback({ message: "KPI data cleared.", type: "info" });
      } else {
        throw new Error("Failed to clear KPI data on server.");
      }
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : "Error clearing KPI data.",
        type: "error",
      });
    }
  };

  const handleClearRecords = async () => {
    if (
      window.confirm(
        "Are you sure you want to delete all sales person visits from the database? This action cannot be undone.",
      )
    ) {
      try {
        const response = await fetch("/api/sales-person-visits", {
          method: "DELETE",
        });
        if (response.ok) {
          onUpdateVisits([]);
          setFeedback({
            message: "All database records cleared.",
            type: "info",
          });
        } else {
          setFeedback({
            message: "Failed to clear database records.",
            type: "error",
          });
        }
      } catch (error) {
        setFeedback({
          message: "Network error while clearing records.",
          type: "error",
        });
      }
    }
  };

  const handleEditKpi = (row: KpiData) => {
    setEditingKpiId(row.id);
    setEditKpiData({ ...row });
  };

  const handleSaveKpiEdit = async () => {
    if (!editingKpiId) return;
    try {
      const response = await fetch(`/api/kpi-data/${editingKpiId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sl: editKpiData.sl,
          emp_id: editKpiData.empId,
          associate: editKpiData.associate,
          date: editKpiData.date,
          project_info: editKpiData.projectInfo,
          lead_info: editKpiData.leadInfo,
        }),
      });

      if (response.ok) {
        const updatedRow = await response.json();
        setKpiData((prev) =>
          prev.map((item) =>
            item.id === editingKpiId
              ? {
                  ...item,
                  sl: updatedRow.sl,
                  empId: updatedRow.emp_id,
                  associate: updatedRow.associate,
                  date: updatedRow.date,
                  projectInfo: updatedRow.project_info,
                  leadInfo: updatedRow.lead_info,
                }
              : item,
          ),
        );
        setEditingKpiId(null);
        setEditKpiData({});
        setFeedback({
          message: "KPI row updated successfully",
          type: "success",
        });
      } else {
        setFeedback({ message: "Failed to update KPI row", type: "error" });
      }
    } catch (error) {
      console.error("Error updating KPI:", error);
      setFeedback({ message: "Error updating KPI row", type: "error" });
    }
  };

  const handleCancelKpiEdit = () => {
    setEditingKpiId(null);
    setEditKpiData({});
  };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden text-slate-800">
          <div className="bg-transparent">
            {activeTab === "records" && (
              <div className="fade-in">
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">
                    Filters
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
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
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
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
                        htmlFor="team-filter"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Team
                      </label>
                      <select
                        id="team-filter"
                        value={teamFilter}
                        onChange={(e) => setTeamFilter(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      >
                        <option value="">All Teams</option>
                        {salesTeams.map((team) => (
                          <option key={team.teamName} value={team.teamName}>
                            {team.teamName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="sales-person-filter"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Sales Person
                      </label>
                      <select
                        id="sales-person-filter"
                        value={salesPersonFilter}
                        onChange={(e) => setSalesPersonFilter(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      >
                        <option value="">All Sales Persons</option>
                        {salesPersonNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">
                      Visit Records ({filteredVisits.length})
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      {canEdit ? (
                        <>
                          <label
                            htmlFor="csv-upload"
                            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                          >
                            Import (CSV)
                          </label>
                          <input
                            id="csv-upload"
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
                            Download Template
                          </button>
                          <button
                            onClick={handleExportCSV}
                            disabled={filteredVisits.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Export Excel (CSV)
                          </button>
                          <button
                            onClick={handleExportPDF}
                            disabled={filteredVisits.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                          >
                            Export PDF
                          </button>
                          <button
                            onClick={handleClearRecords}
                            disabled={visits.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Clear Records
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-400 text-sm bg-slate-100 px-4 py-2 rounded-md border text-center font-medium italic">
                          Admin Only Access
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          {REQUIRED_HEADERS.map((header) => (
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
                        {isLoading ? (
                          Array(6)
                            .fill(0)
                            .map((_, i) => (
                              <SkeletonRow
                                key={i}
                                cols={REQUIRED_HEADERS.length}
                              />
                            ))
                        ) : filteredVisits.length > 0 ? (
                          filteredVisits.map((visit) => (
                            <tr key={visit.id} className="hover:bg-slate-50">
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.slNo}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.employeeId || "N/A"}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {formatDateToDDMMMYYYY(visit.date)}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                {visit.salesPersonName}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.designation}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.customerName}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.customerId}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.projectName}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.projectLocation}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.inTime}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                {visit.outTime}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={REQUIRED_HEADERS.length}
                              className="text-center py-8 text-slate-500"
                            >
                              {visits.length === 0
                                ? "No data imported yet. Please import a CSV file."
                                : "No records match your current filters."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "analysis" && (
              <div className="p-6 space-y-6 fade-in">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-4 items-end">
                    <div className="lg:col-span-3">
                      <h3 className="text-lg font-semibold text-slate-700 mb-2">
                        Select Report Types
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                        {Object.entries(reportOptions).map(
                          ([group, options]) => (
                            <fieldset key={group}>
                              <legend className="text-sm font-semibold text-slate-600 mb-2">
                                {group}
                              </legend>
                              <div className="space-y-3">
                                {options.map((option) => (
                                  <div
                                    key={option.id}
                                    className="relative flex items-start"
                                  >
                                    <div className="flex items-center h-5">
                                      <input
                                        id={`report-${option.id}`}
                                        name={option.id}
                                        type="checkbox"
                                        checked={selectedReports.includes(
                                          option.id,
                                        )}
                                        onChange={() =>
                                          handleReportSelectionChange(option.id)
                                        }
                                        disabled={
                                          (option as any).disabled ||
                                          (option.id !==
                                            "consolidated-report" &&
                                            selectedReports.includes(
                                              "consolidated-report",
                                            ))
                                        }
                                        className="focus:ring-orange-500 h-4 w-4 text-orange-600 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                      />
                                    </div>
                                    <div className="ml-3 text-sm">
                                      <label
                                        htmlFor={`report-${option.id}`}
                                        className={`font-medium ${(option as any).disabled ? "text-gray-400 cursor-not-allowed" : selectedReports.includes("consolidated-report") && option.id !== "consolidated-report" ? "text-gray-400" : "text-gray-700 cursor-pointer"}`}
                                      >
                                        {option.label}
                                      </label>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </fieldset>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="analysis-start-date"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Start Date
                      </label>
                      <input
                        type="date"
                        id="analysis-start-date"
                        value={analysisStartDate}
                        onChange={(e) => setAnalysisStartDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="analysis-end-date"
                        className="block text-sm font-medium text-slate-700"
                      >
                        End Date
                      </label>
                      <input
                        type="date"
                        id="analysis-end-date"
                        value={analysisEndDate}
                        onChange={(e) => setAnalysisEndDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    {canEdit ? (
                      <button
                        onClick={handleGenerateReport}
                        className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700"
                      >
                        Generate Report
                      </button>
                    ) : (
                      <div className="w-full p-2 bg-slate-100 text-slate-500 text-sm text-center rounded-md border border-slate-200 font-medium">
                        Report Generation (Admin Only)
                      </div>
                    )}

                    <div className="lg:col-span-3 mt-4 pt-4 border-t border-slate-200">
                      <h4 className="text-base font-semibold text-slate-700 mb-2">
                        KPI/ERP Data for Comparison
                      </h4>
                      <div className="flex items-center gap-3 flex-wrap">
                        {canEdit && (
                          <>
                            <label
                              htmlFor="kpi-csv-upload"
                              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                            >
                              Import KPI Data (CSV)
                            </label>
                            <input
                              id="kpi-csv-upload"
                              type="file"
                              ref={kpiFileInputRef}
                              onChange={handleKpiFileUpload}
                              className="sr-only"
                              accept=".csv"
                            />
                            <button
                              onClick={handleDownloadKpiTemplate}
                              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                            >
                              Download Template
                            </button>
                            {kpiData.length > 0 && (
                              <button
                                onClick={handleClearKpiData}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100"
                              >
                                Clear KPI Data ({kpiData.length} rows)
                              </button>
                            )}
                          </>
                        )}
                        {kpiData.length > 0 && (
                          <button
                            onClick={() => setShowKpiTable(!showKpiTable)}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                          >
                            {showKpiTable
                              ? "Hide KPI Raw Data"
                              : "View KPI Raw Data"}
                          </button>
                        )}
                      </div>
                      {kpiData.length === 0 && (
                        <p className="text-xs text-slate-500 mt-2">
                          Import a KPI file to enable the "KPI vs Actual Visit
                          Comparison" report.
                        </p>
                      )}

                      {showKpiTable && kpiData.length > 0 && (
                        <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg max-h-96">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0">
                              <tr>
                                {KPI_REQUIRED_HEADERS.map((h) => (
                                  <th
                                    key={h}
                                    className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                                  >
                                    {h}
                                  </th>
                                ))}
                                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {kpiData.map((row, idx) => (
                                <tr
                                  key={idx}
                                  className={
                                    editingKpiId === row.id
                                      ? "bg-orange-50"
                                      : ""
                                  }
                                >
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                                    {editingKpiId === row.id ? (
                                      <input
                                        type="text"
                                        value={editKpiData.sl || ""}
                                        onChange={(e) =>
                                          setEditKpiData((prev) => ({
                                            ...prev,
                                            sl: e.target.value,
                                          }))
                                        }
                                        className="w-full p-1 border rounded text-xs"
                                      />
                                    ) : (
                                      row.sl
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                                    {editingKpiId === row.id ? (
                                      <input
                                        type="text"
                                        value={editKpiData.empId || ""}
                                        onChange={(e) =>
                                          setEditKpiData((prev) => ({
                                            ...prev,
                                            empId: e.target.value,
                                          }))
                                        }
                                        className="w-full p-1 border rounded text-xs"
                                      />
                                    ) : (
                                      row.empId
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                                    {editingKpiId === row.id ? (
                                      <input
                                        type="text"
                                        value={editKpiData.associate || ""}
                                        onChange={(e) =>
                                          setEditKpiData((prev) => ({
                                            ...prev,
                                            associate: e.target.value,
                                          }))
                                        }
                                        className="w-full p-1 border rounded text-xs"
                                      />
                                    ) : (
                                      row.associate
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                                    {editingKpiId === row.id ? (
                                      <input
                                        type="text"
                                        value={editKpiData.date || ""}
                                        onChange={(e) =>
                                          setEditKpiData((prev) => ({
                                            ...prev,
                                            date: e.target.value,
                                          }))
                                        }
                                        className="w-full p-1 border rounded text-xs"
                                      />
                                    ) : (
                                      row.date
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                                    {editingKpiId === row.id ? (
                                      <input
                                        type="text"
                                        value={editKpiData.projectInfo || ""}
                                        onChange={(e) =>
                                          setEditKpiData((prev) => ({
                                            ...prev,
                                            projectInfo: e.target.value,
                                          }))
                                        }
                                        className="w-full p-1 border rounded text-xs"
                                      />
                                    ) : (
                                      row.projectInfo
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                                    {editingKpiId === row.id ? (
                                      <input
                                        type="text"
                                        value={editKpiData.leadInfo || ""}
                                        onChange={(e) =>
                                          setEditKpiData((prev) => ({
                                            ...prev,
                                            leadInfo: e.target.value,
                                          }))
                                        }
                                        className="w-full p-1 border rounded text-xs"
                                      />
                                    ) : (
                                      row.leadInfo
                                    )}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-right text-xs font-medium">
                                    {editingKpiId === row.id ? (
                                      <div className="flex justify-end gap-2">
                                        <button
                                          onClick={handleSaveKpiEdit}
                                          className="text-green-600 hover:text-green-900"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={handleCancelKpiEdit}
                                          className="text-gray-600 hover:text-gray-900"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : canEdit ? (
                                      <button
                                        onClick={() => handleEditKpi(row)}
                                        className="text-indigo-600 hover:text-indigo-900"
                                      >
                                        Edit
                                      </button>
                                    ) : (
                                      <span className="text-slate-300 italic">
                                        Read Only
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {reportData && (
                  <div className="pt-6 border-t border-slate-200">
                    {reportData.overallSummary && (
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-slate-800 mb-3">
                          Overall Summary
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                          <SummaryCard
                            color="purple"
                            title="Sales Persons"
                            value={reportData.overallSummary.totalSalesPersons}
                            icon={
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0110 14.25a5 5 0 01-1.5-4.33A6.97 6.97 0 007 16c0 .34.024.673.07 1h5.86z" />
                              </svg>
                            }
                          />
                          <SummaryCard
                            color="blue"
                            title="Team Members"
                            value={reportData.overallSummary.totalTeamMembers}
                            icon={
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                              </svg>
                            }
                          />
                          <SummaryCard
                            color="green"
                            title="Total Visits"
                            value={reportData.overallSummary.totalVisits}
                            icon={
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path
                                  fillRule="evenodd"
                                  d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            }
                          />
                          <SummaryCard
                            color="amber"
                            title="Unique Customers"
                            value={
                              reportData.overallSummary.totalUniqueCustomers
                            }
                            icon={
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 2a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            }
                          />
                          <SummaryCard
                            color="rose"
                            title="Unique Projects"
                            value={
                              reportData.overallSummary.totalUniqueProjects
                            }
                            icon={
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            }
                          />
                          <SummaryCard
                            color="teal"
                            title="Top Project"
                            value={reportData.overallSummary.topVisitedProject}
                            icon={
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                              </svg>
                            }
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold text-slate-800">
                        {reportData.title}
                      </h3>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleExportReportCSV}
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
                              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Export Excel (CSV)
                        </button>
                        <button
                          onClick={handleExportReportPDF}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Export PDF
                        </button>
                      </div>
                    </div>
                    {reportData.type === "consolidated" ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ReportSection report={reportData.timeAnalysis} />
                        <ReportSection
                          report={reportData.topPerformers}
                          allowWrap={false}
                        />
                        <ReportSection
                          report={reportData.visitsPerSalesperson}
                          allowWrap={false}
                        />
                        <ReportSection report={reportData.visitsPerCustomer} />
                        <ReportSection
                          report={reportData.uniqueCustomersPerSalesperson}
                        />
                        <ReportSection report={reportData.visitsPerProject} />
                        <ReportSection
                          report={reportData.visitsPerProjectLocation}
                        />
                        <ReportSection report={reportData.teamVisitList} />
                        <ReportSection
                          report={reportData.salespersonCustomerVisits}
                        />
                        <ReportSection report={reportData.kpiVisitComparison} />
                        <ReportSection report={reportData.combinedKpiSummary} />
                        <ReportSection
                          report={reportData.saleableProjectAnalysis}
                        />
                        <ReportSection report={reportData.missingOutTime} />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {reportData.reports?.map(
                          (report: any, index: number) => (
                            <ReportSection
                              key={index}
                              report={report}
                              allowWrap={
                                ![
                                  "Total Visits per Sales Person",
                                  "Top 5 Sales Persons (by Visits)",
                                ].includes(report.title)
                              }
                            />
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "teams" && (
              <div className="p-6 space-y-6 fade-in">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-slate-800">
                    Manage Sales Teams
                  </h2>
                  <button
                    onClick={handleAutoCreateTeams}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
                  >
                    Auto-Create Teams from Employees
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {salesTeams.map((team) => (
                    <div
                      key={team.id || team.teamName}
                      className="bg-white border text-sm border-slate-200 rounded-lg shadow-sm p-4 relative overflow-hidden group"
                    >
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                        <button
                          onClick={() => {
                            const newName = prompt(
                              "Enter new team name",
                              team.teamName,
                            );
                            if (!newName) return;
                            const newLeader = prompt(
                              "Enter new team leader",
                              team.leader,
                            );
                            if (!newLeader) return;
                            const newMembersStr = prompt(
                              "Enter team members (comma separated)",
                              team.members.join(", "),
                            );
                            if (newMembersStr) {
                              const newMembers = newMembersStr
                                .split(",")
                                .map((m) => m.trim())
                                .filter(Boolean);
                              fetch(`/api/sales-teams/${team.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  teamName: newName,
                                  leader: newLeader,
                                  members: newMembers,
                                }),
                              })
                                .then((r) => r.json())
                                .then((data) => {
                                  onUpdateTeams((prev) =>
                                    prev.map((t) =>
                                      t.id === team.id ? data : t,
                                    ),
                                  );
                                  setFeedback({
                                    message: "Team updated",
                                    type: "success",
                                  });
                                });
                            }
                          }}
                          className="p-1 px-2 text-xs bg-slate-100/80 rounded hover:bg-blue-50 text-slate-600 hover:text-blue-600 focus:outline-none"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this team?")) {
                              fetch(`/api/sales-teams/${team.id}`, {
                                method: "DELETE",
                              }).then(() => {
                                onUpdateTeams((prev) =>
                                  prev.filter((t) => t.id !== team.id),
                                );
                                setFeedback({
                                  message: "Team deleted",
                                  type: "success",
                                });
                              });
                            }
                          }}
                          className="p-1 px-2 text-xs bg-slate-100/80 rounded hover:bg-red-50 text-slate-600 hover:text-red-600 focus:outline-none"
                        >
                          Delete
                        </button>
                      </div>
                      <h3 className="font-medium text-slate-900 border-b border-slate-100 pb-2 mb-2 pr-16">
                        {team.teamName}
                      </h3>
                      <p className="text-slate-600 mb-2 flex items-center">
                        {(() => {
                          const lemp = salesEmployees.find(
                            (e) => e.name === team.leader,
                          );
                          if (lemp) {
                            const url = `https://credencegroupbd.com/mis/Images1/${lemp.empId}.png`;
                            return (
                              <img
                                src={url}
                                alt={team.leader}
                                className="w-8 h-8 rounded-full mr-2"
                              />
                            );
                          }
                          return null;
                        })()}
                        <span className="font-medium text-slate-700">
                          Leader:
                        </span>{" "}
                        <span className="ml-1 truncate">{team.leader}</span>
                      </p>
                      <div>
                        <p className="text-slate-700 font-medium mb-1">
                          Members ({team.members.length}):
                        </p>
                        <ul className="list-disc leading-tight space-y-1 list-inside text-slate-500 pl-1 max-h-32 overflow-y-auto">
                          {team.members.map((m, i) => {
                            const memberEmp = salesEmployees.find(
                              (e) => e.name === m,
                            );
                            const memberUrl = memberEmp
                              ? `https://credencegroupbd.com/mis/Images1/${memberEmp.empId}.png`
                              : null;
                            return (
                              <li
                                key={i}
                                className="flex items-center space-x-2 mb-1"
                              >
                                {memberUrl && (
                                  <img
                                    src={memberUrl}
                                    alt={m}
                                    className="w-6 h-6 rounded-full"
                                  />
                                )}
                                <span className="truncate" title={m}>
                                  {m}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  ))}

                  <div
                    className="bg-slate-50 border border-slate-200 border-dashed rounded-lg shadow-sm p-4 flex flex-col items-center justify-center text-center hover:bg-slate-100 transition-colors cursor-pointer min-h-[200px]"
                    onClick={() => {
                      setEditingTeam(null);
                      setIsTeamFormOpen(true);
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-orange-600 shadow-sm mb-2 text-2xl font-light">
                      +
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      Add New Team
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "employees" && (
              <div className="p-6 space-y-6 fade-in">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-slate-800">
                    Employee Database
                  </h2>
                  <div className="flex space-x-2">
                    <input
                      type="file"
                      ref={employeeFileInputRef}
                      className="hidden"
                      accept=".csv"
                      onChange={(e) => {
                        if (!e.target.files?.length) return;
                        parseCSVRobustly(e.target.files[0], {
                          header: true,
                          complete: (results: any) => {
                            fetch("/api/sales-employees/bulk", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(results.data),
                            })
                              .then((r) => r.json())
                              .then((data) => {
                                setFeedback({
                                  message: `Bulk import successful: ${data.count} imported`,
                                  type: "success",
                                });
                                fetch("/api/sales-employees")
                                  .then((r) => r.json())
                                  .then(setSalesEmployees);
                              });
                          },
                        });
                      }}
                    />
                    <button
                      onClick={handleDownloadEmployeeTemplate}
                      className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 shadow-sm text-sm font-medium rounded-md hover:bg-slate-200"
                    >
                      Download Template
                    </button>
                    <button
                      onClick={() => employeeFileInputRef.current?.click()}
                      className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 shadow-sm text-sm font-medium rounded-md hover:bg-slate-200"
                    >
                      Bulk Import
                    </button>
                    <button
                      onClick={() => {
                        setEditingEmployee(null);
                        setIsEmployeeFormOpen(true);
                      }}
                      className="inline-flex items-center px-4 py-2 bg-orange-600 text-white shadow-sm text-sm font-medium rounded-md hover:bg-orange-700 focus:outline-none"
                    >
                      + Add Employee
                    </button>
                  </div>
                </div>
                {isEmployeeFormOpen && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                      <h3 className="text-lg font-medium mb-4">
                        {editingEmployee ? "Edit Employee" : "Add Employee"}
                      </h3>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const data = Object.fromEntries(formData.entries());
                          const url = editingEmployee
                            ? "/api/sales-employees/" + editingEmployee.id
                            : "/api/sales-employees";
                          fetch(url, {
                            method: editingEmployee ? "PUT" : "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(data),
                          })
                            .then((r) => r.json())
                            .then((employee) => {
                              if (editingEmployee) {
                                setSalesEmployees((prev) =>
                                  prev.map((e) =>
                                    e.id === employee.id ? employee : e,
                                  ),
                                );
                              } else {
                                setSalesEmployees((prev) => [
                                  ...prev,
                                  employee,
                                ]);
                              }
                              setIsEmployeeFormOpen(false);
                              setFeedback({
                                message: "Employee saved",
                                type: "success",
                              });
                            });
                        }}
                        className="space-y-3"
                      >
                        <input
                          name="empId"
                          placeholder="Employee ID"
                          defaultValue={editingEmployee?.empId}
                          className="w-full p-2 border rounded"
                          required
                        />
                        <input
                          name="name"
                          placeholder="Name"
                          defaultValue={editingEmployee?.name}
                          className="w-full p-2 border rounded"
                          required
                        />
                        <input
                          name="designation"
                          placeholder="Designation"
                          defaultValue={editingEmployee?.designation}
                          className="w-full p-2 border rounded"
                        />
                        <input
                          name="position"
                          placeholder="Position"
                          defaultValue={editingEmployee?.position}
                          className="w-full p-2 border rounded"
                        />
                        <input
                          name="teamLeader"
                          placeholder="Team Leader"
                          defaultValue={editingEmployee?.teamLeader}
                          className="w-full p-2 border rounded"
                        />
                        <input
                          name="departmentHod"
                          placeholder="Department HOD"
                          defaultValue={editingEmployee?.departmentHod}
                          className="w-full p-2 border rounded"
                        />
                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsEmployeeFormOpen(false)}
                            className="px-4 py-2 bg-slate-100 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-orange-600 text-white rounded"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {isTeamFormOpen && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                      <h3 className="text-lg font-medium mb-4">
                        {editingTeam ? "Edit Team" : "Add Team"}
                      </h3>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const teamName = formData.get("teamName") as string;
                          const leader = formData.get("leader") as string;
                          const members = (formData.get("members") as string)
                            .split(",")
                            .map((m) => m.trim())
                            .filter(Boolean);

                          const url = editingTeam
                            ? `/api/sales-teams/${editingTeam.id}`
                            : "/api/sales-teams";
                          fetch(url, {
                            method: editingTeam ? "PUT" : "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ teamName, leader, members }),
                          })
                            .then((r) => r.json())
                            .then((team) => {
                              if (editingTeam) {
                                onUpdateTeams((prev) =>
                                  prev.map((t) =>
                                    t.id === team.id ? team : t,
                                  ),
                                );
                              } else {
                                onUpdateTeams((prev) => [...prev, team]);
                              }
                              setIsTeamFormOpen(false);
                              setFeedback({
                                message: "Team saved",
                                type: "success",
                              });
                            })
                            .catch((err) => {
                              console.error(err);
                              setFeedback({
                                message: "Error saving team",
                                type: "error",
                              });
                            });
                        }}
                        className="space-y-3"
                      >
                        <input
                          name="teamName"
                          placeholder="Team Name"
                          defaultValue={editingTeam?.teamName}
                          className="w-full p-2 border rounded"
                          required
                        />
                        <input
                          name="leader"
                          placeholder="Team Leader"
                          defaultValue={editingTeam?.leader}
                          className="w-full p-2 border rounded"
                          required
                        />
                        <textarea
                          name="members"
                          placeholder="Members (comma separated)"
                          defaultValue={editingTeam?.members.join(", ")}
                          className="w-full p-2 border rounded"
                          rows={3}
                          required
                        />
                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsTeamFormOpen(false)}
                            className="px-4 py-2 bg-slate-100 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-orange-600 text-white rounded"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                <div className="bg-white shadow rounded-lg overflow-x-auto border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Sl
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          ID
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Name
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Designation
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Position
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Team leader
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Department HOD
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {salesEmployees.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-8 text-center text-slate-500 text-sm"
                          >
                            No employees found in the database.
                          </td>
                        </tr>
                      ) : (
                        salesEmployees.map((emp, index) => (
                          <tr key={emp.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                              {emp.empId}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                              {emp.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                              {emp.designation}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                              {emp.position}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                              {emp.teamLeader}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                              {emp.departmentHod}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                              <button
                                onClick={() => {
                                  setEditingEmployee(emp);
                                  setIsEmployeeFormOpen(true);
                                }}
                                className="text-indigo-600 hover:text-indigo-900 pr-2"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm("Delete this employee?")) {
                                    fetch("/api/sales-employees/" + emp.id, {
                                      method: "DELETE",
                                    }).then(() => {
                                      setSalesEmployees((prev) =>
                                        prev.filter((e) => e.id !== emp.id),
                                      );
                                      setFeedback({
                                        message: "Employee deleted",
                                        type: "success",
                                      });
                                    });
                                  }
                                }}
                                className="text-red-600 hover:text-red-900 pl-2"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
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

export default SalesPersonProjectVisit;
