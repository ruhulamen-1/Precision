import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EmployeeVisit, User, AllEmployee } from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import _ from "lodash";
import SearchableSelect from "./SearchableSelect";
import WorkingDaysModal from "./WorkingDaysModal";
import MonthlyConfigModal from "./MonthlyConfigModal";
import { DESIGNATIONS } from "../constants";
import FeedbackMessage from "./FeedbackMessage";
import ChangeIcon from "./ChangeIcon";
import { useLoading } from "../contexts/LoadingContext";
import {
  Download,
  Printer,
  FileText,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Search,
  History as HistoryIcon,
  Clock,
} from "lucide-react";
// FIX: Changed to a named import to match the export from PdfExport.tsx
import { PdfExport } from "./PdfExport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import html2canvas from "html2canvas";
import { SkeletonRow } from "./TableSkeleton";
import TableSettings from "./TableSettings";

// Define the specific designations for the Project Side group
export const PROJECT_SIDE_INVENTORY_DESIGNATIONS = new Set([
  "Assistant Project Accountant (CH)",
  "Site Accountant (CH)",
  "Assistant Project Accountant (CH) [for Inventory Management]",
]);

// --- Helper Functions ---
const parseDurationToSeconds = (durationStr: any): number => {
  if (durationStr === null || durationStr === undefined) return 0;
  if (typeof durationStr === "number") return durationStr;
  if (typeof durationStr !== "string") return 0;

  // Remove category info if present, e.g., "0:06:00 (5 - 9 min)" -> "0:06:00"
  const cleanDuration = durationStr.split("(")[0].trim();
  if (!cleanDuration) return 0;

  const parts = cleanDuration.split(":");
  if (parts.length < 2) {
    // Handle cases like "5 min" or "10" (assumed minutes if just one number)
    const val = parseInt(cleanDuration, 10);
    return isNaN(val) ? 0 : val * 60;
  }

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;

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

  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const formatStabilityValue = (value: number): string => {
  const icon = value > 0 ? "▲" : value < 0 ? "▼" : "–";
  // Cap at 1000% to avoid extreme values like -44946%
  const displayValue = Math.min(Math.max(value, -1000), 1000);
  const suffix = Math.abs(value) > 1000 ? "+" : "";
  return `${icon} ${Math.abs(displayValue).toFixed(2)}%${suffix}`;
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

/**
 * Encapsulates the business logic for determining visit durations.
 * Returns both the duration for UI display and the duration for percentage calculations.
 * @param department The employee's department.
 * @param designation The employee's designation.
 * @returns An object with durations for display and calculation.
 */
const getSupposedlyDurations = (
  department: string,
  designation: string,
  inventorySide?: string,
): SupposedlyDurations => {
  const isExempt = EXEMPT_DEPARTMENTS.has(department);

  // Rule 1: Exempt departments have a 0hr target but are measured against a 4hr baseline for stability.
  if (isExempt) {
    return { durationForDisplaySec: 0, durationForCalcSec: 4 * 3600 };
  }

  // Rule 2: Inventory Management roles
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

  // Rule 4: HR & Admin (Security) often has longer targets (7hr).
  if (department.includes("Security")) {
    return { durationForDisplaySec: 7 * 3600, durationForCalcSec: 7 * 3600 };
  }

  // Default Rule: All others have a 4hr target.
  return { durationForDisplaySec: 4 * 3600, durationForCalcSec: 4 * 3600 };
};

export interface SummaryDataRow {
  department: string;
  visitorName: string;
  designation: string;
  totalWorkingDay: number;
  totalVisitedDay: number;
  totalVisitLogs: number;
  totalVisitedProjectCount: number;
  durationCount: {
    moreThan20: number;
    tenTo19: number;
    fiveTo9: number;
    lessThan5: number;
  };
  supposedlyVisitDurationDay: string;
  supposedlyVisitDurationMonth: string;
  currentMonthActualDuration: string;
  currentMonthDurationPercentage: number;
  lastMonthActualDuration: string;
  lastMonthDurationPercentage: number;
  currentStability: number;
  lastMonthPerDayAverage: string;
  currentMonthDayAverage: string;
  averageStability: number;
  isManuallyAdded?: boolean;
}

// New interface for multi-month data (Visits / Dur(min) / Distinct Projects per month,
// totals, avg MoM % per metric, and Jan->last-month trend) — same style as the
// department-wise monthly summary table, but per employee.
interface MultiMonthDataRow {
  visitorName: string;
  department: string;
  designation: string;
  monthlyMetrics: {
    [month: string]: {
      visits: number;
      durationMin: number;
      projects: number;
    };
  };
  totalVisits: number;
  totalDurationMin: number;
  totalDistinctProjects: number;
  avgMoMVisitPct: number | null; // fraction, e.g. 0.05 = 5%
  avgMoMDurPct: number | null;
  avgMoMProjPct: number | null;
  trend: "up" | "down" | "flat";
}

// Department-wise (Excel "Dept Summary" style) row: Visits / Duration(min) / Distinct Projects per month,
// totals, average month-over-month % change, and an overall Jan->last-month trend.
interface DepartmentMonthlySummaryRow {
  department: string;
  monthly: {
    [month: string]: {
      visits: number;
      durationMin: number;
      projects: number;
    };
  };
  totalVisits: number;
  totalDurationMin: number;
  totalDistinctProjects: number;
  avgMoMVisitPct: number | null; // fraction, e.g. 0.05 = 5%
  avgMoMDurPct: number | null;
  avgMoMProjPct: number | null;
  trend: "up" | "down" | "flat";
}

interface AllDepartmentSummaryProps {
  visits: EmployeeVisit[];
  departments: string[];
  currentUser: User;
  analysisMode?: "single-month-comparison" | "multi-month";
  allEmployees?: AllEmployee[];
  attendanceData?: any[];
  isLoading?: boolean;
}

// --- Department and Designation Sorting Order ---
const departmentOrder = [
  "Construction",
  "Inventory Management",
  "Internal Audit",
  "Quality Assurance",
  "HR & Admin (Security)",
  "Planning & Design (Architectural)",
  "Electro-Mechanical",
  "Information Technology (IT)",
  "Material Quality Assurance & Purchase",
];

const designationOrderByDept: Record<string, string[]> = {
  Construction: [
    "Director",
    "AGM",
    "D.M",
    "Deputy Manager",
    "Asst. Manager",
    "Asst. Manager [for construction]",
  ],
  "Inventory Management": [
    "Deputy Manager",
    "Asst. Manager",
    "Senior Executive",
    "Site Accountant (CH)",
    "Assistant Project Accountant (CH)",
    "Assistant Project Accountant (CH) [for Inventory Management]",
  ],
  "Internal Audit": ["Deputy Manager", "Junior Executive"],
  "Quality Assurance": [
    "Manager",
    "Asst. Manager",
    "Sr. Executive",
    "Sr. Executive [Quality Assurance]",
  ],
  "HR & Admin (Security)": [
    "Sr. Manager",
    "Manager",
    "Asst. Manager",
    "Executive",
    "Security Supervisor [For HR & Admin (Security)]",
  ],
  "Planning & Design (Architectural)": [
    "Associate Architect",
    "Senior Assistant Architect",
    "Assistant Architect",
    "Junior Architect",
    "Junior Surveyor",
    "Junior Architect [for Planning & Design (Architectural)]",
  ],
  "Electro-Mechanical": [
    "AGM",
    "Senior Executive",
    "Executive",
    "Junior Executive",
    "Electrician",
    "Electrician [for Electro-Mechanical]",
  ],
  "Information Technology (IT)": [
    "Senior Executive",
    "IT Technician",
    "Intern [for Information technology]",
  ],
  "Material Quality Assurance & Purchase": [
    "Head of Procurement",
    "Manager",
    "Assistant Manager",
    "Senior Executive",
    "Executive",
    "Junior Executive",
    "Junior Executive [for Material Quality Assurance & Purchase]",
  ],
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

const AllDepartmentSummary: React.FC<AllDepartmentSummaryProps> = ({
  visits,
  departments,
  currentUser,
  analysisMode = "single-month-comparison",
  allEmployees,
  attendanceData,
  isLoading = false,
}) => {
  const permissions = getEffectivePermissions(currentUser);
  const canEditSummary = permissions?.allDepartmentSummary_saveSummary?.view ||
                         currentUser.role === 'super_admin' ||
                         currentUser.role === 'admin';
  const today = new Date();
  const latestMonthFromData = useMemo(() => {
    if (visits && visits.length > 0) {
      const latestVisit = _.maxBy(visits, (v) => v.date || "");
      if (latestVisit && latestVisit.date) {
        const dateStr = String(latestVisit.date);
        const match = dateStr.match(/^(\d{4}-\d{2})/);
        if (match) return match[1];
      }
    }
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }, [visits]);

  const departmentMap = useMemo(() => {
    const map: Record<string, string> = {};
    visits.forEach((v) => {
      if (v.visitorName && v.department)
        map[v.visitorName] = v.department;
    });
    return map;
  }, [visits]);

  // Name -> Employee ID and Employee ID -> canonical Name lookups, built
  // from the master employee list. Used for the Employee ID column in the
  // Working Day template/export/import (mirrors the same pattern used in
  // Employee Project Visit import).
  const employeeIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    (allEmployees || []).forEach((e) => {
      if (e.name) map[e.name.trim().toLowerCase()] = e.employee_id;
    });
    return map;
  }, [allEmployees]);

  const getEmployeeIdForName = (name?: string) =>
    (name && employeeIdByName[name.trim().toLowerCase()]) || "";

  const employeeById = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    (allEmployees || []).forEach((e) => {
      if (e.employee_id) {
        map[e.employee_id.trim().toLowerCase()] = { id: e.employee_id, name: e.name };
      }
    });
    return map;
  }, [allEmployees]);

  // Full master record (department, designation, etc.) by name — used to build
  // zero-value rows for employees/departments manually added to the Live
  // Analysis summary even though they have no visit records at all.
  const employeeMasterByName = useMemo(() => {
    const map: Record<string, AllEmployee> = {};
    (allEmployees || []).forEach((e) => {
      if (e.name) map[e.name.trim().toLowerCase()] = e;
    });
    return map;
  }, [allEmployees]);


  const [selectedMonth, setSelectedMonth] = useState(latestMonthFromData);
  const [customDepartmentOrder, setCustomDepartmentOrder] = useState<string[]>(
    () => {
      const saved = localStorage.getItem("customDepartmentOrder");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Map old names to new, filter out items not in current departmentOrder,
          // and append any new departments from departmentOrder.
          let mapped = parsed.map((d: string) =>
            d === "Inventory Mgt." || d === "Inventory Mgt. (Project Side)"
              ? "Inventory Management"
              : d,
          );

          // Deduplicate after mapping
          mapped = Array.from(new Set(mapped));

          // Keep only valid departments and add any missing ones
          const validMapped = mapped.filter((d: string) =>
            departmentOrder.includes(d),
          );
          const missing = departmentOrder.filter(
            (d) => !validMapped.includes(d),
          );

          return [...validMapped, ...missing];
        } catch (e) {
          return departmentOrder;
        }
      }
      return departmentOrder;
    },
  );
  const [hiddenDepartments, setHiddenDepartments] = useState<Set<string>>(
    () => {
      const saved = localStorage.getItem("hiddenDepartments");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          let mapped = parsed.map((d: string) =>
            d === "Inventory Mgt." || d === "Inventory Mgt. (Project Side)"
              ? "Inventory Management"
              : d,
          );
          return new Set(mapped);
        } catch (e) {
          return new Set();
        }
      }
      return new Set();
    },
  );
  const [hiddenEmployees, setHiddenEmployees] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("hiddenEmployees");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Employees manually added to the Live Analysis summary even though they
  // have no visit records at all (e.g. a new joiner or an employee/department
  // that hasn't been recorded yet). Keyed by month ("YYYY-MM") -> employee
  // names, so an addition only affects the month it was added for.
  const [manuallyAddedEmployees, setManuallyAddedEmployees] = useState<
    Record<string, string[]>
  >(() => {
    const saved = localStorage.getItem("manuallyAddedEmployees");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [addEmployeeSearch, setAddEmployeeSearch] = useState("");
  const [addEmployeeSelection, setAddEmployeeSelection] = useState<
    Set<string>
  >(new Set());

  const fetchWorkingDays = async (
    month: string,
    isLastMonth: boolean = false,
  ) => {
    try {
      const resp = await fetch(`/api/working-days?month=${month}`);
      if (resp.ok) {
        const data = await resp.json();
        const wdMap = Object.fromEntries(
          data.map((d: any) => [d.visitorName, d.working_days]),
        );
        if (isLastMonth) {
          setLastMonthWorkingDays(wdMap);
        } else {
          setWorkingDays(wdMap);
        }
      }
    } catch (e) {
      console.error(`Error fetching working days for ${month}`, e);
    }
  };

  const [employeeSortOrder, setEmployeeSortOrder] = useState<
    Record<string, string[]>
  >(() => {
    const saved = localStorage.getItem("employeeSortOrder");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const result: Record<string, string[]> = {};
        for (const key in parsed) {
          const mappedKey =
            key === "Inventory Mgt." || key === "Inventory Mgt. (Project Side)"
              ? "Inventory Management"
              : key;
          if (result[mappedKey]) {
            result[mappedKey] = Array.from(
              new Set([...result[mappedKey], ...parsed[key]]),
            );
          } else {
            result[mappedKey] = parsed[key];
          }
        }
        return result;
      } catch (e) {
        return {};
      }
    }
    return {};
  });
  // Race condition fix: track when server prefs have been applied
  // so save-effects don't re-write stale localStorage values back to the server
  const prefsLoadedFromServer = React.useRef(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<"sorting" | "targets">("sorting");
  const [reorderingDeptEmployees, setReorderingDeptEmployees] = useState<
    string | null
  >(null);
  const [employeeModalSearch, setEmployeeModalSearch] = useState("");

  // Save preferences to localStorage and server
  // Debounced: rapid successive changes (e.g. dragging employees) only trigger
  // one network request per key, 400ms after the last change.
  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveSettingToServer = (key: string, value: string) => {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
      } catch (e) {
        console.error(`Failed to save ${key} to server`, e);
      }
    }, 400);
  };

  useEffect(() => {
    if (!prefsLoadedFromServer.current) return;
    const val = JSON.stringify(customDepartmentOrder);
    localStorage.setItem("customDepartmentOrder", val);
    saveSettingToServer("customDepartmentOrder", val);
  }, [customDepartmentOrder]);

  useEffect(() => {
    if (!prefsLoadedFromServer.current) return;
    const val = JSON.stringify(Array.from(hiddenDepartments));
    localStorage.setItem("hiddenDepartments", val);
    saveSettingToServer("hiddenDepartments", val);
  }, [hiddenDepartments]);

  useEffect(() => {
    if (!prefsLoadedFromServer.current) return;
    const val = JSON.stringify(Array.from(hiddenEmployees));
    localStorage.setItem("hiddenEmployees", val);
    saveSettingToServer("hiddenEmployees", val);
  }, [hiddenEmployees]);

  useEffect(() => {
    if (!prefsLoadedFromServer.current) return;
    const val = JSON.stringify(employeeSortOrder);
    localStorage.setItem("employeeSortOrder", val);
    saveSettingToServer("employeeSortOrder", val);
  }, [employeeSortOrder]);

  useEffect(() => {
    if (!prefsLoadedFromServer.current) return;
    const val = JSON.stringify(manuallyAddedEmployees);
    localStorage.setItem("manuallyAddedEmployees", val);
    saveSettingToServer("manuallyAddedEmployees", val);
  }, [manuallyAddedEmployees]);

  // State for multi-month mode
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date(latestMonthFromData);
    d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [endMonth, setEndMonth] = useState(latestMonthFromData);
  const [rangeError, setRangeError] = useState("");

  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [workingDays, setWorkingDays] = useState<Record<string, number>>({});
  const [lastMonthWorkingDays, setLastMonthWorkingDays] = useState<
    Record<string, number>
  >({});
  const [inventoryConfig, setInventoryConfig] = useState<
    Record<string, string>
  >({});
  const [isWorkingDaysModalOpen, setIsWorkingDaysModalOpen] = useState(false);
  const [isMonthlyConfigModalOpen, setIsMonthlyConfigModalOpen] =
    useState(false);
  const [allMonthlyConfigs, setAllMonthlyConfigs] = useState<
    Record<string, any>
  >({});
  const [modalMonth, setModalMonth] = useState(selectedMonth);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Visibility states for config sections
  const [showDefaultWdSection, setShowDefaultWdSection] = useState(() => {
    return localStorage.getItem("showDefaultWdSection") !== "false";
  });
  const [showIndividualWdSection, setShowIndividualWdSection] = useState(() => {
    return localStorage.getItem("showIndividualWdSection") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("showDefaultWdSection", String(showDefaultWdSection));
  }, [showDefaultWdSection]);

  useEffect(() => {
    localStorage.setItem(
      "showIndividualWdSection",
      String(showIndividualWdSection),
    );
  }, [showIndividualWdSection]);

  const getLastMonth = (monthYear: string) => {
    const [year, month] = monthYear.split("-").map(Number);
    let m = month === 1 ? 12 : month - 1;
    let y = month === 1 ? year - 1 : year;
    return `${y}-${String(m).padStart(2, "0")}`;
  };

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

  const fetchAllMonthlyConfigs = async () => {
    try {
      const resp = await fetch("/api/all-monthly-configs");
      if (resp.ok) {
        const data = await resp.json();
        const configMap = Object.fromEntries(
          data.map((c: any) => [c.month_year, c]),
        );
        setAllMonthlyConfigs(configMap);
      }
    } catch (e) {
      console.error("Error fetching all monthly configs", e);
    }
  };

  const fetchAppSettings = async (month: string) => {
    try {
      const lastMonth = getLastMonth(month);
      const [
        wdResp,
        wdLastResp,
        settingsResp,
        inventoryResp,
        allConfigsResp,
        configResp,
        configLastResp
      ] = await Promise.all([
        fetch(`/api/working-days?month=${month}`),
        fetch(`/api/working-days?month=${lastMonth}`),
        fetch("/api/settings"),
        fetch("/api/inventory-config"),
        fetch("/api/all-monthly-configs"),
        fetch(`/api/monthly-config?month=${month}`),
        fetch(`/api/monthly-config?month=${lastMonth}`),
      ]);

      // Process working days
      if (wdResp.ok) {
        const data = await wdResp.json();
        const wdMap = Object.fromEntries(
          data.map((d: any) => [d.visitorName, d.working_days]),
        );
        setWorkingDays(wdMap);
      }

      // Process last month working days
      if (wdLastResp.ok) {
        const data = await wdLastResp.json();
        const wdMap = Object.fromEntries(
          data.map((d: any) => [d.visitorName, d.working_days]),
        );
        setLastMonthWorkingDays(wdMap);
      }

      // Process inventory config
      if (inventoryResp.ok) {
        const data = await inventoryResp.json();
        const configMap = Object.fromEntries(
          data.map((c: any) => [c.visitorName, c.side]),
        );
        setInventoryConfig(configMap);
      }

      // Process all monthly configs
      if (allConfigsResp.ok) {
        const data = await allConfigsResp.json();
        const configMap = Object.fromEntries(
          data.map((c: any) => [c.month_year, c]),
        );
        setAllMonthlyConfigs(configMap);
      }

      // Process current month config
      if (configResp.ok) {
        const data = await configResp.json();
        setDefaultCurrentWorkingDays(data.default_wd !== null && data.default_wd !== undefined ? String(data.default_wd) : "25");
        setSecurityCurrentWorkingDays(data.security_wd !== null && data.security_wd !== undefined ? String(data.security_wd) : "");
        setOfficeCurrentWorkingDays(data.office_wd !== null && data.office_wd !== undefined ? String(data.office_wd) : "");
      }

      // Process last month config
      if (configLastResp.ok) {
        const dataLast = await configLastResp.json();
        setDefaultLastWorkingDays(dataLast.default_wd !== null && dataLast.default_wd !== undefined ? String(dataLast.default_wd) : "25");
        setSecurityLastWorkingDays(dataLast.security_wd !== null && dataLast.security_wd !== undefined ? String(dataLast.security_wd) : "");
        setOfficeLastWorkingDays(dataLast.office_wd !== null && dataLast.office_wd !== undefined ? String(dataLast.office_wd) : "");
      }

      // Process app settings
      if (settingsResp.ok) {
        const settings = await settingsResp.json();
        if (settings.customDepartmentOrder) {
          try {
            let parsed = JSON.parse(settings.customDepartmentOrder);
            let mapped = parsed.map((d: string) =>
              d === "Inventory Mgt." || d === "Inventory Mgt. (Project Side)"
                ? "Inventory Management"
                : d,
            );
            mapped = Array.from(new Set(mapped));
            const validMapped = mapped.filter((d: string) =>
              departmentOrder.includes(d),
            );
            const missing = departmentOrder.filter(
              (d) => !validMapped.includes(d),
            );
            setCustomDepartmentOrder([...validMapped, ...missing]);
          } catch (e) {}
        }
        if (settings.hiddenDepartments) {
          try {
            const parsed = JSON.parse(settings.hiddenDepartments);
            let mapped = parsed.map((d: string) =>
              d === "Inventory Mgt." || d === "Inventory Mgt. (Project Side)"
                ? "Inventory Management"
                : d,
            );
            setHiddenDepartments(new Set(mapped));
          } catch (e) {}
        }
        if (settings.hiddenEmployees) {
          try {
            setHiddenEmployees(new Set(JSON.parse(settings.hiddenEmployees)));
          } catch (e) {}
        }
        if (settings.employeeSortOrder) {
          try {
            const parsed = JSON.parse(settings.employeeSortOrder);
            const result: Record<string, string[]> = {};
            for (const key in parsed) {
              const mappedKey =
                key === "Inventory Mgt." ||
                key === "Inventory Mgt. (Project Side)"
                  ? "Inventory Management"
                  : key;
              if (result[mappedKey]) {
                result[mappedKey] = Array.from(
                  new Set([...result[mappedKey], ...parsed[key]]),
                );
              } else {
                result[mappedKey] = parsed[key];
              }
            }
            setEmployeeSortOrder(result);
          } catch (e) {}
        }
        if (settings.customDurations) {
          try {
            setCustomDurations(JSON.parse(settings.customDurations));
          } catch (e) {}
        }
        if (settings.manuallyAddedEmployees) {
          try {
            setManuallyAddedEmployees(
              JSON.parse(settings.manuallyAddedEmployees),
            );
          } catch (e) {}
        }
      }
      // Mark server prefs as loaded so save-effects can now persist user changes
      prefsLoadedFromServer.current = true;
    } catch (e) {
      // Even on error, unblock saves so user changes aren't silently dropped
      prefsLoadedFromServer.current = true;
      console.error("Error fetching settings", e);
    }
  };

  const saveMonthlySetting = async (month: string) => {
    const payload = {
      month_year: month,
      default_wd: parseInt(defaultCurrentWorkingDays) || 25,
      security_wd: parseInt(securityCurrentWorkingDays) || 0,
      office_wd: parseInt(officeCurrentWorkingDays) || 0,
    };
    await fetch("/api/monthly-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await fetchAppSettings(month);
  };

  useEffect(() => {
    fetchAppSettings(selectedMonth);
  }, [selectedMonth]);

  const [customDurations, setCustomDurations] = useState<
    Record<string, string>
  >({});
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // State for configurable working days
  const [defaultCurrentWorkingDays, setDefaultCurrentWorkingDays] =
    useState("25");
  const [defaultLastWorkingDays, setDefaultLastWorkingDays] = useState("26");
  const [securityCurrentWorkingDays, setSecurityCurrentWorkingDays] =
    useState("");
  const [securityLastWorkingDays, setSecurityLastWorkingDays] = useState("");
  const [officeCurrentWorkingDays, setOfficeCurrentWorkingDays] = useState("");
  const [officeLastWorkingDays, setOfficeLastWorkingDays] = useState("");

  const [reportNotes, setReportNotes] = useState<string[]>([]);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState<string[]>([]);

  // Saved Summaries State
  const [analysisSubTab, setAnalysisSubTab] = useState<"live" | "saved">(
    "live",
  );
  const [savedSummaries, setSavedSummaries] = useState<any[]>([]);
  const [savedMonthFilter, setSavedMonthFilter] = useState(latestMonthFromData);
  const [editingSummaryId, setEditingSummaryId] = useState<number | null>(null);
  const [editSummaryData, setEditSummaryData] = useState<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (analysisSubTab === "saved") {
      fetchSavedSummaries(savedMonthFilter);
    }
  }, [analysisSubTab, savedMonthFilter]);

  const fetchSavedSummaries = async (month: string) => {
    showLoading();
    try {
      const response = await fetch(`/api/department-summaries?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        setSavedSummaries(data);
      }
    } catch (error) {
      console.error("Error fetching saved summaries:", error);
    } finally {
      hideLoading();
    }
  };

  const handleSaveSummaryToDB = async () => {
    if (summaryData.length === 0) {
      alert("No data to save.");
      return;
    }
    if (
      !window.confirm(
        `Save current summary for ${selectedMonth} to database? This will overwrite existing data for this month if any.`,
      )
    )
      return;

    showLoading();
    try {
      const response = await fetch("/api/department-summaries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          data: summaryData,
        }),
      });
      if (response.ok) {
        setFeedback({
          message: "Summary saved to database successfully.",
          type: "success",
        });
      } else {
        setFeedback({ message: "Failed to save summary.", type: "error" });
      }
    } catch (error) {
      console.error("Error saving summary:", error);
      setFeedback({ message: "Error connecting to database.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  const handleDeleteSavedSummary = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this summary record?"))
      return;
    showLoading();
    try {
      const response = await fetch(`/api/department-summaries/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSavedSummaries((prev) => prev.filter((s) => s.id !== id));
        setFeedback({ message: "Record deleted.", type: "success" });
      }
    } catch (error) {
      console.error(error);
    } finally {
      hideLoading();
    }
  };

  const handleUpdateSavedSummary = async (id: number) => {
    showLoading();
    try {
      const response = await fetch(`/api/department-summaries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSummaryData),
      });
      if (response.ok) {
        setSavedSummaries((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...editSummaryData } : s)),
        );
        setEditingSummaryId(null);
        setFeedback({ message: "Record updated.", type: "success" });
      }
    } catch (error) {
      console.error(error);
    } finally {
      hideLoading();
    }
  };

  const containerRef_old = useRef<HTMLDivElement>(null);
  const contentToPrintRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const workingDayFileInputRef = useRef<HTMLInputElement>(null);
  const lastMonthWorkingDayFileInputRef = useRef<HTMLInputElement>(null);
  const { showLoading, hideLoading } = useLoading();

  // --- STICKY HEADER POSITIONING CONSTANTS ---
  const THEAD_HEIGHT = 53;
  const DEPT_HEADER_HEIGHT = 49;
  const SUMMARY_ROW_HEIGHT = 52;
  const SUBGROUP_HEADER_HEIGHT = 41;
  const topForDeptHeader = THEAD_HEIGHT;
  const topForSummaryRow = topForDeptHeader + DEPT_HEADER_HEIGHT;
  const topForSubgroupHeader = topForSummaryRow + SUMMARY_ROW_HEIGHT;

  const { departmentOrderMap, designationOrderMaps } = useMemo(() => {
    const deptMap = new Map(
      customDepartmentOrder.map((dept, index) => [dept, index]),
    );
    const desigMaps = Object.fromEntries(
      Object.entries(designationOrderByDept).map(([dept, designations]) => [
        dept,
        new Map(designations.map((desig, index) => [desig, index])),
      ]),
    );
    return { departmentOrderMap: deptMap, designationOrderMaps: desigMaps };
  }, [customDepartmentOrder]);

  useEffect(() => {
    setSelectedMonth(latestMonthFromData);
  }, [latestMonthFromData]);

  useEffect(() => {
    if (analysisMode !== "multi-month") return;
    const months = getMonthsInRange(startMonth, endMonth);
    if (months.length > 6) {
      setRangeError("The date range cannot exceed 6 months.");
    } else if (startMonth > endMonth) {
      setRangeError("Start month cannot be after end month.");
    } else {
      setRangeError("");
    }
  }, [startMonth, endMonth, analysisMode]);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const response = await fetch("/api/report-notes");
        if (response.ok) {
          const data = await response.json();
          setReportNotes(data);
        }
      } catch (error) {
        console.error("Error fetching report notes:", error);
      }
    };
    fetchNotes();
  }, []);

  const handleSaveNotes = async () => {
    try {
      const response = await fetch("/api/report-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: tempNotes }),
      });

      if (response.ok) {
        setReportNotes(tempNotes);
        setIsEditingNotes(false);
        setFeedback({
          message: "Important notes updated successfully.",
          type: "success",
        });
      } else {
        setFeedback({
          message: "Failed to update important notes.",
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error saving notes:", error);
      setFeedback({
        message: "An error occurred while saving notes.",
        type: "error",
      });
    }
  };

  const handleStartEditingNotes = () => {
    setTempNotes([...reportNotes]);
    setIsEditingNotes(true);
  };

  const handleNoteChange = (index: number, value: string) => {
    const newNotes = [...tempNotes];
    newNotes[index] = value;
    setTempNotes(newNotes);
  };

  const handleRemoveNote = (index: number) => {
    setTempNotes(tempNotes.filter((_, i) => i !== index));
  };

  const handleAddNote = () => {
    setTempNotes([...tempNotes, ""]);
  };

  const { currentMonthName, lastMonthName } = useMemo(() => {
    if (!selectedMonth)
      return { currentMonthName: "Current", lastMonthName: "Last" };
    const [year, month] = selectedMonth.split("-").map(Number);
    if (isNaN(year) || isNaN(month))
      return { currentMonthName: "Current", lastMonthName: "Last" };

    try {
      const current = new Date(year, month - 1, 1);
      const last = new Date(year, month - 2, 1);
      const nameFormat = { month: "short" as const };
      return {
        currentMonthName: current.toLocaleString("en-US", nameFormat),
        lastMonthName: last.toLocaleString("en-US", nameFormat),
      };
    } catch (e) {
      return { currentMonthName: "Current", lastMonthName: "Last" };
    }
  }, [selectedMonth]);

  // --- Full Screen Logic ---
  const handleToggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        alert(
          `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
        );
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleMoveDept = (index: number, direction: "up" | "down") => {
    const newOrder = [...customDepartmentOrder];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newOrder.length) return;
    [newOrder[index], newOrder[newIndex]] = [
      newOrder[newIndex],
      newOrder[index],
    ];
    setCustomDepartmentOrder(newOrder);
  };

  const toggleDepartmentVisibility = (dept: string) => {
    setHiddenDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const toggleEmployeeVisibility = (employeeName: string) => {
    setHiddenEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(employeeName)) next.delete(employeeName);
      else next.add(employeeName);
      return next;
    });
  };

  const handleUpdateInventorySide = async (
    visitorName: string,
    side: string,
  ) => {
    try {
      const resp = await fetch("/api/inventory-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorName, side }),
      });
      if (resp.ok) {
        setInventoryConfig((prev) => ({ ...prev, [visitorName]: side }));
        setFeedback({
          message: `Updated ${visitorName} to ${side}`,
          type: "success",
        });
      }
    } catch (e) {
      setFeedback({
        message: "Failed to update inventory configuration",
        type: "error",
      });
    }
  };

  const handleMoveEmployee = (
    dept: string,
    index: number,
    direction: "up" | "down",
  ) => {
    setEmployeeSortOrder((prev) => {
      // Use full summaryData (not filteredData) so employees hidden by an active
      // department/employee filter don't get dropped from the sort order.
      const baseData = analysisMode === "multi-month" ? multiMonthSummaryData : summaryData;
      const currentOrder =
        prev[dept] ||
        _.uniq(
          baseData
            .filter((d) => d.department === dept)
            .map((d) => d.visitorName),
        );
      const newOrder = [...currentOrder];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= newOrder.length) return prev;
      [newOrder[index], newOrder[newIndex]] = [
        newOrder[newIndex],
        newOrder[index],
      ];
      return { ...prev, [dept]: newOrder };
    });
  };

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullScreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, []);

  const handleWorkingDaysChange = (employeeName: string, days: string) => {
    const numDays = parseInt(days, 10);
    if (days === "") {
      setWorkingDays((prev) => {
        const newState = { ...prev };
        delete newState[employeeName];
        return newState;
      });
    } else if (!isNaN(numDays) && numDays >= 0 && numDays <= 31) {
      setWorkingDays((prev) => ({ ...prev, [employeeName]: numDays }));
    }
  };

  const handleCustomDurationChange = (department: string, hours: string) => {
    // Allow empty string, numbers, and a single decimal point.
    if (hours === "" || /^[0-9]*\.?[0-9]*$/.test(hours)) {
      setCustomDurations((prev) => ({ ...prev, [department]: hours }));
    }
  };

  const handleSaveCustomDurations = async () => {
    try {
      await saveSettingToServer(
        "customDurations",
        JSON.stringify(customDurations),
      );
      setFeedback({
        message: "Target durations updated successfully.",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      setFeedback({
        message: "Failed to update target durations.",
        type: "error",
      });
    }
  };

  const dataDateRange = useMemo(() => {
    if (!visits || visits.length === 0) return null;
    const sorted = _.orderBy(visits, ["date"], ["asc"]);
    return {
      start: sorted[0].date,
      end: sorted[sorted.length - 1].date,
      count: visits.length,
    };
  }, [visits]);

  // Existing summaryData logic for single-month-comparison
  const summaryData = useMemo<SummaryDataRow[]>(() => {
    if (analysisMode !== "single-month-comparison") return [];

    const [year, month] = selectedMonth.split("-").map(Number); // month is 1-based

    let lastMonthYear = month === 1 ? year - 1 : year;
    let lastMonth = month === 1 ? 12 : month - 1;
    let lastMonthStr = `${lastMonthYear}-${String(lastMonth).padStart(2, "0")}`;

    const currentVisits = visits.filter((v) => {
      if (!v.date) return false;
      const d = String(v.date);
      // More resilient matching: check if it starts with YYYY-MM or contains it
      return (
        d.startsWith(selectedMonth) ||
        (d.includes("-") &&
          d.split("-")[0] === String(year) &&
          d.split("-")[1] === String(month).padStart(2, "0"))
      );
    });

    // Debug logging for the user to help identify why values might be 0
    if (currentVisits.length === 0 && visits.length > 0) {
      console.warn(
        `AllDepartmentSummary: No visits found for selected month ${selectedMonth}.`,
      );
      console.log(
        `Available date range: ${dataDateRange?.start} to ${dataDateRange?.end}`,
      );
    }

    const lastMonthVisits = visits.filter((v) => {
      if (!v.date) return false;
      const d = String(v.date);
      return (
        d.startsWith(lastMonthStr) ||
        (d.includes("-") &&
          d.split("-")[0] === String(lastMonthYear) &&
          d.split("-")[1] === String(lastMonth).padStart(2, "0"))
      );
    });

    // Group visits before mapping for O(1) lookups
    const visitsByEmployee = _.groupBy(visits, 
      (v) => (v.visitorName || "").trim()
    );
    const currentVisitsByEmployee = _.groupBy(currentVisits,
      (v) => (v.visitorName || "").trim()
    );
    const lastMonthVisitsByEmployee = _.groupBy(lastMonthVisits,
      (v) => (v.visitorName || "").trim()
    );

    // Names manually added for this month even though they have no visit
    // records at all — these are merged in below and rendered with zero stats.
    const manualNamesForMonth = (
      manuallyAddedEmployees[selectedMonth] || []
    ).filter(Boolean);
    const manualNamesSet = new Set(manualNamesForMonth);

    const employeeNamesWithVisits = _.uniq([
      ...visits.map((v) => (v.visitorName || "").trim()),
      ...manualNamesForMonth,
    ]).filter(Boolean);

    const numDefaultCurrentWD = parseInt(defaultCurrentWorkingDays, 10) || 0;
    const numDefaultLastWD = parseInt(defaultLastWorkingDays, 10) || 0;
    const numSecurityCurrentWD = parseInt(securityCurrentWorkingDays, 10);
    const numSecurityLastWD = parseInt(securityLastWorkingDays, 10);
    const numOfficeCurrentWD = parseInt(officeCurrentWorkingDays, 10);
    const numOfficeLastWD = parseInt(officeLastWorkingDays, 10);

    const calculatedData = employeeNamesWithVisits
      .map((employeeName) => {
        const allVisitsForEmployee = visitsByEmployee[employeeName] || [];
        const isManuallyAdded =
          allVisitsForEmployee.length === 0 && manualNamesSet.has(employeeName);
        if (allVisitsForEmployee.length === 0 && !isManuallyAdded) return null;

        const employeeVisits = currentVisitsByEmployee[employeeName] || [];
        const employeeLastMonthVisits = lastMonthVisitsByEmployee[employeeName] || [];

        const firstVisit = allVisitsForEmployee[0];
        let department: string;
        let designation: string;
        if (firstVisit) {
          ({ department, designation } = firstVisit);
        } else {
          // Manually added, no visit records at all — pull dept/designation
          // from the employee master list instead.
          const master = employeeMasterByName[employeeName.trim().toLowerCase()];
          department = master?.department || "Unassigned";
          designation = master?.designation || "";
        }
        if (department === "Inventory Mgt." || department === "Inventory Mgt. (Project Side)") {
          department = "Inventory Management";
        }
        // Legacy records may still have the old plain name saved before the
        // canonical department list was updated to "Information Technology (IT)".
        // Normalize so old and new records group together instead of splitting.
        if (department === "Information Technology") {
          department = "Information Technology (IT)";
        }

        let customDurationInput = customDurations[department];
        if (department === "Inventory Management") {
          const configSide = inventoryConfig[employeeName] || (
            PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(designation) ? "Project Side" : "Head Office"
          );
          if (configSide === "Project Side") {
            customDurationInput = customDurations["Inventory Management (Project Side)"] !== undefined && customDurations["Inventory Management (Project Side)"].trim() !== ""
              ? customDurations["Inventory Management (Project Side)"]
              : customDurations[department];
          } else {
            customDurationInput = customDurations["Inventory Management (Head Office)"] !== undefined && customDurations["Inventory Management (Head Office)"].trim() !== ""
              ? customDurations["Inventory Management (Head Office)"]
              : customDurations[department];
          }
        }

        let { durationForDisplaySec, durationForCalcSec } =
          getSupposedlyDurations(
            department,
            designation,
            inventoryConfig[employeeName],
          );

        if (
          customDurationInput !== undefined &&
          customDurationInput.trim() !== ""
        ) {
          const customHours = parseFloat(customDurationInput);
          if (!isNaN(customHours) && customHours >= 0) {
            durationForDisplaySec = customHours * 3600;
            if (customHours === 0) {
              durationForCalcSec = 4 * 3600;
            } else {
              durationForCalcSec = customHours * 3600;
            }
          }
        }

        const isSecurity = department.toLowerCase().includes("security");

        // Standard working days for current month from config
        let currentStandardWD: number;
        if (isSecurity) {
          currentStandardWD =
            !isNaN(numSecurityCurrentWD) && numSecurityCurrentWD > 0
              ? numSecurityCurrentWD
              : numDefaultCurrentWD > 0
                ? numDefaultCurrentWD
                : 25;
        } else {
          currentStandardWD =
            !isNaN(numOfficeCurrentWD) && numOfficeCurrentWD > 0
              ? numOfficeCurrentWD
              : numDefaultCurrentWD > 0
                ? numDefaultCurrentWD
                : 25;
        }

        // Standard working days for last month from config
        let lastStandardWD: number;
        if (isSecurity) {
          lastStandardWD =
            !isNaN(numSecurityLastWD) && numSecurityLastWD > 0
              ? numSecurityLastWD
              : numDefaultLastWD > 0
                ? numDefaultLastWD
                : 25;
        } else {
          lastStandardWD =
            !isNaN(numOfficeLastWD) && numOfficeLastWD > 0
              ? numOfficeLastWD
              : numDefaultLastWD > 0
                ? numDefaultLastWD
                : 25;
        }

        // For display and actual percentage, we can still show imported days if available
        let wd = workingDays[employeeName] || currentStandardWD;
        let lastWd = lastMonthWorkingDays[employeeName] || lastStandardWD;

        // FOR AVERAGE CALCULATION: Always use the standard configured days to ensure consistency
        const currentMonthAvgDivisor = currentStandardWD;
        const lastMonthAvgDivisor = lastStandardWD;

        const totalVisitedDay = _.uniqBy(employeeVisits, "date").length;
        const totalVisitLogs = employeeVisits.length;
        const totalVisitedProjectCount = _.uniqBy(
          employeeVisits,
          "projectName",
        ).length;

        const currentMonthActualDurationSec = _.sumBy(employeeVisits, (v) =>
          parseDurationToSeconds(v.duration),
        );
        const supposedlyDurationMonthSec = wd * durationForDisplaySec;

        const supposedlyDurationMonthSec_forCalc = wd * durationForCalcSec;
        const currentMonthDurationPercentage =
          supposedlyDurationMonthSec_forCalc > 0
            ? (currentMonthActualDurationSec /
                supposedlyDurationMonthSec_forCalc) *
              100
            : 0;

        const durationCount = {
          moreThan20: employeeVisits.filter(
            (v) => parseDurationToSeconds(v.duration) >= 1200,
          ).length,
          tenTo19: employeeVisits.filter((v) => {
            const s = parseDurationToSeconds(v.duration);
            return s >= 600 && s < 1200;
          }).length,
          fiveTo9: employeeVisits.filter((v) => {
            const s = parseDurationToSeconds(v.duration);
            return s >= 300 && s < 600;
          }).length,
          lessThan5: employeeVisits.filter(
            (v) => parseDurationToSeconds(v.duration) < 300,
          ).length,
        };

        const lastMonthActualDurationSec = _.sumBy(
          employeeLastMonthVisits,
          (v) => parseDurationToSeconds(v.duration),
        );
        const lastMonthSupposedlyDurationMonthSec_forCalc =
          lastWd * durationForCalcSec;
        const lastMonthDurationPercentage =
          lastMonthSupposedlyDurationMonthSec_forCalc > 0
            ? (lastMonthActualDurationSec /
                lastMonthSupposedlyDurationMonthSec_forCalc) *
              100
            : 0;

        const currentMonthDayAverageSec =
          currentMonthAvgDivisor > 0
            ? currentMonthActualDurationSec / currentMonthAvgDivisor
            : 0;
        const lastMonthPerDayAverageSec =
          lastMonthAvgDivisor > 0
            ? lastMonthActualDurationSec / lastMonthAvgDivisor
            : 0;

        const currentStability =
          currentMonthDurationPercentage - lastMonthDurationPercentage;

        let averageStabilityPercentage = 0;
        const minBaselineSec = 60; // Minimum 1 minute baseline to avoid division by near-zero

        if (lastMonthPerDayAverageSec >= minBaselineSec) {
          averageStabilityPercentage =
            ((currentMonthDayAverageSec - lastMonthPerDayAverageSec) /
              lastMonthPerDayAverageSec) *
            100;
        } else if (
          lastMonthPerDayAverageSec < minBaselineSec &&
          currentMonthDayAverageSec >= minBaselineSec
        ) {
          averageStabilityPercentage = 100.0;
        } else {
          averageStabilityPercentage = 0;
        }

        return {
          department: department,
          visitorName: employeeName,
          designation: designation,
          totalWorkingDay: wd,
          totalVisitedDay,
          totalVisitLogs,
          totalVisitedProjectCount,
          durationCount,
          supposedlyVisitDurationDay: formatSecondsToHHMM(
            durationForDisplaySec,
          ),
          supposedlyVisitDurationMonth: formatSecondsToHHMM(
            supposedlyDurationMonthSec,
          ),
          currentMonthActualDuration: formatSecondsToHHMM(
            currentMonthActualDurationSec,
          ),
          currentMonthDurationPercentage,
          lastMonthActualDuration: formatSecondsToHHMM(
            lastMonthActualDurationSec,
          ),
          lastMonthDurationPercentage,
          currentStability,
          lastMonthPerDayAverage: formatSecondsToHHMM(
            lastMonthPerDayAverageSec,
          ),
          currentMonthDayAverage: formatSecondsToHHMM(
            currentMonthDayAverageSec,
          ),
          averageStability: averageStabilityPercentage,
          isManuallyAdded,
        };
      })
      .filter((item): item is SummaryDataRow => item !== null);
    return calculatedData;
  }, [
    selectedMonth,
    visits,
    workingDays,
    lastMonthWorkingDays,
    defaultCurrentWorkingDays,
    defaultLastWorkingDays,
    securityCurrentWorkingDays,
    securityLastWorkingDays,
    officeCurrentWorkingDays,
    officeLastWorkingDays,
    customDurations,
    analysisMode,
    inventoryConfig,
    manuallyAddedEmployees,
    employeeMasterByName,
  ]);

  // New memo for multi-month data
  const multiMonthSummaryData = useMemo<MultiMonthDataRow[]>(() => {
    if (analysisMode !== "multi-month" || rangeError) return [];

    const months = getMonthsInRange(startMonth, endMonth);
    const employeeNames = _.uniq(visits.map((v) => v.visitorName));

    // Group by visitorName for O(1) lookup
    const visitsByName = _.groupBy(visits, "visitorName");

    const momAverage = (series: number[]): number | null => {
      const changes: number[] = [];
      for (let i = 1; i < series.length; i++) {
        const prev = series[i - 1];
        const curr = series[i];
        if (prev > 0) {
          changes.push((curr - prev) / prev);
        }
      }
      return changes.length > 0 ? _.mean(changes) : null;
    };

    return employeeNames
      .map((name) => {
        const allVisitsForEmployee = visitsByName[name] || [];
        if (allVisitsForEmployee.length === 0) return null;

        let { department, designation } = allVisitsForEmployee[0];
        if (department === "Inventory Mgt." || department === "Inventory Mgt. (Project Side)") {
          department = "Inventory Management";
        }
        // Legacy records may still have the old plain name saved before the
        // canonical department list was updated to "Information Technology (IT)".
        // Normalize so old and new records group together instead of splitting.
        if (department === "Information Technology") {
          department = "Information Technology (IT)";
        }

        const monthlyMetrics: MultiMonthDataRow["monthlyMetrics"] = {};
        const visitSeries: number[] = [];
        const durationSeries: number[] = [];
        const projectSeries: number[] = [];

        months.forEach((monthStr) => {
          const visitsInMonth = allVisitsForEmployee.filter((v) =>
            v.date.startsWith(monthStr),
          );
          const visitsCount = visitsInMonth.length;
          const durationSec = _.sumBy(visitsInMonth, (v) =>
            parseDurationToSeconds(v.duration),
          );
          const durationMin = Math.round((durationSec / 60) * 10) / 10;
          const distinctProjects = new Set(
            visitsInMonth.map((v) => v.projectName),
          ).size;

          monthlyMetrics[monthStr] = {
            visits: visitsCount,
            durationMin,
            projects: distinctProjects,
          };
          visitSeries.push(visitsCount);
          durationSeries.push(durationMin);
          projectSeries.push(distinctProjects);
        });

        const totalVisits = _.sum(visitSeries);
        const totalDurationMin = Math.round(_.sum(durationSeries) * 10) / 10;
        const visitsInRange = allVisitsForEmployee.filter((v) =>
          months.some((m) => v.date.startsWith(m)),
        );
        const totalDistinctProjects = new Set(
          visitsInRange.map((v) => v.projectName),
        ).size;

        const firstVisits = visitSeries[0] ?? 0;
        const lastVisits = visitSeries[visitSeries.length - 1] ?? 0;
        const trend: MultiMonthDataRow["trend"] =
          lastVisits > firstVisits ? "up" : lastVisits < firstVisits ? "down" : "flat";

        return {
          visitorName: name,
          department,
          designation,
          monthlyMetrics,
          totalVisits,
          totalDurationMin,
          totalDistinctProjects,
          avgMoMVisitPct: momAverage(visitSeries),
          avgMoMDurPct: momAverage(durationSeries),
          avgMoMProjPct: momAverage(projectSeries),
          trend,
        };
      })
      .filter((item): item is MultiMonthDataRow => item !== null);
  }, [startMonth, endMonth, rangeError, visits, analysisMode]);

  // Department-wise monthly summary (Visits / Dur(min) / Distinct Projects per month,
  // totals, avg MoM % per metric, and Jan->last-month trend) — mirrors the Excel "Dept Summary" sheet.
  const departmentMonthlySummaryData = useMemo<DepartmentMonthlySummaryRow[]>(() => {
    if (analysisMode !== "multi-month" || rangeError) return [];

    const months = getMonthsInRange(startMonth, endMonth);

    const normalizeDept = (dept: string) => {
      if (dept === "Inventory Mgt." || dept === "Inventory Mgt. (Project Side)") {
        return "Inventory Management";
      }
      if (dept === "Information Technology") {
        return "Information Technology (IT)";
      }
      return dept;
    };

    const visitsByDept = _.groupBy(visits, (v) => normalizeDept(v.department));

    const momAverage = (series: number[]): number | null => {
      const changes: number[] = [];
      for (let i = 1; i < series.length; i++) {
        const prev = series[i - 1];
        const curr = series[i];
        if (prev > 0) {
          changes.push((curr - prev) / prev);
        }
      }
      return changes.length > 0 ? _.mean(changes) : null;
    };

    return (Object.entries(visitsByDept) as [string, typeof visits][]).map(([department, deptVisits]) => {
      const monthly: DepartmentMonthlySummaryRow["monthly"] = {};
      const visitSeries: number[] = [];
      const durationSeries: number[] = [];
      const projectSeries: number[] = [];

      months.forEach((monthStr) => {
        const visitsInMonth = deptVisits.filter((v) => v.date.startsWith(monthStr));
        const visitsCount = visitsInMonth.length;
        const durationSec = _.sumBy(visitsInMonth, (v) => parseDurationToSeconds(v.duration));
        const durationMin = Math.round((durationSec / 60) * 10) / 10;
        const distinctProjects = new Set(visitsInMonth.map((v) => v.projectName)).size;

        monthly[monthStr] = { visits: visitsCount, durationMin, projects: distinctProjects };
        visitSeries.push(visitsCount);
        durationSeries.push(durationMin);
        projectSeries.push(distinctProjects);
      });

      const totalVisits = _.sum(visitSeries);
      const totalDurationMin = Math.round(_.sum(durationSeries) * 10) / 10;
      const visitsInRange = deptVisits.filter((v) =>
        months.some((m) => v.date.startsWith(m)),
      );
      const totalDistinctProjects = new Set(
        visitsInRange.map((v) => v.projectName),
      ).size;

      const firstVisits = visitSeries[0] ?? 0;
      const lastVisits = visitSeries[visitSeries.length - 1] ?? 0;
      const trend: DepartmentMonthlySummaryRow["trend"] =
        lastVisits > firstVisits ? "up" : lastVisits < firstVisits ? "down" : "flat";

      return {
        department,
        monthly,
        totalVisits,
        totalDurationMin,
        totalDistinctProjects,
        avgMoMVisitPct: momAverage(visitSeries),
        avgMoMDurPct: momAverage(durationSeries),
        avgMoMProjPct: momAverage(projectSeries),
        trend,
      };
    });
  }, [analysisMode, rangeError, startMonth, endMonth, visits]);

  const sortedDepartmentMonthlySummary = useMemo(() => {
    return departmentMonthlySummaryData
      .filter((row) => !hiddenDepartments.has(row.department))
      .filter((row) => !departmentFilter || row.department === departmentFilter)
      .sort((a, b) => {
        const orderA = departmentOrderMap.get(a.department) ?? Infinity;
        const orderB = departmentOrderMap.get(b.department) ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        return a.department.localeCompare(b.department);
      });
  }, [departmentMonthlySummaryData, hiddenDepartments, departmentFilter, departmentOrderMap]);

  const departmentNamesForFilter = useMemo(() => {
    return _.uniq(summaryData.map((row) => row.department)).sort();
  }, [summaryData]);

  const employeeNamesForFilter = useMemo(() => {
    let relevantData = summaryData;
    if (departmentFilter) {
      relevantData = summaryData.filter(
        (row) => row.department === departmentFilter,
      );
    }
    return _.uniq(relevantData.map((row) => row.visitorName)).sort();
  }, [summaryData, departmentFilter]);

  const filteredData = useMemo(() => {
    const dataToFilter =
      analysisMode === "multi-month" ? multiMonthSummaryData : summaryData;

    return dataToFilter
      .filter((row) => {
        if (hiddenDepartments.has(row.department)) return false;
        if (hiddenEmployees.has(row.visitorName)) return false;
        if (departmentFilter && row.department !== departmentFilter)
          return false;
        if (employeeFilter && row.visitorName !== employeeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const deptOrderA = departmentOrderMap.get(a.department) ?? Infinity;
        const deptOrderB = departmentOrderMap.get(b.department) ?? Infinity;

        if (deptOrderA !== deptOrderB) return deptOrderA - deptOrderB;

        // Custom Employee Ordering
        const customEmpOrder = employeeSortOrder[a.department];
        if (customEmpOrder) {
          const indexA = customEmpOrder.indexOf(a.visitorName);
          const indexB = customEmpOrder.indexOf(b.visitorName);

          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
        }

        const desigOrderMap =
          designationOrderMaps[
            a.department as keyof typeof designationOrderMaps
          ];
        if (desigOrderMap) {
          const desigOrderA = desigOrderMap.get(a.designation) ?? Infinity;
          const desigOrderB = desigOrderMap.get(b.designation) ?? Infinity;
          if (desigOrderA !== desigOrderB) return desigOrderA - desigOrderB;
        }
        return a.visitorName.localeCompare(b.visitorName);
      });
  }, [
    summaryData,
    multiMonthSummaryData,
    departmentFilter,
    employeeFilter,
    departmentOrderMap,
    designationOrderMaps,
    analysisMode,
    hiddenDepartments,
    hiddenEmployees,
    employeeSortOrder,
  ]);

  const groupedData = useMemo(() => {
    const grouped = new Map<string, any[]>();
    const orderedDepts = _.uniq(filteredData.map((d) => d.department));

    orderedDepts.forEach((deptName) => {
      const employeesInDept = filteredData.filter(
        (row) => row.department === deptName,
      );
      if (employeesInDept.length > 0) {
        grouped.set(deptName, employeesInDept);
      }
    });
    return grouped;
  }, [filteredData]);

  const monthsForHeader = useMemo(() => {
    if (analysisMode !== "multi-month" || rangeError) return [];
    return getMonthsInRange(startMonth, endMonth);
  }, [startMonth, endMonth, rangeError, analysisMode]);

  const handleDepartmentFilterChange = (value: string) => {
    const filterValue = value === "All Departments" ? "" : value;
    setDepartmentFilter(filterValue);
    setEmployeeFilter(""); // Reset employee filter when department changes
  };

  const handleEmployeeFilterChange = (value: string) => {
    const filterValue = value === "All Employees" ? "" : value;
    setEmployeeFilter(filterValue);
  };

  // Active employees from the master list who have zero visit records at
  // all (in any month) and haven't already been manually added for the
  // selected month — candidates for "+ Add Employee".
  const missingEmployeesForMonth = useMemo(() => {
    const namesWithVisits = new Set(
      visits.map((v) => (v.visitorName || "").trim()).filter(Boolean),
    );
    const alreadyManuallyAdded = new Set(
      manuallyAddedEmployees[selectedMonth] || [],
    );
    return (allEmployees || [])
      .filter((e) => e.is_active !== false && !!e.name)
      .filter(
        (e) =>
          !namesWithVisits.has(e.name.trim()) &&
          !alreadyManuallyAdded.has(e.name.trim()),
      )
      .sort(
        (a, b) =>
          a.department.localeCompare(b.department) ||
          a.name.localeCompare(b.name),
      );
  }, [allEmployees, visits, manuallyAddedEmployees, selectedMonth]);

  const missingEmployeesByDept = useMemo(() => {
    const term = addEmployeeSearch.trim().toLowerCase();
    const filtered = term
      ? missingEmployeesForMonth.filter(
          (e) =>
            e.name.toLowerCase().includes(term) ||
            e.department.toLowerCase().includes(term),
        )
      : missingEmployeesForMonth;
    return _.groupBy(filtered, "department") as Record<string, AllEmployee[]>;
  }, [missingEmployeesForMonth, addEmployeeSearch]);

  const toggleAddEmployeeSelection = (name: string) => {
    setAddEmployeeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAddDepartmentSelection = (deptEmployees: AllEmployee[]) => {
    setAddEmployeeSelection((prev) => {
      const next = new Set(prev);
      const allSelected = deptEmployees.every((e) => next.has(e.name));
      deptEmployees.forEach((e) => {
        if (allSelected) next.delete(e.name);
        else next.add(e.name);
      });
      return next;
    });
  };

  const handleConfirmAddEmployees = () => {
    if (addEmployeeSelection.size === 0) {
      setShowAddEmployeeModal(false);
      return;
    }
    setManuallyAddedEmployees((prev) => {
      const existing = prev[selectedMonth] || [];
      const merged = Array.from(
        new Set([...existing, ...Array.from(addEmployeeSelection)]),
      );
      return { ...prev, [selectedMonth]: merged };
    });
    setFeedback({
      message: `${addEmployeeSelection.size} employee(s) added to the summary for ${selectedMonth}.`,
      type: "info",
    });
    setAddEmployeeSelection(new Set());
    setAddEmployeeSearch("");
    setShowAddEmployeeModal(false);
  };

  const handleRemoveManualEmployee = (name: string) => {
    setManuallyAddedEmployees((prev) => {
      const existing = prev[selectedMonth] || [];
      return { ...prev, [selectedMonth]: existing.filter((n) => n !== name) };
    });
  };

  const handleDownloadWDTemplate = (isLastMonth: boolean) => {
    if (typeof window.Papa === "undefined") {
      setFeedback({ message: "CSV library is not available.", type: "error" });
      return;
    }
    const headers = [
      "Visitor Name",
      "Employee ID",
      "Department",
      "Designation",
      "Working Day",
    ];
    const exampleData = summaryData.map((d) => [
      d.visitorName,
      getEmployeeIdForName(d.visitorName),
      d.department,
      d.designation,
      isLastMonth ? defaultLastWorkingDays : d.totalWorkingDay,
    ]);

    const csv = window.Papa.unparse({ fields: headers, data: exampleData });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const fileName = isLastMonth
      ? `last_month_working_day_template.csv`
      : `working_day_template.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleWorkingDayFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    isLastMonth: boolean,
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
      complete: async (results: any) => {
        const requiredHeaders = ["Visitor Name", "Working Day"];
        const headers = results.meta.fields;

        if (!requiredHeaders.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              'CSV must contain "Visitor Name" and "Working Day" headers.',
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const newWorkingDays: Record<string, number> = {};
        let errorOccurred = false;
        let nameCorrectedCount = 0;
        const employeeNameSet = new Set(summaryData.map((d) => d.visitorName));

        for (const [index, row] of results.data.entries()) {
          if (errorOccurred) break;

          const typedName = row["Visitor Name"];
          const workingDayStr = row["Working Day"];

          if (!typedName || !workingDayStr) {
            setFeedback({
              message: `Row ${index + 2}: Missing Visitor Name or Working Day.`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }

          // If the row's Employee ID matches a known employee, trust that
          // ID and resolve to the employee's official name — this way a
          // typo'd or extra-spaced "Visitor Name" still matches correctly.
          const csvEmployeeId = (row["Employee ID"] || "").trim();
          const matchedById = csvEmployeeId ? employeeById[csvEmployeeId.toLowerCase()] : undefined;
          let visitorName = typedName.trim();
          if (matchedById) {
            if (matchedById.name.trim().toLowerCase() !== visitorName.toLowerCase()) {
              nameCorrectedCount++;
            }
            visitorName = matchedById.name;
          }

          if (!employeeNameSet.has(visitorName)) {
            continue; // Silently skip names not in the current summary
          }

          const workingDay = parseInt(workingDayStr, 10);
          if (isNaN(workingDay) || workingDay < 0 || workingDay > 31) {
            setFeedback({
              message: `Row ${index + 2}: Invalid Working Day "${workingDayStr}". Must be a number between 0 and 31.`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }

          newWorkingDays[visitorName] = workingDay;
        }

        if (!errorOccurred) {
          // Save to server
          const monthToSave = isLastMonth
            ? getLastMonth(selectedMonth)
            : selectedMonth;
          for (const [visitorName, wd] of Object.entries(newWorkingDays)) {
            await fetch("/api/working-days", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                visitorName,
                month_year: monthToSave,
                working_days: wd,
              }),
            });
          }

          // Refresh local state
          fetchWorkingDays(selectedMonth);
          setFeedback({
            message: `Successfully updated ${isLastMonth ? "last month" : "current month"} working days.${nameCorrectedCount > 0 ? ` (${nameCorrectedCount} name(s) auto-corrected via Employee ID.)` : ""}`,
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

    if (event.target) event.target.value = ""; // Reset file input
  };

  const handleExportCSV = () => {
    if (typeof window.Papa === "undefined" && !Papa) {
      alert("CSV Export library is not available.");
      return;
    }

    const headers = [
      "SL. No",
      "Visitor Name",
      "Department",
      "Designation",
      "Total Work Day",
      "Total Visit Day",
      "Total Projects",
      "Visit Count",
      ">20m",
      "10-19m",
      "5-9m",
      "<5m",
      "Supposedly Dur/Day",
      "Supposedly Dur/Month",
      "Current Actual Duration",
      "Current %",
      "Last Month Actual",
      "Last M %",
      "Stability %",
      `${lastMonthName} Avg/Day`,
      `${currentMonthName} Avg/Day`,
      "Avg Stability %",
    ];

    const data = filteredData.map((row, index) => {
      const isExempt =
        (row as SummaryDataRow).supposedlyVisitDurationDay === "00:00";
      const r = row as SummaryDataRow;
      return [
        index + 1,
        r.visitorName,
        r.department,
        r.designation,
        r.totalWorkingDay,
        r.totalVisitedDay,
        r.totalVisitedProjectCount,
        r.totalVisitLogs,
        r.durationCount.moreThan20,
        r.durationCount.tenTo19,
        r.durationCount.fiveTo9,
        r.durationCount.lessThan5,
        r.supposedlyVisitDurationDay,
        r.supposedlyVisitDurationMonth,
        r.currentMonthActualDuration,
        isExempt
          ? r.currentMonthActualDuration
          : `${r.currentMonthDurationPercentage.toFixed(2)}%`,
        r.lastMonthActualDuration,
        isExempt
          ? r.lastMonthActualDuration
          : `${r.lastMonthDurationPercentage.toFixed(2)}%`,
        formatStabilityValue(r.currentStability), // Added icons and formatting
        r.lastMonthPerDayAverage,
        r.currentMonthDayAverage,
        formatStabilityValue(r.averageStability), // Added icons and formatting
      ];
    });

    const csv = (window.Papa || Papa).unparse({ fields: headers, data });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `department_summary_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const headers = [
      "SL. No",
      "Visitor Name",
      "Department",
      "Designation",
      "Total Work Day",
      "Total Visit Day",
      "Total Visit Count",
      "Total Projects",
      ">20m",
      "10-19m",
      "5-9m",
      "<5m",
      "Target Dur/Day",
      "Target Dur/Month",
      "Current Actual Duration",
      "Current %",
      "Last Month Actual",
      "Last M %",
      "Stability %",
      `${lastMonthName} Avg/Day`,
      `${currentMonthName} Avg/Day`,
      "Avg Stability %",
    ];

    const data = filteredData.map((row, index) => {
      const isExempt =
        (row as SummaryDataRow).supposedlyVisitDurationDay === "00:00";
      const r = row as SummaryDataRow;
      return {
        "SL. No": index + 1,
        "Visitor Name": r.visitorName,
        Department: r.department,
        Designation: r.designation,
        "Total Work Day": r.totalWorkingDay,
        "Total Visit Day": r.totalVisitedDay,
        "Total Visit Count": r.totalVisitLogs,
        "Total Projects": r.totalVisitedProjectCount,
        ">20m": r.durationCount.moreThan20,
        "10-19m": r.durationCount.tenTo19,
        "5-9m": r.durationCount.fiveTo9,
        "<5m": r.durationCount.lessThan5,
        "Target Dur/Day": r.supposedlyVisitDurationDay,
        "Target Dur/Month": r.supposedlyVisitDurationMonth,
        "Current Actual Duration": r.currentMonthActualDuration,
        "Current %": isExempt
          ? r.currentMonthActualDuration
          : `${r.currentMonthDurationPercentage.toFixed(2)}%`,
        "Last Month Actual": r.lastMonthActualDuration,
        "Last M %": isExempt
          ? r.lastMonthActualDuration
          : `${r.lastMonthDurationPercentage.toFixed(2)}%`,
        "Stability %": formatStabilityValue(r.currentStability),
        [`${lastMonthName} Avg/Day`]: r.lastMonthPerDayAverage,
        [`${currentMonthName} Avg/Day`]: r.currentMonthDayAverage,
        "Avg Stability %": formatStabilityValue(r.averageStability),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Summary");

    // Auto-size columns
    const maxWidths = headers.map((h) => {
      let max = h.length;
      data.forEach((row) => {
        const val = String((row as any)[h] || "");
        if (val.length > max) max = val.length;
      });
      return { wch: max + 2 };
    });
    worksheet["!cols"] = maxWidths;

    XLSX.writeFile(workbook, `department_summary_${selectedMonth}.xlsx`);
  };

  const handlePrintView = () => {
    window.print();
  };

  const handleSaveViewAsPdf = async () => {
    const printableArea = contentToPrintRef.current;
    if (!printableArea) {
      setFeedback({ message: "Content to print not found.", type: "error" });
      return;
    }

    const scrollableContainer = printableArea.querySelector(
      ".overflow-auto",
    ) as HTMLElement | null;
    if (!scrollableContainer) {
      setFeedback({
        message: "Could not find the table container to export.",
        type: "error",
      });
      return;
    }

    showLoading();
    const originalMaxHeight = scrollableContainer.style.maxHeight;

    try {
      // Temporarily remove height restrictions for full content capture
      scrollableContainer.style.maxHeight = "none";

      const canvas = await html2canvas(printableArea, {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      // Restore original height immediately after capture
      scrollableContainer.style.maxHeight = originalMaxHeight;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "legal",
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft > 0) {
        position = -(pdfHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      pdf.save(`department_summary_view_${selectedMonth}.pdf`);
    } catch (error) {
      console.error("Error generating view PDF:", error);
      setFeedback({
        message: "An error occurred while generating the PDF.",
        type: "error",
      });
    } finally {
      // Ensure style is always restored
      scrollableContainer.style.maxHeight = originalMaxHeight;
      hideLoading();
    }
  };

  // --- Multi-month (Department + Employee) export helpers ---
  const getMultiMonthExportData = () => {
    const monthCols = monthsForHeader.map((month) => {
      const [year, monthNum] = month.split("-");
      const monthName = new Date(
        Number(year),
        Number(monthNum) - 1,
        1,
      ).toLocaleString("en-US", { month: "short" });
      return { key: month, label: `${monthName} '${year.slice(2)}` };
    });

    const pctText = (pct: number | null) => {
      if (pct === null) return "n/a";
      const val = pct * 100;
      const sign = val > 0 ? "+" : "";
      return `${sign}${val.toFixed(1)}%`;
    };

    const trendText = (trend: "up" | "down" | "flat") =>
      trend === "up" ? "Up" : trend === "down" ? "Down" : "Flat";

    const deptHeader = [
      "SL",
      "Department",
      ...monthCols.flatMap((m) => [
        `${m.label} Visits`,
        `${m.label} Dur(min)`,
        `${m.label} Projects`,
      ]),
      "Total Visits",
      "Total Dur(min)",
      "Total Distinct Projects",
      "Avg MoM Visit %",
      "Avg MoM Dur %",
      "Avg MoM Proj %",
      "Trend (First→Last)",
    ];

    const deptRows = sortedDepartmentMonthlySummary.map((row, idx) => [
      idx + 1,
      row.department,
      ...monthCols.flatMap((m) => {
        const metric = row.monthly[m.key] || {
          visits: 0,
          durationMin: 0,
          projects: 0,
        };
        return [metric.visits, metric.durationMin, metric.projects];
      }),
      row.totalVisits,
      row.totalDurationMin,
      row.totalDistinctProjects,
      pctText(row.avgMoMVisitPct),
      pctText(row.avgMoMDurPct),
      pctText(row.avgMoMProjPct),
      trendText(row.trend),
    ]);

    const employeeHeader = [
      "SL",
      "Visitor Name",
      "Department",
      "Designation",
      ...monthCols.flatMap((m) => [
        `${m.label} Visits`,
        `${m.label} Dur(min)`,
        `${m.label} Projects`,
      ]),
      "Total Visits",
      "Total Dur(min)",
      "Total Distinct Projects",
      "Avg MoM Visit %",
      "Avg MoM Dur %",
      "Avg MoM Proj %",
      "Trend (First→Last)",
    ];

    const employeeRows = (filteredData as MultiMonthDataRow[]).map(
      (row, idx) => [
        idx + 1,
        row.visitorName,
        row.department,
        row.designation,
        ...monthCols.flatMap((m) => {
          const metric = row.monthlyMetrics[m.key] || {
            visits: 0,
            durationMin: 0,
            projects: 0,
          };
          return [metric.visits, metric.durationMin, metric.projects];
        }),
        row.totalVisits,
        row.totalDurationMin,
        row.totalDistinctProjects,
        pctText(row.avgMoMVisitPct),
        pctText(row.avgMoMDurPct),
        pctText(row.avgMoMProjPct),
        trendText(row.trend),
      ],
    );

    return { deptHeader, deptRows, employeeHeader, employeeRows };
  };

  const handleExportMultiMonthExcel = () => {
    const { deptHeader, deptRows, employeeHeader, employeeRows } =
      getMultiMonthExportData();

    const workbook = XLSX.utils.book_new();

    const deptSheet = XLSX.utils.aoa_to_sheet([deptHeader, ...deptRows]);
    deptSheet["!cols"] = deptHeader.map((h) => ({
      wch: Math.max(String(h).length, 12),
    }));
    XLSX.utils.book_append_sheet(workbook, deptSheet, "Dept Summary");

    const empSheet = XLSX.utils.aoa_to_sheet([
      employeeHeader,
      ...employeeRows,
    ]);
    empSheet["!cols"] = employeeHeader.map((h) => ({
      wch: Math.max(String(h).length, 12),
    }));
    XLSX.utils.book_append_sheet(workbook, empSheet, "Employee Summary");

    XLSX.writeFile(
      workbook,
      `monthly_comparison_precision_${startMonth}_to_${endMonth}.xlsx`,
    );
  };

  const handleExportMultiMonthPdf = () => {
    const { deptHeader, deptRows, employeeHeader, employeeRows } =
      getMultiMonthExportData();

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
    });

    doc.setFontSize(12);
    doc.text(
      `Department-wise Monthly Summary (${startMonth} to ${endMonth})`,
      10,
      10,
    );
    autoTable(doc as any, {
      head: [deptHeader],
      body: deptRows,
      startY: 14,
      theme: "grid",
      styles: { fontSize: 6, cellPadding: 1, overflow: "linebreak" },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: 255,
        halign: "center",
        fontSize: 6,
      },
      bodyStyles: { halign: "center" },
      margin: { left: 8, right: 8 },
    });

    doc.addPage();
    doc.setFontSize(12);
    doc.text(
      `Employee-wise Monthly Summary (${startMonth} to ${endMonth})`,
      10,
      10,
    );
    autoTable(doc as any, {
      head: [employeeHeader],
      body: employeeRows,
      startY: 14,
      theme: "grid",
      styles: { fontSize: 6, cellPadding: 1, overflow: "linebreak" },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: 255,
        halign: "center",
        fontSize: 6,
      },
      bodyStyles: { halign: "center" },
      columnStyles: { 1: { halign: "left" }, 2: { halign: "left" } },
      margin: { left: 8, right: 8 },
    });

    doc.save(
      `monthly_comparison_precision_${startMonth}_to_${endMonth}.pdf`,
    );
  };

  // --- RENDER LOGIC ---

  const renderMultiMonthFilters = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 no-print">
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
      <div className="lg:col-span-2">
        <SearchableSelect
          id="dept-filter-multi"
          label="Department"
          options={[
            "All Departments",
            ..._.uniq(multiMonthSummaryData.map((r) => r.department)).sort(),
          ]}
          value={departmentFilter}
          onChange={handleDepartmentFilterChange}
          placeholder="Filter departments..."
        />
      </div>
      {rangeError && (
        <div className="md:col-span-4 text-center text-red-600 bg-red-50 p-2 rounded-md">
          {rangeError}
        </div>
      )}
    </div>
  );

  const renderSingleMonthFilters = () => (
    <div className="space-y-4 mb-4 no-print">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="month-select-dept"
            className="block text-sm font-medium text-slate-700"
          >
            Select Month
          </label>
          <input
            type="month"
            id="month-select-dept"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div>
          <SearchableSelect
            id="dept-filter-dept"
            label="Department"
            options={["All Departments", ...departmentNamesForFilter]}
            value={departmentFilter}
            onChange={handleDepartmentFilterChange}
            placeholder="Type to filter departments..."
          />
        </div>
        <div>
          <SearchableSelect
            id="employee-filter-dept"
            label="Employee"
            options={["All Employees", ...employeeNamesForFilter]}
            value={employeeFilter}
            onChange={handleEmployeeFilterChange}
            placeholder="Type to filter employees..."
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-4 mb-2 no-print">
        <button
          onClick={() => { setSettingsActiveTab("sorting"); setShowSettingsPage(true); }}
          className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
          </svg>
          Custom Sorting & Visibility
        </button>
        <button
          onClick={() => { setSettingsActiveTab("targets"); setShowSettingsPage(true); }}
          className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <Clock size={16} />
          Department Target/Day
        </button>
        {analysisSubTab === "live" && (
          <button
            onClick={() => {
              setAddEmployeeSearch("");
              setAddEmployeeSelection(new Set());
              setShowAddEmployeeModal(true);
            }}
            className="px-4 py-2 bg-orange-600 text-white rounded-md text-sm font-semibold hover:bg-orange-700 transition-colors shadow-sm flex items-center gap-2"
            title="Add an employee or department with no visit records into this month's summary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            Add Employee / Department
          </button>
        )}
        {(manuallyAddedEmployees[selectedMonth] || []).length > 0 && (
          <span className="text-xs text-orange-600 italic">
            ({(manuallyAddedEmployees[selectedMonth] || []).length} manually
            added for {selectedMonth})
          </span>
        )}
        {(hiddenDepartments.size > 0 || hiddenEmployees.size > 0) && (
          <span className="text-xs text-slate-500 italic">
            ({hiddenDepartments.size > 0 && `${hiddenDepartments.size} depts`}
            {hiddenDepartments.size > 0 && hiddenEmployees.size > 0 && ", "}
            {hiddenEmployees.size > 0 &&
              `${hiddenEmployees.size} employees`}{" "}
            excluded)
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-white rounded-md bg-white/40 backdrop-blur-md transition-all duration-200 shadow-sm">
          <button
            onClick={() => setShowDefaultWdSection(!showDefaultWdSection)}
            className="w-full flex items-center justify-between p-3 border-b border-transparent hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <h4 className="text-sm font-semibold text-slate-700">
                Default & Office Working Days
              </h4>
            </div>
            {showDefaultWdSection ? (
              <ChevronUp size={16} className="text-slate-500" />
            ) : (
              <ChevronDown size={16} className="text-slate-500" />
            )}
          </button>
          {showDefaultWdSection && (
            <div className="p-3 space-y-2">
              <div className="flex gap-2 items-center mb-2 justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase">
                  Monthly Configs
                </h4>
                <button
                  onClick={() => setIsMonthlyConfigModalOpen(true)}
                  className="text-[10px] px-2 py-0.5 border rounded-md bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                >
                  <HistoryIcon size={10} /> View History
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <label
                    htmlFor="default-wd-current"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Default WD ({currentMonthName})
                  </label>
                  <input
                    type="number"
                    id="default-wd-current"
                    value={defaultCurrentWorkingDays}
                    onChange={(e) =>
                      setDefaultCurrentWorkingDays(e.target.value)
                    }
                    onBlur={() => saveMonthlySetting(selectedMonth)}
                    min="0"
                    max="31"
                    className="mt-1 block w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="security-wd-current"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Security WD ({currentMonthName})
                  </label>
                  <input
                    type="number"
                    id="security-wd-current"
                    value={securityCurrentWorkingDays}
                    onChange={(e) =>
                      setSecurityCurrentWorkingDays(e.target.value)
                    }
                    onBlur={() => saveMonthlySetting(selectedMonth)}
                    min="0"
                    max="31"
                    placeholder="Optional"
                    className="mt-1 block w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="office-wd-current"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Office Day ({currentMonthName})
                  </label>
                  <input
                    type="number"
                    id="office-wd-current"
                    value={officeCurrentWorkingDays}
                    onChange={(e) =>
                      setOfficeCurrentWorkingDays(e.target.value)
                    }
                    onBlur={() => saveMonthlySetting(selectedMonth)}
                    min="0"
                    max="31"
                    placeholder="Optional"
                    className="mt-1 block w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                  />
                </div>
                <div className="flex items-end pb-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await saveMonthlySetting(selectedMonth);
                      setFeedback({
                        message: "Default & office working days configuration updated and saved successfully!",
                        type: "success",
                      });
                    }}
                    className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save Days
                  </button>
                </div>
                <div className="pt-4 border-t mt-2 col-span-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Previous Month Data Reference ({lastMonthName})
                  </p>
                  <div className="grid grid-cols-3 gap-2 bg-slate-100 p-2 rounded">
                    <div>
                      <p className="text-[10px] text-slate-500">Def WD</p>
                      <p className="text-xs font-semibold">
                        {defaultLastWorkingDays || "25"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Sec WD</p>
                      <p className="text-xs font-semibold">
                        {securityLastWorkingDays || "0"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Off WD</p>
                      <p className="text-xs font-semibold">
                        {officeLastWorkingDays || "0"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="border border-white rounded-md bg-white/40 backdrop-blur-md transition-all duration-200 shadow-sm">
          <button
            onClick={() => setShowIndividualWdSection(!showIndividualWdSection)}
            className="w-full flex items-center justify-between p-3 border-b border-transparent hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <h4 className="text-sm font-semibold text-slate-700">
                Individual Working Days (Import)
              </h4>
            </div>
            {showIndividualWdSection ? (
              <ChevronUp size={16} className="text-slate-500" />
            ) : (
              <ChevronDown size={16} className="text-slate-500" />
            )}
          </button>
          {showIndividualWdSection && (
            <div className="p-3 space-y-2">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => {
                    setModalMonth(selectedMonth);
                    setIsWorkingDaysModalOpen(true);
                  }}
                  className="block w-full text-xs px-2 py-1 border rounded-md bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100"
                >
                  Current Month
                </button>
                <button
                  onClick={() => {
                    setModalMonth(getLastMonth(selectedMonth));
                    setIsWorkingDaysModalOpen(true);
                  }}
                  className="block w-full text-xs px-2 py-1 border rounded-md bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100"
                >
                  Last Month
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">
                    Current Month
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownloadWDTemplate(false)}
                      className="flex-1 text-xs px-2 py-1 border rounded-md bg-white"
                    >
                      Template
                    </button>
                    <label
                      htmlFor="wd-csv-upload"
                      className="flex-1 text-xs px-2 py-1 border rounded-md bg-white cursor-pointer text-center"
                    >
                      Import
                    </label>
                    <input
                      id="wd-csv-upload"
                      type="file"
                      ref={workingDayFileInputRef}
                      onChange={(e) => handleWorkingDayFileUpload(e, false)}
                      className="sr-only"
                      accept=".csv"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">
                    Last Month
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownloadWDTemplate(true)}
                      className="flex-1 text-xs px-2 py-1 border rounded-md bg-white"
                    >
                      Template
                    </button>
                    <label
                      htmlFor="wd-csv-upload-last"
                      className="flex-1 text-xs px-2 py-1 border rounded-md bg-white cursor-pointer text-center"
                    >
                      Import
                    </label>
                    <input
                      id="wd-csv-upload-last"
                      type="file"
                      ref={lastMonthWorkingDayFileInputRef}
                      onChange={(e) => handleWorkingDayFileUpload(e, true)}
                      className="sr-only"
                      accept=".csv"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="security-wd-current"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Security WD ({currentMonthName})
                  </label>
                  <input
                    type="number"
                    id="security-wd-current"
                    value={securityCurrentWorkingDays}
                    onChange={(e) =>
                      setSecurityCurrentWorkingDays(e.target.value)
                    }
                    min="0"
                    max="31"
                    placeholder="Optional"
                    className="mt-1 block w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="security-wd-last"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Security WD ({lastMonthName})
                  </label>
                  <input
                    type="number"
                    id="security-wd-last"
                    value={securityLastWorkingDays}
                    onChange={(e) => setSecurityLastWorkingDays(e.target.value)}
                    min="0"
                    max="31"
                    placeholder="Optional"
                    className="mt-1 block w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderDepartmentMonthlySummaryTable = () => {
    if (sortedDepartmentMonthlySummary.length === 0) return null;

    const renderMoMCell = (pct: number | null) =>
      pct === null ? (
        <span className="text-slate-400">n/a</span>
      ) : (
        <ChangeIcon value={formatStabilityValue(pct * 100)} />
      );

    const trendBadge = (trend: DepartmentMonthlySummaryRow["trend"]) => {
      if (trend === "up")
        return <span className="text-green-600 font-bold">▲ Up</span>;
      if (trend === "down")
        return <span className="text-red-600 font-bold">▼ Down</span>;
      return <span className="text-slate-500 font-semibold">→ Flat</span>;
    };

    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-slate-800 mb-2">
          Department-wise Monthly Summary
        </h3>
        <div className="overflow-auto border rounded-lg max-h-[70vh]">
          <table className="min-w-full text-xs border-collapse">
            <thead className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 bg-slate-50/80 backdrop-blur-md p-2 border border-slate-300 align-middle w-10 text-center"
                >
                  SL
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-10 bg-slate-50/80 backdrop-blur-md p-2 border border-slate-300 align-middle w-48"
                >
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
                      colSpan={3}
                      className="p-2 border border-slate-300 text-center"
                    >{`${monthName} '${year.slice(2)}`}</th>
                  );
                })}
                <th colSpan={3} className="p-2 border border-slate-300 text-center">
                  Total
                </th>
                <th colSpan={3} className="p-2 border border-slate-300 text-center">
                  Avg MoM %
                </th>
                <th
                  rowSpan={2}
                  className="p-2 border border-slate-300 align-middle text-center"
                >
                  Trend (First→Last)
                </th>
              </tr>
              <tr>
                {monthsForHeader.map((month) => (
                  <React.Fragment key={`${month}-dept-sub`}>
                    <th className="p-2 border border-slate-300 text-center">
                      Visits
                    </th>
                    <th className="p-2 border border-slate-300 text-center">
                      Dur(min)
                    </th>
                    <th className="p-2 border border-slate-300 text-center">
                      Proj.
                    </th>
                  </React.Fragment>
                ))}
                <th className="p-2 border border-slate-300 text-center">Visits</th>
                <th className="p-2 border border-slate-300 text-center">Dur(min)</th>
                <th className="p-2 border border-slate-300 text-center">Proj.</th>
                <th className="p-2 border border-slate-300 text-center">Visit</th>
                <th className="p-2 border border-slate-300 text-center">Dur</th>
                <th className="p-2 border border-slate-300 text-center">Proj</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {sortedDepartmentMonthlySummary.map((row, idx) => (
                <tr key={row.department} className="hover:bg-slate-50">
                  <td className="sticky left-0 bg-white hover:bg-slate-50 p-2 border border-slate-300 text-center">
                    {idx + 1}
                  </td>
                  <td className="sticky left-10 bg-white hover:bg-slate-50 p-2 border border-slate-300 whitespace-nowrap font-semibold">
                    {row.department}
                  </td>
                  {monthsForHeader.map((month) => {
                    const m = row.monthly[month] || {
                      visits: 0,
                      durationMin: 0,
                      projects: 0,
                    };
                    return (
                      <React.Fragment key={`${month}-${row.department}`}>
                        <td className="p-2 border border-slate-300 text-center">
                          {m.visits}
                        </td>
                        <td className="p-2 border border-slate-300 text-center">
                          {m.durationMin.toFixed(1)}
                        </td>
                        <td className="p-2 border border-slate-300 text-center">
                          {m.projects}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="p-2 border border-slate-300 text-center font-semibold">
                    {row.totalVisits}
                  </td>
                  <td className="p-2 border border-slate-300 text-center font-semibold">
                    {row.totalDurationMin.toFixed(1)}
                  </td>
                  <td className="p-2 border border-slate-300 text-center font-semibold">
                    {row.totalDistinctProjects}
                  </td>
                  <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                    {renderMoMCell(row.avgMoMVisitPct)}
                  </td>
                  <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                    {renderMoMCell(row.avgMoMDurPct)}
                  </td>
                  <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                    {renderMoMCell(row.avgMoMProjPct)}
                  </td>
                  <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                    {trendBadge(row.trend)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const EMPLOYEE_MULTI_MONTH_COLS = 2 + monthsForHeader.length * 3 + 3 + 3 + 1;

  const renderMultiMonthTable = () => (
    <div ref={contentToPrintRef} className="printable-area">
      <div
        className={`overflow-auto border rounded-lg ${isFullScreen ? "h-[calc(100vh-200px)]" : "max-h-[70vh]"}`}
      >
        <table className="min-w-full text-xs border-collapse">
          <thead
            ref={theadRef}
            className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-20 shadow-sm"
          >
            <tr>
              <th
                className="sticky left-0 bg-slate-50/80 backdrop-blur-md p-2 border border-slate-300 align-middle w-12 text-center"
                rowSpan={2}
              >
                SL
              </th>
              <th
                className="sticky left-12 bg-slate-50/80 backdrop-blur-md p-2 border border-slate-300 align-middle w-48"
                rowSpan={2}
              >
                Visitor Name
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
                    colSpan={3}
                    className="p-2 border border-slate-300 text-center"
                  >{`${monthName} '${year.slice(2)}`}</th>
                );
              })}
              <th colSpan={3} className="p-2 border border-slate-300 text-center">
                Total
              </th>
              <th colSpan={3} className="p-2 border border-slate-300 text-center">
                Avg MoM %
              </th>
              <th
                className="p-2 border border-slate-300 align-middle text-center"
                rowSpan={2}
              >
                Trend (First→Last)
              </th>
            </tr>
            <tr>
              {monthsForHeader.map((month) => (
                <React.Fragment key={`${month}-sub`}>
                  <th className="p-2 border border-slate-300 align-middle text-center">
                    Visits
                  </th>
                  <th className="p-2 border border-slate-300 align-middle text-center">
                    Dur(min)
                  </th>
                  <th className="p-2 border border-slate-300 align-middle text-center">
                    Proj.
                  </th>
                </React.Fragment>
              ))}
              <th className="p-2 border border-slate-300 align-middle text-center">
                Visits
              </th>
              <th className="p-2 border border-slate-300 align-middle text-center">
                Dur(min)
              </th>
              <th className="p-2 border border-slate-300 align-middle text-center">
                Proj.
              </th>
              <th className="p-2 border border-slate-300 align-middle text-center">
                Visit
              </th>
              <th className="p-2 border border-slate-300 align-middle text-center">
                Dur
              </th>
              <th className="p-2 border border-slate-300 align-middle text-center">
                Proj
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {isLoading
              ? Array(8)
                  .fill(0)
                  .map((_, i) => (
                    <SkeletonRow
                      key={i}
                      cols={EMPLOYEE_MULTI_MONTH_COLS}
                    />
                  ))
              : Array.from(groupedData.entries()).map(
                  ([department, employees]) => {
                    const departmentHeader = (
                      <tr
                        className="sticky bg-slate-200 z-10"
                        style={{ top: `${THEAD_HEIGHT}px` }}
                      >
                        <td
                          colSpan={EMPLOYEE_MULTI_MONTH_COLS}
                          className="p-2 font-bold text-slate-800 border border-slate-300"
                        >
                          {department}
                        </td>
                      </tr>
                    );

                    const renderMoMCell = (pct: number | null) =>
                      pct === null ? (
                        <span className="text-slate-400">n/a</span>
                      ) : (
                        <ChangeIcon value={formatStabilityValue(pct * 100)} />
                      );

                    const trendBadge = (trend: MultiMonthDataRow["trend"]) => {
                      if (trend === "up")
                        return (
                          <span className="text-green-600 font-bold">▲ Up</span>
                        );
                      if (trend === "down")
                        return (
                          <span className="text-red-600 font-bold">▼ Down</span>
                        );
                      return (
                        <span className="text-slate-500 font-semibold">
                          → Flat
                        </span>
                      );
                    };

                    const renderRow = (row: MultiMonthDataRow, index: number) => (
                        <tr key={row.visitorName} className="hover:bg-slate-50">
                          <td className="sticky left-0 bg-white hover:bg-slate-50 p-2 border border-slate-300 text-center">
                            {index}
                          </td>
                          <td className="sticky left-12 bg-white hover:bg-slate-50 p-2 border border-slate-300 whitespace-nowrap font-semibold">
                            {row.visitorName}
                          </td>
                          {monthsForHeader.map((month) => {
                            const metrics = row.monthlyMetrics[month];
                            return metrics ? (
                              <React.Fragment
                                key={`${month}-${row.visitorName}`}
                              >
                                <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                                  {metrics.visits}
                                </td>
                                <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                                  {metrics.durationMin.toFixed(1)}
                                </td>
                                <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                                  {metrics.projects}
                                </td>
                              </React.Fragment>
                            ) : (
                              <td
                                key={`${month}-${row.visitorName}`}
                                colSpan={3}
                                className="p-2 border border-slate-300 text-center text-slate-400"
                              >
                                N/A
                              </td>
                            );
                          })}
                          <td className="p-2 border border-slate-300 text-center font-semibold whitespace-nowrap">
                            {row.totalVisits}
                          </td>
                          <td className="p-2 border border-slate-300 text-center font-semibold whitespace-nowrap">
                            {row.totalDurationMin.toFixed(1)}
                          </td>
                          <td className="p-2 border border-slate-300 text-center font-semibold whitespace-nowrap">
                            {row.totalDistinctProjects}
                          </td>
                          <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                            {renderMoMCell(row.avgMoMVisitPct)}
                          </td>
                          <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                            {renderMoMCell(row.avgMoMDurPct)}
                          </td>
                          <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                            {renderMoMCell(row.avgMoMProjPct)}
                          </td>
                          <td className="p-2 border border-slate-300 text-center whitespace-nowrap">
                            {trendBadge(row.trend)}
                          </td>
                        </tr>
                    );

                    if (department === "Inventory Management") {
                      const projectSideEmployees = (
                        employees as MultiMonthDataRow[]
                      ).filter((e) => {
                        const configSide = inventoryConfig[e.visitorName];
                        if (configSide) return configSide === "Project Side";
                        return PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(
                          e.designation,
                        );
                      });
                      const headOfficeEmployees = (
                        employees as MultiMonthDataRow[]
                      ).filter((e) => {
                        const configSide = inventoryConfig[e.visitorName];
                        if (configSide) return configSide === "Head Office";
                        return !PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(
                          e.designation,
                        );
                      });

                      const subHeaderTop = THEAD_HEIGHT + DEPT_HEADER_HEIGHT - 4;

                      return (
                        <React.Fragment key={department}>
                          {departmentHeader}
                          {headOfficeEmployees.length > 0 && (
                            <tr
                              className="sticky bg-amber-100/90 z-10"
                              style={{ top: `${subHeaderTop}px` }}
                            >
                              <td
                                colSpan={EMPLOYEE_MULTI_MONTH_COLS}
                                className="p-2 font-semibold text-center text-amber-900 border-y border-amber-200"
                              >
                                Head Office
                              </td>
                            </tr>
                          )}
                          {headOfficeEmployees.map((row, index) =>
                            renderRow(row, index + 1)
                          )}
                          {projectSideEmployees.length > 0 && (
                            <tr
                              className="sticky bg-amber-100/90 z-10"
                              style={{ top: `${subHeaderTop}px` }}
                            >
                              <td
                                colSpan={EMPLOYEE_MULTI_MONTH_COLS}
                                className="p-2 font-semibold text-center text-amber-900 border-y border-amber-200"
                              >
                                Project Side
                              </td>
                            </tr>
                          )}
                          {projectSideEmployees.map((row, index) =>
                            renderRow(row, headOfficeEmployees.length + index + 1)
                          )}
                        </React.Fragment>
                      );
                    }

                    return (
                      <React.Fragment key={department}>
                        {departmentHeader}
                        {(employees as MultiMonthDataRow[]).map((row, index) => renderRow(row, index + 1))}
                      </React.Fragment>
                    );
                  }
                )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSavedSummariesTable = () => {
    return (
      <div className="fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print bg-white/40 backdrop-blur-md p-4 rounded-lg border border-white shadow-sm">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">
              Filter Month:
            </label>
            <input
              type="month"
              value={savedMonthFilter}
              onChange={(e) => setSavedMonthFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div className="text-xs text-slate-500">
            {savedSummaries.length} records found for {savedMonthFilter}
          </div>
        </div>

        <div className="overflow-auto border rounded-lg max-h-[70vh]">
          <table className="min-w-full text-xs border-collapse">
            <thead className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="p-2 border-b-2 border-slate-300 w-12 text-center">
                  SL
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-left">
                  Visitor Name
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-left">
                  Department
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-left">
                  Designation
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  Work Day
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  Visit Day
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  Actual Dur.
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  % Achievement
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {isLoading ? (
                Array(8)
                  .fill(0)
                  .map((_, i) => <SkeletonRow key={i} cols={9} />)
              ) : savedSummaries.length > 0 ? (
                savedSummaries.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-2 text-center">{idx + 1}</td>
                    <td className="p-2 font-semibold">{s.visitor_name}</td>
                    <td className="p-2">{s.department}</td>
                    <td className="p-2">{s.designation}</td>
                    <td className="p-2 text-center">
                      {editingSummaryId === s.id ? (
                        <input
                          type="number"
                          value={editSummaryData.total_working_day}
                          onChange={(e) =>
                            setEditSummaryData({
                              ...editSummaryData,
                              total_working_day: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center border rounded"
                        />
                      ) : (
                        s.total_working_day
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {editingSummaryId === s.id ? (
                        <input
                          type="number"
                          value={editSummaryData.total_visited_day}
                          onChange={(e) =>
                            setEditSummaryData({
                              ...editSummaryData,
                              total_visited_day: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center border rounded"
                        />
                      ) : (
                        s.total_visited_day
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {editingSummaryId === s.id ? (
                        <input
                          type="text"
                          value={editSummaryData.actual_duration}
                          onChange={(e) =>
                            setEditSummaryData({
                              ...editSummaryData,
                              actual_duration: e.target.value,
                            })
                          }
                          className="w-16 text-center border rounded"
                        />
                      ) : (
                        s.actual_duration
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {editingSummaryId === s.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editSummaryData.duration_percentage}
                          onChange={(e) =>
                            setEditSummaryData({
                              ...editSummaryData,
                              duration_percentage:
                                parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-16 text-center border rounded"
                        />
                      ) : (
                        `${Number(s.duration_percentage).toFixed(2)}%`
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {canEditSummary ? (
                          editingSummaryId === s.id ? (
                            <>
                              <button
                                onClick={() => handleUpdateSavedSummary(s.id)}
                                className="text-green-600 hover:text-green-800"
                                title="Save"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() => setEditingSummaryId(null)}
                                className="text-slate-400 hover:text-slate-600"
                                title="Cancel"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingSummaryId(s.id);
                                  setEditSummaryData({ ...s });
                                }}
                                className="text-blue-600 hover:text-blue-800"
                                title="Edit"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteSavedSummary(s.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Delete"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V10a1 1 0 10-2 0v6H6V6h10a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            </>
                          )
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">
                            Admin Only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="p-8 text-center text-slate-400 italic"
                  >
                    No saved summaries for {savedMonthFilter}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSingleMonthTable = () => {
    const renderRow = (row: SummaryDataRow, slNo: number) => {
      const isExempt = row.supposedlyVisitDurationDay === "00:00";
      const stabilityClass =
        row.currentStability > 0
          ? "border-l-4 border-green-400"
          : row.currentStability < 0
            ? "border-l-4 border-red-400"
            : "border-l-4 border-transparent";

      return (
        <tr
          key={row.visitorName}
          className={`hover:bg-orange-50/70 transition-colors duration-150 ${stabilityClass}`}
        >
          <td className="sticky left-0 bg-white hover:bg-orange-50/70 p-2 border-b border-slate-200 text-center">
            {slNo}
          </td>
          <td className="sticky left-12 bg-white hover:bg-orange-50/70 p-2 border-b border-slate-200 whitespace-nowrap font-semibold">
            <span className="inline-flex items-center gap-1.5">
              {row.visitorName}
              {row.isManuallyAdded && (
                <>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full"
                    title="Manually added — no visit records for this employee"
                  >
                    Manual
                  </span>
                  <button
                    onClick={() => handleRemoveManualEmployee(row.visitorName)}
                    className="text-slate-300 hover:text-red-500 transition-colors no-print"
                    title="Remove from summary"
                  >
                    ✕
                  </button>
                </>
              )}
            </span>
          </td>
          <td className="p-2 border-b border-slate-200 whitespace-nowrap">
            {row.designation}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            <input
              type="number"
              value={workingDays[row.visitorName] ?? ""}
              onChange={(e) =>
                handleWorkingDaysChange(row.visitorName, e.target.value)
              }
              placeholder={String(row.totalWorkingDay)}
              className="w-12 text-center bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 rounded"
              min="0"
              max="31"
            />
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.totalVisitedDay}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.totalVisitedProjectCount}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.totalVisitLogs}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.durationCount.moreThan20}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.durationCount.tenTo19}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.durationCount.fiveTo9}
          </td>
          <td className="p-2 border-b border-slate-200 text-center bg-rose-50 text-rose-700 font-medium">
            {row.durationCount.lessThan5}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.supposedlyVisitDurationDay}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.supposedlyVisitDurationMonth}
          </td>
          <td className="p-2 border-b border-slate-200 text-center bg-orange-50 font-semibold">
            {row.currentMonthActualDuration}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {isExempt
              ? row.currentMonthActualDuration
              : `${row.currentMonthDurationPercentage.toFixed(2)}%`}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.lastMonthActualDuration}
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {isExempt
              ? row.lastMonthDurationPercentage.toFixed(2)
              : `${row.lastMonthDurationPercentage.toFixed(2)}%`}
          </td>
          <td className="p-2 border-b border-slate-200 text-center bg-orange-50 whitespace-nowrap">
            <ChangeIcon value={formatStabilityValue(row.currentStability)} />
          </td>
          <td className="p-2 border-b border-slate-200 text-center">
            {row.lastMonthPerDayAverage}
          </td>
          <td className="p-2 border-b border-slate-200 text-center bg-orange-50 font-semibold">
            {row.currentMonthDayAverage}
          </td>
          <td className="p-2 border-b border-slate-200 text-center bg-orange-50 whitespace-nowrap">
            <ChangeIcon value={formatStabilityValue(row.averageStability)} />
          </td>
        </tr>
      );
    };

    return (
      <div ref={contentToPrintRef} className="printable-area">
        <div
          className={`overflow-auto border rounded-lg ${isFullScreen ? "h-[calc(100vh-200px)]" : "max-h-[70vh]"}`}
        >
          <table className="min-w-full text-xs border-collapse">
            <thead
              ref={theadRef}
              className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-20 shadow-sm"
            >
              <tr>
                <th
                  className="sticky left-0 bg-slate-50/80 backdrop-blur-md p-2 border-b-2 border-slate-300 align-middle w-12 text-center"
                  rowSpan={2}
                >
                  SL
                </th>
                <th
                  className="sticky left-12 bg-slate-50/80 backdrop-blur-md p-2 border-b-2 border-slate-300 align-middle w-48"
                  rowSpan={2}
                >
                  Visitor Name
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Designation
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Work Day
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Visit Day
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Total Proj.
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Visit Count
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 text-center"
                  colSpan={4}
                >
                  Duration Count
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Target /Day
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  Target /Month
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  {currentMonthName} Actual
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  {currentMonthName} %
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  {lastMonthName} Actual
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  {lastMonthName} %
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle whitespace-nowrap"
                  rowSpan={2}
                >
                  Stability %
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  {lastMonthName} Avg/Day
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle"
                  rowSpan={2}
                >
                  {currentMonthName} Avg/Day
                </th>
                <th
                  className="p-2 border-b-2 border-slate-300 align-middle whitespace-nowrap"
                  rowSpan={2}
                >
                  Avg Stability %
                </th>
              </tr>
              <tr>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  &gt;20m
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  10-19m
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center">
                  5-9m
                </th>
                <th className="p-2 border-b-2 border-slate-300 text-center bg-rose-100 text-rose-900 font-bold">
                  &lt;5m
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading
                ? Array(8)
                    .fill(0)
                    .map((_, i) => <SkeletonRow key={i} cols={21} />)
                : Array.from(groupedData.entries()).map(
                    ([department, employees]) => {
                      const departmentHeader = (
                        <tr
                          className="sticky bg-gradient-to-r from-slate-200 to-slate-100 shadow-sm z-10"
                          style={{ top: `${THEAD_HEIGHT}px` }}
                        >
                          <td
                            colSpan={21}
                            className="p-3 font-bold text-slate-800 tracking-wider border-y border-slate-300"
                          >
                            {department}
                          </td>
                        </tr>
                      );

                      if (department === "Inventory Management") {
                        const projectSideEmployees = (
                          employees as SummaryDataRow[]
                        ).filter((e) => {
                          const configSide = inventoryConfig[e.visitorName];
                          if (configSide) return configSide === "Project Side";
                          return PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(
                            e.designation,
                          );
                        });
                        const headOfficeEmployees = (
                          employees as SummaryDataRow[]
                        ).filter((e) => {
                          const configSide = inventoryConfig[e.visitorName];
                          if (configSide) return configSide === "Head Office";
                          return !PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(
                            e.designation,
                          );
                        });

                        const subHeaderTop =
                          THEAD_HEIGHT + DEPT_HEADER_HEIGHT - 4; // Adjusting for height

                        return (
                          <React.Fragment key={department}>
                            {departmentHeader}
                            {headOfficeEmployees.length > 0 && (
                              <tr
                                className="sticky bg-amber-100/90 z-10"
                                style={{ top: `${subHeaderTop}px` }}
                              >
                                <td
                                  colSpan={21}
                                  className="p-2 font-semibold text-center text-amber-900 border-y border-amber-200"
                                >
                                  Head Office
                                </td>
                              </tr>
                            )}
                            {headOfficeEmployees.map((row, index) =>
                              renderRow(row, index + 1),
                            )}
                            {projectSideEmployees.length > 0 && (
                              <tr
                                className="sticky bg-amber-100/90 z-10"
                                style={{ top: `${subHeaderTop}px` }}
                              >
                                <td
                                  colSpan={21}
                                  className="p-2 font-semibold text-center text-amber-900 border-y border-amber-200"
                                >
                                  Project Side
                                </td>
                              </tr>
                            )}
                            {projectSideEmployees.map((row, index) =>
                              renderRow(
                                row,
                                headOfficeEmployees.length + index + 1,
                              ),
                            )}
                          </React.Fragment>
                        );
                      }

                      return (
                        <React.Fragment key={department}>
                          {departmentHeader}
                          {(employees as SummaryDataRow[]).map((row, index) =>
                            renderRow(row, index + 1),
                          )}
                        </React.Fragment>
                      );
                    },
                  )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`fade-in ${isFullScreen ? "bg-white p-4" : ""}`}
      >
        {/* Filter and Configuration Section */}
        {analysisMode === "multi-month"
          ? renderMultiMonthFilters()
          : renderSingleMonthFilters()}

        {analysisMode === "single-month-comparison" && (
          <div className="flex items-center gap-1 mb-4 no-print border-b border-slate-200">
            <button
              onClick={() => setAnalysisSubTab("live")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${analysisSubTab === "live" ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Live Analysis
            </button>
            <button
              onClick={() => setAnalysisSubTab("saved")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${analysisSubTab === "saved" ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Saved Summaries
            </button>
          </div>
        )}

        {dataDateRange && analysisSubTab === "live" && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-3 no-print">
            <div className="p-2 bg-blue-100 rounded-full text-blue-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Data Inventory:</span>{" "}
              {dataDateRange.count} total records found from{" "}
              <span className="font-mono bg-blue-100 px-1 rounded">
                {dataDateRange.start}
              </span>{" "}
              to{" "}
              <span className="font-mono bg-blue-100 px-1 rounded">
                {dataDateRange.end}
              </span>
              .
              {analysisMode === "single-month-comparison" &&
                summaryData.length === 0 && (
                  <span className="ml-2 text-red-600 font-medium">
                    No records match the selected month{" "}
                    <span className="font-mono">{selectedMonth}</span>.
                  </span>
                )}
            </p>
          </div>
        )}

        {analysisMode === "single-month-comparison" && (
          <div className="flex justify-end items-center gap-2 mb-2 no-print">
            <PdfExport
              groupedData={groupedData}
              currentUser={currentUser}
              selectedMonth={selectedMonth}
              currentMonthName={currentMonthName}
              lastMonthName={lastMonthName}
              defaultCurrentWorkingDays={defaultCurrentWorkingDays}
              defaultLastWorkingDays={defaultLastWorkingDays}
              securityCurrentWorkingDays={securityCurrentWorkingDays}
              securityLastWorkingDays={securityLastWorkingDays}
              formatStabilityValue={formatStabilityValue}
              reportNotes={reportNotes}
              allEmployees={allEmployees}
              attendanceData={attendanceData}
              allVisits={visits}
            />
            <button
              onClick={handleExportExcel}
              disabled={
                !(
                  currentUser.role === "super_admin" ||
                  currentUser.role === "admin" ||
                  permissions.allDepartmentSummary_exportExcel?.view
                )
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
              title="Export Data as Excel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Export Data (Excel)
            </button>
            <button
              onClick={handleSaveSummaryToDB}
              disabled={
                !(
                  currentUser.role === "super_admin" ||
                  currentUser.role === "admin" ||
                  permissions.allDepartmentSummary_saveSummary?.view
                )
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-orange-300 text-xs font-medium rounded-md shadow-sm text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
              title="Save current summary to database for monthly comparison"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V4.5a1 1 0 10-2 0v7.086L7.707 10.293z" />
                <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
              </svg>
              Save Summary
            </button>
          </div>
        )}

        {analysisMode === "multi-month" && (
          <div className="flex justify-end items-center gap-2 mb-2 no-print">
            <button
              onClick={handleExportMultiMonthExcel}
              disabled={
                !(
                  currentUser.role === "super_admin" ||
                  currentUser.role === "admin" ||
                  permissions.allDepartmentSummary_exportExcel?.view
                )
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
              title="Export Report as Excel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Export Excel
            </button>
            <button
              onClick={handleExportMultiMonthPdf}
              disabled={
                !(
                  currentUser.role === "super_admin" ||
                  currentUser.role === "admin" ||
                  permissions.allDepartmentSummary_exportExcel?.view
                )
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
              title="Export Report as PDF"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-red-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Export PDF
            </button>
          </div>
        )}

        {analysisMode === "multi-month" && renderDepartmentMonthlySummaryTable()}

        {analysisMode === "multi-month"
          ? renderMultiMonthTable()
          : analysisSubTab === "live"
            ? renderSingleMonthTable()
            : renderSavedSummariesTable()}

        {/* Important Notes Editor */}
        <div className="mt-8 p-4 border border-white rounded-lg bg-white/40 backdrop-blur-md no-print shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-orange-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              Important Notes for Reports
            </h3>
            {!isEditingNotes ? (
              <button
                onClick={handleStartEditingNotes}
                className="text-xs px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                Edit Notes
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNotes}
                  className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsEditingNotes(false)}
                  className="text-xs px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {!isEditingNotes ? (
            <ul className="space-y-1.5">
              {reportNotes.length > 0 ? (
                reportNotes.map((note, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-slate-600 pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-orange-400"
                  >
                    {note}
                  </li>
                ))
              ) : (
                <li className="text-xs text-slate-400 italic">
                  No notes added.
                </li>
              )}
            </ul>
          ) : (
            <div className="space-y-3">
              {tempNotes.map((note, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-xs font-medium text-slate-400 pt-2 w-4">
                    {idx + 1}.
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => handleNoteChange(idx, e.target.value)}
                    className="flex-1 text-xs p-2 border border-slate-200 rounded focus:border-orange-500 focus:ring-1 focus:ring-orange-500 min-h-[60px]"
                    placeholder="Enter note text..."
                  />
                  <button
                    onClick={() => handleRemoveNote(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"
                    title="Remove note"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddNote}
                className="w-full py-2 border-2 border-dashed border-slate-200 rounded text-xs text-slate-500 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Add New Note
              </button>
            </div>
          )}
        </div>
      </div>
      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}

      <TableSettings
        isOpen={showSettingsPage}
        onClose={() => { setShowSettingsPage(false); setReorderingDeptEmployees(null); }}
        initialTab={settingsActiveTab}
        customDepartmentOrder={customDepartmentOrder}
        hiddenDepartments={hiddenDepartments}
        hiddenEmployees={hiddenEmployees}
        employeeSortOrder={employeeSortOrder}
        summaryData={summaryData}
        multiMonthSummaryData={multiMonthSummaryData}
        analysisMode={analysisMode}
        inventoryConfig={inventoryConfig}
        visits={visits}
        projectSideDesignations={PROJECT_SIDE_INVENTORY_DESIGNATIONS}
        departmentOrder={departmentOrder}
        onReorderDepts={setCustomDepartmentOrder}
        onToggleDept={toggleDepartmentVisibility}
        onToggleEmployee={toggleEmployeeVisibility}
        onReorderEmployees={(dept, newOrder) => setEmployeeSortOrder(prev => ({ ...prev, [dept]: newOrder }))}
        onUpdateInventorySide={handleUpdateInventorySide}
        onResetAll={() => {
          setCustomDepartmentOrder(departmentOrder);
          setHiddenDepartments(new Set());
          setHiddenEmployees(new Set());
          setEmployeeSortOrder({});
          setFeedback({ message: "Reset all custom sorting and visibility to default.", type: "info" });
        }}
        customDurations={customDurations}
        exemptDepartments={EXEMPT_DEPARTMENTS}
        onDurationChange={handleCustomDurationChange}
        onSaveDurations={handleSaveCustomDurations}
        onResetDurations={() => {
          setCustomDurations({});
          saveSettingToServer("customDurations", JSON.stringify({}));
          setFeedback({ message: "All target durations reset to default.", type: "info" });
        }}
      />

      <WorkingDaysModal
        isOpen={isWorkingDaysModalOpen}
        onClose={() => setIsWorkingDaysModalOpen(false)}
        month={modalMonth}
        refresh={() => fetchWorkingDays(selectedMonth)}
        departmentMap={departmentMap}
      />
      <MonthlyConfigModal
        isOpen={isMonthlyConfigModalOpen}
        onClose={() => setIsMonthlyConfigModalOpen(false)}
        onUpdate={() => fetchAppSettings(selectedMonth)}
      />

      {showAddEmployeeModal &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
                <h3 className="text-lg font-bold">
                  Add Employee / Department — {selectedMonth}
                </h3>
                <button
                  onClick={() => setShowAddEmployeeModal(false)}
                  className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Search */}
              <div className="px-6 pt-4 pb-2 shrink-0">
                <p className="text-sm text-slate-500 mb-3">
                  Only employees with{" "}
                  <span className="font-semibold">
                    no visit records at all
                  </span>{" "}
                  are listed here. Select individual employees, or use the
                  department checkbox to add everyone missing from that
                  department at once. They'll appear in the summary with zero
                  stats.
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by employee or department..."
                    value={addEmployeeSearch}
                    onChange={(e) => setAddEmployeeSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-slate-50"
                  />
                </div>
              </div>

              {/* List */}
              <div className="px-6 pb-2 overflow-y-auto flex-1 min-h-0">
                {Object.keys(missingEmployeesByDept).length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center py-8">
                    {missingEmployeesForMonth.length === 0
                      ? "No missing employees — everyone in the master list already has visit records or has been added."
                      : "No match found."}
                  </p>
                ) : (
                  <div className="space-y-4 py-2">
                    {Object.entries(missingEmployeesByDept).map(
                      ([dept, emps]) => {
                        const allSelected = emps.every((e) =>
                          addEmployeeSelection.has(e.name),
                        );
                        return (
                          <div
                            key={dept}
                            className="border border-slate-200 rounded-lg overflow-hidden"
                          >
                            <label className="flex items-center gap-2 bg-slate-50 px-3 py-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() =>
                                  toggleAddDepartmentSelection(emps)
                                }
                                className="rounded border-slate-300"
                              />
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                {dept}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                ({emps.length})
                              </span>
                            </label>
                            <div className="divide-y divide-slate-100">
                              {emps.map((e) => (
                                <label
                                  key={e.employee_id || e.name}
                                  className="flex items-center gap-2 px-3 py-2 pl-8 text-sm hover:bg-orange-50/50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={addEmployeeSelection.has(e.name)}
                                    onChange={() =>
                                      toggleAddEmployeeSelection(e.name)
                                    }
                                    className="rounded border-slate-300"
                                  />
                                  <span className="font-medium text-slate-700">
                                    {e.name}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {e.designation}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0 bg-white">
                <span className="text-xs text-slate-500">
                  {addEmployeeSelection.size} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddEmployeeModal(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAddEmployees}
                    disabled={addEmployeeSelection.size === 0}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-md text-sm font-semibold transition-colors"
                  >
                    Add to Summary
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default AllDepartmentSummary;