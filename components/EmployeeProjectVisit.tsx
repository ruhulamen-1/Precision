import React, { useState, useMemo, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  User,
  Project,
  EmployeeVisit,
  ReportData,
  EmployeeVisitTab,
  AllEmployee,
  VisitBook,
  AttendanceRecord,
} from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import { DEPARTMENTS, DESIGNATIONS } from "../constants";
import FeedbackMessage from "./FeedbackMessage";
import AllDepartmentSummary from "./AllDepartmentSummary";
import EmployeeDutyAnalysis from "./EmployeeDutyAnalysis";
import EmployeeVisitSummary from "./EmployeeVisitSummary";
import ProjectVisitCompliance from "./ProjectVisitCompliance";
import _ from "lodash";
import SearchableSelect from "./SearchableSelect";
import { Plus, Trash2, Edit2, Save, X, Calendar, Clock, MapPin, User as UserIcon, RefreshCw, Image as ImageIcon, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import PhotoUploader from "./PhotoUploader";
import { useLoading } from "../contexts/LoadingContext";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import { SkeletonRow } from "./TableSkeleton";
import {
  parseAndFormatDate,
  formatDateToDDMMMYYYY,
  getDurationFormula,
  calculateDuration
} from "../utils/dateUtils";

// Safe motion — falls back to plain divs in sandboxed envs (e.g. AI Studio)
const _motionModule = (() => {
  try { return require("motion/react"); } catch { return null; }
})();
const motion: any = _motionModule?.motion ?? {
  div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    (props, ref) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props as any;
      return <div ref={ref} {...rest} />;
    }
  ),
};
const AnimatePresence: React.FC<{ children?: React.ReactNode; mode?: string }> =
  _motionModule?.AnimatePresence ?? (({ children }) => <>{children}</>);

interface EmployeeProjectVisitProps {
  currentUser: User;
  projects: Project[];
  visits: EmployeeVisit[];
  onUpdateVisits: React.Dispatch<React.SetStateAction<EmployeeVisit[]>>;
  activeTab: EmployeeVisitTab;
  onTabChange: (tab: EmployeeVisitTab) => void;
  allEmployees: AllEmployee[];
  isVisitsLoading: boolean;
  attendanceData: AttendanceRecord[];
  onUpdateAttendanceData: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
  // Set when arriving here via the header's global search — pre-fills the
  // Records tab search box and switches to it. `ts` makes repeated
  // selections of the same name re-trigger the effect.
  initialSearchQuery?: { query: string; ts: number } | null;
}

const EmployeeProjectVisit: React.FC<EmployeeProjectVisitProps> = ({
  currentUser,
  projects,
  visits,
  onUpdateVisits,
  activeTab,
  onTabChange,
  allEmployees,
  isVisitsLoading,
  attendanceData,
  onUpdateAttendanceData,
  initialSearchQuery,
}) => {
  const permissions = getEffectivePermissions(currentUser);

  // --- STATE ---

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Bulk Selection state
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showMergeDesignationModal, setShowMergeDesignationModal] = useState(false);

  // Merge designation state — per-employee chosen designation
  const [mergeSelections, setMergeSelections] = useState<Record<string, string>>({});
  const [bulkEditData, setBulkEditData] = useState<{
    remarks?: string;
    department?: string;
    designation?: string;
    date?: string;
    visitorName?: string;
  }>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // State for Records Tab
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Arrive here from the header's global search: jump to Records and
  // pre-fill the search box with whatever the person picked.
  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery.query);
      onTabChange("records");
    }
  }, [initialSearchQuery?.ts]);

  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // New state for editing
  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<EmployeeVisit>>({});

  // Import Preview Modal state
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<{
    newRows: EmployeeVisit[];
    duplicateRows: EmployeeVisit[];
    allParsedRows: EmployeeVisit[];
  } | null>(null);

  // Manual Entry State
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressDate, setProgressDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryFormData, setEntryFormData] = useState<Partial<EmployeeVisit>>({
    date: new Date().toISOString().split("T")[0],
    visitorName: "",
    department: "",
    designation: "",
    projectName: "",
    entryTime: "",
    outTime: "",
    duration: "0:0:0",
    remarks: "",
    images: [],
  });

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionData, setSessionData] = useState<{
    date: string;
    projectName: string;
    images: string[];
  }>({
    date: new Date().toISOString().split("T")[0],
    projectName: "",
    images: [],
  });
  const [currentRefImageIdx, setCurrentRefImageIdx] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const previewImgRef = useRef<HTMLDivElement>(null);
  const [poppedOutWindow, setPoppedOutWindow] = useState<Window | null>(null);
  const [isImageMinimized, setIsImageMinimized] = useState(false);

  const syncPopOut = () => {
    if (poppedOutWindow && !poppedOutWindow.closed) {
      const images = sessionData.images || [];
      const src = images[currentRefImageIdx];
      if (src) {
        syncPoppedOutWindow(poppedOutWindow, src);
      }
    }
  };

  const syncPoppedOutWindow = (win: Window, src: string) => {
    try {
      if (win && !win.closed) {
        const img = win.document.getElementById("pop-image") as HTMLImageElement;
        const overlay = win.document.getElementById("pop-overlay");
        if (img) {
          img.src = src;
          if (overlay) {
            overlay.innerHTML = `
              <strong style="display: block; font-size: 16px; color: #f97316;">${sessionData.projectName || ""}</strong>
              <span>${sessionData.date || ""}</span>
            `;
          }
        } else {
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>${sessionData.projectName || "Reference Image"}</title>
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  background: #000;
                  width: 100vw;
                  height: 100vh;
                  overflow: hidden;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  font-family: system-ui, -apple-system, sans-serif;
                }
                .container {
                  position: relative;
                  width: 100vw;
                  height: 100vh;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                }
                img {
                  object-fit: contain;
                  width: 100vw;
                  height: 100vh;
                }
                .overlay {
                  position: absolute;
                  bottom: 20px;
                  left: 20px;
                  color: white;
                  background: rgba(0,0,0,0.6);
                  padding: 10px 15px;
                  border-radius: 8px;
                  font-size: 14px;
                  pointer-events: none;
                }
                .close-btn {
                  position: absolute;
                  top: 20px;
                  right: 20px;
                  background: rgba(0,0,0,0.6);
                  color: white;
                  border: 1px solid rgba(255,255,255,0.3);
                  padding: 8px 16px;
                  border-radius: 5px;
                  cursor: pointer;
                  font-size: 12px;
                  font-weight: bold;
                }
                .close-btn:hover {
                  background: rgba(234, 88, 12, 0.8);
                }
              </style>
            </head>
            <body>
              <div class="container">
                <img id="pop-image" src="${src}" />
                <div id="pop-overlay" class="overlay">
                  <strong style="display: block; font-size: 16px; color: #f97316;">${sessionData.projectName || ""}</strong>
                  <span>${sessionData.date || ""}</span>
                </div>
                <button class="close-btn" onclick="window.close()">Close</button>
              </div>
              <script>
                function tryFullscreen() {
                  try {
                    if (document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen();
                    } else if (document.documentElement.webkitRequestFullscreen) {
                      document.documentElement.webkitRequestFullscreen();
                    }
                  } catch(e) {
                    console.log(e);
                  }
                }
                window.onload = function() {
                  tryFullscreen();
                  document.body.addEventListener('click', function(e) {
                    if (e.target.tagName !== 'BUTTON') {
                      tryFullscreen();
                    }
                  });
                };
              </script>
            </body>
            </html>
          `;
          win.document.open();
          win.document.write(html);
          win.document.close();
        }
      }
    } catch (e) {
      console.error("Failed to sync popped-out window:", e);
    }
  };

  const handlePopOutImage = () => {
    const images = sessionData.images || [];
    const src = images[currentRefImageIdx];
    if (!src) return;

    const win = window.open(
      "",
      "_blank",
      "width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no"
    );

    if (win) {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${sessionData.projectName || "Reference Image"}</title>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: #000;
              width: 100vw;
              height: 100vh;
              overflow: hidden;
              display: flex;
              justify-content: center;
              align-items: center;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .container {
              position: relative;
              width: 100vw;
              height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            img {
              object-fit: contain;
              width: 100vw;
              height: 100vh;
            }
            .overlay {
              position: absolute;
              bottom: 20px;
              left: 20px;
              color: white;
              background: rgba(0,0,0,0.6);
              padding: 10px 15px;
              border-radius: 8px;
              font-size: 14px;
              pointer-events: none;
            }
            .close-btn {
              position: absolute;
              top: 20px;
              right: 20px;
              background: rgba(0,0,0,0.6);
              color: white;
              border: 1px solid rgba(255,255,255,0.3);
              padding: 8px 16px;
              border-radius: 5px;
              cursor: pointer;
              font-size: 12px;
              font-weight: bold;
            }
            .close-btn:hover {
              background: rgba(234, 88, 12, 0.8);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <img id="pop-image" src="${src}" />
            <div id="pop-overlay" class="overlay">
              <strong style="display: block; font-size: 16px; color: #f97316;">${sessionData.projectName || ""}</strong>
              <span>${sessionData.date || ""}</span>
            </div>
            <button class="close-btn" onclick="window.close()">Close</button>
          </div>
          <script>
            function tryFullscreen() {
              try {
                if (document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen();
                } else if (document.documentElement.webkitRequestFullscreen) {
                  document.documentElement.webkitRequestFullscreen();
                }
              } catch(e) {
                console.log(e);
              }
            }
            window.onload = function() {
              tryFullscreen();
              document.body.addEventListener('click', function(e) {
                if (e.target.tagName !== 'BUTTON') {
                  tryFullscreen();
                }
              });
            };
          </script>
        </body>
        </html>
      `;
      win.document.open();
      win.document.write(html);
      win.document.close();
      setPoppedOutWindow(win);
      setIsImageMinimized(true);
    }
  };

  useEffect(() => {
    if (poppedOutWindow && poppedOutWindow.closed) {
      setPoppedOutWindow(null);
      setIsImageMinimized(false);
    } else if (poppedOutWindow && !poppedOutWindow.closed) {
      const images = sessionData.images || [];
      const src = images[currentRefImageIdx];
      if (src) {
        syncPoppedOutWindow(poppedOutWindow, src);
      }
    }
  }, [currentRefImageIdx, poppedOutWindow, sessionData.images, sessionData.projectName, sessionData.date]);

  // Refs for keyboard navigation
  const visitorSelectRef = useRef<any>(null);
  const entryTimeInputRef = useRef<HTMLInputElement>(null);
  const outTimeInputRef = useRef<HTMLInputElement>(null);

  // Reset zoom and pan when image changes
  useEffect(() => { 
    setZoomLevel(1); 
    setPanOffset({ x: 0, y: 0 });
  }, [currentRefImageIdx]);

  // Update entry form when session changes
  useEffect(() => {
    if (isSessionActive) {
      setEntryFormData((prev) => ({
        ...prev,
        date: sessionData.date,
        projectName: sessionData.projectName,
        images: sessionData.images,
      }));
      setCurrentRefImageIdx(0);
    }
  }, [isSessionActive, sessionData]);

  // Focus visitor field when form resets after successfully saving a visit
  useEffect(() => {
    if (!entryFormData.visitorName && !entryFormData.entryTime) {
      setTimeout(() => {
        visitorSelectRef.current?.focus?.();
        visitorSelectRef.current?.focusInput?.();
      }, 150);
    }
  }, [entryFormData.visitorName, entryFormData.entryTime]);

  const [showSessionImageModal, setShowSessionImageModal] = useState(false);
  const [showEntryImageModal, setShowEntryImageModal] = useState(false);

  const formatTimeStr = (val: string): string => {
    const raw = val.replace(/[^0-9:]/g, '');
    let h = '', m = '';
    if (raw.includes(':')) {
      [h, m] = raw.split(':');
    } else if (raw.length === 3) {
      h = raw.slice(0, 1);
      m = raw.slice(1);
    } else if (raw.length === 4) {
      h = raw.slice(0, 2);
      m = raw.slice(2);
    }
    h = h.padStart(2, '0');
    m = m.padStart(2, '0');
    const hNum = parseInt(h, 10);
    const mNum = parseInt(m, 10);
    if (hNum >= 0 && hNum <= 23 && mNum >= 0 && mNum <= 59) {
      return `${h}:${m}`;
    }
    return '';
  };

  // Handle Enter/Tab/ArrowRight for rapid entry
  const handleVisitorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      entryTimeInputRef.current?.focus();
    }
  };

  const handleEntryTimeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      outTimeInputRef.current?.focus();
      // Try to open the time picker if supported by browser/UI
      (outTimeInputRef.current as HTMLInputElement & { showPicker?: () => void })?.showPicker?.();
    }
  };

  const handleOutTimeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const target = e.currentTarget as HTMLInputElement;
      const rawVal = target.value;
      const formatted = formatTimeStr(rawVal);
      const nextOutTime = formatted || rawVal;
      const nextDuration = calculateDuration(entryFormData.entryTime || "", nextOutTime);

      setEntryFormData((prev) => ({
        ...prev,
        outTime: nextOutTime,
        duration: nextDuration,
      }));

      handleSaveNewEntry(false, {
        outTime: nextOutTime,
        duration: nextDuration,
      }).then(() => {
        // After save completes and loading overlay unmounts, focus back to visitor name for next entry
        setTimeout(() => {
          visitorSelectRef.current?.focus?.();
          visitorSelectRef.current?.focusInput?.();
        }, 300);
      });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      entryTimeInputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      // Check if essential fields are filled
      if (entryFormData.visitorName && entryFormData.projectName && entryFormData.entryTime && entryFormData.outTime) {
        e.preventDefault();
        handleSaveNewEntry(false);
      }
    }
  };

  // Fetch Visit Book images when date/project changes in session setup
  useEffect(() => {
    if (!isSessionActive && sessionData.date && sessionData.projectName) {
      const checkVisitBook = async () => {
        try {
          const res = await fetch("/api/visit-book");
          if (res.ok) {
            const data = await res.json();
            const existing = data.find((v: VisitBook) => v.date === sessionData.date && v.projectName === sessionData.projectName);
            if (existing) {
              setSessionData(prev => ({ ...prev, images: existing.images || [] }));
            } else {
              setSessionData(prev => ({ ...prev, images: [] }));
            }
          }
        } catch (err) {
          console.error("Error checking visit book:", err);
        }
      };
      checkVisitBook();
    }
  }, [sessionData.date, sessionData.projectName, isSessionActive]);

  // Handle global paste event for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only process paste if entry tab is active or a modal is showing
      if (activeTab !== "entry" && !showEntryModal && !showSessionImageModal && !showEntryImageModal) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) imageFiles.push(blob);
        }
      }

      if (imageFiles.length > 0) {
        const loaders = imageFiles.map((file) => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.readAsDataURL(file);
          });
        });

        Promise.all(loaders).then((base64Strings) => {
          if (showSessionImageModal) {
            setSessionData((prev) => ({
              ...prev,
              images: [...(prev.images || []), ...base64Strings].slice(0, 3),
            }));
          } else {
            setEntryFormData((prev) => ({
              ...prev,
              images: [...(prev.images || []), ...base64Strings].slice(0, 3),
            }));
            // If they paste while in spreadsheet mode, maybe give some feedback
            if (activeTab === "entry" && !showEntryModal && !showSessionImageModal && !showEntryImageModal) {
              setFeedback({ message: "Image(s) pasted and attached to current entry.", type: "info" });
              setTimeout(() => setFeedback(null), 3000);
            }
          }
        });
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [activeTab, showEntryModal, showSessionImageModal, showEntryImageModal]);

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

  // --- REFS & MEMOS ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showLoading, hideLoading } = useLoading();
  const projectNames = useMemo(
    () =>
      Array.isArray(projects)
        ? _.uniq(projects.map((p) => p.name || "Unnamed")).sort()
        : [],
    [projects],
  );

  // Name -> Employee ID lookup (built from the master employee list).
  // Works for old and new visit records alike since it's resolved live
  // from the current visitorName, no data migration needed.
  const employeeIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    (allEmployees || []).forEach((e) => {
      if (e.name) map[e.name.trim().toLowerCase()] = e.employee_id;
    });
    return map;
  }, [allEmployees]);

  const getEmployeeIdForName = (name?: string) =>
    (name && employeeIdByName[name.trim().toLowerCase()]) || "—";

  // Employee ID -> canonical Name lookup (reverse of the above). Used on
  // CSV import: if a row's Employee ID matches a known employee, that
  // employee's official name is trusted over whatever was typed in the
  // "Visitor Name" cell, so a stray space or spelling slip doesn't break
  // the ID match or create a duplicate-looking name.
  const employeeById = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    (allEmployees || []).forEach((e) => {
      if (e.employee_id) {
        map[e.employee_id.trim().toLowerCase()] = { id: e.employee_id, name: e.name };
      }
    });
    return map;
  }, [allEmployees]);

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
    setSelectedRowIds(new Set());
  }, [startDate, endDate, projectFilter, departmentFilter, searchQuery]);

  const paginatedVisits = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredVisits.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredVisits, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredVisits.length / rowsPerPage);

  const sessionProgress = useMemo(() => {
    const todayVisits = visits.filter((v) => v.date === progressDate);
    const groups = _.groupBy(todayVisits, "projectName") as Record<string, EmployeeVisit[]>;
    return Object.entries(groups).map(([name, items]) => ({
      name,
      count: items.length,
      visitors: items.map(i => i.visitorName).slice(0, 5),
    })).sort((a, b) => b.count - a.count);
  }, [visits, progressDate]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const newSelected = new Set(paginatedVisits.map((v) => v.id));
      setSelectedRowIds(newSelected);
    } else {
      setSelectedRowIds(new Set());
    }
  };

  const handleSelectRow = (id: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // If, after a name edit, no visit record is left under the old name,
  // treat it as a full employee rename and carry it over to the
  // Individual Working Days entries too — otherwise the old spelling
  // lingers there and shows up as a separate "duplicate" employee.
  const syncWorkingDaysRename = async (oldName: string, newName: string, updatedVisits: EmployeeVisit[]) => {
    if (!oldName || !newName || oldName === newName) return;
    const stillExists = updatedVisits.some((v) => v.visitorName === oldName);
    if (stillExists) return;
    try {
      await fetch("/api/working-days/rename-employee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });
    } catch (error) {
      console.error("Error syncing working days rename:", error);
    }
  };

  const handleBulkEdit = async () => {
    if (selectedRowIds.size === 0) return;
    showLoading();
    try {
      const ids = Array.from(selectedRowIds);
      const oldNames = _.uniq(
        visits.filter((v) => selectedRowIds.has(v.id)).map((v) => v.visitorName),
      );
      const response = await fetch("/api/employee-visits-bulk/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          updates: bulkEditData,
        }),
      });

      if (response.ok) {
        const updatedVisits = visits.map((v) =>
          selectedRowIds.has(v.id) ? { ...v, ...bulkEditData } : v,
        );
        onUpdateVisits(updatedVisits);
        if (bulkEditData.visitorName) {
          for (const oldName of oldNames) {
            await syncWorkingDaysRename(oldName, bulkEditData.visitorName, updatedVisits);
          }
        }
        setFeedback({
          message: `Successfully updated ${ids.length} records.`,
          type: "success",
        });
        setSelectedRowIds(new Set());
        setShowBulkEditModal(false);
        setBulkEditData({});
      } else {
        setFeedback({ message: "Failed to update records.", type: "error" });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRowIds.size === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedRowIds.size} selected record(s)? This cannot be undone.`,
      )
    )
      return;

    setIsBulkDeleting(true);
    showLoading();
    try {
      const ids = Array.from(selectedRowIds);
      const response = await fetch("/api/employee-visits/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (response.ok) {
        onUpdateVisits((prev) => prev.filter((v) => !selectedRowIds.has(v.id)));
        setFeedback({
          message: `Successfully deleted ${ids.length} records.`,
          type: "success",
        });
        setSelectedRowIds(new Set());
      } else {
        setFeedback({ message: "Failed to delete records.", type: "error" });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      setIsBulkDeleting(false);
      hideLoading();
    }
  };

  // --- Designation Mismatch Detection ---
  // Finds employees who have 2+ distinct designations across all visits
  const designationMismatches = useMemo(() => {
    const employeeDesignationMap: Record<string, { designation: string; count: number; ids: number[] }[]> = {};

    visits.forEach((v) => {
      const name = v.visitorName.trim();
      const desig = (v.designation || "").trim();
      if (!name || !desig) return;

      if (!employeeDesignationMap[name]) employeeDesignationMap[name] = [];

      const existing = employeeDesignationMap[name].find((d) => d.designation === desig);
      if (existing) {
        existing.count++;
        existing.ids.push(v.id);
      } else {
        employeeDesignationMap[name].push({ designation: desig, count: 1, ids: [v.id] });
      }
    });

    // Only return employees with 2+ distinct designations
    return Object.entries(employeeDesignationMap)
      .filter(([, designations]) => designations.length >= 2)
      .map(([employeeName, designations]) => ({
        employeeName,
        designations: designations.sort((a, b) => b.count - a.count), // most frequent first
        totalVisits: designations.reduce((s, d) => s + d.count, 0),
      }));
  }, [visits]);

  // Handler: open merge modal and pre-select most frequent designation per employee
  const handleOpenMergeModal = () => {
    const defaults: Record<string, string> = {};
    designationMismatches.forEach((m) => {
      defaults[m.employeeName] = m.designations[0].designation; // most frequent
    });
    setMergeSelections(defaults);
    setShowMergeDesignationModal(true);
  };

  // Handler: apply merge — update DB then local state
  const handleApplyMerge = async (employeeName: string) => {
    const chosenDesignation = mergeSelections[employeeName];
    if (!chosenDesignation) return;

    const mismatch = designationMismatches.find((m) => m.employeeName === employeeName);
    if (!mismatch) return;

    // IDs of records that need to change (all except those already matching)
    const idsToUpdate = mismatch.designations
      .filter((d) => d.designation !== chosenDesignation)
      .flatMap((d) => d.ids);

    if (idsToUpdate.length === 0) return;

    showLoading();
    try {
      const response = await fetch("/api/employee-visits-bulk/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: idsToUpdate,
          updates: { designation: chosenDesignation },
        }),
      });

      if (response.ok) {
        onUpdateVisits((prev) =>
          prev.map((v) =>
            idsToUpdate.includes(v.id)
              ? { ...v, designation: chosenDesignation }
              : v
          )
        );
        setFeedback({
          message: `"${employeeName}"-এর ${idsToUpdate.length}টি record-এ designation "${chosenDesignation}" করা হয়েছে।`,
          type: "success",
        });
        // Remove merged employee from selections
        setMergeSelections((prev) => {
          const next = { ...prev };
          delete next[employeeName];
          return next;
        });
      } else {
        setFeedback({ message: `Failed to update designation for "${employeeName}".`, type: "error" });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  // Handler: apply all merges at once
  const handleApplyAllMerges = async () => {
    const remaining = designationMismatches.filter(
      (m) => mergeSelections[m.employeeName]
    );
    if (remaining.length === 0) return;

    showLoading();
    try {
      let totalUpdated = 0;
      let allSuccess = true;

      for (const mismatch of remaining) {
        const chosenDesignation = mergeSelections[mismatch.employeeName];
        const idsToUpdate = mismatch.designations
          .filter((d) => d.designation !== chosenDesignation)
          .flatMap((d) => d.ids);

        if (idsToUpdate.length === 0) continue;

        const response = await fetch("/api/employee-visits-bulk/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: idsToUpdate,
            updates: { designation: chosenDesignation },
          }),
        });

        if (response.ok) {
          onUpdateVisits((prev) =>
            prev.map((v) =>
              idsToUpdate.includes(v.id)
                ? { ...v, designation: chosenDesignation }
                : v
            )
          );
          totalUpdated += idsToUpdate.length;
        } else {
          allSuccess = false;
        }
      }

      setFeedback({
        message: allSuccess
          ? `সব merge সম্পন্ন। মোট ${totalUpdated}টি record update হয়েছে।`
          : `কিছু record update হয়নি। ${totalUpdated}টি সফলভাবে update হয়েছে।`,
        type: allSuccess ? "success" : "error",
      });

      if (allSuccess) setShowMergeDesignationModal(false);
    } catch (error) {
      console.error(error);
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  const handleSelectAllForPerson = (visitorName: string) => {
    const personVisits = filteredVisits
      .filter((v) => v.visitorName === visitorName)
      .map((v) => v.id);
    setSelectedRowIds(new Set(personVisits));
    setFeedback({
      message: `Selected all ${personVisits.length} records for ${visitorName}.`,
      type: "info",
    });
  };

  // --- Handlers for Records Tab ---
  const VISIT_REQUIRED_HEADERS = [
    "Sl No",
    "Date",
    "Visitor Name",
    "Employee ID",
    "Department",
    "Designation",
    "Visited Project Name",
    "Entry Time",
    "Out Time",
    "Duration",
    "Formula",
  ];

  const handleClearRecords = async () => {
    if (
      window.confirm(
        "⚠️ WARNING: PERMANENT DELETION\n\nAre you ABSOLUTELY sure you want to delete ALL visit records? This action CANNOT be undone and will erase the entire database for visits.",
      ) &&
      window.confirm(
        "FINAL CONFIRMATION:\n\nIf you proceed, all data will be lost immediately. Do you really want to permanently delete all records?",
      )
    ) {
      showLoading();
      try {
        const response = await fetch("/api/employee-visits", {
          method: "DELETE",
        });
        if (response.ok) {
          onUpdateVisits([]);
          setFeedback({
            message: "All records have been cleared from MySQL database.",
            type: "info",
          });
        } else {
          setFeedback({
            message: "Failed to clear records from database.",
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error clearing visits:", error);
        setFeedback({ message: "Database connection error.", type: "error" });
      } finally {
        hideLoading();
      }
    }
  };

  const handleDeleteRecord = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    showLoading();
    try {
      const response = await fetch(`/api/employee-visits/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        onUpdateVisits((prev) => prev.filter((v) => v.id !== id));
        setFeedback({
          message: "Record deleted successfully.",
          type: "success",
        });
      } else {
        setFeedback({ message: "Failed to delete record.", type: "error" });
      }
    } catch (error) {
      console.error("Error deleting record:", error);
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  const handleEditRecord = (visit: EmployeeVisit) => {
    setEditingVisitId(visit.id);
    const dateStr = visit.date ? String(visit.date).split("T")[0] : "";
    setEditFormData({ ...visit, date: dateStr });
  };

  const handleSaveEdit = async () => {
    if (!editingVisitId) return;
    showLoading();
    try {
      const originalVisit = visits.find((v) => v.id === editingVisitId);
      const oldName = originalVisit?.visitorName;
      const response = await fetch(`/api/employee-visits/${editingVisitId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      if (response.ok) {
        const updatedVisit = await response.json();
        const updatedVisits = visits.map((v) =>
          v.id === editingVisitId ? { ...v, ...updatedVisit } : v,
        );
        onUpdateVisits(updatedVisits);
        if (oldName && editFormData.visitorName) {
          await syncWorkingDaysRename(oldName, editFormData.visitorName, updatedVisits);
        }
        setEditingVisitId(null);
        setFeedback({
          message: "Record updated successfully.",
          type: "success",
        });
      } else {
        setFeedback({ message: "Failed to update record.", type: "error" });
      }
    } catch (error) {
      console.error("Error updating record:", error);
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  // isDuplicateVisit: date + visitorName + projectName + entryTime same হলে duplicate
  const isDuplicateVisit = (incoming: EmployeeVisit): boolean => {
    return visits.some(
      (v) =>
        v.date === incoming.date &&
        v.visitorName.trim().toLowerCase() === incoming.visitorName.trim().toLowerCase() &&
        v.projectName.trim().toLowerCase() === incoming.projectName.trim().toLowerCase() &&
        v.entryTime.trim() === incoming.entryTime.trim(),
    );
  };

  const handleVisitFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    showLoading();

    if (typeof parseCSVRobustly === "undefined") {
      setFeedback({
        message: "CSV parsing utility is not available.",
        type: "error",
      });
      hideLoading();
      return;
    }

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<Record<string, string>>) => {
        try {
          const headers = results.meta.fields;
          const isValid =
            headers &&
            VISIT_REQUIRED_HEADERS.length === headers.length &&
            VISIT_REQUIRED_HEADERS.every((h, i) => headers[i]?.trim() === h);

          if (!isValid) {
            setFeedback({
              message: "CSV header mismatch. Please use the exact format from the downloaded template.",
              type: "error",
            });
            if (event.target) event.target.value = "";
            hideLoading();
            return;
          }

          const allParsedRows: EmployeeVisit[] = [];
          let hasError = false;
          let nameCorrectedCount = 0;

          results.data.forEach((row: Record<string, string>, index: number) => {
            if (hasError) return;

            const requiredDataFields = [
              "Date", "Visitor Name", "Department", "Designation",
              "Visited Project Name", "Entry Time", "Out Time", "Duration",
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

            // Resolve name + ID: if the row's Employee ID matches a known
            // employee, trust that ID and use the employee's official name
            // from the master list — this way a typo'd or extra-spaced
            // "Visitor Name" in the CSV doesn't stop the ID from matching,
            // and the saved record always carries the correct name.
            const typedName = (row["Visitor Name"] || "").trim();
            const csvEmployeeId = (row["Employee ID"] || "").trim();
            const matchedById = csvEmployeeId ? employeeById[csvEmployeeId.toLowerCase()] : undefined;

            let resolvedName = typedName;
            let resolvedId: string;
            if (matchedById) {
              resolvedId = matchedById.id;
              resolvedName = matchedById.name;
              if (matchedById.name.trim().toLowerCase() !== typedName.toLowerCase()) {
                nameCorrectedCount++;
              }
            } else {
              resolvedId = getEmployeeIdForName(typedName);
            }

            allParsedRows.push({
              id: Date.now() + index,
              date: formattedDate,
              visitorName: resolvedName,
              employeeId: resolvedId,
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
            const duplicateRows = allParsedRows.filter((r) => isDuplicateVisit(r));
            const newRows = allParsedRows.filter((r) => !isDuplicateVisit(r));
            setImportPreviewData({ newRows, duplicateRows, allParsedRows });
            setShowImportPreview(true);
            if (nameCorrectedCount > 0) {
              setFeedback({
                message: `${nameCorrectedCount}টি row-এ Employee ID মিলে যাওয়ায় নাম মাস্টার লিস্ট অনুযায়ী ঠিক করা হয়েছে।`,
                type: "info",
              });
            }
          }

          hideLoading();
        } catch (err) {
          console.error("Import error:", err);
          hideLoading();
        }
      },
      error: (error: Papa.ParseError) => {
        setFeedback({
          message: `CSV parsing error: ${error.message}`,
          type: "error",
        });
        hideLoading();
      },
    });

    if (event.target) event.target.value = "";
  };

  const handleConfirmImport = async (onlyNew: boolean) => {
    if (!importPreviewData) return;
    const dataToSave = onlyNew ? importPreviewData.newRows : importPreviewData.allParsedRows;
    if (dataToSave.length === 0) {
      setFeedback({ message: "Import করার মতো কোনো নতুন record নেই।", type: "info" });
      setShowImportPreview(false);
      setImportPreviewData(null);
      return;
    }
    showLoading();
    try {
      const response = await fetch("/api/employee-visits/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });

      if (response.ok) {
        const updatedResponse = await fetch("/api/employee-visits");
        if (updatedResponse.ok) {
          const updatedData = await updatedResponse.json();
          onUpdateVisits(updatedData);
        } else {
          onUpdateVisits((prev) => _.orderBy([...prev, ...dataToSave], ["date"], ["desc"]));
        }
        setFeedback({
          message: `সফলভাবে ${dataToSave.length}টি record import হয়েছে।`,
          type: "success",
        });
      } else {
        setFeedback({ message: "Database-এ save করা সম্ভব হয়নি।", type: "error" });
      }
    } catch (error) {
      console.error("Database error:", error);
      setFeedback({ message: "Server connection error।", type: "error" });
    } finally {
      hideLoading();
      setShowImportPreview(false);
      setImportPreviewData(null);
    }
  };

  const handleDownloadRecordsCSV = () => {
    // User-defined headers
    const headers = [
      "Sl No",
      "Date",
      "Visitor Name",
      "Employee ID",
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
      formatDateToDDMMMYYYY(visit.date),
      visit.visitorName,
      getEmployeeIdForName(visit.visitorName),
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

  const handleDownloadRecordsPDF = () => {
    const doc = new jsPDF("landscape", "mm", "legal");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    const headers = [
      "Sl No",
      "Date",
      "Visitor Name",
      "Department",
      "Designation",
      "Visited Project",
      "Entry Time",
      "Out Time",
      "Duration",
      "Formula",
    ];

    const dataForPdf = filteredVisits.map((visit, index) => [
      index + 1,
      formatDateToDDMMMYYYY(visit.date),
      visit.visitorName,
      visit.department,
      visit.designation,
      visit.projectName,
      visit.entryTime,
      visit.outTime,
      visit.duration,
      visit.remarks || "",
    ]);

    const formatDateForPDF = (date: Date) => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = date.toLocaleString("en-US", { month: "short" });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    };

    const drawHeader = (docInstance: jsPDF) => {
      const headerStartY = 8;
      docInstance
        .setFont("helvetica", "bold")
        .setFontSize(9)
        .setTextColor(234, 88, 12);
      docInstance.text(
        "Credence Housing Limited",
        pageWidth / 2,
        headerStartY,
        { align: "center" },
      );
      docInstance
        .setFont("helvetica", "normal")
        .setFontSize(7)
        .setTextColor(100);
      docInstance.text(
        "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
        pageWidth / 2,
        headerStartY + 3.5,
        { align: "center" },
      );
      docInstance
        .setDrawColor(220)
        .setLineWidth(0.15)
        .line(margin, 14, pageWidth - margin, 14);

      // == REPORT TITLE ON EVERY PAGE ==
      const titleY = 20;
      docInstance.setFontSize(10).setFont("helvetica", "bold").setTextColor(40);
      const title = `Employee Project Visit Records`;
      docInstance.text(title, pageWidth / 2, titleY, { align: "center" });

      docInstance
        .setFont("helvetica", "normal")
        .setFontSize(7.5)
        .setTextColor(100);
      docInstance.text(
        `Preparing Date: ${formatDateForPDF(new Date())}`,
        pageWidth - margin,
        titleY,
        { align: "right" },
      );
    };

    autoTable(doc, {
      head: [headers],
      body: dataForPdf,
      startY: 25,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [44, 62, 80], textColor: 255 }, // Dark navy header instead of orange, consistent with other table headers in PDF export
      margin: { top: 25, bottom: 20, left: margin, right: margin },
      didDrawPage: () => {
        drawHeader(doc);
      },
    });

    const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7).setTextColor(100);

      // Left Side: System Note
      doc.text(
        "It is a system generated report, no signature is required.",
        margin,
        pageHeight - 12,
      );

      // Left Side (below): Prepared by
      doc.text(`Prepared by: ${currentUser.name}`, margin, pageHeight - 8);

      // Right Side: Page numbering
      const pageText = `Page ${String(i)} of ${String(pageCount)}`;
      doc.text(pageText, pageWidth - margin, pageHeight - 8, {
        align: "right",
      });
    }

    doc.save("employee_visits_export.pdf");
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
        getEmployeeIdForName("Wayes Ah") !== "—" ? getEmployeeIdForName("Wayes Ah") : "EMP-001",
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
        getEmployeeIdForName("Md. Abul Emon") !== "—" ? getEmployeeIdForName("Md. Abul Emon") : "EMP-002",
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

    if (typeof parseCSVRobustly === "undefined") {
      setFeedback({
        message: "CSV parsing utility is not available.",
        type: "error",
      });
      hideLoading();
      return;
    }

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<Record<string, string>>) => {
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
            .map((row: Record<string, string>) => ({
              "Emp. Name": row["Emp. Name"],
              "Emp. Code": row["Emp. Code"],
              Designation: row["Designation"],
            }))
            .filter((r: AttendanceRecord) => r["Emp. Name"] && r["Emp. Code"]);

          if (newAttendanceRecords.length === 0) {
            setFeedback({
              message: `No valid employee records found in the CSV.`,
              type: "error",
            });
            return;
          }

          onUpdateAttendanceData((prev) =>
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
      error: (error: Papa.ParseError) => {
        setFeedback({
          message: `CSV parsing error: ${error.message}`,
          type: "error",
        });
        hideLoading();
      },
    });
  };

  const handleSaveNewEntry = async (
    shouldClose: boolean = true,
    customFormData?: Partial<EmployeeVisit>,
  ) => {
    const dataToSave = customFormData ? { ...entryFormData, ...customFormData } : entryFormData;
    if (
      !dataToSave.date ||
      !dataToSave.visitorName ||
      !dataToSave.projectName ||
      !dataToSave.entryTime ||
      !dataToSave.outTime
    ) {
      setFeedback({
        message: "Please fill in all required fields.",
        type: "error",
      });
      return;
    }

    showLoading();
    try {
      const response = await fetch("/api/employee-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });

      if (response.ok) {
        const newVisit = await response.json();
        onUpdateVisits((prev) => [newVisit, ...prev]);
        
        if (shouldClose) {
          setShowEntryModal(false);
          setEntryFormData({
            date: isSessionActive ? sessionData.date : new Date().toISOString().split("T")[0],
            visitorName: "",
            department: "",
            designation: "",
            projectName: isSessionActive ? sessionData.projectName : "",
            entryTime: "",
            outTime: "",
            duration: "0:0:0",
            remarks: "",
            images: isSessionActive ? sessionData.images : [],
          });
        } else {
          // Keep common fields (date, projectName, images) for the session
          setEntryFormData((prev) => ({
            ...prev,
            date: isSessionActive ? sessionData.date : prev.date,
            projectName: isSessionActive ? sessionData.projectName : prev.projectName,
            images: isSessionActive ? sessionData.images : prev.images,
            visitorName: "",
            department: "",
            designation: "",
            entryTime: "",
            outTime: "",
            duration: "0:0:0",
            remarks: "",
          }));
          setTimeout(() => {
            visitorSelectRef.current?.focus?.();
            visitorSelectRef.current?.focusInput?.();
          }, 200);
        }

        setFeedback({
          message: "Visit entry saved successfully.",
          type: "success",
        });
      } else {
        const err = await response.json();
        setFeedback({
          message: err.error || "Failed to save visit entry.",
          type: "error",
        });
      }
    } catch (error) {
      setFeedback({ message: "Database connection error.", type: "error" });
    } finally {
      hideLoading();
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const loaders = Array.from(files).map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(loaders).then(async (base64Strings) => {
      if (showSessionImageModal) {
        const newImages = [...(sessionData.images || []), ...base64Strings].slice(0, 3);
        setSessionData((prev) => ({
          ...prev,
          images: newImages,
        }));
        // Auto-save to visit book if in session or setting up session
        try {
          await fetch("/api/visit-book", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: sessionData.date,
              projectName: sessionData.projectName,
              images: newImages
            })
          });
        } catch (err) {
          console.error("Failed to save visit book:", err);
        }
      } else {
        setEntryFormData((prev) => ({
          ...prev,
          images: [...(prev.images || []), ...base64Strings].slice(0, 3), // Limit to 3
        }));
      }
    });
  };

  const removeImage = async (index: number) => {
    if (showSessionImageModal) {
      const newImages = (sessionData.images || []).filter((_, i) => i !== index);
      setSessionData((prev) => ({
        ...prev,
        images: newImages,
      }));
      // Auto-save update to server
      try {
        await fetch("/api/visit-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: sessionData.date,
            projectName: sessionData.projectName,
            images: newImages
          })
        });
      } catch (err) {
        console.error("Failed to update visit book:", err);
      }
    } else {
      setEntryFormData((prev) => ({
        ...prev,
        images: (prev.images || []).filter((_, i) => i !== index),
      }));
    }
  };

  return (
    <>
      {/* Page Content */}
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        {/* Gradient border container */}
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden text-slate-800">
          <div className="bg-transparent">
            <div className="p-6">
              {activeTab === "entry" && (
                <div className="fade-in p-6 space-y-6">
                  {/* Session Control Banner */}
                  <div className={`p-4 rounded-2xl border transition-all ${
                    isSessionActive 
                      ? "bg-orange-50 border-orange-200 shadow-inner" 
                      : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isSessionActive ? "bg-orange-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                          <MapPin size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800">
                            {isSessionActive ? "Project Session Active" : "Standard Entry Mode"}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {isSessionActive 
                              ? `Entering multiple visits for ${sessionData.projectName}` 
                              : "Set a session to lock project details and images for multiple rows."}
                          </p>
                        </div>
                      </div>

                      {!isSessionActive ? (
                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                          <input 
                            type="date" 
                            value={sessionData.date}
                            onChange={(e) => setSessionData({...sessionData, date: e.target.value})}
                            className="px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-orange-500"
                          />
                          <div className="min-w-[200px]">
                            <SearchableSelect 
                              id="session-project"
                              options={projectNames}
                              value={sessionData.projectName}
                              onChange={(val) => setSessionData({...sessionData, projectName: val})}
                              placeholder="Select Project for Session"
                              className="!mt-0"
                            />
                          </div>
                          <button 
                            onClick={() => {
                              setShowSessionImageModal(true);
                            }}
                            className="bg-white border border-slate-300 p-2 rounded-lg text-slate-600 hover:bg-slate-50 relative"
                            title="Add Session Photos"
                          >
                            <Camera size={18} />
                            {sessionData.images.length > 0 && (
                              <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-[8px] px-1 rounded-full">{sessionData.images.length}</span>
                            )}
                          </button>
                          <button 
                            disabled={!sessionData.projectName}
                            onClick={() => setIsSessionActive(true)}
                            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                          >
                            Start Project Session
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          {(sessionData.images && Array.isArray(sessionData.images) && sessionData.images.length > 0) && (
                            <div className="flex -space-x-2">
                              {sessionData.images.map((img, i) => (
                                <img key={i} src={img} className="h-8 w-8 rounded-full border-2 border-white object-cover" alt="" />
                              ))}
                            </div>
                          )}
                          <div className="text-right">
                            <span className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider">{sessionData.date}</span>
                            <span className="block text-sm font-bold text-slate-800">{sessionData.projectName}</span>
                          </div>
                          <button 
                            onClick={() => {
                              setIsSessionActive(false);
                              setSessionData(prev => ({ ...prev, projectName: "", images: [] }));
                              setEntryFormData(prev => ({ ...prev, projectName: "", images: [] }));
                            }}
                            className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-300 transition-all active:scale-95"
                          >
                            End Session
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Main Entry Area */}
                    <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-800">Visit Entry</h2>
                        <div className="flex items-center gap-3">
                          {(currentUser.role === "super_admin" ||
                            currentUser.role === "admin" ||
                            permissions.employeeProjectVisit?.edit) && (
                            <button
                              onClick={() => {
                                setShowEntryModal(true);
                                setEntryFormData({
                                  date: isSessionActive ? sessionData.date : new Date().toISOString().split("T")[0],
                                  visitorName: "",
                                  department: "",
                                  designation: "",
                                  projectName: isSessionActive ? sessionData.projectName : "",
                                  entryTime: "",
                                  outTime: "",
                                  duration: "0:0:0",
                                  remarks: "",
                                  images: isSessionActive ? sessionData.images : [],
                                });
                              }}
                              className="bg-orange-600 shadow-lg shadow-orange-600/20 text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-orange-700 active:scale-95 transition-all"
                            >
                              <Plus className="h-4 w-4" />
                              New Entry
                            </button>
                          )}
                          <button
                            onClick={() => setShowProgressModal(true)}
                            className="bg-white border border-slate-200 shadow-sm text-slate-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-50 active:scale-95 transition-all"
                          >
                            <RefreshCw className="h-4 w-4 text-orange-600" />
                            Progress Tracker
                          </button>
                        </div>
                      </div>

                        {/* Reference Image Slider (Bigger, Above Table) */}
                        <AnimatePresence>
                          {isSessionActive && sessionData.images.length > 0 && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                            <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-4 flex flex-col gap-4">
                              {isImageMinimized ? (
                                <div className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-2">
                                  <div className="flex items-center gap-3">
                                    {/* Thumbnail strip - small versions of session images */}
                                    {sessionData.images.map((img, idx) => (
                                      <button key={idx} onClick={() => { setCurrentRefImageIdx(idx); syncPopOut(); }}
                                        className={`w-10 h-10 rounded-lg overflow-hidden border-2 ${currentRefImageIdx === idx ? "border-orange-500" : "border-transparent"}`}>
                                        <img src={img} className="w-full h-full object-cover" />
                                      </button>
                                    ))}
                                    <span className="text-white text-[10px] font-bold opacity-60">
                                      {sessionData.projectName} · {sessionData.date}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* Sync button */}
                                    <button onClick={syncPopOut}
                                      className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded-lg pointer-events-auto">
                                      Sync →
                                    </button>
                                    {/* Restore/Expand button */}
                                    <button onClick={() => setIsImageMinimized(false)}
                                      className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold rounded-lg pointer-events-auto">
                                      Expand
                                    </button>
                                    {/* Close pop-out */}
                                    <button onClick={() => { poppedOutWindow?.close(); setPoppedOutWindow(null); setIsImageMinimized(false); }}
                                      className="px-2 py-1 bg-red-500/80 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg pointer-events-auto">
                                      Close Pop-out
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div 
                                  ref={previewImgRef}
                                  className={`w-full relative group rounded-xl overflow-hidden bg-slate-900 h-[400px] ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setIsDragging(true);
                                    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                                  }}
                                  onMouseMove={(e) => {
                                    if (isDragging) {
                                      setPanOffset({
                                        x: e.clientX - dragStart.x,
                                        y: e.clientY - dragStart.y,
                                      });
                                    }
                                  }}
                                  onMouseUp={() => setIsDragging(false)}
                                  onMouseLeave={() => setIsDragging(false)}
                                >
                                  <img
                                    src={(sessionData.images || [])[currentRefImageIdx]}
                                    className="w-full h-auto block pointer-events-none select-none"
                                    alt="Reference"
                                    style={{ 
                                      transformOrigin: "top center",
                                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                                      transition: isDragging ? "none" : "transform 0.1s ease-out"
                                    }}
                                  />
                                  <div className="absolute top-2 left-2 flex items-center gap-2 z-10 select-none">
                                    <button
                                      type="button"
                                      onClick={handlePopOutImage}
                                      className="bg-black/50 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 hover:text-orange-400 active:scale-95 transition-all outline-none pointer-events-auto"
                                      title="Open in new window (move to secondary monitor)"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M15 3h6v6" />
                                        <path d="M10 14 21 3" />
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      </svg>
                                      Pop-out
                                    </button>
                                    {poppedOutWindow && !poppedOutWindow.closed && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const images = sessionData.images || [];
                                          const src = images[currentRefImageIdx];
                                          if (src) {
                                            syncPoppedOutWindow(poppedOutWindow, src);
                                          }
                                        }}
                                        className="bg-black/50 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 hover:text-orange-400 active:scale-95 transition-all outline-none pointer-events-auto"
                                        title="Update popped-out window with current image"
                                      >
                                        Sync →
                                      </button>
                                    )}
                                  </div>
                                  <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-white text-[10px] font-medium pointer-events-none">
                                    {sessionData.projectName} · {sessionData.date}
                                  </div>
                                  <div className="absolute top-2 right-2 flex items-center bg-black/50 backdrop-blur px-2.5 py-1 rounded-full text-white text-[10px] font-bold gap-1 z-10 select-none">
                                    <button
                                      onClick={() => setZoomLevel((prev) => Math.min(prev + 0.5, 8))}
                                      className="px-1.5 focus:outline-none hover:text-orange-400 active:scale-95 transition-all text-sm font-extrabold"
                                      title="Zoom In"
                                      type="button"
                                    >
                                      +
                                    </button>
                                    <span className="px-1 min-w-[36px] text-center font-bold">{Math.round(zoomLevel * 100)}%</span>
                                    <button
                                      onClick={() => setZoomLevel((prev) => Math.max(prev - 0.5, 1))}
                                      className="px-1.5 focus:outline-none hover:text-orange-400 active:scale-95 transition-all text-sm font-extrabold"
                                      title="Zoom Out"
                                      type="button"
                                    >
                                      -
                                    </button>
                                    <button
                                      onClick={() => {
                                        setZoomLevel(1);
                                        setPanOffset({ x: 0, y: 0 });
                                      }}
                                      className="ml-1 pl-1.5 border-l border-white/20 focus:outline-none hover:text-orange-400 active:scale-95 transition-all font-bold"
                                      title="Reset Zoom"
                                      type="button"
                                    >
                                      Reset
                                    </button>
                                  </div>
                                  {sessionData.images.length > 1 && (
                                    <>
                                      <button
                                        onClick={() => setCurrentRefImageIdx((prev) => (prev === 0 ? sessionData.images.length - 1 : prev - 1))}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all opacity-0 group-hover:opacity-100"
                                      >
                                        <ChevronLeft size={20} />
                                      </button>
                                      <button
                                        onClick={() => setCurrentRefImageIdx((prev) => (prev === sessionData.images.length - 1 ? 0 : prev + 1))}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all opacity-0 group-hover:opacity-100"
                                      >
                                        <ChevronRight size={20} />
                                      </button>
                                    </>
                                  )}
                                  <div className="absolute top-2 right-2 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-white text-[10px] font-bold">
                                    {currentRefImageIdx + 1} / {sessionData.images.length}
                                  </div>
                                </div>
                              )}
                                <div className="space-y-4">
                                  {(sessionData.images && Array.isArray(sessionData.images) && sessionData.images.length > 0) && (
                                    <div className="flex flex-row flex-wrap gap-2">
                                      {sessionData.images.map((img, idx) => (
                                        <button
                                          key={idx}
                                          onClick={() => setCurrentRefImageIdx(idx)}
                                          className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all relative ${
                                            currentRefImageIdx === idx ? "border-orange-500 ring-2 ring-orange-500/20" : "border-transparent opacity-60 hover:opacity-100"
                                          }`}
                                        >
                                          <img src={img} className="w-full h-full object-cover" alt="" />
                                          {currentRefImageIdx === idx && (
                                            <div className="absolute inset-0 bg-orange-500/10 pointer-events-none" />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                                    <p className="text-[11px] text-orange-700 font-medium leading-relaxed">
                                      Viewing reference photos for <span className="font-bold underline">{sessionData.projectName}</span> on <span className="font-bold underline">{sessionData.date}</span>. Use these to verify entries.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                      {/* Table */}
                      <div className="border border-slate-200 rounded-lg shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200 border-separate border-spacing-0">
                          <thead className="bg-slate-100 sticky top-0 z-20 shadow-sm">
                            <tr>
                              {[
                                "Date",
                                "Visitor Name",
                                "Department",
                                "Designation",
                                "Visited Project Name",
                                "Entry Time",
                                "Out Time",
                                "Duration",
                                "Images",
                                "Formula",
                                "Actions",
                              ].map((header) => (
                                <th
                                  key={header}
                                  className="px-2 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-tighter"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {/* Visual Hint Row */}
                            <tr className="bg-slate-50/20 no-print">
                              <td colSpan={11} className="px-1 py-0.5 text-[9px] text-slate-300 italic text-left select-none">
                                Tab → next field  |  Enter → save & next
                              </td>
                            </tr>

                            {/* Spreadsheet Style Entry Row */}
                            {(currentUser.role === "super_admin" ||
                              currentUser.role === "admin" ||
                              permissions.employeeProjectVisit?.edit) && (
                              <tr className="bg-orange-50/60 border-b-2 border-orange-200">
                                <td className="px-1 py-0.5">
                                  <input
                                    type="date"
                                    readOnly={isSessionActive}
                                    value={entryFormData.date}
                                    onChange={(e) =>
                                      setEntryFormData({
                                        ...entryFormData,
                                        date: e.target.value,
                                      })
                                    }
                                    className={`w-24 px-1 py-0.5 text-[11px] border border-orange-200 rounded focus:ring-1 focus:ring-orange-500 outline-none ${isSessionActive ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                                    title="Date"
                                  />
                                </td>
                                <td className="px-1 py-0.5 min-w-[140px]">
                                  <SearchableSelect
                                    ref={visitorSelectRef}
                                    id="inline-visitor"
                                    options={allEmployees.map((e) => e.name)}
                                    value={entryFormData.visitorName || ""}
                                    onKeyDown={handleVisitorKeyDown}
                                    onChange={(name) => {
                                      const emp = allEmployees.find(
                                        (a) => a.name === name,
                                      );
                                      setEntryFormData((prev) => ({
                                        ...prev,
                                        visitorName: name,
                                        department: emp?.department || "",
                                        designation: emp?.designation || "",
                                      }));
                                    }}
                                    placeholder="Visitor Name"
                                    className="!py-0 !px-0 !text-[11px]"
                                  />
                                </td>
                                <td className="px-1 py-0.5">
                                  <input
                                    type="text"
                                    value={entryFormData.department || ""}
                                    placeholder="Dept"
                                    onKeyDown={handleKeyDown}
                                    onChange={(e) =>
                                      setEntryFormData({
                                        ...entryFormData,
                                        department: e.target.value,
                                      })
                                    }
                                    className="w-full px-1 py-0.5 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-orange-500 outline-none bg-slate-50"
                                  />
                                </td>
                                <td className="px-1 py-0.5">
                                  <input
                                    type="text"
                                    value={entryFormData.designation || ""}
                                    placeholder="Desig"
                                    onKeyDown={handleKeyDown}
                                    onChange={(e) =>
                                      setEntryFormData({
                                        ...entryFormData,
                                        designation: e.target.value,
                                      })
                                    }
                                    className="w-full px-1 py-0.5 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-orange-500 outline-none bg-slate-50"
                                  />
                                </td>
                                <td className="px-1 py-0.5 min-w-[140px]">
                                  <SearchableSelect
                                    id="inline-project"
                                    readOnly={isSessionActive}
                                    options={projectNames}
                                    value={entryFormData.projectName || ""}
                                    onKeyDown={handleKeyDown}
                                    onChange={(name) =>
                                      setEntryFormData({
                                        ...entryFormData,
                                        projectName: name,
                                      })
                                    }
                                    placeholder="Select Project"
                                    className={`!py-0 !px-0 !text-[11px] ${isSessionActive ? "opacity-60 grayscale cursor-not-allowed" : ""}`}
                                  />
                                </td>
                                <td className="px-1 py-0.5">
                                  <input
                                    ref={entryTimeInputRef}
                                    type="text"
                                    placeholder="HH:MM"
                                    pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                                    maxLength={5}
                                    value={entryFormData.entryTime}
                                    onKeyDown={handleEntryTimeKeyDown}
                                    onChange={(e) => {
                                      const newIn = e.target.value;
                                      setEntryFormData((prev) => ({
                                        ...prev,
                                        entryTime: newIn,
                                        duration: calculateDuration(
                                          newIn,
                                          prev.outTime || "",
                                        ),
                                      }));
                                    }}
                                    onBlur={(e) => {
                                      const raw = e.target.value;
                                      const formatted = formatTimeStr(raw);
                                      if (formatted) {
                                        setEntryFormData(prev => ({
                                          ...prev,
                                          entryTime: formatted,
                                          duration: calculateDuration(formatted, prev.outTime || '')
                                        }));
                                        setTimeout(() => {
                                          outTimeInputRef.current?.focus();
                                        }, 50);
                                      } else {
                                        setEntryFormData(prev => ({
                                          ...prev,
                                          entryTime: '',
                                          duration: calculateDuration('', prev.outTime || '')
                                        }));
                                      }
                                    }}
                                    className="w-20 px-1 py-0.5 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                                  />
                                </td>
                                <td className="px-1 py-0.5">
                                  <input
                                    ref={outTimeInputRef}
                                    type="text"
                                    placeholder="HH:MM"
                                    pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                                    maxLength={5}
                                    value={entryFormData.outTime}
                                    onKeyDown={handleOutTimeKeyDown}
                                    onChange={(e) => {
                                      const newOut = e.target.value;
                                      setEntryFormData((prev) => ({
                                        ...prev,
                                        outTime: newOut,
                                        duration: calculateDuration(
                                          prev.entryTime || "",
                                          newOut,
                                        ),
                                      }));
                                    }}
                                    onBlur={(e) => {
                                      const raw = e.target.value;
                                      const formatted = formatTimeStr(raw);
                                      if (formatted) {
                                        setEntryFormData(prev => ({
                                          ...prev,
                                          outTime: formatted,
                                          duration: calculateDuration(prev.entryTime || '', formatted)
                                        }));
                                      } else {
                                        setEntryFormData(prev => ({
                                          ...prev,
                                          outTime: '',
                                          duration: calculateDuration(prev.entryTime || '', '')
                                        }));
                                      }
                                    }}
                                    className="w-20 px-1 py-0.5 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                                  />
                                </td>
                                <td className="px-1 py-0.5 text-center text-[11px] font-bold text-orange-700 bg-orange-100/50">
                                  {entryFormData.duration || "0:0:0"}
                                </td>
                                <td className="px-1 py-0.5 flex justify-center">
                                  <button
                                    disabled={isSessionActive}
                                    onClick={() => {
                                      setShowEntryImageModal(true);
                                    }}
                                    className={`p-1 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${
                                      (entryFormData.images?.length || 0) > 0
                                        ? "bg-orange-100 border-orange-300 text-orange-600 shadow-sm"
                                        : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                    } ${isSessionActive ? "opacity-50 grayscale cursor-help" : ""}`}
                                    title={isSessionActive ? "Photos locked by session" : "Attach Photos (Max 3)"}
                                  >
                                    <Camera size={12} />
                                    <span className="text-[8px] font-black">
                                      {(entryFormData.images?.length || 0)}/3
                                    </span>
                                  </button>
                                </td>
                                <td className="px-1 py-0.5 text-[10px] text-slate-500 italic max-w-[100px] truncate">
                                  {getDurationFormula(entryFormData.duration || "")}
                                </td>
                                <td className="px-1 py-0.5">
                                  <button
                                    onClick={() => handleSaveNewEntry(false)}
                                    className="w-full flex items-center justify-center p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-sm active:scale-95 transition-all"
                                    title="Quick Save & Add Another"
                                  >
                                    <Save size={14} />
                                  </button>
                                </td>
                              </tr>
                            )}

                            {/* Recent Entries */}
                            {!isSessionActive && (() => {
                              const recent = visits.slice(0, 3);
                              
                              return recent.map(visit => (
                                <tr key={visit.id} className="bg-slate-50/50 hover:bg-orange-50/30 transition-colors text-[10px]">
                                  <td className="px-1 py-1 whitespace-nowrap">{formatDateToDDMMMYYYY(visit.date)}</td>
                                  <td className="px-1 py-1 whitespace-nowrap font-medium text-slate-800">{visit.visitorName}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">{visit.department}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">{visit.designation}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">{visit.projectName}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">{visit.entryTime}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">{visit.outTime}</td>
                                  <td className="px-1 py-1 whitespace-nowrap text-orange-600 font-bold">{visit.duration}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">
                                    <div className="flex -space-x-2">
                                      {(visit.images || []).map((img, i) => (
                                        <img key={i} src={img} className="h-6 w-6 rounded-full border-2 border-white object-cover" alt="" onClick={() => window.open(img, "_blank")} />
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-1 py-1 whitespace-nowrap italic text-slate-400">{getDurationFormula(visit.duration)}</td>
                                  <td className="px-1 py-1 whitespace-nowrap">
                                    <div className="flex gap-2 justify-center">
                                      <button onClick={() => handleEditRecord(visit)} className="p-1 text-slate-400 hover:text-orange-600 transition-all"><Edit2 size={12} /></button>
                                      <button onClick={() => handleDeleteRecord(visit.id)} className="p-1 text-slate-400 hover:text-red-600 transition-all"><Trash2 size={12} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>

                      {/* Session Records Table (Show all entries for this session) */}
                      {isSessionActive && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                              Records in Current Session
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              {visits.filter(v => v.date === sessionData.date && v.projectName === sessionData.projectName).length} Entries
                            </span>
                          </div>
                          <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-slate-100">
                              <thead className="bg-slate-50">
                                <tr>
                                  {["Visitor", "Time In/Out", "Duration", "Images", "Remarks", "Action"].map(h => (
                                    <th key={h} className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-tighter">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {visits
                                  .filter(v => v.date === sessionData.date && v.projectName === sessionData.projectName)
                                  .map(visit => (
                                    <tr key={visit.id} className="hover:bg-orange-50/30 transition-colors">
                                      <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-800">{visit.visitorName}</span>
                                          <span className="text-[9px] text-slate-400">{visit.designation}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                          <Clock size={10} className="text-orange-500" />
                                          {visit.entryTime} - {visit.outTime}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">
                                          {visit.duration}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex -space-x-1">
                                          {(visit.images || []).map((img, i) => (
                                            <img 
                                              key={i} 
                                              src={img} 
                                              className="h-6 w-6 rounded-full border border-white object-cover cursor-zoom-in" 
                                              alt="" 
                                              onClick={() => window.open(img, "_blank")} 
                                            />
                                          ))}
                                          {(!visit.images || visit.images.length === 0) && (
                                            <span className="text-[9px] text-slate-300">No photos</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 max-w-[150px] truncate">
                                        <span className="text-[10px] text-slate-500 italic">{visit.remarks || "-"}</span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                          <button onClick={() => handleEditRecord(visit)} className="p-1 hover:bg-white rounded shadow-sm text-slate-400 hover:text-orange-600 transition-all">
                                            <Edit2 size={12} />
                                          </button>
                                          <button onClick={() => handleDeleteRecord(visit.id)} className="p-1 hover:bg-white rounded shadow-sm text-slate-400 hover:text-red-600 transition-all">
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                {visits.filter(v => v.date === sessionData.date && v.projectName === sessionData.projectName).length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-[10px] text-slate-400 italic">
                                      No entries yet for this session. Start typing above!
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* No old records shown here message */}
                      {!isSessionActive && visits.length === 0 && (
                        <div className="p-8 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                          <p className="text-sm italic">Fill in the row above to add a new visit record.</p>
                        </div>
                      )}
                    </div>
                  </div>
              )}

              {activeTab === "records" && (
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
                      {(currentUser.role === "super_admin" ||
                        currentUser.role === "admin" ||
                        permissions.employeeProjectVisit_import?.view) && (
                        <label
                          htmlFor="csv-upload"
                          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
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
                          Import CSV File
                        </label>
                      )}
                      {(currentUser.role === "super_admin" ||
                        currentUser.role === "admin" ||
                        permissions.employeeProjectVisit_import?.view) && (
                        <input
                          id="csv-upload"
                          type="file"
                          ref={fileInputRef}
                          onChange={handleVisitFileUpload}
                          className="sr-only"
                          accept=".csv"
                        />
                      )}
                      {(currentUser.role === "super_admin" ||
                        currentUser.role === "admin" ||
                        permissions.employeeProjectVisit_template?.view) && (
                        <button
                          onClick={handleDownloadVisitTemplate}
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
                      )}
                      <button
                        onClick={handleDownloadRecordsCSV}
                        disabled={filteredVisits.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M6.293 7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Export
                      </button>
                      <button
                        onClick={handleDownloadRecordsPDF}
                        disabled={filteredVisits.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        title="Download PDF"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        PDF
                      </button>
                    </div>
                    {(currentUser.role === "super_admin" ||
                      currentUser.role === "admin" ||
                      permissions.employeeProjectVisit_clear?.view) && (
                      <button
                        onClick={handleClearRecords}
                        disabled={visits.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200"
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
                    )}
                  </div>
                  {/* Designation Mismatch Warning Banner */}
                  {designationMismatches.length > 0 && (
                    <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-amber-800">
                          {designationMismatches.length} জন employee-এর designation mismatch আছে
                        </span>
                        <span className="text-xs text-amber-600">— একই ব্যক্তির ভিন্ন ভিন্ন designation পাওয়া গেছে</span>
                      </div>
                      <button
                        onClick={handleOpenMergeModal}
                        className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-md shadow-sm transition-colors"
                      >
                        Fix & Merge
                      </button>
                    </div>
                  )}

                  {/* Bulk Actions & Pagination Info */}
                  <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4 px-1">
                    <div className="flex items-center gap-3">
                      {selectedRowIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 transition-all">
                          <span className="text-sm font-medium text-orange-700 bg-orange-100 px-3 py-1 rounded-full">
                            {selectedRowIds.size} Selected
                          </span>
                          <button
                            onClick={() => setShowBulkEditModal(true)}
                            className="text-sm bg-orange-600 text-white px-4 py-1.5 rounded-md hover:bg-orange-700 shadow-sm transition-colors"
                          >
                            Bulk Edit
                          </button>
                          <button
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className="text-sm bg-red-600 text-white px-4 py-1.5 rounded-md hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isBulkDeleting ? "Deleting..." : "Bulk Delete"}
                          </button>
                          <button
                            onClick={() => setSelectedRowIds(new Set())}
                            className="text-sm text-slate-500 hover:text-slate-700 px-2 underline"
                          >
                            Deselect All
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                          className="p-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title="Previous page"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>
                          Page {currentPage} of {totalPages || 1} (
                          {filteredVisits.length} Records)
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                          disabled={currentPage >= (totalPages || 1)}
                          className="p-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title="Next page"
                        >
                          <ChevronRight size={16} />
                        </button>
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

                  <div
                    className="overflow-auto border border-slate-200 rounded-lg shadow-sm"
                    style={{ maxHeight: "40rem" }}
                  >
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="px-2 py-2 text-left">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500"
                              onChange={handleSelectAll}
                              checked={
                                paginatedVisits.length > 0 &&
                                paginatedVisits.every((v) =>
                                  selectedRowIds.has(v.id),
                                )
                              }
                            />
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                            Sl No
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Visitor Name
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Department
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Designation
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Visited Project Name
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Entry Time
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Out Time
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Duration
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Photos
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                            Formula
                          </th>
                          <th className="px-2 py-2 text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider no-print">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {isVisitsLoading ? (
                          Array.from({ length: 10 }).map((_, i) => (
                            <SkeletonRow key={`skeleton-${i}`} cols={13} />
                          ))
                        ) : paginatedVisits.length > 0 ? (
                          paginatedVisits.map((visit, index) => (
                            <tr
                              key={visit.id}
                              className={`${selectedRowIds.has(visit.id) ? "bg-orange-50/50" : "hover:bg-slate-50"} transition-colors`}
                            >
                              <td className="px-2 py-1 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500"
                                  checked={selectedRowIds.has(visit.id)}
                                  onChange={() => handleSelectRow(visit.id)}
                                />
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                {(currentPage - 1) * rowsPerPage + index + 1}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="date"
                                    value={editFormData.date}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        date: e.target.value,
                                      })
                                    }
                                    className="w-32 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  />
                                ) : (
                                  formatDateToDDMMMYYYY(visit.date)
                                )}
                              </td>
                              <td className="px-2 py-1 text-[11px] text-slate-600 font-medium">
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="text"
                                    value={editFormData.visitorName}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        visitorName: e.target.value,
                                      })
                                    }
                                    className="w-32 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 group">
                                    <span>{visit.visitorName}</span>
                                    <button
                                      onClick={() =>
                                        handleSelectAllForPerson(
                                          visit.visitorName,
                                        )
                                      }
                                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-all text-[10px] font-bold uppercase border border-slate-200"
                                      title="Select all for this person"
                                    >
                                      All
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                                {getEmployeeIdForName(
                                  editingVisitId === visit.id
                                    ? editFormData.visitorName
                                    : visit.visitorName,
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                {editingVisitId === visit.id ? (
                                  <select
                                    value={editFormData.department}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        department: e.target.value,
                                      })
                                    }
                                    className="w-28 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  >
                                    {_.uniq(DEPARTMENTS).map((d) => (
                                      <option key={d} value={d}>
                                        {d}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  visit.department
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="text"
                                    value={editFormData.designation}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        designation: e.target.value,
                                      })
                                    }
                                    className="w-32 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  />
                                ) : (
                                  visit.designation
                                )}
                              </td>
                              <td className="px-2 py-1 text-[11px] text-slate-500">
                                {editingVisitId === visit.id ? (
                                  <select
                                    value={editFormData.projectName}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        projectName: e.target.value,
                                      })
                                    }
                                    className="w-48 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  >
                                    {projectNames.map((p) => (
                                      <option key={p} value={p}>
                                        {p}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  visit.projectName
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="text"
                                    value={editFormData.entryTime}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        entryTime: e.target.value,
                                      })
                                    }
                                    className="w-20 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  />
                                ) : (
                                  visit.entryTime
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="text"
                                    value={editFormData.outTime}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        outTime: e.target.value,
                                      })
                                    }
                                    className="w-20 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  />
                                ) : (
                                  visit.outTime
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="text"
                                    value={editFormData.duration}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        duration: e.target.value,
                                      })
                                    }
                                    className="w-20 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  />
                                ) : (
                                  visit.duration
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500">
                                <div className="flex -space-x-2 overflow-hidden">
                                  {(Array.isArray(visit.images) ? visit.images : []).map((img, i) => (
                                    <img
                                      key={i}
                                      src={img}
                                      alt=""
                                      className="h-6 w-6 rounded-full border-2 border-white object-cover shadow-sm hover:scale-125 hover:z-10 transition-all cursor-pointer"
                                      title={`View photo ${i + 1}`}
                                      onClick={() => window.open(img, "_blank")}
                                    />
                                  ))}
                                  {(!Array.isArray(visit.images) || visit.images.length === 0) && (
                                    <span className="text-[10px] text-slate-300 italic font-medium">No Photos</span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="px-2 py-1 whitespace-nowrap text-[11px] text-slate-500 italic font-medium"
                                title={visit.remarks || ""}
                              >
                                {editingVisitId === visit.id ? (
                                  <input
                                    type="text"
                                    value={editFormData.remarks}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        remarks: e.target.value,
                                      })
                                    }
                                    className="w-32 border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                    placeholder="Remarks..."
                                  />
                                ) : (
                                  <div className="flex flex-col">
                                    <span className="text-orange-700 font-bold text-[10px] uppercase">{getDurationFormula(visit.duration)}</span>
                                    {visit.remarks && (
                                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{visit.remarks}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-center text-[11px] font-medium no-print">
                                {editingVisitId === visit.id ? (
                                  <div className="flex justify-center gap-2">
                                    <button
                                      onClick={handleSaveEdit}
                                      className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                                      title="Save changes"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-5 w-5"
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
                                      onClick={() => setEditingVisitId(null)}
                                      className="p-1 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                                      title="Cancel edit"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-5 w-5"
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
                                ) : (
                                  <div className="flex justify-center gap-3">
                                    {currentUser.role === "admin" ? (
                                      <>
                                        <button
                                          onClick={() =>
                                            handleEditRecord(visit)
                                          }
                                          className="text-slate-400 hover:text-orange-500 transition-colors"
                                          title="Edit record"
                                        >
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-4 w-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                            />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleDeleteRecord(visit.id)
                                          }
                                          className="text-slate-400 hover:text-red-500 transition-colors"
                                          title="Delete record"
                                        >
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-4 w-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                          </svg>
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-slate-300 text-[10px] uppercase font-black tracking-widest italic">
                                        Read Only
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={11}
                              className="text-center py-8 text-slate-500 italic"
                            >
                              No records match your criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {activeTab === "departmentSummary" && (
                <div className="fade-in">
                  <AllDepartmentSummary
                    visits={visits}
                    departments={DEPARTMENTS}
                    currentUser={currentUser}
                    allEmployees={allEmployees}
                    attendanceData={attendanceData}
                  />
                </div>
              )}
              {activeTab === "dutyAnalysis" && (
                <div className="fade-in">
                  <EmployeeDutyAnalysis
                    visits={visits}
                    currentUser={currentUser}
                  />
                </div>
              )}
              {activeTab === "summary" && (
                <div className="fade-in">
                  <EmployeeVisitSummary
                    currentUser={currentUser}
                    visits={visits}
                    allEmployees={allEmployees}
                    attendanceData={attendanceData}
                    onUpdateAttendanceData={onUpdateAttendanceData}
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
              )}

              {activeTab === "projectCompliance" && (
                <div className="fade-in">
                  <ProjectVisitCompliance visits={visits} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Designation Merge Modal ===== */}
      {showMergeDesignationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="text-base font-bold">Designation Merge</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  প্রতিটি employee-এর জন্য কোন designation রাখবেন সেটা বেছে নিন
                </p>
              </div>
              <button
                onClick={() => setShowMergeDesignationModal(false)}
                className="text-slate-400 hover:text-white text-lg leading-none"
              >✕</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {designationMismatches.every(
                (m) => !mergeSelections[m.employeeName]
              ) ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  সব mismatch resolve হয়ে গেছে। ✓
                </div>
              ) : (
                designationMismatches
                  .filter((m) => mergeSelections[m.employeeName])
                  .map((mismatch) => (
                    <div
                      key={mismatch.employeeName}
                      className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
                    >
                      {/* Employee name row */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{mismatch.employeeName}</p>
                          <p className="text-xs text-slate-500">মোট {mismatch.totalVisits}টি visit</p>
                        </div>
                        <button
                          onClick={() => handleApplyMerge(mismatch.employeeName)}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-md shadow-sm transition-colors"
                        >
                          Apply
                        </button>
                      </div>

                      {/* Designation options */}
                      <div className="space-y-2">
                        {mismatch.designations.map((d) => (
                          <label
                            key={d.designation}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              mergeSelections[mismatch.employeeName] === d.designation
                                ? "border-orange-400 bg-orange-50"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`desig-${mismatch.employeeName}`}
                              value={d.designation}
                              checked={mergeSelections[mismatch.employeeName] === d.designation}
                              onChange={() =>
                                setMergeSelections((prev) => ({
                                  ...prev,
                                  [mismatch.employeeName]: d.designation,
                                }))
                              }
                              className="accent-orange-500"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-800 block truncate">
                                {d.designation}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-slate-500">{d.count}টি record</span>
                              {mismatch.designations[0].designation === d.designation && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
                                  সবচেয়ে বেশি
                                </span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>

                      {/* Preview of what will change */}
                      {(() => {
                        const chosen = mergeSelections[mismatch.employeeName];
                        const willChange = mismatch.designations
                          .filter((d) => d.designation !== chosen)
                          .reduce((s, d) => s + d.count, 0);
                        return willChange > 0 ? (
                          <p className="text-xs text-slate-400 mt-2 pl-1">
                            → {willChange}টি record-এ "{chosen}" বসবে
                          </p>
                        ) : null;
                      })()}
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t shrink-0">
              <p className="text-xs text-slate-500">
                {Object.keys(mergeSelections).length} জন pending
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowMergeDesignationModal(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium"
                >
                  Close
                </button>
                <button
                  onClick={handleApplyAllMerges}
                  disabled={Object.keys(mergeSelections).length === 0}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-lg shadow disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Apply All ({Object.keys(mergeSelections).length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold">
                Bulk Edit {selectedRowIds.size} Records
              </h3>
              <button
                onClick={() => setShowBulkEditModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 mb-2 italic">
                Leave fields empty to keep their original values.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Employee Name
                </label>
                <input
                  type="text"
                  value={bulkEditData.visitorName || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      visitorName: e.target.value,
                    }))
                  }
                  placeholder="Enter new employee name"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Careful: this will rename all {selectedRowIds.size} selected record(s) to this name.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={bulkEditData.date || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={bulkEditData.department || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      department: e.target.value,
                    }))
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                >
                  <option value="">No Change</option>
                  {_.uniq(DEPARTMENTS).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  list="bulk-designations-list"
                  value={bulkEditData.designation || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      designation: e.target.value,
                    }))
                  }
                  placeholder="Enter or select designation"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                />
                <datalist id="bulk-designations-list">
                  {_.uniq(DESIGNATIONS).map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Remarks
                </label>
                <textarea
                  value={bulkEditData.remarks || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      remarks: e.target.value,
                    }))
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[80px]"
                  placeholder="Add uniform remarks..."
                />
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t">
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditData({});
                }}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkEdit}
                disabled={Object.keys(bulkEditData).length === 0}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 shadow-md transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Progress Modal */}
      <AnimatePresence>
        {showProgressModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-xl">
                    <RefreshCw size={20} className="text-orange-600 animate-spin-slow" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-800 text-base">Progress Tracker</h3>
                      <input
                        type="date"
                        value={progressDate}
                        onChange={(e) => setProgressDate(e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {formatDateToDDMMMYYYY(progressDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-orange-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-sm shadow-orange-600/20">
                    {sessionProgress.reduce((sum, p) => sum + p.count, 0)} Total
                  </span>
                  <button
                    onClick={() => setShowProgressModal(false)}
                    className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-all"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-4 max-h-[70vh] overflow-auto custom-scrollbar">
                {sessionProgress.length === 0 ? (
                  <div className="text-center py-16 px-6">
                    <div className="mx-auto w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-200 mb-4 border border-slate-100">
                      <ImageIcon size={32} />
                    </div>
                    <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-[200px] mx-auto">
                      No activity recorded for this date. Start a session to track activity.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {sessionProgress.map((prog, idx) => (
                      <div key={idx} className="group p-4 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-orange-200 hover:shadow-xl transition-all duration-300">
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <div>
                            <span className="font-extrabold text-sm text-slate-800 leading-tight block mb-1">{prog.name}</span>
                            <div className="flex flex-wrap gap-1">
                              {prog.visitors.map((v, vIdx) => (
                                <span key={vIdx} className="text-[10px] bg-white border border-slate-100 text-slate-500 px-2 py-0.5 rounded-lg shadow-sm truncate max-w-[100px]">
                                  {v}
                                </span>
                              ))}
                              {prog.count > 5 && (
                                <span className="text-[10px] text-slate-400 font-bold px-1 flex items-center">+ {prog.count - 5} others</span>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 bg-white border border-slate-200 text-orange-600 text-xs font-black h-8 w-8 flex items-center justify-center rounded-xl shadow-sm">
                            {prog.count}
                          </span>
                        </div>
                        <button 
                          onClick={async () => {
                            showLoading();
                            setShowProgressModal(false);
                            try {
                              const res = await fetch("/api/visit-book");
                              let images: string[] = [];
                              if (res.ok) {
                                const data = await res.json();
                                const existing = data.find((v: VisitBook) => v.date === progressDate && v.projectName === prog.name);
                                if (existing) {
                                  images = existing.images || [];
                                }
                              }
                              setSessionData({
                                date: progressDate,
                                projectName: prog.name,
                                images: images
                              });
                              setIsSessionActive(true);
                              onTabChange("entry");
                            } catch (err) {
                              console.error("Error fetching visit book:", err);
                            } finally {
                              hideLoading();
                            }
                          }}
                          className="w-full py-2 rounded-xl text-xs font-black text-orange-600 bg-orange-50 hover:bg-orange-600 hover:text-white transition-all flex items-center justify-center gap-2 border border-orange-100/50"
                        >
                          <Edit2 size={14} />
                          Check & Add Entries
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                <button 
                   onClick={() => {
                     setProjectFilter("");
                     setStartDate(new Date().toISOString().split('T')[0]);
                     onTabChange("records");
                     setShowProgressModal(false);
                   }}
                   className="text-xs font-bold text-slate-500 hover:text-orange-600 transition-colors flex items-center gap-2"
                >
                   <ImageIcon size={14} />
                   View All Today's Records
                </button>
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="px-6 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {showEntryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-white"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-xl">
                    <Plus className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">
                      Quick Visit Entry
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">Add records like a spreadsheet</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEntryModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-8">
                  {/* Row 1: Employee & Date */}
                  <div className="md:col-span-8">
                    <SearchableSelect
                      id="entry-visitor-name"
                      label="Visitor Name"
                      placeholder="Search or select employee..."
                      options={allEmployees.map(emp => emp.name)}
                      value={entryFormData.visitorName || ""}
                      onChange={(name) => {
                        const emp = allEmployees.find(a => a.name === name);
                        setEntryFormData(prev => ({
                          ...prev,
                          visitorName: name,
                          department: emp?.department || "",
                          designation: emp?.designation || "",
                        }));
                      }}
                      required
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Visit Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="date"
                        value={entryFormData.date}
                        onChange={(e) => setEntryFormData({ ...entryFormData, date: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Row 2: Dept & Desig (Read Only - Auto-filled) */}
                  <div className="md:col-span-6">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Department
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={entryFormData.department || "Auto-fills from employee"}
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed italic"
                    />
                  </div>

                  <div className="md:col-span-6">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Designation
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={entryFormData.designation || "Auto-fills from employee"}
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed italic"
                    />
                  </div>

                  {/* Row 3: Project */}
                  <div className="md:col-span-12">
                    <SearchableSelect
                      id="entry-project-name"
                      label="Visited Project Name"
                      placeholder="Search or select project..."
                      options={projectNames}
                      value={entryFormData.projectName || ""}
                      onChange={(name) => setEntryFormData({ ...entryFormData, projectName: name })}
                      required
                    />
                  </div>

                  {/* Row 4: Times */}
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Entry Time
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="time"
                        value={entryFormData.entryTime}
                        onChange={(e) => {
                          const newIn = e.target.value;
                          setEntryFormData(prev => ({
                            ...prev,
                            entryTime: newIn,
                            duration: calculateDuration(newIn, prev.outTime || ""),
                          }));
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Out Time
                    </label>
                    <div className="relative">
                      <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="time"
                        value={entryFormData.outTime}
                        onChange={(e) => {
                          const newOut = e.target.value;
                          setEntryFormData(prev => ({
                            ...prev,
                            outTime: newOut,
                            duration: calculateDuration(prev.entryTime || "", newOut),
                          }));
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Duration
                    </label>
                    <div className="w-full px-4 py-2.5 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-700 font-bold font-mono flex items-center justify-center">
                      {entryFormData.duration || "0:00:00"}
                    </div>
                  </div>

                  {/* Row 5: Remarks */}
                  <div className="md:col-span-12">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
                      Formula / Remarks
                    </label>
                    <textarea
                      value={entryFormData.remarks}
                      onChange={(e) => setEntryFormData({ ...entryFormData, remarks: e.target.value })}
                      placeholder="Add any specific notes or formula results here..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all h-24 resize-none"
                    />
                  </div>

                  {/* Row 6: Photos */}
                  <div className="md:col-span-12">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-wider">
                      Visit Photos (Max 3)
                    </label>
                    <PhotoUploader
                      id="modal-photo-upload"
                      onFileChange={handlePhotoUpload}
                      onCameraClick={() => fileInputRef.current?.click()}
                      fileInputRef={fileInputRef}
                      multiple={true}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4 mt-6">
                      {(entryFormData.images || []).map((img, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-slate-400 font-medium">
                  Fields marked with * are required
                </div>
                <div className="flex flex-wrap justify-end gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setShowEntryModal(false)}
                    className="px-6 py-3 text-sm font-bold text-slate-500 hover:bg-white hover:text-slate-700 rounded-2xl transition-all border border-transparent hover:border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveNewEntry(false)}
                    className="px-6 py-3 bg-white border-2 border-orange-600 text-orange-600 font-bold rounded-2xl text-sm hover:bg-orange-50 active:scale-95 transition-all flex items-center gap-2"
                  >
                    Save & Add Another
                  </button>
                  <button
                    onClick={() => handleSaveNewEntry(true)}
                    className="bg-orange-600 shadow-xl shadow-orange-600/20 text-white px-10 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-orange-700 active:scale-95 transition-all"
                  >
                    <Save className="h-5 w-5" />
                    Complete Entry
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inline Image Upload Modals */}
      <AnimatePresence>
        {showSessionImageModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-orange-100 rounded-lg">
                    <Camera className="h-4 w-4 text-orange-600" />
                  </div>
                  <h3 className="font-bold text-slate-800">
                    Attach Session Photos (Max 3)
                  </h3>
                </div>
                <button
                  onClick={() => setShowSessionImageModal(false)}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <PhotoUploader
                  id="session-photo-upload"
                  onFileChange={handlePhotoUpload}
                  onCameraClick={() => fileInputRef.current?.click()}
                  fileInputRef={fileInputRef}
                  multiple={true}
                />

                <div className="grid grid-cols-3 gap-3 mt-4">
                  {(sessionData.images || []).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 shadow-sm"
                    >
                      <img
                        src={img}
                        alt={`Visit ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {Array.from({
                    length: 3 - (sessionData.images?.length || 0),
                  }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="aspect-square rounded-lg border-2 border-slate-100 border-dashed flex flex-col items-center justify-center text-slate-300"
                    >
                      <ImageIcon size={20} className="mb-1" />
                      <span className="text-[8px] font-bold uppercase tracking-tighter">
                        Empty
                      </span>
                    </div>
                  ))}
                </div>
                {(sessionData.images?.length || 0) >= 3 && (
                  <p className="text-[10px] text-orange-600 font-bold bg-orange-50 p-2 rounded text-center">
                    Maximum 3 images reached
                  </p>
                )}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowSessionImageModal(false)}
                  className="px-8 py-2.5 bg-orange-600 shadow-lg shadow-orange-600/20 text-white font-bold rounded-xl text-sm hover:bg-orange-700 active:scale-95 transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showEntryImageModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-orange-100 rounded-lg">
                    <Camera className="h-4 w-4 text-orange-600" />
                  </div>
                  <h3 className="font-bold text-slate-800">
                    Attach Entry Photos (Max 3)
                  </h3>
                </div>
                <button
                  onClick={() => setShowEntryImageModal(false)}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <PhotoUploader
                  id="entry-photo-upload"
                  onFileChange={handlePhotoUpload}
                  onCameraClick={() => fileInputRef.current?.click()}
                  fileInputRef={fileInputRef}
                  multiple={true}
                />

                <div className="grid grid-cols-3 gap-3 mt-4">
                  {(entryFormData.images || []).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 shadow-sm"
                    >
                      <img
                        src={img}
                        alt={`Visit ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {Array.from({
                    length: 3 - (entryFormData.images?.length || 0),
                  }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="aspect-square rounded-lg border-2 border-slate-100 border-dashed flex flex-col items-center justify-center text-slate-300"
                    >
                      <ImageIcon size={20} className="mb-1" />
                      <span className="text-[8px] font-bold uppercase tracking-tighter">
                        Empty
                      </span>
                    </div>
                  ))}
                </div>
                {(entryFormData.images?.length || 0) >= 3 && (
                  <p className="text-[10px] text-orange-600 font-bold bg-orange-50 p-2 rounded text-center">
                    Maximum 3 images reached
                  </p>
                )}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowEntryImageModal(false)}
                  className="px-8 py-2.5 bg-orange-600 shadow-lg shadow-orange-600/20 text-white font-bold rounded-xl text-sm hover:bg-orange-700 active:scale-95 transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== Import Preview Modal ===== */}
      {showImportPreview && importPreviewData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Import Preview</h3>
                  <p className="text-xs text-slate-500">Database-এ save করার আগে দেখুন</p>
                </div>
              </div>
              <button
                onClick={() => { setShowImportPreview(false); setImportPreviewData(null); }}
                className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="p-5 border-b border-slate-100 shrink-0">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-slate-700">{importPreviewData.allParsedRows.length}</div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">মোট CSV Row</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-green-600">{importPreviewData.newRows.length}</div>
                  <div className="text-[11px] font-semibold text-green-600 uppercase tracking-wider mt-0.5">নতুন Record</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-amber-600">{importPreviewData.duplicateRows.length}</div>
                  <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mt-0.5">Duplicate</div>
                </div>
              </div>

              {importPreviewData.duplicateRows.length > 0 && (
                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-amber-700">
                    <span className="font-bold">{importPreviewData.duplicateRows.length}টি row</span> ইতিমধ্যে database-এ আছে (same Date + Visitor + Project + Entry Time)। নিচে দেখুন।
                  </p>
                </div>
              )}
            </div>

            {/* Duplicate rows list */}
            {importPreviewData.duplicateRows.length > 0 && (
              <div className="px-5 pt-3 pb-1 shrink-0">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Duplicate Rows (পরে import হবে না)</p>
              </div>
            )}
            {importPreviewData.duplicateRows.length > 0 && (
              <div className="px-5 pb-3 overflow-y-auto max-h-36 shrink-0">
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-amber-50">
                      <tr>
                        {["Date", "Visitor Name", "ID", "Project", "Entry Time"].map(h => (
                          <th key={h} className="px-3 py-1.5 text-left font-bold text-amber-700 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-amber-100">
                      {importPreviewData.duplicateRows.map((row, i) => (
                        <tr key={i} className="hover:bg-amber-50/50">
                          <td className="px-3 py-1 text-slate-600">{formatDateToDDMMMYYYY(row.date)}</td>
                          <td className="px-3 py-1 font-medium text-slate-700">{row.visitorName}</td>
                          <td className="px-3 py-1 text-slate-500 font-mono">{getEmployeeIdForName(row.visitorName)}</td>
                          <td className="px-3 py-1 text-slate-600">{row.projectName}</td>
                          <td className="px-3 py-1 text-slate-600">{row.entryTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New rows preview */}
            {importPreviewData.newRows.length > 0 && (
              <div className="px-5 pt-3 pb-1 shrink-0">
                <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">নতুন Rows (import হবে)</p>
              </div>
            )}
            {importPreviewData.newRows.length > 0 && (
              <div className="px-5 pb-3 overflow-y-auto flex-1 min-h-0">
                <div className="border border-green-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-green-50 sticky top-0">
                      <tr>
                        {["Date", "Visitor Name", "ID", "Project", "Entry Time", "Duration"].map(h => (
                          <th key={h} className="px-3 py-1.5 text-left font-bold text-green-700 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-green-100">
                      {importPreviewData.newRows.map((row, i) => (
                        <tr key={i} className="hover:bg-green-50/50">
                          <td className="px-3 py-1 text-slate-600">{formatDateToDDMMMYYYY(row.date)}</td>
                          <td className="px-3 py-1 font-medium text-slate-700">{row.visitorName}</td>
                          <td className="px-3 py-1 text-slate-500 font-mono">{getEmployeeIdForName(row.visitorName)}</td>
                          <td className="px-3 py-1 text-slate-600">{row.projectName}</td>
                          <td className="px-3 py-1 text-slate-600">{row.entryTime}</td>
                          <td className="px-3 py-1 text-slate-500">{row.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 justify-end shrink-0">
              <button
                onClick={() => { setShowImportPreview(false); setImportPreviewData(null); }}
                className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-100 transition-colors"
              >
                বাতিল করুন
              </button>
              {importPreviewData.duplicateRows.length > 0 && importPreviewData.newRows.length > 0 && (
                <button
                  onClick={() => handleConfirmImport(true)}
                  className="px-5 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 shadow-md shadow-green-600/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  শুধু নতুন {importPreviewData.newRows.length}টি import করুন
                </button>
              )}
              <button
                onClick={() => handleConfirmImport(false)}
                className="px-5 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {importPreviewData.duplicateRows.length > 0 ? `সব ${importPreviewData.allParsedRows.length}টি import করুন` : `${importPreviewData.newRows.length}টি import করুন`}
              </button>
            </div>
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
    </>
  );
};

export default EmployeeProjectVisit;