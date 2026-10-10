import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EmployeeVisit, User } from "../types";
import { DEPARTMENTS } from "../constants";
import _ from "lodash";
import FeedbackMessage from "./FeedbackMessage";
import ChangeIcon from "./ChangeIcon";
import { useLoading } from "../contexts/LoadingContext";
import Spinner from "./Spinner";
import { generateImprovementAnalysis } from "../services/geminiService";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
import html2canvas from "html2canvas";

// --- Helper Functions copied from AllDepartmentSummary ---
const PROJECT_SIDE_INVENTORY_DESIGNATIONS = new Set([
  "Assistant Project Accountant (CH)",
  "Site Accountant (CH)",
]);

const EXEMPT_DEPARTMENTS = new Set([
  "Internal Audit",
  "Brand Management",
  "Planning & Design (Architectural)",
  "Electro-Mechanical",
  "Information Technology (IT)",
  "Management Information System (MIS)",
  "Material Quality Assurance & Purchase",
]);

interface SupposedlyDurations {
  durationForDisplaySec: number;
  durationForCalcSec: number;
}

const getSupposedlyDurations = (
  department: string,
  designation: string,
  inventorySide?: string,
): SupposedlyDurations => {
  const isExempt = EXEMPT_DEPARTMENTS.has(department);
  if (isExempt) {
    return { durationForDisplaySec: 0, durationForCalcSec: 4 * 3600 };
  }
  if (department === "Inventory Management") {
    const isProjectSide =
      inventorySide === "Project Side" ||
      PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(designation);
    const target = isProjectSide ? 6 : 4;
    return {
      durationForDisplaySec: target * 3600,
      durationForCalcSec: target * 3600,
    };
  }
  if (department === "HR & Admin (Security)") {
    return { durationForDisplaySec: 7 * 3600, durationForCalcSec: 7 * 3600 };
  }
  return { durationForDisplaySec: 4 * 3600, durationForCalcSec: 4 * 3600 };
};

const parseDurationToSeconds = (durationStr: string): number => {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
};

const formatSecondsToHHMM = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const totalMinutes = Math.round(Math.abs(totalSeconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

// --- Interfaces ---
interface SummaryDataRow {
  department: string;
  visitorName: string;
  designation: string;
  totalWorkingDay: number;
  currentMonthActualDurationSec: number;
  lastMonthActualDurationSec: number;
  currentMonthDurationPercentage: number;
  lastMonthDurationPercentage: number;
  currentStability: number;
}

interface PerformerData {
  name: string;
  visitCount: number;
  projectCount: number;
  duration: string;
}

interface AnalysisResultRow {
  department: string;
  employeeCount: number;
  totalVisits: number;
  averageStability: number;
  remark: string;
  topPerformer: PerformerData | null;
  lowestPerformer: PerformerData | null;
}

interface EmployeeDutyAnalysisProps {
  visits: EmployeeVisit[];
  currentUser: User;
}

// --- New Interfaces for Breakdown Modal ---
interface EmployeeBreakdownMetrics {
  totalVisits: number;
  totalDuration: string;
  uniqueProjects: number;
  avgDailyDuration: string;
  shortVisits: number;
}

interface EmployeeBreakdown {
  name: string;
  stability: number;
  metrics: {
    current: EmployeeBreakdownMetrics;
    last: EmployeeBreakdownMetrics;
  };
}

interface BreakdownData {
  [departmentName: string]: {
    averageStability: number;
    employees: EmployeeBreakdown[];
  };
}

// --- New Interfaces for Impact Metrics ---
interface HighAttentionProject {
  name: string;
  visitCount: number;
  uniqueVisitors: number;
  departments: string[];
  badge: "critical" | "watch" | "normal";
}

interface CoordinatedVisitDay {
  date: string;
  projectName: string;
  visitors: string[];
  departments: string[];
  type: "cross_dept" | "same_dept";
}

const ImprovementAnalysisModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  analysis: Record<string, string> | null;
  isLoading: boolean;
}> = ({ isOpen, onClose, analysis, isLoading }) => {
  if (!isOpen) return null;

  const renderContent = (content: unknown) => {
    if (typeof content !== "string") return null;
    // Simple markdown-to-HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .split("\n")
      .map((line, index) => {
        if (line.trim().startsWith("- ")) {
          return (
            <li key={index} className="ml-4 list-disc">
              {line.substring(2)}
            </li>
          );
        }
        if (line.trim().length > 0) {
          return (
            <p key={index} className="mt-2">
              {line}
            </p>
          );
        }
        return null;
      });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">
            Areas for Improvement Analysis
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-500 hover:bg-slate-100"
          >
            &times;
          </button>
        </header>
        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48">
              <Spinner className="w-8 h-8" />
              <p className="mt-4 text-slate-600">
                AI is analyzing the data... Please wait.
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-6">
              {Object.entries(analysis).map(([department, result]) => (
                <div
                  key={department}
                  className="p-4 bg-slate-50 rounded-lg border"
                >
                  <h3 className="text-lg font-semibold text-slate-900 border-b pb-2 mb-2">
                    {department}
                  </h3>
                  <div className="prose prose-sm max-w-none text-slate-700">
                    {renderContent(result)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-500">
              No underperforming departments found to analyze.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Reusable MetricRow component for breakdown modals ---
const MetricRow: React.FC<{
  label: string;
  current: string | number;
  last: string | number;
}> = ({ label, current, last }) => {
  const parseValue = (val: string | number): number => {
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.includes(":")) {
      const parts = val.split(":").map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    return parseFloat(val) || 0;
  };
  const currentValue = parseValue(current);
  const lastValue = parseValue(last);
  const change = currentValue - lastValue;
  const isDecrease = change < 0;
  const isIncrease = change > 0;
  const isShortVisit = label.toLowerCase().includes("short visits");

  let colorClass = "text-slate-500";
  if (isIncrease) colorClass = isShortVisit ? "text-red-600" : "text-green-600";
  if (isDecrease) colorClass = isShortVisit ? "text-green-600" : "text-red-600";

  return (
    <tr>
      <td className="px-2 py-1.5 font-medium text-slate-600">{label}</td>
      <td className="px-2 py-1.5 text-center text-slate-800 font-mono">
        {last}
      </td>
      <td className="px-2 py-1.5 text-center text-slate-800 font-mono">
        {current}
      </td>
      <td className={`px-2 py-1.5 text-center font-bold ${colorClass}`}>
        {isIncrease ? "▲" : isDecrease ? "▼" : "–"}
      </td>
    </tr>
  );
};

// --- New Component for Full Page Detailed Breakdown ---
const FullPagePerformanceBreakdownModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  data: BreakdownData | null;
  currentUser: User;
  selectedMonth: string;
  title: string;
}> = ({ isOpen, onClose, data, currentUser, selectedMonth, title }) => {
  if (!isOpen) return null;

  const parseValue = (val: string | number): number => {
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.includes(":")) {
      const parts = val.split(":").map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    return parseFloat(val) || 0;
  };

  const handleExportPDF = () => {
    if (!data) {
      alert("No data to export.");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    let currentY = 0;

    const addHeader = () => {
      const headerStartY = 10;
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(40);
      doc.text("Credence Housing Limited", pageWidth / 2, headerStartY, {
        align: "center",
      });
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
      doc.text(
        "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
        pageWidth / 2,
        headerStartY + 6,
        { align: "center" },
      );
      doc
        .setDrawColor(220)
        .setLineWidth(0.2)
        .line(margin, headerStartY + 10, pageWidth - margin, headerStartY + 10);
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      doc.text(`${title} Report`, pageWidth / 2, headerStartY + 15, {
        align: "center",
      });
      const [year, month] = selectedMonth.split("-");
      const monthName = new Date(
        parseInt(year),
        parseInt(month) - 1,
        1,
      ).toLocaleString("en-US", { month: "long", year: "numeric" });
      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
      doc.text(monthName, pageWidth / 2, headerStartY + 20, {
        align: "center",
      });
      currentY = headerStartY + 24;
    };

    const addFooter = (pageNumber: number, pageCount: number) => {
      doc.setFontSize(9).setTextColor(150);
      const preparedByStr = `Prepared by\n${currentUser.name}`;
      doc.text(preparedByStr, margin, pageHeight - 20);
      doc.text("Dept. HOD", pageWidth / 2, pageHeight - 10, {
        align: "center",
      });
      const pageStr = `Page ${pageNumber} of ${pageCount}`;
      doc.text(pageStr, pageWidth - margin, pageHeight - 10, {
        align: "right",
      });
    };

    const checkAndAddPage = (requiredHeight: number) => {
      if (currentY + requiredHeight > pageHeight - 25) {
        doc.addPage();
        currentY = 0;
        addHeader();
      }
    };

    addHeader();

    for (const [deptName, deptDataUntyped] of Object.entries(data)) {
      const deptData = deptDataUntyped as {
        averageStability: number;
        employees: EmployeeBreakdown[];
      };
      checkAndAddPage(15);
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, contentWidth, 8, "F");

      const stabilityValue = deptData.averageStability;
      const sign = stabilityValue > 0 ? "(+)" : stabilityValue < 0 ? "(-)" : "";
      const stabilityText = `${sign} ${Math.abs(stabilityValue).toFixed(2)}%`;
      const fullText = `${deptName} (Avg. Stability: ${stabilityText})`;
      doc.text(fullText, margin + 2, currentY + 5.5);

      currentY += 10;

      for (const emp of deptData.employees) {
        checkAndAddPage(35);
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(50);
        doc.text(
          `${emp.name} (Stability: ${emp.stability.toFixed(2)}%)`,
          margin + 1,
          currentY,
        );
        currentY += 2;
        const head = [["Metric", "Last Month", "Current Month", "Trend"]];
        const body = [
          [
            "Total Visits",
            emp.metrics.last.totalVisits,
            emp.metrics.current.totalVisits,
          ],
          [
            "Total Duration (HH:MM)",
            emp.metrics.last.totalDuration,
            emp.metrics.current.totalDuration,
          ],
          [
            "Unique Projects",
            emp.metrics.last.uniqueProjects,
            emp.metrics.current.uniqueProjects,
          ],
          [
            "Avg Daily Duration",
            emp.metrics.last.avgDailyDuration,
            emp.metrics.current.avgDailyDuration,
          ],
          [
            "Short Visits (<5m)",
            emp.metrics.last.shortVisits,
            emp.metrics.current.shortVisits,
          ],
        ];
        body.forEach((row: (string | number)[]) => {
          const currentVal = parseValue(row[2]);
          const lastVal = parseValue(row[1]);
          const change = currentVal - lastVal;
          let trend = "–";
          if (change > 0) trend = "(+)";
          if (change < 0) trend = "(-)";
          row.push(trend);
        });
        // @ts-ignore
        autoTable(doc as any, {
          head,
          body,
          startY: currentY,
          theme: "grid" as any,
          headStyles: {
            fillColor: [80, 80, 80],
            fontSize: 8,
            cellPadding: 1.5,
          },
          bodyStyles: { fontSize: 8, cellPadding: 1.5 },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { halign: "center" as any },
            2: { halign: "center" as any },
            3: { halign: "center" as any, cellWidth: 15 },
          },
          didParseCell: (hookData: any) => {
            const rawRow = hookData.row?.raw;
            if (
              hookData.column.index === 3 &&
              hookData.cell.section === "body" &&
              Array.isArray(rawRow) &&
              (rawRow as any[]).length > 2
            ) {
              const cellText = hookData.cell.text?.[0];
              if (cellText === "–") return;

              const currentVal = parseValue(
                (rawRow as any[])[2] as string | number,
              );
              const lastVal = parseValue(
                (rawRow as any[])[1] as string | number,
              );
              const change = currentVal - lastVal;

              const metricLabel = String((rawRow as any[])[0]);
              const isShortVisitMetric = metricLabel.includes("Short Visits");

              let isPositiveTrend = false;
              if (isShortVisitMetric) {
                isPositiveTrend = change < 0;
              } else {
                isPositiveTrend = change > 0;
              }

              if (change !== 0) {
                hookData.cell.styles.textColor = isPositiveTrend
                  ? [0, 128, 0]
                  : [255, 0, 0];
              }
            }
          },
        });
        currentY = (doc as any).lastAutoTable.finalY + 6;
      }
    }
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      addFooter(i, pageCount);
    }
    doc.save(
      `${title.toLowerCase().replace(/\s+/g, "_")}_${selectedMonth}.pdf`,
    );
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-slate-100 z-[100] overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full min-h-screen p-4 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-slate-800">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPDF}
              disabled={!data || Object.keys(data).length === 0}
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
                  d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                  clipRule="evenodd"
                />
              </svg>
              Export PDF
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
              aria-label="Go Back"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Back
            </button>
          </div>
        </header>
        <div className="space-y-12">
          {data && Object.keys(data).length > 0 ? (
            Object.entries(data).map(([deptName, deptDataUntyped]) => {
              const deptData = deptDataUntyped as {
                averageStability: number;
                employees: EmployeeBreakdown[];
              };
              return (
                <section
                  key={deptName}
                  className="bg-white shadow-lg p-8 md:p-12 ring-1 ring-slate-200/50"
                >
                  <h3 className="text-2xl font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-6 flex justify-between items-baseline">
                    <span>{deptName}</span>
                    <span className="font-semibold text-lg">
                      (Avg. Stability:{" "}
                      <ChangeIcon
                        value={`${deptData.averageStability > 0 ? "▲" : deptData.averageStability < 0 ? "▼" : "–"} ${Math.abs(deptData.averageStability).toFixed(2)}%`}
                      />
                      )
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6">
                    {deptData.employees.map((emp) => (
                      <div
                        key={emp.name}
                        className="bg-slate-50 p-4 rounded-lg border border-slate-200/80"
                      >
                        <p className="font-bold text-slate-800 text-base">
                          {emp.name}
                        </p>
                        <p className="text-sm mb-2">
                          <span className="font-semibold text-slate-700">
                            Stability:{" "}
                          </span>
                          <ChangeIcon
                            value={`${emp.stability > 0 ? "▲" : emp.stability < 0 ? "▼" : "–"} ${Math.abs(emp.stability).toFixed(2)}%`}
                          />
                        </p>
                        <table className="w-full text-xs mt-3">
                          <thead className="bg-slate-200">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold">
                                Metric
                              </th>
                              <th className="px-2 py-1.5 text-center font-semibold">
                                Last Month
                              </th>
                              <th className="px-2 py-1.5 text-center font-semibold">
                                Current Month
                              </th>
                              <th className="px-2 py-1.5 text-center font-semibold">
                                Trend
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            <MetricRow
                              label="Total Visits"
                              current={emp.metrics.current.totalVisits}
                              last={emp.metrics.last.totalVisits}
                            />
                            <MetricRow
                              label="Total Duration (HH:MM)"
                              current={emp.metrics.current.totalDuration}
                              last={emp.metrics.last.totalDuration}
                            />
                            <MetricRow
                              label="Unique Projects"
                              current={emp.metrics.current.uniqueProjects}
                              last={emp.metrics.last.uniqueProjects}
                            />
                            <MetricRow
                              label="Avg Daily Duration"
                              current={emp.metrics.current.avgDailyDuration}
                              last={emp.metrics.last.avgDailyDuration}
                            />
                            <MetricRow
                              label="Short Visits (<5m)"
                              current={emp.metrics.current.shortVisits}
                              last={emp.metrics.last.shortVisits}
                            />
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <p className="text-center text-slate-500 py-16 bg-white shadow-md">
              No departments to display.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

const EmployeeDutyAnalysis: React.FC<EmployeeDutyAnalysisProps> = ({
  visits,
  currentUser,
}) => {
  const today = new Date();
  const latestMonthFromData = useMemo(() => {
    if (visits.length > 0) {
      const latestVisit = _.maxBy(visits, "date");
      if (latestVisit) {
        const latestDate = new Date(latestVisit.date);
        return `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, "0")}`;
      }
    }
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }, [visits]);

  const [selectedMonth, setSelectedMonth] = useState(latestMonthFromData);
  const [defaultCurrentWorkingDays, setDefaultCurrentWorkingDays] =
    useState("25");
  const [defaultLastWorkingDays, setDefaultLastWorkingDays] = useState("26");
  const [analysisData, setAnalysisData] = useState<AnalysisResultRow[] | null>(
    null,
  );
  const [hiddenDepartments, setHiddenDepartments] = useState<Set<string>>(
    () => {
      try {
        const saved = typeof window !== "undefined" && window.localStorage
          ? localStorage.getItem("analysis_hiddenDepartments")
          : null;
        if (saved) {
          const parsed = JSON.parse(saved);
          let mapped = parsed.map((d: string) =>
            d === "Inventory Mgt." || d === "Inventory Mgt. (Project Side)"
              ? "Inventory Management"
              : d,
          );
          return new Set(mapped);
        }
      } catch (e) { /* silent fail in sandboxed env */ }
      return new Set();
    },
  );
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [inventoryConfig, setInventoryConfig] = useState<
    Record<string, string>
  >({});
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const [impactMonth, setImpactMonth] = useState(latestMonthFromData);

  // --- Impact Metric 1: High Attention Projects ---
  const highAttentionProjects = useMemo<HighAttentionProject[]>(() => {
    const [year, month] = impactMonth.split("-").map(Number);
    const filtered = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vy, vm] = v.date.split("-").map(Number);
      return vy === year && vm === month;
    });

    const projectMap = filtered.reduce<Record<string, EmployeeVisit[]>>((acc, v) => {
      if (!acc[v.projectName]) acc[v.projectName] = [];
      acc[v.projectName].push(v);
      return acc;
    }, {});

    return Object.entries(projectMap)
      .map(([name, pvs]) => {
        const visitCount = pvs.length;
        const badge: HighAttentionProject["badge"] =
          visitCount >= 10 ? "critical" : visitCount >= 5 ? "watch" : "normal";
        return {
          name,
          visitCount,
          uniqueVisitors: new Set(pvs.map((v) => v.visitorName)).size,
          departments: Array.from(new Set(pvs.map((v) => v.department))),
          badge,
        };
      })
      .filter((p) => p.badge !== "normal")
      .sort((a, b) => b.visitCount - a.visitCount);
  }, [visits, impactMonth]);

  // --- Impact Metric 2: Coordinated / Overlapping Visits ---
  const coordinatedVisits = useMemo<CoordinatedVisitDay[]>(() => {
    const [year, month] = impactMonth.split("-").map(Number);
    const filtered = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vy, vm] = v.date.split("-").map(Number);
      return vy === year && vm === month;
    });

    const groupMap = filtered.reduce<Record<string, EmployeeVisit[]>>((acc, v) => {
      const key = `${v.date}__${v.projectName}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(v);
      return acc;
    }, {});

    return Object.entries(groupMap)
      .filter(([, vs]) => vs.length >= 2)
      .map(([key, vs]) => {
        const [date, projectName] = key.split("__");
        const depts = Array.from(new Set(vs.map((v) => v.department)));
        return {
          date,
          projectName,
          visitors: vs.map((v) => v.visitorName),
          departments: depts,
          type: (depts.length > 1 ? "cross_dept" : "same_dept") as "cross_dept" | "same_dept",
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [visits, impactMonth]);

  const fetchInventoryConfig = async () => {
    try {
      const resp = await fetch("/api/inventory-config");
      if (resp.ok) {
        const data = await resp.json();
        const configMap = Object.fromEntries(
          data.map((c: any) => [c.visitorName, c.side]),
        );
        setInventoryConfig(configMap);
      }
    } catch (e) {
      console.error("Error fetching inventory config", e);
    }
  };

  useEffect(() => {
    fetchInventoryConfig();
  }, []);

  // Save preferences to localStorage (safe — fails silently in sandboxed envs)
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(
          "analysis_hiddenDepartments",
          JSON.stringify(Array.from(hiddenDepartments)),
        );
      }
    } catch (e) { /* silent fail */ }
  }, [hiddenDepartments]);

  const toggleDepartmentVisibility = (dept: string) => {
    setHiddenDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };
  const { isLoading, showLoading, hideLoading } = useLoading();

  // State for improvement analysis
  const [isImprovementModalOpen, setIsImprovementModalOpen] = useState(false);
  const [improvementAnalysis, setImprovementAnalysis] = useState<Record<
    string,
    string
  > | null>(null);
  const [isAnalyzingImprovements, setIsAnalyzingImprovements] = useState(false);

  // Unified state for breakdown modals
  const [isFullPageBreakdownOpen, setIsFullPageBreakdownOpen] = useState(false);
  const [fullPageBreakdownData, setFullPageBreakdownData] =
    useState<BreakdownData | null>(null);
  const [fullPageBreakdownTitle, setFullPageBreakdownTitle] = useState("");

  const summaryData = useMemo<SummaryDataRow[]>(() => {
    const [year, month] = selectedMonth.split("-").map(Number); // month is 1-based

    let lastMonthYear = year;
    let lastMonth = month - 1;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = year - 1;
    }

    const currentVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [visitYear, visitMonth] = v.date.split("-").map(Number);
      return visitYear === year && visitMonth === month;
    });

    const lastMonthVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [visitYear, visitMonth] = v.date.split("-").map(Number);
      return visitYear === lastMonthYear && visitMonth === lastMonth;
    });

    const employeeNamesWithVisits = _.uniq([
      ...currentVisits.map((v) => v.visitorName),
      ...lastMonthVisits.map((v) => v.visitorName),
    ]);

    return employeeNamesWithVisits
      .map((name) => {
        const allVisitsForEmployee = visits.filter(
          (v) => v.visitorName === name,
        );
        const firstVisit = allVisitsForEmployee[0];
        const { department, designation } = firstVisit;

        const { durationForCalcSec } = getSupposedlyDurations(
          department,
          designation,
          inventoryConfig[name],
        );
        const wd = parseInt(defaultCurrentWorkingDays, 10) || 0;
        const lastWd = parseInt(defaultLastWorkingDays, 10) || 0;

        const employeeCurrentVisits = currentVisits.filter(
          (v) => v.visitorName === name,
        );
        const employeeLastMonthVisits = lastMonthVisits.filter(
          (v) => v.visitorName === name,
        );

        const currentActualSec = _.sumBy(employeeCurrentVisits, (v) =>
          parseDurationToSeconds(v.duration),
        );
        const lastActualSec = _.sumBy(employeeLastMonthVisits, (v) =>
          parseDurationToSeconds(v.duration),
        );

        const currentSupposedlySec = wd * durationForCalcSec;
        const lastSupposedlySec = lastWd * durationForCalcSec;

        const currentPercent =
          currentSupposedlySec > 0
            ? (currentActualSec / currentSupposedlySec) * 100
            : 0;
        const lastPercent =
          lastSupposedlySec > 0 ? (lastActualSec / lastSupposedlySec) * 100 : 0;

        return {
          department,
          visitorName: name,
          designation,
          totalWorkingDay: wd,
          currentMonthActualDurationSec: currentActualSec,
          lastMonthActualDurationSec: lastActualSec,
          currentMonthDurationPercentage: currentPercent,
          lastMonthDurationPercentage: lastPercent,
          currentStability: currentPercent - lastPercent,
        };
      })
      .filter((row) => !hiddenDepartments.has(row.department));
  }, [
    selectedMonth,
    visits,
    defaultCurrentWorkingDays,
    defaultLastWorkingDays,
    hiddenDepartments,
    inventoryConfig,
  ]);

  const handleGenerateAnalysis = () => {
    if (summaryData.length === 0) {
      setFeedback({
        message: "No visit data available for the selected period to analyze.",
        type: "info",
      });
      return;
    }
    showLoading();
    setAnalysisData(null);

    const [year, month] = selectedMonth.split("-").map(Number);
    const currentMonthVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [visitYear, visitMonth] = v.date.split("-").map(Number);
      return visitYear === year && visitMonth === month;
    });

    const groupedByDept = _.groupBy(summaryData, "department");

    try {
      const results = Object.entries(groupedByDept).map(
        ([department, employees]) => {
          const averageStability = _.meanBy(
            employees as SummaryDataRow[],
            "currentStability",
          );
          const employeeCount = (employees as SummaryDataRow[]).length;
          const totalVisits = currentMonthVisits.filter(
            (v) => v.department === department,
          ).length;

          const topPerformerRow = _.maxBy(
            employees as SummaryDataRow[],
            "currentStability",
          );
          const lowestPerformerRow = _.minBy(
            employees as SummaryDataRow[],
            "currentStability",
          );

          const getPerformerDetails = (
            performer: SummaryDataRow | undefined,
          ): PerformerData | null => {
            if (!performer) return null;
            const performerVisits = currentMonthVisits.filter(
              (v) => v.visitorName === performer.visitorName,
            );
            return {
              name: performer.visitorName,
              visitCount: performerVisits.length,
              projectCount: _.uniqBy(performerVisits, "projectName").length,
              duration: formatSecondsToHHMM(
                performer.currentMonthActualDurationSec,
              ),
            };
          };

          return {
            department,
            employeeCount,
            totalVisits,
            averageStability,
            remark: "",
            topPerformer: getPerformerDetails(topPerformerRow),
            lowestPerformer: getPerformerDetails(lowestPerformerRow),
          };
        },
      );

      setAnalysisData(_.orderBy(results, ["averageStability"], ["desc"]));
      setFeedback({
        message: "Analysis complete. You can now add observation remarks.",
        type: "success",
      });
    } catch (error) {
      console.error("Analysis failed:", error);
      setFeedback({
        message: "An error occurred during analysis.",
        type: "error",
      });
    } finally {
      hideLoading();
    }
  };

  const handleAnalyzeImprovements = async () => {
    if (!analysisData) {
      setFeedback({
        message: "Please generate the initial analysis first.",
        type: "info",
      });
      return;
    }

    const underperformingDepts = analysisData.filter(
      (d) => d.averageStability < 0,
    );

    if (underperformingDepts.length === 0) {
      setFeedback({
        message: "No underperforming departments found to analyze.",
        type: "success",
      });
      return;
    }

    setIsAnalyzingImprovements(true);
    setIsImprovementModalOpen(true);
    setImprovementAnalysis(null);

    try {
      const analysisPromises = underperformingDepts.map(async (dept) => {
        const deptEmployees = summaryData.filter(
          (e) => e.department === dept.department,
        );
        const lowPerformers = _.orderBy(
          deptEmployees,
          ["currentStability"],
          ["asc"],
        ).slice(0, 5); // Top 5 lowest

        const promptData = `
Department: ${dept.department} (Average Stability: ${dept.averageStability.toFixed(2)}%)

Key Contributing Employees (Decline in Performance):
${lowPerformers
  .map(
    (p) => `
- Name: ${p.visitorName} (Stability: ${p.currentStability.toFixed(2)}%)
  - Current Month Duration: ${formatSecondsToHHMM(p.currentMonthActualDurationSec)} (vs ${formatSecondsToHHMM(p.lastMonthActualDurationSec)} last month)
  - Current Performance: ${p.currentMonthDurationPercentage.toFixed(2)}% (vs ${p.lastMonthDurationPercentage.toFixed(2)}% last month)
`,
  )
  .join("")}
`;
        const result = await generateImprovementAnalysis(promptData);
        return { department: dept.department, result };
      });

      const results = await Promise.all(analysisPromises);
      const finalAnalysis = results.reduce(
        (acc, { department, result }) => {
          if (result) {
            acc[department] = result;
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      setImprovementAnalysis(finalAnalysis);
    } catch (error) {
      console.error("Error during improvement analysis:", error);
      setFeedback({
        message: "Failed to generate improvement analysis.",
        type: "error",
      });
      setIsImprovementModalOpen(false);
    } finally {
      setIsAnalyzingImprovements(false);
    }
  };

  const handleShowBreakdown = () => {
    if (!analysisData || !summaryData) return;

    const [year, month] = selectedMonth.split("-").map(Number);
    let lastMonthYear = year;
    let lastMonth = month - 1;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = year - 1;
    }

    const currentMonthVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vYear, vMonth] = v.date.split("-").map(Number);
      return vYear === year && vMonth === month;
    });
    const lastMonthVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vYear, vMonth] = v.date.split("-").map(Number);
      return vYear === lastMonthYear && vMonth === lastMonth;
    });

    const underperformingDepts = analysisData.filter(
      (d) => d.averageStability < 0,
    );
    const numDefaultLastWD = parseInt(defaultLastWorkingDays, 10) || 22;

    const finalBreakdownData: BreakdownData = {};

    for (const dept of underperformingDepts) {
      const deptEmployeesFromSummary = summaryData.filter(
        (e) => e.department === dept.department && e.currentStability < 0,
      );

      const employeeBreakdowns: EmployeeBreakdown[] =
        deptEmployeesFromSummary.map((employeeSummary) => {
          const empCurrentVisits = currentMonthVisits.filter(
            (v) => v.visitorName === employeeSummary.visitorName,
          );
          const empLastMonthVisits = lastMonthVisits.filter(
            (v) => v.visitorName === employeeSummary.visitorName,
          );

          const currentDurationSec =
            employeeSummary.currentMonthActualDurationSec;
          const lastDurationSec = employeeSummary.lastMonthActualDurationSec;

          const currentWorkingDays = employeeSummary.totalWorkingDay;
          const lastWorkingDays = numDefaultLastWD;

          return {
            name: employeeSummary.visitorName,
            stability: employeeSummary.currentStability,
            metrics: {
              current: {
                totalVisits: empCurrentVisits.length,
                totalDuration: formatSecondsToHHMM(currentDurationSec),
                uniqueProjects: _.uniqBy(empCurrentVisits, "projectName")
                  .length,
                avgDailyDuration: formatSecondsToHHMM(
                  currentWorkingDays > 0
                    ? currentDurationSec / currentWorkingDays
                    : 0,
                ),
                shortVisits: empCurrentVisits.filter(
                  (v) => parseDurationToSeconds(v.duration) < 300,
                ).length,
              },
              last: {
                totalVisits: empLastMonthVisits.length,
                totalDuration: formatSecondsToHHMM(lastDurationSec),
                uniqueProjects: _.uniqBy(empLastMonthVisits, "projectName")
                  .length,
                avgDailyDuration: formatSecondsToHHMM(
                  lastWorkingDays > 0 ? lastDurationSec / lastWorkingDays : 0,
                ),
                shortVisits: empLastMonthVisits.filter(
                  (v) => parseDurationToSeconds(v.duration) < 300,
                ).length,
              },
            },
          };
        });

      finalBreakdownData[dept.department] = {
        averageStability: dept.averageStability,
        employees: _.orderBy(employeeBreakdowns, ["stability"], ["asc"]),
      };
    }

    setFullPageBreakdownData(finalBreakdownData);
    setFullPageBreakdownTitle("Underperforming Breakdown");
    setIsFullPageBreakdownOpen(true);
  };

  const handleShowFullBreakdown = () => {
    if (!analysisData || !summaryData) return;

    const [year, month] = selectedMonth.split("-").map(Number);
    let lastMonthYear = year;
    let lastMonth = month - 1;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = year - 1;
    }

    const currentMonthVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vYear, vMonth] = v.date.split("-").map(Number);
      return vYear === year && vMonth === month;
    });
    const lastMonthVisits = visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vYear, vMonth] = v.date.split("-").map(Number);
      return vYear === lastMonthYear && vMonth === lastMonth;
    });

    const allDepts = analysisData; // The main change: use all departments
    const numDefaultLastWD = parseInt(defaultLastWorkingDays, 10) || 22;

    const finalBreakdownData: BreakdownData = {};

    for (const dept of allDepts) {
      const deptEmployeesFromSummary = summaryData.filter(
        (e) => e.department === dept.department,
      );

      const employeeBreakdowns: EmployeeBreakdown[] =
        deptEmployeesFromSummary.map((employeeSummary) => {
          const empCurrentVisits = currentMonthVisits.filter(
            (v) => v.visitorName === employeeSummary.visitorName,
          );
          const empLastMonthVisits = lastMonthVisits.filter(
            (v) => v.visitorName === employeeSummary.visitorName,
          );

          const currentDurationSec =
            employeeSummary.currentMonthActualDurationSec;
          const lastDurationSec = employeeSummary.lastMonthActualDurationSec;

          const currentWorkingDays = employeeSummary.totalWorkingDay;
          const lastWorkingDays = numDefaultLastWD;

          return {
            name: employeeSummary.visitorName,
            stability: employeeSummary.currentStability,
            metrics: {
              current: {
                totalVisits: empCurrentVisits.length,
                totalDuration: formatSecondsToHHMM(currentDurationSec),
                uniqueProjects: _.uniqBy(empCurrentVisits, "projectName")
                  .length,
                avgDailyDuration: formatSecondsToHHMM(
                  currentWorkingDays > 0
                    ? currentDurationSec / currentWorkingDays
                    : 0,
                ),
                shortVisits: empCurrentVisits.filter(
                  (v) => parseDurationToSeconds(v.duration) < 300,
                ).length,
              },
              last: {
                totalVisits: empLastMonthVisits.length,
                totalDuration: formatSecondsToHHMM(lastDurationSec),
                uniqueProjects: _.uniqBy(empLastMonthVisits, "projectName")
                  .length,
                avgDailyDuration: formatSecondsToHHMM(
                  lastWorkingDays > 0 ? lastDurationSec / lastWorkingDays : 0,
                ),
                shortVisits: empLastMonthVisits.filter(
                  (v) => parseDurationToSeconds(v.duration) < 300,
                ).length,
              },
            },
          };
        });

      finalBreakdownData[dept.department] = {
        averageStability: dept.averageStability,
        employees: _.orderBy(employeeBreakdowns, ["stability"], ["asc"]),
      };
    }

    setFullPageBreakdownData(finalBreakdownData);
    setFullPageBreakdownTitle("Full Performance Breakdown");
    setIsFullPageBreakdownOpen(true);
  };

  const handleRemarkChange = (department: string, newRemark: string) => {
    if (!analysisData) return;
    setAnalysisData((prevData) =>
      prevData!.map((row) =>
        row.department === department ? { ...row, remark: newRemark } : row,
      ),
    );
  };

  const handleExportCSV = () => {
    if (!analysisData) {
      setFeedback({ message: "No data to export.", type: "error" });
      return;
    }

    const dataForCsv = analysisData.map((row) => ({
      Department: row.department,
      "Employee Count": row.employeeCount,
      "Total Visits": row.totalVisits,
      "Average Stability (%)": row.averageStability.toFixed(2),
      "Top Performer": row.topPerformer?.name || "N/A",
      "Top P. Visits": row.topPerformer?.visitCount ?? "N/A",
      "Top P. Projects": row.topPerformer?.projectCount ?? "N/A",
      "Top P. Duration": row.topPerformer?.duration || "N/A",
      "Lowest Performer": row.lowestPerformer?.name || "N/A",
      "Lowest P. Visits": row.lowestPerformer?.visitCount ?? "N/A",
      "Lowest P. Projects": row.lowestPerformer?.projectCount ?? "N/A",
      "Lowest P. Duration": row.lowestPerformer?.duration || "N/A",
      "Observation remarks": row.remark,
    }));

    const csv = Papa.unparse(dataForCsv);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `duty_analysis_report_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!analysisData) {
      setFeedback({ message: "No data to export.", type: "error" });
      return;
    }
    const dataForPdf = analysisData; // Create a local constant for type safety in closures
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    const addHeaderAndFooter = (docInstance: any) => {
      const pageCount = docInstance.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        docInstance.setPage(i);

        const headerStartY = 10;
        docInstance
          .setFont("helvetica", "bold")
          .setFontSize(14)
          .setTextColor(40);
        docInstance.text(
          "Credence Housing Limited",
          pageWidth / 2,
          headerStartY,
          { align: "center" },
        );
        docInstance
          .setFont("helvetica", "normal")
          .setFontSize(9)
          .setTextColor(100);
        docInstance.text(
          "Duty Analysis Report",
          pageWidth / 2,
          headerStartY + 6,
          { align: "center" },
        );
        docInstance
          .setDrawColor(220)
          .setLineWidth(0.2)
          .line(
            margin,
            headerStartY + 10,
            pageWidth - margin,
            headerStartY + 10,
          );

        const footerY = pageHeight - 20;
        docInstance.setFontSize(9).setTextColor(150);
        const preparedByStr = `Prepared by\nMIS`;
        docInstance.text(preparedByStr, margin, footerY);
        docInstance.text("Dept. HoD", pageWidth / 2, pageHeight - 10, {
          align: "center",
        });
        const pageStr = `Page ${i} of ${pageCount}`;
        docInstance.text(pageStr, pageWidth - margin, pageHeight - 10, {
          align: "right",
        });
      }
    };

    const head = [["Department", "Avg. Stability", "Observation remarks"]];
    const body = dataForPdf.map((row) => {
      const topPerformer = row.topPerformer;
      const lowestPerformer = row.lowestPerformer;

      const topPerformerText = topPerformer
        ? `Top: ${topPerformer.name}\n(Visits: ${topPerformer.visitCount}, Projects: ${topPerformer.projectCount}, Duration: ${topPerformer.duration})`
        : "Top: N/A";

      const lowestPerformerText = lowestPerformer
        ? `Lowest: ${lowestPerformer.name}\n(Visits: ${lowestPerformer.visitCount}, Projects: ${lowestPerformer.projectCount}, Duration: ${lowestPerformer.duration})`
        : "Lowest: N/A";

      return [
        {
          content: `${row.department}\n(Empl: ${row.employeeCount}, Visits: ${row.totalVisits})\n${topPerformerText}\n${lowestPerformerText}`,
          styles: { halign: "left", valign: "middle" },
        },
        {
          content: `${row.averageStability > 0 ? "(+)" : row.averageStability < 0 ? "(-)" : ""} ${Math.abs(row.averageStability).toFixed(2)}%`,
          styles: { halign: "center" as any, valign: "middle" },
        },
        { content: row.remark, styles: { halign: "left", valign: "middle" } },
      ];
    });

    // @ts-ignore
    autoTable(doc as any, {
      head,
      body: body as any,
      startY: 25,
      theme: "grid" as any,
      headStyles: { fillColor: [44, 62, 80], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 30 },
        2: { cellWidth: "auto" },
      },
      didParseCell: (data: any) => {
        // FIX: In the didParseCell callback for PDF generation, `dataForPdf` was being inferred as `unknown`, causing a type error. Casting it to `any` before accessing `.length` resolves this, ensuring the bounds check works as intended.
        if (
          !Array.isArray(dataForPdf) ||
          data.column.index !== 1 ||
          data.cell.section !== "body" ||
          !data.row ||
          typeof data.row.index !== "number" ||
          data.row.index < 0 ||
          data.row.index >= (dataForPdf as any).length
        ) {
          return;
        }

        const rowData = dataForPdf[data.row.index];
        if (rowData && typeof rowData.averageStability === "number") {
          const value = rowData.averageStability;
          if (value > 0) {
            data.cell.styles.textColor = [0, 128, 0];
          } else if (value < 0) {
            data.cell.styles.textColor = [255, 0, 0];
          }
        }
      },
      margin: { top: 25, bottom: 25 },
    });

    addHeaderAndFooter(doc);
    doc.save(`duty_analysis_report_${selectedMonth}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label
            htmlFor="month-select-duty"
            className="block text-sm font-medium text-slate-700"
          >
            Select Month
          </label>
          <input
            type="month"
            id="month-select-duty"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label
            htmlFor="default-wd-current-duty"
            className="block text-sm font-medium text-slate-700"
          >
            Current Month WD
          </label>
          <input
            type="number"
            id="default-wd-current-duty"
            value={defaultCurrentWorkingDays}
            onChange={(e) => setDefaultCurrentWorkingDays(e.target.value)}
            min="0"
            max="31"
            className="mt-1 block w-full px-2 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
          />
        </div>
        <div>
          <label
            htmlFor="default-wd-last-duty"
            className="block text-sm font-medium text-slate-700"
          >
            Last Month WD
          </label>
          <input
            type="number"
            id="default-wd-last-duty"
            value={defaultLastWorkingDays}
            onChange={(e) => setDefaultLastWorkingDays(e.target.value)}
            min="0"
            max="31"
            className="mt-1 block w-full px-2 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
          />
        </div>
        <button
          onClick={handleGenerateAnalysis}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400"
        >
          {isLoading ? <Spinner /> : "Generate Analysis"}
        </button>
      </div>

      <div className="flex items-center gap-3 no-print">
        <button
          onClick={() => setShowVisibilityModal(true)}
          className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
              clipRule="evenodd"
            />
          </svg>
          Filter Departments
        </button>
        {hiddenDepartments.size > 0 && (
          <span className="text-xs text-slate-500 italic">
            ({hiddenDepartments.size} departments excluded from analysis)
          </span>
        )}
      </div>

      {analysisData && (
        <div className="fade-in space-y-4">
          <div className="flex justify-end items-center gap-3 flex-wrap">
            <button
              onClick={handleShowBreakdown}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 14a1 1 0 001 1h8a1 1 0 001-1V5a1 1 0 00-1-1H6a1 1 0 00-1 1v9z" />
                <path d="M13 5a1 1 0 011 1v2a1 1 0 11-2 0V6a1 1 0 011-1zM9 5a1 1 0 011 1v4a1 1 0 11-2 0V6a1 1 0 011-1zM5 9a1 1 0 011-1h2a1 1 0 110 2H6a1 1 0 01-1-1z" />
              </svg>
              Underperforming Breakdown
            </button>
            <button
              onClick={handleShowFullBreakdown}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1zm13 1a1 1 0 10-2 0v6a1 1 0 102 0V8zM8 7a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              </svg>
              Full Breakdown
            </button>
            <button
              onClick={handleAnalyzeImprovements}
              disabled={isAnalyzingImprovements}
              className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Analyze with AI
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
            >
              Export PDF
            </button>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/4">
                    Department & Performers
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Average Stability
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/2">
                    Observation remarks
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {analysisData.map((row) => (
                  <tr key={row.department}>
                    <td className="px-3 py-4 align-top">
                      <p className="font-bold text-slate-800">
                        {row.department}
                      </p>
                      <p className="text-xs text-slate-500">
                        Empl: {row.employeeCount} | Visits: {row.totalVisits}
                      </p>
                      <div className="mt-2 text-xs space-y-1">
                        <p
                          className="text-green-700 truncate"
                          title={row.topPerformer?.name}
                        >
                          <strong>Top:</strong>{" "}
                          {row.topPerformer?.name || "N/A"}
                        </p>
                        <p
                          className="text-red-700 truncate"
                          title={row.lowestPerformer?.name}
                        >
                          <strong>Lowest:</strong>{" "}
                          {row.lowestPerformer?.name || "N/A"}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center align-middle">
                      <ChangeIcon
                        value={`${row.averageStability > 0 ? "▲" : row.averageStability < 0 ? "▼" : "–"} ${Math.abs(row.averageStability).toFixed(2)}%`}
                      />
                    </td>
                    <td className="px-3 py-4 align-top">
                      <textarea
                        value={row.remark}
                        onChange={(e) =>
                          handleRemarkChange(row.department, e.target.value)
                        }
                        placeholder="Enter observation..."
                        className="w-full h-24 p-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* ===== IMPACT METRICS SECTION ===== */}
      <div className="space-y-6 pt-2">
        {/* Impact Header + Month Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Visit Impact Metrics
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Derived from existing visit data — no extra input needed</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="impact-month-select" className="text-sm font-medium text-slate-700 whitespace-nowrap">Month</label>
            <input
              type="month"
              id="impact-month-select"
              value={impactMonth}
              onChange={(e) => setImpactMonth(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* ---- Impact Metric 1: High Attention Projects ---- */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-slate-700">High Attention Projects</span>
              <span className="text-xs text-slate-500">— বারবার visit হওয়া projects</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>Critical ≥10</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"></span>Watch 5–9</span>
            </div>
          </div>
          {highAttentionProjects.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              এই মাসে কোনো project-এ ৫+ visit নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-white">
                  <tr>
                    {["Project Name", "Visit Count", "Unique Visitors", "Involved Departments", "Status"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {highAttentionProjects.map((p) => (
                    <tr key={p.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-800 max-w-[200px] truncate" title={p.name}>{p.name}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block font-mono font-bold text-sm ${p.badge === "critical" ? "text-red-600" : "text-amber-600"}`}>
                          {p.visitCount}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm text-slate-700">{p.uniqueVisitors}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {p.departments.map((d) => (
                            <span key={d} className="inline-block text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md truncate max-w-[120px]" title={d}>{d}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.badge === "critical" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>Critical
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>Watch
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

        {/* ---- Impact Metric 2: Coordinated / Overlapping Visits ---- */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span className="text-sm font-semibold text-slate-700">Coordinated / Overlapping Visits</span>
              <span className="text-xs text-slate-500">— একই দিনে একই project-এ ২+ জন</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>Cross-dept (ভালো)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"></span>Same-dept (review করো)</span>
            </div>
          </div>
          {coordinatedVisits.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              এই মাসে একই দিনে একই project-এ ২+ visit নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-white">
                  <tr>
                    {["Date", "Project Name", "Visitors", "Departments", "Type"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {coordinatedVisits.map((c, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50 transition-colors ${c.type === "same_dept" ? "border-l-2 border-amber-400" : "border-l-2 border-green-400"}`}>
                      <td className="px-3 py-2.5 text-sm font-mono text-slate-700 whitespace-nowrap">{c.date}</td>
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-800 max-w-[180px] truncate" title={c.projectName}>{c.projectName}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {c.visitors.map((v, i) => (
                            <span key={i} className="text-xs text-slate-600">{v}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.departments.map((d) => (
                            <span key={d} className="inline-block text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md truncate max-w-[120px]" title={d}>{d}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {c.type === "cross_dept" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>Coordinated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>Overlap?
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

      <ImprovementAnalysisModal
        isOpen={isImprovementModalOpen}
        onClose={() => setIsImprovementModalOpen(false)}
        analysis={improvementAnalysis}
        isLoading={isAnalyzingImprovements}
      />
      <FullPagePerformanceBreakdownModal
        isOpen={isFullPageBreakdownOpen}
        onClose={() => setIsFullPageBreakdownOpen(false)}
        data={fullPageBreakdownData}
        currentUser={currentUser}
        selectedMonth={selectedMonth}
        title={fullPageBreakdownTitle}
      />

      {showVisibilityModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold">Include/Exclude Departments</h3>
              <button
                onClick={() => setShowVisibilityModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500 mb-4 italic">
                Select departments to include in the Live Analysis report.
              </p>
              <div className="space-y-2">
                {_.uniq(DEPARTMENTS).map((dept) => (
                  <div
                    key={dept}
                    className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg group hover:border-orange-200 hover:bg-orange-50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!hiddenDepartments.has(dept)}
                        onChange={() => toggleDepartmentVisibility(dept)}
                        className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500"
                      />
                      <span
                        className={`text-sm font-medium ${hiddenDepartments.has(dept) ? "text-slate-400 line-through" : "text-slate-700"}`}
                      >
                        {dept}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t">
              <button
                onClick={() => {
                  setHiddenDepartments(new Set());
                  setFeedback({
                    message: "All departments included.",
                    type: "info",
                  });
                }}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium text-sm"
              >
                Reset All
              </button>
              <button
                onClick={() => setShowVisibilityModal(false)}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 shadow-md transition-all font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDutyAnalysis;
