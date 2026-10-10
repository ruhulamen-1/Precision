import React, { useMemo, useRef } from "react";
import { User, EmployeeVisit, ReportData, AllEmployee } from "../types";
import { parseCSVRobustly } from "../utils/csvUtils";
import _ from "lodash";
import SearchableSelect from "./SearchableSelect";
import VisitSummaryPDFGenerator from "./VisitSummaryPDFGenerator";

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

// --- Helper Functions for Reporting ---
const parseDurationToSeconds = (durationStr: string): number => {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
};

const formatSecondsToHHMM = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const sign = totalSeconds < 0 ? "-" : "";
  const absSeconds = Math.abs(totalSeconds);

  // Round to the nearest minute for accuracy
  const totalMinutes = Math.round(absSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

interface EmployeeDetailsTableProps {
  selectedEmployee: string;
  allVisits: EmployeeVisit[];
  attendanceData: any[];
  allEmployees?: AllEmployee[];
  selectedMonth: string;
}

const EmployeeDetailsTable: React.FC<EmployeeDetailsTableProps> = ({
  selectedEmployee,
  allVisits,
  attendanceData,
  allEmployees,
  selectedMonth,
}) => {
  if (!selectedEmployee) return null;

  // Prioritize data from the monthly attendance import
  const attendanceRecord = attendanceData?.find(
    (rec) => rec["Emp. Name"] === selectedEmployee,
  );

  // Find in system-managed employees
  const systemEmployee = allEmployees?.find(
    (emp) => emp.name === selectedEmployee,
  );

  // Fallback to the main visits list if no attendance record is found
  const employeeDataFromVisits = allVisits.find(
    (v) => v.visitorName === selectedEmployee,
  );

  // If neither source has data for the selected employee, don't render.
  if (!attendanceRecord && !employeeDataFromVisits && !systemEmployee)
    return null;

  // Get details, prioritizing the system-managed employee list, then attendance record
  const employeeName = selectedEmployee; // Name is known
  const employeeId = systemEmployee
    ? systemEmployee.employee_id
    : attendanceRecord
      ? attendanceRecord["Emp. Code"]
      : "N/A";
  const designation = systemEmployee
    ? systemEmployee.designation
    : attendanceRecord
      ? attendanceRecord["Designation"]
      : employeeDataFromVisits?.designation || "N/A";
  const department = systemEmployee
    ? systemEmployee.department
    : attendanceRecord
      ? attendanceRecord["Department"]
      : employeeDataFromVisits?.department || "N/A";

  const [year, month] = selectedMonth.split("-");
  const monthName = new Date(
    parseInt(year),
    parseInt(month) - 1,
    1,
  ).toLocaleString("en-US", { month: "long", year: "numeric" });
  const preparingDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const cellClass = "py-1.5 px-3 border border-slate-200 bg-white";
  const headerCellClass = "font-semibold text-slate-600 pr-2";

  return (
    <div className="my-6 p-4 border rounded-lg bg-slate-50/70">
      <table className="w-full text-sm border-collapse">
        <tbody>
          <tr>
            <td className={`${cellClass}`}>
              <span className={headerCellClass}>Name:</span> {employeeName}
            </td>
            <td className={`${cellClass}`}>
              <span className={headerCellClass}>Employee Code/ID:</span>{" "}
              {employeeId}
            </td>
            <td className={`${cellClass}`}>
              <span className={headerCellClass}>Month:</span> {monthName}
            </td>
          </tr>
          <tr>
            <td className={`${cellClass}`}>
              <span className={headerCellClass}>Designation:</span>{" "}
              {designation}
            </td>
            <td className={`${cellClass}`}>
              <span className={headerCellClass}>Department:</span> {department}
            </td>
            <td className={`${cellClass}`}>
              <span className={headerCellClass}>Date of Preparing:</span>{" "}
              {preparingDate}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

interface EmployeeVisitSummaryProps {
  currentUser: User;
  visits: EmployeeVisit[];
  allEmployees: AllEmployee[];
  attendanceData: any[];
  onUpdateAttendanceData: React.Dispatch<React.SetStateAction<any[]>>;
  // Lifted state props
  reportData: ReportData | null;
  setReportData: React.Dispatch<React.SetStateAction<ReportData | null>>;
  isReportGenerated: boolean;
  setIsReportGenerated: React.Dispatch<React.SetStateAction<boolean>>;
  reportTitle: string;
  setReportTitle: React.Dispatch<React.SetStateAction<string>>;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  selectedEmployee: string;
  onEmployeeChange: (employee: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (department: string) => void;
}

const EmployeeVisitSummary: React.FC<EmployeeVisitSummaryProps> = ({
  currentUser,
  visits,
  allEmployees,
  attendanceData,
  onUpdateAttendanceData,
  reportData,
  setReportData,
  isReportGenerated,
  setIsReportGenerated,
  reportTitle,
  setReportTitle,
  selectedMonth,
  onMonthChange,
  selectedEmployee,
  onEmployeeChange,
  selectedDepartment,
  onDepartmentChange,
}) => {
  const canEdit = currentUser.permissions?.monthlyComparisonPrecision?.edit || 
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';
  const attendanceFileInputRef = useRef<HTMLInputElement>(null);

  const uniqueEmployeeNames = useMemo(
    () => _.uniq(visits.map((v) => v.visitorName)).sort(),
    [visits],
  );
  const departmentNames = useMemo(
    () => _.uniq(visits.map((v) => v.department)).sort(),
    [visits],
  );

  const employeeOptionsForSummary = useMemo(
    () => ["All Employees", ...uniqueEmployeeNames],
    [uniqueEmployeeNames],
  );
  const departmentOptionsForSummary = useMemo(
    () => ["All Departments", ...departmentNames],
    [departmentNames],
  );

  const handleDownloadMonthlyAttendanceTemplate = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    const headers = ["Emp. Name", "Emp. Code", "Designation"];
    for (let i = 1; i <= daysInMonth; i++) {
      headers.push(String(i));
    }

    const employeesForTemplate = allEmployees.map((emp) => ({
      name: emp.name,
      department: emp.department,
      designation: emp.designation,
    }));

    const data = employeesForTemplate.map((emp) => [
      emp.name,
      (emp as any).employee_id || "",
      emp.designation,
    ]);

    const csv = window.Papa.unparse({ fields: headers, data });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `attendance_template_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMonthlyAttendanceFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const requiredHeaders = ["Emp. Name", "Emp. Code", "Designation"];
        if (!requiredHeaders.every((h) => results.meta.fields.includes(h))) {
          alert(`CSV must contain headers: ${requiredHeaders.join(", ")}`);
          return;
        }

        const newRecords = results.data
          .map((row: any) => {
            const record: any = {};
            // Copy all fields from the CSV row to the record
            Object.keys(row).forEach((header) => {
              record[header] = row[header] || "";
            });
            return record;
          })
          .filter((r: any) => r["Emp. Name"]);

        onUpdateAttendanceData((prev) =>
          _.unionBy(newRecords, prev, "Emp. Name"),
        );
        alert(`Imported ${newRecords.length} attendance records.`);
      },
      error: (err: any) => alert(`Error parsing CSV: ${err.message}`),
    });
    if (event.target) event.target.value = "";
  };

  const handleClearAttendanceData = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all imported attendance and remark data for this session?",
      )
    ) {
      onUpdateAttendanceData([]);
      alert("Imported data cleared.");
    }
  };

  const handleGenerateReport = () => {
    const [year, month] = selectedMonth.split("-").map(Number);

    const visitsInMonth = visits.filter((visit) => {
      const visitDate = new Date(visit.date);
      const monthMatch =
        visitDate.getFullYear() === year && visitDate.getMonth() + 1 === month;
      const employeeMatch =
        !selectedEmployee ||
        selectedEmployee === "All Employees" ||
        visit.visitorName === selectedEmployee;
      const departmentMatch =
        !selectedDepartment ||
        selectedDepartment === "All Departments" ||
        visit.department === selectedDepartment;
      return monthMatch && employeeMatch && departmentMatch;
    });

    // 1. Per Day Analysis
    const perDayVisits = _.chain(visitsInMonth)
      .groupBy("date")
      .map((dayVisits, date) => ({
        date,
        visitCount: dayVisits.length,
        totalDuration: _.sumBy(dayVisits, (v) =>
          parseDurationToSeconds(v.duration),
        ),
      }))
      .orderBy("date", "asc")
      .value();

    // Summary Calculations
    const totalVisitDays = perDayVisits.length;
    const totalProjectsVisited = _.uniqBy(visitsInMonth, "projectName").length;
    const grandTotalDuration = _.sumBy(perDayVisits, "totalDuration");

    // 2. Per Project Analysis
    const perProjectVisits = _.chain(visitsInMonth)
      .groupBy("projectName")
      .map((projectVisits, projectName) => ({
        projectName,
        visitCount: projectVisits.length,
        totalDuration: _.sumBy(projectVisits, (v) =>
          parseDurationToSeconds(v.duration),
        ),
      }))
      .orderBy("visitCount", "desc")
      .value();

    // 3. Duration Feedback
    const durationCounts: { [key: string]: number } = {
      "More than 20 Minutes": 0,
      "10–19 Minutes": 0,
      "5–9 Minutes": 0,
      "Less than 5 Minutes": 0,
    };
    const improperVisits: EmployeeVisit[] = [];
    visitsInMonth.forEach((visit) => {
      const seconds = parseDurationToSeconds(visit.duration);
      if (seconds === 0) {
        improperVisits.push(visit);
        return;
      }
      const minutes = seconds / 60;
      if (minutes > 20) durationCounts["More than 20 Minutes"]++;
      else if (minutes >= 10) durationCounts["10–19 Minutes"]++;
      else if (minutes >= 5) durationCounts["5–9 Minutes"]++;
      else durationCounts["Less than 5 Minutes"]++;
    });
    const durationCountsArray = Object.entries(durationCounts).map(
      ([category, count]) => ({ category, count }),
    );

    // 4. Daily Project Log
    const dailyProjectsLog = _.chain(visitsInMonth)
      .cloneDeep() // Avoid mutating original data
      .orderBy("date", "asc")
      .map((v) => ({ date: v.date, projectName: v.projectName }))
      .value();

    // 5. No Visit Days (Only calculated for a single employee)
    const noVisitDays: { date: string; day: string; remark: string }[] = [];
    if (selectedEmployee) {
      const visitDates = new Set(visitsInMonth.map((v) => v.date));
      const daysInMonth = new Date(year, month, 0).getDate();
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const employeeAttendanceRecord = attendanceData.find(
        (rec) => rec["Emp. Name"] === selectedEmployee,
      );

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month - 1, day);
        const dayOfWeek = currentDate.getDay();

        if (dayOfWeek >= 0 && dayOfWeek <= 4) {
          // Sunday to Thursday
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (!visitDates.has(dateStr)) {
            const remark = employeeAttendanceRecord
              ? employeeAttendanceRecord[String(day)] || ""
              : "";
            noVisitDays.push({
              date: dateStr,
              day: dayNames[dayOfWeek],
              remark,
            });
          }
        }
      }
    }

    setReportData({
      perDay: perDayVisits,
      summary: { totalVisitDays, totalProjectsVisited, grandTotalDuration },
      perProject: perProjectVisits,
      durationCounts: durationCountsArray,
      improperVisitCount: improperVisits.length,
      improperVisits,
      dailyProjects: dailyProjectsLog,
      noVisitDays,
    });

    const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", {
      month: "long",
    });
    const title = `Monthly Visit Report - ${monthName} ${year}`;
    setReportTitle(title);
    setIsReportGenerated(true);
  };

  const handleNoVisitRemarkChange = (
    dateToUpdate: string,
    newRemark: string,
  ) => {
    if (!reportData) return;

    const updatedNoVisitDays = reportData.noVisitDays.map((day) => {
      if (day.date === dateToUpdate) {
        return { ...day, remark: newRemark };
      }
      return day;
    });

    setReportData({
      ...reportData,
      noVisitDays: updatedNoVisitDays,
    });
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label
            htmlFor="month-select"
            className="block text-sm font-medium text-slate-700"
          >
            Select Month & Year
          </label>
          <input
            type="month"
            id="month-select"
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div>
          <SearchableSelect
            id="employee-select"
            label="Employee Name"
            options={employeeOptionsForSummary}
            value={selectedEmployee}
            onChange={onEmployeeChange}
            placeholder="Type or select employee"
          />
        </div>
        <div>
          <SearchableSelect
            id="dept-summary-filter"
            label="Department"
            options={departmentOptionsForSummary}
            value={selectedDepartment}
            onChange={onDepartmentChange}
            placeholder="Type or select department"
          />
        </div>
        <button
          onClick={handleGenerateReport}
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
        >
          Generate Report
        </button>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-white/40 backdrop-blur-md border border-white shadow-sm">
        <h3 className="text-base font-semibold text-slate-700 mb-2">
          Monthly Attendance & Remarks Import
        </h3>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleDownloadMonthlyAttendanceTemplate}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
          >
            Download Template
          </button>
          <label
            htmlFor="attendance-upload"
            className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
          >
            Import Data (CSV)
          </label>
          <input
            id="attendance-upload"
            type="file"
            className="sr-only"
            ref={attendanceFileInputRef}
            onChange={handleMonthlyAttendanceFileUpload}
            accept=".csv"
          />
          <button
            onClick={handleClearAttendanceData}
            disabled={attendanceData.length === 0}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
          >
            Clear Imported Data
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Import a CSV to pre-fill employee details (Code, Designation) and
          daily remarks for non-visiting days (e.g., 'Holiday', 'Leave').
        </p>
      </div>

      {isReportGenerated &&
        selectedEmployee &&
        selectedEmployee !== "All Employees" &&
        reportData && (
          <EmployeeDetailsTable
            selectedEmployee={selectedEmployee}
            allVisits={visits}
            attendanceData={attendanceData}
            allEmployees={allEmployees}
            selectedMonth={selectedMonth}
          />
        )}

      {isReportGenerated && reportData ? (
        <div className="mt-6 border-t border-slate-200 pt-6 space-y-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h3 className="text-xl font-bold text-slate-800">{reportTitle}</h3>
            {canEdit ? (
              <VisitSummaryPDFGenerator
                reportData={reportData}
                reportTitle={reportTitle}
                currentUser={currentUser}
                selectedMonth={selectedMonth}
                selectedEmployee={selectedEmployee}
                selectedDepartment={selectedDepartment}
                allVisits={visits}
                attendanceData={attendanceData}
                allEmployees={allEmployees}
              />
            ) : (
              <span className="text-slate-400 text-xs px-4 py-2 bg-slate-50 border rounded-md italic">
                Report Generation: Admin Only
              </span>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-slate-700 mb-2">
              Overall Summary
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="bg-white/40 backdrop-blur-sm p-3 rounded-lg border border-white shadow-sm">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  Total Visiting Days
                </p>
                <p className="font-bold text-slate-800 text-2xl mt-1">
                  {reportData.summary.totalVisitDays}
                </p>
              </div>
              <div className="bg-white/40 backdrop-blur-sm p-3 rounded-lg border border-white shadow-sm">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  Total Projects Visited
                </p>
                <p className="font-bold text-slate-800 text-2xl mt-1">
                  {reportData.summary.totalProjectsVisited}
                </p>
              </div>
              <div className="bg-white/40 backdrop-blur-sm p-3 rounded-lg border border-white shadow-sm">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  Grand Total Duration
                </p>
                <p className="font-bold text-slate-800 text-2xl mt-1">
                  {formatSecondsToHHMM(reportData.summary.grandTotalDuration)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Per Day Visit Count */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-700">
                Per Day Visit Count
              </h4>
              <div className="overflow-auto border rounded-lg max-h-96">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Visits
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Total Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {reportData.perDay.map((d) => (
                      <tr key={d.date}>
                        <td className="px-4 py-2 text-sm">
                          {formatDateToDDMMMYYYY(d.date)}
                        </td>
                        <td className="px-4 py-2 text-sm text-center">
                          {d.visitCount}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {formatSecondsToHHMM(d.totalDuration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per Project Summary */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-700">
                Per Project Summary
              </h4>
              <div className="overflow-auto border rounded-lg max-h-96">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Project
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Visits
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {reportData.perProject.map((p) => (
                      <tr key={p.projectName}>
                        <td className="px-4 py-2 text-sm">{p.projectName}</td>
                        <td className="px-4 py-2 text-sm text-center">
                          {p.visitCount}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {formatSecondsToHHMM(p.totalDuration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Duration Feedback */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-700">
                Duration Feedback
              </h4>
              <div className="overflow-auto border rounded-lg max-h-96">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Category
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {reportData.durationCounts.map((d) => (
                      <tr key={d.category}>
                        <td className="px-4 py-2 text-sm">{d.category}</td>
                        <td className="px-4 py-2 text-sm text-right">
                          {d.count}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-red-50 font-semibold">
                      <td className="px-4 py-2 text-sm text-red-800">
                        Improper Visit Count
                      </td>
                      <td className="px-4 py-2 text-sm text-red-800 text-right">
                        {reportData.improperVisitCount}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {reportData.improperVisits &&
                reportData.improperVisits.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h5 className="font-semibold text-red-700">
                      Improper Visit Details (Duration 0:00:00)
                    </h5>
                    <div className="overflow-auto border rounded-lg max-h-60">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-red-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase">
                              Date
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase">
                              Visitor
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase">
                              Project
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase">
                              In Time
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase">
                              Out Time
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                          {reportData.improperVisits.map((visit) => (
                            <tr key={visit.id}>
                              <td className="px-4 py-2 text-sm">
                                {formatDateToDDMMMYYYY(visit.date)}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {visit.visitorName}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {visit.projectName}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {visit.entryTime}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {visit.outTime}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>

            {/* Daily Project Log */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-700">
                Daily Project Log
              </h4>
              <div className="overflow-y-auto border rounded-lg max-h-96">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Project Name
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {reportData.dailyProjects.map((d, i) => (
                      <tr key={`${d.date}-${i}`}>
                        <td className="px-4 py-2 text-sm">{d.date}</td>
                        <td className="px-4 py-2 text-sm">{d.projectName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* No Visit Days - only show for single employee report */}
          {selectedEmployee && reportData.noVisitDays.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-700">
                No Visit Days (Sun-Thu)
              </h4>
              <div className="overflow-y-auto border rounded-lg max-h-80">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Day
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {reportData.noVisitDays.map((d) => (
                      <tr key={d.date}>
                        <td className="px-4 py-2 text-sm">
                          {formatDateToDDMMMYYYY(d.date)}
                        </td>
                        <td className="px-4 py-2 text-sm">{d.day}</td>
                        <td className="px-4 py-2 text-sm">
                          <select
                            value={d.remark}
                            onChange={(e) =>
                              handleNoVisitRemarkChange(d.date, e.target.value)
                            }
                            className="w-full p-1 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                            aria-label={`Remark for ${d.date}`}
                          >
                            <option value="">Select...</option>
                            <option value="Holiday">Holiday</option>
                            <option value="Leave">Leave</option>
                            <option value="Absent">Absent</option>
                            <option value="Day off">Day off</option>
                            <option value="Weekend">Weekend</option>
                            <option value="Not Found">Not Found</option>
                          </select>
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
        isReportGenerated && (
          <div className="text-center py-8 text-slate-500">
            No visit data found for the selected criteria.
          </div>
        )
      )}
    </div>
  );
};

export default EmployeeVisitSummary;
