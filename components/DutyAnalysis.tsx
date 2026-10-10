import React, { useState, useMemo, useEffect } from "react";
import { EmployeeVisit, User } from "../types";
import _ from "lodash";
import FeedbackMessage from "./FeedbackMessage";
import ChangeIcon from "./ChangeIcon";

// --- Helper Functions ---
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
): SupposedlyDurations => {
  const isExempt = EXEMPT_DEPARTMENTS.has(department);
  if (isExempt) {
    return { durationForDisplaySec: 0, durationForCalcSec: 4 * 3600 };
  }
  if (department === "Inventory Management") {
    const isProjectSide = [
      "Assistant Project Accountant (CH)",
      "Site Accountant (CH)",
    ].includes(designation);
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

const getMonthsInRange = (startMonth: string, endMonth: string): string[] => {
  const start = new Date(startMonth + "-01T00:00:00Z");
  const end = new Date(endMonth + "-01T00:00:00Z");
  const months: string[] = [];
  let current = start;

  while (current <= end) {
    months.push(current.toISOString().slice(0, 7)); // "YYYY-MM"
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
};

interface DutyAnalysisProps {
  visits: EmployeeVisit[];
  currentUser: User;
}

const DutyAnalysis: React.FC<DutyAnalysisProps> = ({ visits }) => {
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

  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date(latestMonthFromData);
    d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [endMonth, setEndMonth] = useState(latestMonthFromData);
  const [rangeError, setRangeError] = useState("");
  const [defaultCurrentWorkingDays, setDefaultCurrentWorkingDays] =
    useState("25"); // Keep for calculation consistency

  useEffect(() => {
    const months = getMonthsInRange(startMonth, endMonth);
    if (months.length > 6) {
      setRangeError("The date range cannot exceed 6 months.");
    } else if (startMonth > endMonth) {
      setRangeError("Start month cannot be after end month.");
    } else {
      setRangeError("");
    }
  }, [startMonth, endMonth]);

  const multiMonthAnalysisData = useMemo(() => {
    if (rangeError) return null;

    const months = getMonthsInRange(startMonth, endMonth);
    const departments = _.uniq(visits.map((v) => v.department));

    const results = departments.map((dept) => {
      const monthlyPercentages: { [month: string]: number } = {};

      months.forEach((monthStr) => {
        const deptVisitsInMonth = visits.filter(
          (v) => v.department === dept && v.date.startsWith(monthStr),
        );
        if (deptVisitsInMonth.length === 0) {
          monthlyPercentages[monthStr] = 0;
          return;
        }

        const totalActualSec = _.sumBy(deptVisitsInMonth, (v) => {
          const { durationForCalcSec } = getSupposedlyDurations(
            v.department,
            v.designation,
          );
          const wd = parseInt(defaultCurrentWorkingDays, 10) || 22;
          const supposed = wd * durationForCalcSec;
          const actual = parseDurationToSeconds(v.duration);
          return supposed > 0 ? (actual / supposed) * 100 : 0;
        });

        const uniqueEmployees = _.uniq(
          deptVisitsInMonth.map((v) => v.visitorName),
        );
        monthlyPercentages[monthStr] =
          uniqueEmployees.length > 0
            ? totalActualSec / uniqueEmployees.length
            : 0;
      });

      const percentages = Object.values(monthlyPercentages);
      const trend =
        percentages.length > 1
          ? percentages[percentages.length - 1] - percentages[0]
          : 0;

      return {
        department: dept,
        monthlyPercentages,
        trend,
      };
    });

    return _.orderBy(results, ["trend"], ["desc"]);
  }, [visits, startMonth, endMonth, rangeError, defaultCurrentWorkingDays]);

  const monthsForHeader = useMemo(() => {
    if (rangeError) return [];
    return getMonthsInRange(startMonth, endMonth);
  }, [startMonth, endMonth, rangeError]);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-white/40 backdrop-blur-md border border-white grid grid-cols-1 md:grid-cols-4 gap-4 items-end shadow-sm">
        <div>
          <label
            htmlFor="start-month-select"
            className="block text-sm font-medium text-slate-700"
          >
            Start Month
          </label>
          <input
            type="month"
            id="start-month-select"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label
            htmlFor="end-month-select"
            className="block text-sm font-medium text-slate-700"
          >
            End Month
          </label>
          <input
            type="month"
            id="end-month-select"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="md:col-span-2">
          {rangeError && (
            <div className="text-center text-red-600 bg-red-50 p-2 rounded-md">
              {rangeError}
            </div>
          )}
        </div>
      </div>

      {multiMonthAnalysisData && (
        <div className="fade-in space-y-4">
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/80 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Department
                  </th>
                  {monthsForHeader.map((month) => {
                    const [year, monthNum] = month.split("-");
                    const monthName = new Date(
                      Number(year),
                      Number(monthNum) - 1,
                      1,
                    ).toLocaleString("en-US", { month: "short" });
                    return (
                      <th
                        key={month}
                        className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >{`${monthName} '${year.slice(2)}`}</th>
                    );
                  })}
                  <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {multiMonthAnalysisData.map((row) => (
                  <tr key={row.department}>
                    <td className="px-3 py-4 font-bold text-slate-800">
                      {row.department}
                    </td>
                    {monthsForHeader.map((month) => (
                      <td key={month} className="px-3 py-4 text-center">
                        {row.monthlyPercentages[month] !== undefined
                          ? `${row.monthlyPercentages[month].toFixed(2)}%`
                          : "N/A"}
                      </td>
                    ))}
                    <td className="px-3 py-4 text-center">
                      <ChangeIcon
                        value={`${row.trend > 0 ? "▲" : row.trend < 0 ? "▼" : "–"} ${Math.abs(row.trend).toFixed(2)}%`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DutyAnalysis;
