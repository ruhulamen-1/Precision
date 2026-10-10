import React, { useState, useMemo } from "react";
import { EmployeeVisit } from "../types";
import _ from "lodash";

// --- Helper Functions ---

/**
 * Determines the "Duty Date" for a given visit.
 * If the visit entry time is before 8 AM, it's considered part of the previous day's night shift.
 * This function is now timezone-safe.
 * @param dateStr The calendar date of the visit (YYYY-MM-DD).
 * @param timeStr The entry time of the visit (HH:MM).
 * @returns The calculated "Duty Date" in YYYY-MM-DD format.
 */
const getDutyDate = (dateStr: string, timeStr: string): string => {
  if (!dateStr) return "";

  // Normalize input date to UTC components to avoid timezone shifting
  let year: number, month: number, day: number;

  // Check if it's an ISO string or just date part
  let datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  const parts = datePart.split(/[-/]/).map(Number);

  if (parts.length === 3 && !parts.some(isNaN)) {
    if (parts[0] > 1000) {
      // YYYY-MM-DD
      [year, month, day] = parts;
    } else {
      // DD-MM-YYYY
      [day, month, year] = parts;
    }
  } else {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  }

  try {
    const hour = parseInt(timeStr?.split(":")[0] || "0", 10);
    const d = new Date(Date.UTC(year, month - 1, day));

    // If entry time is before 8 AM, it belongs to the previous day's shift
    if (hour < 8) {
      d.setUTCDate(d.getUTCDate() - 1);
    }

    return d.toISOString().split("T")[0];
  } catch (e) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
};

const getShiftType = (entryTime: string): "Day" | "Night" => {
  if (!entryTime || !/^\d{1,2}:\d{2}/.test(entryTime)) {
    return "Night"; // Default to night if time is invalid
  }
  const hour = parseInt(entryTime.split(":")[0], 10);
  return hour >= 8 && hour < 20 ? "Day" : "Night";
};

const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr || !timeStr) return null;

  // Normalize date format
  let normalizedDate = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    // Try parsing DD-MM-YYYY or common variations
    const dmyMatch = normalizedDate.match(
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/,
    );
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      let year = parseInt(dmyMatch[3], 10);
      if (year < 100) year += 2000;
      normalizedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    } else {
      const d = new Date(normalizedDate);
      if (isNaN(d.getTime())) return null;
      normalizedDate = d.toISOString().split("T")[0];
    }
  }

  // Normalize time format
  let normalizedTime = timeStr.trim().toUpperCase();
  const ampmMatch = normalizedTime.match(/(AM|PM)$/);
  let [hourStr, minuteStr] = normalizedTime
    .replace(/(AM|PM)$/, "")
    .trim()
    .split(":");

  if (!hourStr || !minuteStr) return null;

  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (ampmMatch) {
    if (ampmMatch[0] === "PM" && hour < 12) hour += 12;
    if (ampmMatch[0] === "AM" && hour === 12) hour = 0;
  }

  const paddedTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const d = new Date(`${normalizedDate}T${paddedTimeStr}:00`);
  if (isNaN(d.getTime())) return null;
  return d;
};

const parseDurationToSeconds = (durationStr: string): number => {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const [hours, minutes] = parts;
    return hours * 3600 + minutes * 60;
  }
  return 0;
};

const formatSecondsToHHMMSS = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const RosterAnalysisCard: React.FC<{
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}> = ({ title, value, icon }) => (
  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
      {icon}
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

const VisitTable: React.FC<{
  title: string;
  visits: EmployeeVisit[];
  icon: React.ReactNode;
}> = ({ title, visits, icon }) => (
  <div className="bg-white p-4 rounded-lg border border-slate-200 h-full">
    <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
      {icon}
      {title}
    </h4>
    <div className="overflow-auto max-h-60">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">
              Calendar Date
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">
              Project
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">
              In
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">
              Out
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {visits.length > 0 ? (
            visits.map((v) => (
              <tr key={v.id}>
                {/* FIX: Changed visits.property to v.property to correctly access data from the mapped item. */}
                <td className="px-2 py-1.5 whitespace-nowrap">{v.date}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {v.projectName}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{v.entryTime}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{v.outTime}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{v.duration}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="text-center py-4 text-slate-400">
                No visits recorded
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

/**
 * Formats a date string (YYYY-MM-DD or ISO) to DD-MMM-YYYY format.
 * @param dateStr Date string.
 * @returns Formatted date string (e.g., 29-Apr-2024).
 */
const formatDateToDDMMMYYYY = (dateStr: string): string => {
  if (!dateStr) return "";

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
  } catch (e) {}

  return dateStr;
};

const SSVDutyAnalysisRoster: React.FC<{ visits: EmployeeVisit[] }> = ({
  visits,
}) => {
  const [dateMode, setDateMode] = useState<
    "month" | "day" | "range" | "overview"
  >("overview");
  const [selectedSingleDate, setSelectedSingleDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [selectedSupervisor, setSelectedSupervisor] = useState("");

  const uniqueSupervisors = useMemo(
    () => _.uniq(visits.map((v) => v.visitorName)).sort(),
    [visits],
  );

  const overviewData = useMemo(() => {
    if (dateMode !== "overview" || !selectedMonth) return null;

    const [year, month] = selectedMonth.split("-").map(Number);

    // Filter visits for the selected month
    const monthlyVisits = visits.filter((v) => {
      const dutyDate = getDutyDate(v.date, v.entryTime);
      const [vYear, vMonth] = dutyDate.split("-").map(Number);
      return vYear === year && vMonth === month;
    });

    const supervisorGroups = _.groupBy(monthlyVisits, "visitorName");

    const summary = Object.entries(supervisorGroups).map(
      ([name, visitsGroup]) => {
        const supervisorVisits = visitsGroup as EmployeeVisit[];
        const dutyDates = _.groupBy(supervisorVisits, (v) =>
          getDutyDate(v.date, v.entryTime),
        );
        const totalDutyDays = Object.keys(dutyDates).length;
        const uniqueProjects = _.uniq(
          supervisorVisits.map((v) => v.projectName),
        ).length;
        const dayShifts = supervisorVisits.filter(
          (v) => getShiftType(v.entryTime) === "Day",
        ).length;
        const nightShifts = supervisorVisits.filter(
          (v) => getShiftType(v.entryTime) === "Night",
        ).length;
        const totalDurationSec = _.sumBy(supervisorVisits, (v) =>
          parseDurationToSeconds(v.duration),
        );
        const designation =
          supervisorVisits[0]?.designation || "Security Supervisor";

        return {
          name,
          designation,
          totalDutyDays,
          dayShifts,
          nightShifts,
          uniqueProjects,
          totalDuration: formatSecondsToHHMMSS(totalDurationSec),
          totalDurationSec,
        };
      },
    );

    const sortedSummary = _.orderBy(
      summary,
      ["uniqueProjects", "totalDutyDays"],
      ["desc", "desc"],
    );

    const topPerformer = sortedSummary[0] || null;
    const topDuty = _.maxBy(summary, "totalDutyDays") || null;

    return {
      summary: sortedSummary,
      topPerformer,
      topDuty,
    };
  }, [visits, selectedMonth, dateMode]);

  const analysisData = useMemo(() => {
    if (!selectedSupervisor || dateMode === "overview") return null;

    // Group all visits for the selected supervisor by their calculated duty date
    const supervisorVisits = visits.filter(
      (v) => v.visitorName === selectedSupervisor,
    );
    const visitsByDutyDate = _.groupBy(supervisorVisits, (v) =>
      getDutyDate(v.date, v.entryTime),
    );

    // SINGLE DAY MODE
    if (dateMode === "day") {
      const relevantVisits = visitsByDutyDate[selectedSingleDate] || [];

      const dayShiftVisits = relevantVisits.filter(
        (v) => getShiftType(v.entryTime) === "Day",
      );
      const nightShiftVisits = relevantVisits.filter(
        (v) => getShiftType(v.entryTime) === "Night",
      );
      const totalDurationSec = _.sumBy(relevantVisits, (v) =>
        parseDurationToSeconds(v.duration),
      );
      const projectsVisited = _.uniq(relevantVisits.map((v) => v.projectName));

      return {
        summary: {
          totalDutyHours: formatSecondsToHHMMSS(totalDurationSec),
          totalProjects: projectsVisited.length,
          dayVisitsCount: dayShiftVisits.length,
          nightVisitsCount: nightShiftVisits.length,
          totalDutyDays: relevantVisits.length > 0 ? 1 : 0,
        },
        dailyBreakdown: null,
        dayShiftVisits: _.orderBy(
          dayShiftVisits,
          ["date", "entryTime"],
          ["asc", "asc"],
        ),
        nightShiftVisits: _.orderBy(
          nightShiftVisits,
          ["date", "entryTime"],
          ["asc", "asc"],
        ),
      };
    }

    // MONTH AND RANGE MODE
    if (dateMode === "month" || dateMode === "range") {
      let start: string, end: string;
      if (dateMode === "month") {
        if (!selectedMonth) return null;
        const [year, month] = selectedMonth.split("-").map(Number);
        start = `${selectedMonth}-01`;
        const daysInMonth = new Date(year, month, 0).getDate();
        end = `${selectedMonth}-${String(daysInMonth).padStart(2, "0")}`;
      } else {
        // range
        if (!startDate || !endDate) return null;
        start = startDate;
        end = endDate;
      }

      if (start > end) return null;

      const relevantVisits = _.chain(visitsByDutyDate)
        .pickBy((_value, key) => key >= start && key <= end)
        .flatMap()
        .value() as unknown as EmployeeVisit[];

      // Summary for the entire period
      const totalDurationSec = _.sumBy(relevantVisits, (v) =>
        parseDurationToSeconds(v.duration),
      );
      const projectsVisited = _.uniq(relevantVisits.map((v) => v.projectName));

      // Daily breakdown logic
      const dailyBreakdown: any[] = [];
      const currentDate = new Date(`${start}T00:00:00Z`); // Use UTC to prevent timezone issues
      const endDateObj = new Date(`${end}T00:00:00Z`);

      if (isNaN(currentDate.getTime()) || isNaN(endDateObj.getTime())) {
        return {
          summary: {
            totalDutyHours: formatSecondsToHHMMSS(totalDurationSec),
            totalProjects: projectsVisited.length,
            dayVisitsCount: 0,
            nightVisitsCount: 0,
            totalDutyDays: 0,
          },
          dailyBreakdown: [],
          dayShiftVisits: [],
          nightShiftVisits: [],
        };
      }

      while (currentDate <= endDateObj) {
        const currentDateStr = currentDate.toISOString().split("T")[0];
        const dayVisits = visitsByDutyDate[currentDateStr] || [];

        if (dayVisits.length === 0) {
          dailyBreakdown.push({
            dutyDate: currentDateStr,
            dayShiftHours: "00:00:00",
            nightShiftHours: "00:00:00",
            totalHours: "00:00:00",
            status: "Day Off",
            projectsVisited: "N/A",
          });
        } else {
          const dayShiftVisits = dayVisits.filter(
            (v) => getShiftType(v.entryTime) === "Day",
          );
          const nightShiftVisits = dayVisits.filter(
            (v) => getShiftType(v.entryTime) === "Night",
          );

          const dayDuration = _.sumBy(dayShiftVisits, (v) =>
            parseDurationToSeconds(v.duration),
          );
          const nightDuration = _.sumBy(nightShiftVisits, (v) =>
            parseDurationToSeconds(v.duration),
          );

          let status = "Active Duty";
          if (dayShiftVisits.length > 0 && nightShiftVisits.length > 0)
            status = "Day & Night Duty";
          else if (dayShiftVisits.length > 0) status = "Day Duty";
          else if (nightShiftVisits.length > 0) status = "Night Duty";

          dailyBreakdown.push({
            dutyDate: currentDateStr,
            dayShiftHours: formatSecondsToHHMMSS(dayDuration),
            nightShiftHours: formatSecondsToHHMMSS(nightDuration),
            totalHours: formatSecondsToHHMMSS(dayDuration + nightDuration),
            status: status,
            projectsVisited: _.uniq(dayVisits.map((v) => v.projectName)).join(
              ", ",
            ),
          });
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      const totalDutyDays = dailyBreakdown.filter(
        (day) => day.status !== "Day Off",
      ).length;

      const summary = {
        totalDutyHours: formatSecondsToHHMMSS(totalDurationSec),
        totalProjects: projectsVisited.length,
        dayVisitsCount: relevantVisits.filter(
          (v) => getShiftType(v.entryTime) === "Day",
        ).length,
        nightVisitsCount: relevantVisits.filter(
          (v) => getShiftType(v.entryTime) === "Night",
        ).length,
        totalDutyDays,
      };

      return {
        summary,
        dailyBreakdown,
        dayShiftVisits: [], // Not used in month/range view
        nightShiftVisits: [], // Not used in month/range view
      };
    }

    return null; // Should not be reached
  }, [
    visits,
    selectedSupervisor,
    dateMode,
    selectedSingleDate,
    startDate,
    endDate,
    selectedMonth,
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div className="lg:col-span-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Filter Mode
          </label>
          <div className="flex items-center gap-4 rounded-lg bg-slate-100 p-1 w-full sm:w-auto">
            {(["overview", "month", "day", "range"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDateMode(mode)}
                className={`flex-1 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${dateMode === mode ? "bg-white text-orange-600 shadow-sm" : "text-slate-600 hover:bg-slate-200"}`}
              >
                {mode === "overview"
                  ? "Monthly Overview"
                  : mode === "day"
                    ? "Single Day"
                    : mode === "range"
                      ? "Date Range"
                      : "Individual Month"}
              </button>
            ))}
          </div>
        </div>
        {(dateMode === "month" || dateMode === "overview") && (
          <div>
            <label
              htmlFor="month-select"
              className="block text-sm font-medium text-slate-700"
            >
              Select Month
            </label>
            <input
              type="month"
              id="month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        )}
        {dateMode === "day" && (
          <div>
            <label
              htmlFor="duty-day-select"
              className="block text-sm font-medium text-slate-700"
            >
              Select Duty Day (8am to 8am)
            </label>
            <input
              type="date"
              id="duty-day-select"
              value={selectedSingleDate}
              onChange={(e) => setSelectedSingleDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        )}
        {dateMode === "range" && (
          <>
            <div>
              <label
                htmlFor="start-date-select"
                className="block text-sm font-medium text-slate-700"
              >
                Start Date
              </label>
              <input
                type="date"
                id="start-date-select"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label
                htmlFor="end-date-select"
                className="block text-sm font-medium text-slate-700"
              >
                End Date
              </label>
              <input
                type="date"
                id="end-date-select"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
              />
            </div>
          </>
        )}

        <div>
          <label
            htmlFor="supervisor-roster-filter"
            className="block text-sm font-medium text-slate-700"
          >
            Select Supervisor
          </label>
          <select
            id="supervisor-roster-filter"
            value={selectedSupervisor}
            onChange={(e) => {
              setSelectedSupervisor(e.target.value);
              if (e.target.value && dateMode === "overview") {
                setDateMode("month");
              }
            }}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          >
            <option value="">-- Select a Supervisor --</option>
            {uniqueSupervisors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dateMode === "day" && (
        <p className="text-xs text-center text-slate-500 -mt-4">
          A "Duty Day" runs from 8:00 AM on the selected date to 7:59 AM on the
          following day.
        </p>
      )}

      {dateMode === "overview" && overviewData && (
        <div className="fade-in space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overviewData.topPerformer && (
              <div
                className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 flex items-center gap-4 shadow-sm cursor-pointer hover:border-orange-400 transition-all"
                onClick={() => {
                  setSelectedSupervisor(overviewData.topPerformer!.name);
                  setDateMode("month");
                }}
              >
                <div className="h-12 w-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
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
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                    Monthly Best Performer
                  </p>
                  <p className="text-lg font-bold text-slate-800">
                    {overviewData.topPerformer.name}
                  </p>
                  <p className="text-sm text-slate-600">
                    {overviewData.topPerformer.uniqueProjects} Unique Projects
                    Visited
                  </p>
                </div>
              </div>
            )}
            {overviewData.topDuty && (
              <div
                className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4 shadow-sm cursor-pointer hover:border-blue-400 transition-all"
                onClick={() => {
                  setSelectedSupervisor(overviewData.topDuty!.name);
                  setDateMode("month");
                }}
              >
                <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
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
                </div>
                <div>
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                    Top Duty Performer
                  </p>
                  <p className="text-lg font-bold text-slate-800">
                    {overviewData.topDuty.name}
                  </p>
                  <p className="text-sm text-slate-600">
                    {overviewData.topDuty.totalDutyDays} Active Duty Days
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <h4 className="font-bold text-slate-800 uppercase tracking-tight">
                Supervisor Monthly Summary ({selectedMonth})
              </h4>
              <div className="text-xs text-slate-500 font-medium">
                Sorted by Performance
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider">
                      Supervisor Name
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider">
                      Designation
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider">
                      Duty Days
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider">
                      Shift (D/N)
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider">
                      Projects
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider">
                      Tot. Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overviewData.summary.map((row) => (
                    <tr
                      key={row.name}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSelectedSupervisor(row.name);
                            setDateMode("month");
                          }}
                          className="font-bold text-orange-600 hover:text-orange-700 hover:underline text-left"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.designation}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-slate-100 px-2 py-1 rounded font-mono text-slate-700">
                          {row.totalDutyDays}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-orange-600 font-bold">
                          {row.dayShifts}D
                        </span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span className="text-indigo-600 font-bold">
                          {row.nightShifts}N
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded font-bold">
                          {row.uniqueProjects}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                        {row.totalDuration}
                      </td>
                    </tr>
                  ))}
                  {overviewData.summary.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-12 text-center text-slate-400 italic"
                      >
                        No data found for the selected month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {dateMode !== "overview" && selectedSupervisor && analysisData ? (
        <div className="fade-in space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {dateMode === "day" ? "Duty Day Summary" : "Period Summary"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <RosterAnalysisCard
                title="Total Duty Hours"
                value={analysisData.summary.totalDutyHours}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z"
                      clipRule="evenodd"
                    />
                  </svg>
                }
              />
              <RosterAnalysisCard
                title="Total Projects"
                value={analysisData.summary.totalProjects}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                  </svg>
                }
              />
              <RosterAnalysisCard
                title="Total Duty Days"
                value={analysisData.summary.totalDutyDays}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                      clipRule="evenodd"
                    />
                  </svg>
                }
              />
              <RosterAnalysisCard
                title="Day Shift Visits"
                value={analysisData.summary.dayVisitsCount}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.706-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 14.95a1 1 0 010-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707a1 1 0 011.414 0zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" />
                  </svg>
                }
              />
              <RosterAnalysisCard
                title="Night Shift Visits"
                value={analysisData.summary.nightVisitsCount}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                }
              />
            </div>
          </div>

          {dateMode === "day" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <VisitTable
                title={`Day Shift (8am - 8pm)`}
                visits={analysisData.dayShiftVisits}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-yellow-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.706-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 14.95a1 1 0 010-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707a1 1 0 011.414 0zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" />
                  </svg>
                }
              />
              <VisitTable
                title={`Night Shift (8pm - 8am)`}
                visits={analysisData.nightShiftVisits}
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-indigo-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                }
              />
            </div>
          ) : (
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-700 mb-2">
                Daily Breakdown
              </h4>
              <div className="overflow-auto max-h-96">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">
                        Duty Date
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">
                        Day Hours
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">
                        Night Hours
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">
                        Total Hours
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">
                        Projects Visited
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {analysisData.dailyBreakdown?.map((day) => (
                      <tr
                        key={day.dutyDate}
                        className={
                          day.status === "Day Off" ? "bg-slate-50" : ""
                        }
                      >
                        <td className="px-3 py-2 whitespace-nowrap font-semibold">
                          {formatDateToDDMMMYYYY(day.dutyDate)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {day.dayShiftHours}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {day.nightShiftHours}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-bold">
                          {day.totalHours}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              day.status === "Day Off"
                                ? "bg-gray-100 text-gray-800"
                                : day.status.includes("Day & Night")
                                  ? "bg-purple-100 text-purple-800"
                                  : day.status.includes("Day")
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-indigo-100 text-indigo-800"
                            }`}
                          >
                            {day.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-normal break-words">
                          {day.projectsVisited}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          <p>
            Please select a filter mode, date(s), and a supervisor to view the
            roster analysis.
          </p>
        </div>
      )}
    </div>
  );
};

export default SSVDutyAnalysisRoster;
