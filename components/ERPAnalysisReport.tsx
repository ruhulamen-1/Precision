import React, { useMemo, useState } from "react";
import { ERPCorrectionRecord, User } from "../types";
import _ from "lodash";
import ChangeIcon from "./ChangeIcon";

// Helper to calculate duration in minutes
const calculateDurationMinutes = (
  report: ERPCorrectionRecord,
): number | null => {
  if (
    report.status !== "Completed" ||
    !report.completedDate ||
    !report.completedTime
  ) {
    return null;
  }
  try {
    const start = new Date(`${report.entryDate}T${report.entryTime}`);
    const end = new Date(`${report.completedDate}T${report.completedTime}`);
    // FIX: Use getTime() for robust date comparison and arithmetic.
    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      end.getTime() < start.getTime()
    ) {
      return null;
    }
    return (end.getTime() - start.getTime()) / (1000 * 60);
  } catch (e) {
    console.error("Error calculating duration:", e);
    return null;
  }
};

// Helper to format minutes into a readable string
const formatMinutes = (minutes: number): string => {
  if (isNaN(minutes) || minutes === 0) return "0 min";
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
};

// --- SVG Icon Components ---
const ClipboardListIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
    />
  </svg>
);
const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);
const OfficeBuildingIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m-1 4h1m5-4h1m-1 4h1m-5-4h1m-1 4h1"
    />
  </svg>
);
const TagIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 8V3z"
    />
  </svg>
);

// Analysis Card component
const AnalysisCard: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm transition-shadow hover:shadow-md">
    <h3 className="text-base font-semibold text-slate-800 border-b border-slate-200 pb-3 mb-4">
      {title}
    </h3>
    <div className="text-sm">{children}</div>
  </div>
);

// New component for the overview cards
const OverviewCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  currentValue: string | number;
  change?: number;
  previousValue?: string | number;
  isTime?: boolean;
  invertTrend?: boolean; // For metrics where lower is better
  color: "blue" | "yellow" | "purple" | "rose";
}> = ({
  title,
  icon,
  currentValue,
  change,
  previousValue,
  isTime = false,
  invertTrend = false,
  color,
}) => {
  const formatValue = (val: string | number) =>
    isTime ? formatMinutes(Number(val)) : val;

  const colorClasses = {
    blue: { bg: "bg-blue-100", text: "text-blue-600" },
    yellow: { bg: "bg-yellow-100", text: "text-yellow-600" },
    purple: { bg: "bg-purple-100", text: "text-purple-600" },
    rose: { bg: "bg-rose-100", text: "text-rose-600" },
  };

  let trendIcon = null;
  if (change !== undefined && change !== 0 && isFinite(change)) {
    let isPositive = change > 0;
    if (invertTrend) isPositive = !isPositive;
    const trendText = `${isPositive ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`;
    trendIcon = <ChangeIcon value={trendText} />;
  } else if (change === Infinity) {
    trendIcon = <ChangeIcon value={`▲ ∞%`} />;
  }

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 p-5 rounded-xl border border-slate-200/80 shadow-lg h-full flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div>
        <div className="flex items-center justify-between text-slate-500">
          <h4 className="font-semibold">{title}</h4>
          <div
            className={`p-2 rounded-lg ${colorClasses[color].bg} ${colorClasses[color].text}`}
          >
            {icon}
          </div>
        </div>
        <p
          className="text-4xl font-bold text-slate-800 my-2 truncate"
          title={String(currentValue)}
        >
          {formatValue(currentValue)}
        </p>
      </div>
      <div className="flex justify-between items-baseline text-xs">
        {trendIcon ? (
          <>
            <span className="text-sm font-semibold">{trendIcon}</span>
            <span className="text-slate-400">
              vs {formatValue(previousValue || 0)}
            </span>
          </>
        ) : (
          <span className="text-slate-400">
            {previousValue
              ? `Prev: ${formatValue(previousValue)}`
              : "No previous data"}
          </span>
        )}
      </div>
    </div>
  );
};

// Table component for analysis data
const AnalysisTable: React.FC<{
  headers: string[];
  data: (string | number)[][];
}> = ({ headers, data }) => {
  const containerClasses =
    data.length > 5
      ? "max-h-56 overflow-auto border border-slate-200 rounded-lg"
      : "overflow-x-auto";

  return (
    <div className={containerClasses}>
      <table className="w-full text-sm">
        <thead className="bg-slate-100 sticky top-0 z-10">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider ${i > 0 ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {data.map((row, i) => (
            <tr key={i} className={i % 2 !== 0 ? "bg-slate-50/70" : ""}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2.5 whitespace-nowrap text-slate-700 ${j > 0 ? "text-right font-mono" : "font-medium text-slate-800"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface ERPAnalysisReportProps {
  reports: ERPCorrectionRecord[];
  currentUser?: User;
}

/**
 * Robustly parses a date string into a Date object, treating it as UTC.
 * Handles YYYY-MM-DD and DD-MM-YYYY (with '-' or '/' separators).
 * @param dateStr The date string to parse.
 * @returns A Date object at UTC midnight, or null if parsing fails.
 */
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();

  // Try YYYY-MM-DD
  let parts = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const d = new Date(
      Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])),
    );
    if (!isNaN(d.getTime())) return d;
  }

  // Try DD-MM-YYYY with various separators
  parts = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (parts) {
    const d = new Date(
      Date.UTC(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])),
    );
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback for other formats supported by new Date() (e.g., from date picker)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // Standardize to UTC midnight
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  return null;
};

const ERPAnalysisReport: React.FC<ERPAnalysisReportProps> = ({
  reports,
  currentUser,
}) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const analysisData = useMemo(() => {
    // --- Date Range Filtering ---
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const currentStart = startDate ? parseDate(startDate) : firstDayOfMonth;
    const currentEnd = endDate ? parseDate(endDate) : today;

    if (currentEnd) {
      currentEnd.setUTCHours(23, 59, 59, 999);
    }

    const currentPeriodReports = reports.filter((report) => {
      const reportDate = parseDate(report.entryDate);
      if (!reportDate) return false;
      // FIX: Use getTime() for robust date comparison.
      return (
        (!currentStart || reportDate.getTime() >= currentStart.getTime()) &&
        (!currentEnd || reportDate.getTime() <= currentEnd.getTime())
      );
    });

    // --- Previous Period Calculation ---
    let previousPeriodReports: ERPCorrectionRecord[] = [];
    if (currentStart && currentEnd) {
      // FIX: Use getTime() for robust date comparison and arithmetic.
      const duration = currentEnd.getTime() - currentStart.getTime();
      // FIX: Use getTime() for robust date comparison and arithmetic.
      const prevEnd = new Date(currentStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);

      previousPeriodReports = reports.filter((report) => {
        const reportDate = parseDate(report.entryDate);
        if (!reportDate) return false;
        // FIX: Use getTime() for robust date comparison.
        return (
          reportDate.getTime() >= prevStart.getTime() &&
          reportDate.getTime() <= prevEnd.getTime()
        );
      });
    }

    // --- Metrics Calculation Helper ---
    const calculateMetrics = (periodReports: ERPCorrectionRecord[]) => {
      if (periodReports.length === 0) {
        return {
          totalCorrections: 0,
          avgCompletionTime: 0,
          topDepartment: { name: "N/A", count: 0 },
          topCorrectionType: { name: "N/A", count: 0 },
        };
      }

      const completed = periodReports
        .map((r) => ({ ...r, duration: calculateDurationMinutes(r) }))
        .filter((r) => r.duration !== null && r.duration >= 0);

      const topDepartment = _.chain(periodReports)
        .countBy("department")
        .toPairs()
        .maxBy(1)
        .value() || ["N/A", 0];

      const topCorrectionType = _.chain(periodReports)
        .countBy("correctionType")
        .toPairs()
        .maxBy(1)
        .value() || ["N/A", 0];

      return {
        totalCorrections: periodReports.length,
        avgCompletionTime: _.meanBy(completed, "duration") || 0,
        topDepartment: {
          name: topDepartment[0],
          count: topDepartment[1] as number,
        },
        topCorrectionType: {
          name: topCorrectionType[0],
          count: topCorrectionType[1] as number,
        },
      };
    };

    const currentMetrics = calculateMetrics(currentPeriodReports);
    const previousMetrics = calculateMetrics(previousPeriodReports);

    // --- Change Calculation Helper ---
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) {
        return current > 0 ? Infinity : 0; // Infinity change if starting from 0
      }
      return ((current - previous) / previous) * 100;
    };

    // --- Final Analysis Object ---
    if (currentPeriodReports.length === 0) return null;

    const formatDateForDisplay = (
      dateStr: string | null | undefined,
    ): string => {
      if (!dateStr) return "N/A";
      const date = parseDate(dateStr);
      if (!date) return "Invalid Date";
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    };

    const displayStartDate = currentStart
      ? currentStart.toISOString().split("T")[0]
      : _.min(reports.map((r) => r.entryDate));
    const displayEndDate = currentEnd
      ? currentEnd.toISOString().split("T")[0]
      : _.max(reports.map((r) => r.entryDate));
    const dateRangeString = `${formatDateForDisplay(displayStartDate)} - ${formatDateForDisplay(displayEndDate)}`;

    const correctionsByOfficer = _.countBy(currentPeriodReports, "officers");
    const deptAnalysisData = _.map(
      _.groupBy(currentPeriodReports, "department"),
      (deptReports, department) => {
        const topOfficerEntry = _.maxBy(
          _.toPairs(_.countBy(deptReports, "officers")),
          1,
        );
        return {
          department,
          totalCorrections: deptReports.length,
          topOfficerName: topOfficerEntry ? topOfficerEntry[0] : "N/A",
          topOfficerCount: topOfficerEntry ? topOfficerEntry[1] : 0,
        };
      },
    ).sort((a, b) => b.totalCorrections - a.totalCorrections);

    const completedReports = currentPeriodReports
      .map((r) => ({ ...r, duration: calculateDurationMinutes(r) }))
      .filter((r) => r.duration !== null && r.duration >= 0);

    const avgCompletionTimeByOfficer = _.chain(completedReports)
      .groupBy("officers")
      .mapValues((g) => _.meanBy(g, "duration"))
      .value();
    // FIX: Explicitly cast values to Number to ensure correct sorting.
    const sortedOfficersByTime = Object.entries(
      avgCompletionTimeByOfficer,
    ).sort((a, b) => Number(a[1]) - Number(b[1]));
    // FIX: Explicitly cast values to Number to ensure correct sorting.
    const sortedOfficersByCount = Object.entries(correctionsByOfficer).sort(
      (a, b) => Number(b[1]) - Number(a[1]),
    );

    return {
      dateRangeString,
      monthlyOverview: {
        totalCorrections: {
          current: currentMetrics.totalCorrections,
          previous: previousMetrics.totalCorrections,
          change: calculateChange(
            currentMetrics.totalCorrections,
            previousMetrics.totalCorrections,
          ),
        },
        avgCompletionTime: {
          current: currentMetrics.avgCompletionTime,
          previous: previousMetrics.avgCompletionTime,
          change: calculateChange(
            currentMetrics.avgCompletionTime,
            previousMetrics.avgCompletionTime,
          ),
        },
        topDepartment: {
          current: currentMetrics.topDepartment,
          previous: previousMetrics.topDepartment,
        },
        topCorrectionType: {
          current: currentMetrics.topCorrectionType,
          previous: previousMetrics.topCorrectionType,
        },
      },
      correctionsByOfficer,
      deptAnalysisData,
      correctionsByProject: _.countBy(currentPeriodReports, "projectName"),
      correctionsByType: _.countBy(currentPeriodReports, "correctionType"),
      statusSummary: _.countBy(currentPeriodReports, "status"),
      fastestOfficer: sortedOfficersByTime[0]
        ? { name: sortedOfficersByTime[0][0], time: sortedOfficersByTime[0][1] }
        : null,
      slowestOfficer:
        sortedOfficersByTime.length > 0
          ? {
              name: sortedOfficersByTime[sortedOfficersByTime.length - 1][0],
              time: sortedOfficersByTime[sortedOfficersByTime.length - 1][1],
            }
          : null,
      mostCorrectionsOfficer: sortedOfficersByCount[0]
        ? {
            name: sortedOfficersByCount[0][0],
            count: sortedOfficersByCount[0][1],
          }
        : null,
      fewestCorrectionsOfficer:
        sortedOfficersByCount.length > 0
          ? {
              name: sortedOfficersByCount[sortedOfficersByCount.length - 1][0],
              count: sortedOfficersByCount[sortedOfficersByCount.length - 1][1],
            }
          : null,
      remarkPatterns: _.countBy(currentPeriodReports, (r) => {
        const remark = r.remarks?.toLowerCase() || "";
        if (remark.includes("supplier name change"))
          return "Supplier name change";
        if (remark.includes("can't change quantity"))
          return "Can't change quantity";
        if (remark.includes("deleted from erp")) return "Deleted from ERP";
        return "Other";
      }),
    };
  }, [reports, startDate, endDate]);

  if (!analysisData) {
    const message =
      reports.length > 0
        ? "No data available for the selected date range."
        : "No data available to analyze. Please import records first.";
    return (
      <div>
        <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Filter by Date Range
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="start-date-filter"
                className="block text-sm font-medium text-slate-600"
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
                className="block text-sm font-medium text-slate-600"
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
          </div>
        </div>
        <p className="text-center text-slate-500 p-8">{message}</p>
      </div>
    );
  }

  const {
    dateRangeString,
    monthlyOverview,
    correctionsByOfficer,
    deptAnalysisData,
    correctionsByProject,
    correctionsByType,
    statusSummary,
    fastestOfficer,
    slowestOfficer,
    mostCorrectionsOfficer,
    fewestCorrectionsOfficer,
    remarkPatterns,
  } = analysisData;

  // Convert data to format for AnalysisTable component
  // FIX: Convert all numeric values to strings to resolve potential type errors.
  const officerData = Object.entries(correctionsByOfficer)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([officer, count]) => [officer, String(count)]);
  const deptData = deptAnalysisData.map((d) => [
    d.department,
    String(d.totalCorrections),
    d.topOfficerName,
    String(d.topOfficerCount),
  ]);
  const projectData = Object.entries(correctionsByProject)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([project, count]) => [project, String(count)]);
  const typeData = Object.entries(correctionsByType)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([type, count]) => [type, String(count)]);

  return (
    <div>
      <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-700 mb-2">
          Filter by Date Range
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="start-date-filter"
              className="block text-sm font-medium text-slate-600"
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
              className="block text-sm font-medium text-slate-600"
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
        </div>
      </div>

      {/* Monthly Comparison Overview */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Comparison Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <OverviewCard
            title="Total Corrections"
            icon={<ClipboardListIcon />}
            color="blue"
            currentValue={monthlyOverview.totalCorrections.current}
            previousValue={monthlyOverview.totalCorrections.previous}
            change={monthlyOverview.totalCorrections.change}
            invertTrend={true} // Higher is worse
          />
          <OverviewCard
            title="Avg. Completion Time"
            icon={<ClockIcon />}
            color="yellow"
            currentValue={monthlyOverview.avgCompletionTime.current}
            previousValue={monthlyOverview.avgCompletionTime.previous}
            change={monthlyOverview.avgCompletionTime.change}
            isTime={true}
            invertTrend={true} // Lower is better
          />
          <OverviewCard
            title="Top Department"
            icon={<OfficeBuildingIcon />}
            color="purple"
            currentValue={`${monthlyOverview.topDepartment.current.name} (${monthlyOverview.topDepartment.current.count})`}
            previousValue={`${monthlyOverview.topDepartment.previous.name} (${monthlyOverview.topDepartment.previous.count})`}
          />
          <OverviewCard
            title="Top Correction Type"
            icon={<TagIcon />}
            color="rose"
            currentValue={`${monthlyOverview.topCorrectionType.current.name} (${monthlyOverview.topCorrectionType.current.count})`}
            previousValue={`${monthlyOverview.topCorrectionType.previous.name} (${monthlyOverview.topCorrectionType.previous.count})`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnalysisCard title="Corrections by Officer">
          <p className="text-xs text-slate-500 -mt-3 mb-3">{dateRangeString}</p>
          <AnalysisTable headers={["Officer", "Count"]} data={officerData} />
        </AnalysisCard>
        <AnalysisCard title="Corrections by Department">
          <p className="text-xs text-slate-500 -mt-3 mb-3">{dateRangeString}</p>
          <AnalysisTable
            headers={[
              "Department",
              "Total Corrections",
              "Top Officer",
              "Corrections",
            ]}
            data={deptData}
          />
        </AnalysisCard>
        <AnalysisCard title="Corrections by Project">
          <p className="text-xs text-slate-500 -mt-3 mb-3">{dateRangeString}</p>
          <AnalysisTable headers={["Project", "Count"]} data={projectData} />
        </AnalysisCard>
        <AnalysisCard title="Corrections by Type">
          <p className="text-xs text-slate-500 -mt-3 mb-3">{dateRangeString}</p>
          <AnalysisTable headers={["Type", "Count"]} data={typeData} />
        </AnalysisCard>

        <AnalysisCard title="Officer Performance Metrics">
          <p className="text-xs text-slate-500 -mt-3 mb-3">{dateRangeString}</p>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-green-50/70 p-4 rounded-lg border border-green-200">
              <p className="text-xs text-green-700 font-semibold uppercase tracking-wider">
                Fastest (Avg Time)
              </p>
              <p
                className="text-base font-bold text-green-900 mt-1.5 truncate"
                title={fastestOfficer?.name || ""}
              >
                {fastestOfficer?.name || "N/A"}
              </p>
              <p className="text-sm text-green-800 font-mono mt-1">
                {fastestOfficer
                  ? formatMinutes(Number(fastestOfficer.time))
                  : ""}
              </p>
            </div>
            <div className="bg-red-50/70 p-4 rounded-lg border border-red-200">
              <p className="text-xs text-red-700 font-semibold uppercase tracking-wider">
                Slowest (Avg Time)
              </p>
              <p
                className="text-base font-bold text-red-900 mt-1.5 truncate"
                title={slowestOfficer?.name || ""}
              >
                {slowestOfficer?.name || "N/A"}
              </p>
              <p className="text-sm text-red-800 font-mono mt-1">
                {slowestOfficer
                  ? formatMinutes(Number(slowestOfficer.time))
                  : ""}
              </p>
            </div>
            <div className="bg-blue-50/70 p-4 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 font-semibold uppercase tracking-wider">
                Most Corrections
              </p>
              <p
                className="text-base font-bold text-blue-900 mt-1.5 truncate"
                title={mostCorrectionsOfficer?.name || ""}
              >
                {mostCorrectionsOfficer?.name || "N/A"}
              </p>
              <p className="text-sm text-blue-800 font-mono mt-1">
                {mostCorrectionsOfficer
                  ? `${mostCorrectionsOfficer.count}`
                  : ""}
              </p>
            </div>
            <div className="bg-purple-50/70 p-4 rounded-lg border border-purple-200">
              <p className="text-xs text-purple-700 font-semibold uppercase tracking-wider">
                Fewest Corrections
              </p>
              <p
                className="text-base font-bold text-purple-900 mt-1.5 truncate"
                title={fewestCorrectionsOfficer?.name || ""}
              >
                {fewestCorrectionsOfficer?.name || "N/A"}
              </p>
              <p className="text-sm text-purple-800 font-mono mt-1">
                {fewestCorrectionsOfficer
                  ? `${fewestCorrectionsOfficer.count}`
                  : ""}
              </p>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard title="Status Summary">
          <p className="text-xs text-slate-500 -mt-3 mb-3">{dateRangeString}</p>
          <div className="space-y-3">
            {Object.entries(statusSummary).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <span className="font-medium text-slate-700">{status}</span>
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-white bg-slate-600">
                  {count as number}
                </span>
              </div>
            ))}
          </div>
        </AnalysisCard>

        <div className="md:col-span-2 lg:col-span-3">
          <AnalysisCard title="Common Error Patterns (from Remarks)">
            <p className="text-xs text-slate-500 -mt-3 mb-3">
              {dateRangeString}
            </p>
            <AnalysisTable
              headers={["Pattern", "Occurrences"]}
              data={Object.entries(remarkPatterns)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([pattern, count]) => [pattern, String(count)])}
            />
          </AnalysisCard>
        </div>
      </div>
    </div>
  );
};

export default ERPAnalysisReport;
