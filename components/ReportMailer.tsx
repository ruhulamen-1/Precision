import React, { useState, useEffect, useMemo } from "react";
import {
  User,
  EmployeeVisit,
  ITAssignedIssue,
  SalesPersonVisit,
  Project,
  AllEmployee,
  DepartmentEmail,
  MonthlyLink,
} from "../types";
import {
  Mail,
  FileText,
  Send,
  Loader2,
  Edit3,
  Save,
  CheckCircle2,
  AlertCircle,
  History,
  Clock,
  Settings,
  Plus,
  Trash2,
  ExternalLink,
  MailPlus,
  Link as LinkIcon,
  Globe,
  Paperclip,
  Minus,
  X,
  Maximize2,
  Expand,
  Shrink,
  ChevronDown,
  File as FileIcon,
} from "lucide-react";
import { useLoading } from "../contexts/LoadingContext";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import _ from "lodash";

interface SentReport {
  id: number;
  sender_email: string;
  recipient_email: string;
  subject: string;
  report_type: string;
  report_month: string;
  sent_at: string;
  attachment_name: string;
  message_body?: string;
}

interface ReportMailerProps {
  currentUser: User;
  allVisits: EmployeeVisit[];
  salesVisits: SalesPersonVisit[];
  itIssues: ITAssignedIssue[];
  projects: Project[];
  allEmployees: AllEmployee[];
}

type TabType = "compose" | "departments" | "history";

const ReportMailer: React.FC<ReportMailerProps> = ({
  currentUser,
  allVisits,
  salesVisits,
  itIssues,
  projects,
  allEmployees,
}) => {
  const { showLoading, hideLoading } = useLoading();
  const [activeTab, setActiveTab] = useState<TabType>("compose");

  // Email Compose State
  const [recipient, setRecipient] = useState("");
  const [customCc, setCustomCc] = useState("");
  const [customBcc, setCustomBcc] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customMessage, setCustomMessage] = useState(`Dear Sir,

Assalamu Alaikum.

I hope you are doing well.

Please find the link below to access the Monthly Project Visit Report (Department-wise Summary) for the month of [Month-Year].

The report highlights the following key aspects:

* Department-wise average project visit frequency
* Total and average duty hours spent on project visits
* Comparative analysis with the previous month to identify trends and performance changes

This analysis provides an overview of departmental engagement in project visits and helps assess operational efficiency and field activity.

[REPORT_LINK_WILL_BE_INSERTED_HERE]

Kindly review the report for your valuable insights and further instructions.

Thank you for your time and consideration.
Note: This is a system-generated automated dispatch.`);
  const [customLink, setCustomLink] = useState("");
  const [sendingCustom, setSendingCustom] = useState(false);
  const [showCustomEmail, setShowCustomEmail] = useState(false); // controls whether the Gmail-style compose popup is open
  const [isComposeMinimized, setIsComposeMinimized] = useState(false);
  const [showCcField, setShowCcField] = useState(false);
  const [showBccField, setShowBccField] = useState(false);
  const [customAttachments, setCustomAttachments] = useState<File[]>([]);
  const customFileInputRef = React.useRef<HTMLInputElement>(null);
  // Employee-suggestion dropdown shared by the compose popup's To/Cc/Bcc
  // fields, and a toggle to expand the popup into a larger window.
  const [composeEmailDropdown, setComposeEmailDropdown] = useState<
    "to" | "cc" | "bcc" | null
  >(null);
  const [composeEmailSearch, setComposeEmailSearch] = useState("");
  const composeDropdownRef = React.useRef<HTMLDivElement>(null);
  const [isComposeExpanded, setIsComposeExpanded] = useState(false);

  // --- Free-drag corner resize for the compose popup ---
  // Lets the user grab the top-left corner and resize the popup to any
  // custom size (only active when not fullscreen-expanded and not
  // minimized). Independent of the Expand/Shrink toggle above.
  const DEFAULT_COMPOSE_SIZE = { width: 440, height: 560 };
  const MIN_COMPOSE_WIDTH = 360;
  const MAX_COMPOSE_WIDTH = 900;
  const MIN_COMPOSE_HEIGHT = 360;
  const MAX_COMPOSE_HEIGHT = 800;
  const [composeSize, setComposeSize] = useState(DEFAULT_COMPOSE_SIZE);
  const isResizingRef = React.useRef(false);
  const resizeStartRef = React.useRef({
    x: 0,
    y: 0,
    width: DEFAULT_COMPOSE_SIZE.width,
    height: DEFAULT_COMPOSE_SIZE.height,
  });

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: composeSize.width,
      height: composeSize.height,
    };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleResizeMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const { x, y, width, height } = resizeStartRef.current;
      // Popup is anchored to the bottom-right corner of the screen, so
      // dragging the top-left handle left/up should grow the box.
      const deltaX = x - e.clientX;
      const deltaY = y - e.clientY;
      setComposeSize({
        width: Math.min(
          MAX_COMPOSE_WIDTH,
          Math.max(MIN_COMPOSE_WIDTH, width + deltaX),
        ),
        height: Math.min(
          MAX_COMPOSE_HEIGHT,
          Math.max(MIN_COMPOSE_HEIGHT, height + deltaY),
        ),
      });
    };
    const handleResizeMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleResizeMouseMove);
    document.addEventListener("mouseup", handleResizeMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleResizeMouseMove);
      document.removeEventListener("mouseup", handleResizeMouseUp);
    };
  }, []);

  const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB soft cap
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(`Dear Sir,

Assalamu Alaikum.

I hope you are doing well.

Please find the link below to access the Department-wise Project Visit Summary and Individual Performance Report for your department for the month of [Month-Year]

The report can be viewed directly from the link.

[REPORT_LINK_WILL_BE_INSERTED_HERE]

Kindly review the report and share your feedback if any.

Thank you for your cooperation.
Note: This is a system-generated automated dispatch.`);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Department Emails Management
  const [deptEmails, setDeptEmails] = useState<DepartmentEmail[]>([]);
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDept, setNewDept] = useState<DepartmentEmail>({
    department_name: "",
    to_emails: "",
    cc_emails: "",
  });

  // Monthly Links Management
  const [monthlyLinks, setMonthlyLinks] = useState<MonthlyLink[]>([]);
  const [editingLinks, setEditingLinks] = useState<Record<string, string>>({});
  const [isEditingMonthlyLinks, setIsEditingMonthlyLinks] = useState(false);

  // Sent History
  const [sentHistory, setSentHistory] = useState<SentReport[]>([]);
  const [viewingLog, setViewingLog] = useState<SentReport | null>(null);

  // Filtered employees for dropdown
  const [activeEmailDropdown, setActiveEmailDropdown] = useState<
    "to" | "cc" | null
  >(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setActiveEmailDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredDeptEmployees = useMemo(() => {
    if (!newDept.department_name) return [];
    return allEmployees
      .filter((e) => e.department === newDept.department_name && e.email)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, newDept.department_name]);

  const allEmailEmployees = useMemo(() => {
    return allEmployees
      .filter((e) => e.email)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees]);

  const [emailSearch, setEmailSearch] = useState("");

  const addEmailToDept = (email: string, type: "to" | "cc") => {
    const field = type === "to" ? "to_emails" : "cc_emails";
    const currentVal = newDept[field];
    const emails = currentVal ? currentVal.split(",").map((s) => s.trim()) : [];
    if (!emails.includes(email)) {
      const newVal = [...emails.filter(Boolean), email].join(", ");
      setNewDept((prev) => ({ ...prev, [field]: newVal }));
    }
    setEmailSearch("");
  };

  // --- Row-level editing for the Base Department Contacts table ---
  // Lets a single saved department row be expanded inline so individual
  // TO/CC emails can be added or removed without deleting and re-creating
  // the whole department contact.
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const [editDeptData, setEditDeptData] = useState<DepartmentEmail>({
    department_name: "",
    to_emails: "",
    cc_emails: "",
  });
  const [editEmailDropdown, setEditEmailDropdown] = useState<
    "to" | "cc" | null
  >(null);
  const [editEmailInputValue, setEditEmailInputValue] = useState("");
  const editDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutsideEdit = (event: MouseEvent) => {
      if (
        editDropdownRef.current &&
        !editDropdownRef.current.contains(event.target as Node)
      ) {
        setEditEmailDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutsideEdit);
    return () =>
      document.removeEventListener("mousedown", handleClickOutsideEdit);
  }, []);

  const filteredEditDeptEmployees = useMemo(() => {
    if (!editDeptData.department_name) return [];
    return allEmployees
      .filter((e) => e.department === editDeptData.department_name && e.email)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, editDeptData.department_name]);

  const startEditDept = (d: DepartmentEmail) => {
    setIsAddingDept(false);
    setEditingDeptId(d.id ?? null);
    setEditDeptData({ ...d });
    setEditEmailDropdown(null);
    setEditEmailInputValue("");
  };

  const cancelEditDept = () => {
    setEditingDeptId(null);
    setEditEmailDropdown(null);
    setEditEmailInputValue("");
  };

  const addEmailToEditDept = (email: string, type: "to" | "cc") => {
    const trimmed = email.trim();
    if (!trimmed) return;
    const field = type === "to" ? "to_emails" : "cc_emails";
    const currentVal = editDeptData[field];
    const emails = currentVal
      ? currentVal.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (!emails.includes(trimmed)) {
      setEditDeptData((prev) => ({
        ...prev,
        [field]: [...emails, trimmed].join(", "),
      }));
    }
    setEditEmailInputValue("");
  };

  const removeEmailFromEditDept = (email: string, type: "to" | "cc") => {
    const field = type === "to" ? "to_emails" : "cc_emails";
    const currentVal = editDeptData[field];
    const emails = currentVal
      ? currentVal.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setEditDeptData((prev) => ({
      ...prev,
      [field]: emails.filter((e) => e !== email).join(", "),
    }));
  };

  const handleUpdateDeptEmail = async () => {
    if (!editDeptData.to_emails) {
      setStatus({
        type: "error",
        text: "At least one TO recipient is required.",
      });
      return;
    }
    try {
      const res = await fetch("/api/department-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDeptData),
      });
      if (res.ok) {
        await fetchDeptEmails();
        cancelEditDept();
        setStatus({
          type: "success",
          text: "Department contact settings updated.",
        });
      } else {
        setStatus({ type: "error", text: "Failed to update settings." });
      }
    } catch (err) {
      setStatus({ type: "error", text: "Failed to update settings." });
    }
  };

  const formatLogMessage = (text?: string) => {
    if (!text) return null;
    // Regex to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    const matches = text.match(urlRegex);

    return parts.map((part, i) => {
      if (matches && matches.includes(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 font-bold underline text-lg inline-block my-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
          >
            {part}
          </a>
        );
      }
      return (
        <span key={i} className="whitespace-pre-wrap">
          {part}
        </span>
      );
    });
  };

  const departments = useMemo(() => {
    return _.uniq(allEmployees.map((e) => e.department))
      .filter(Boolean)
      .sort();
  }, [allEmployees]);

  // Signature State
  const [signature, setSignature] = useState(`With Regards,

Ruhul Amen
Executive | MIS Dept.
Contact: +880 1896-055404`);
  const [isEditingSignature, setIsEditingSignature] = useState(false);

  useEffect(() => {
    fetchDeptEmails();
    fetchSentHistory();
    fetchSignature();
    fetchMonthlyLinks();

    // Form initial subject
    const [year, month] = selectedMonth.split("-");
    const monthName = new Date(
      parseInt(year),
      parseInt(month) - 1,
      1,
    ).toLocaleString("en-US", { month: "long" });
    setSubject(`Monthly Visit Report Summary - ${monthName} ${year}`);
  }, [selectedMonth]);

  const fetchSignature = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const settings = await res.json();
        if (settings.email_signature) {
          setSignature(settings.email_signature);
        }
      }
    } catch (err) {
      console.error("Failed to fetch signature", err);
    }
  };

  const fetchMonthlyLinks = async () => {
    try {
      const res = await fetch(`/api/department-monthly-links/${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        setMonthlyLinks(data);

        // Prefill editing state
        const linkMap: Record<string, string> = {};
        data.forEach((l: MonthlyLink) => {
          linkMap[l.department_name] = l.link;
        });
        setEditingLinks(linkMap);
      }
    } catch (err) {
      console.error("Failed to fetch monthly links", err);
    }
  };

  const handleSaveMonthlyLink = async (deptName: string, link: string) => {
    try {
      const res = await fetch("/api/department-monthly-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_name: deptName,
          report_month: selectedMonth,
          link,
        }),
      });
      if (res.ok) {
        fetchMonthlyLinks();
      }
    } catch (err) {
      console.error("Failed to save monthly link", err);
    }
  };

  const handleSaveAllLinks = async () => {
    showLoading();
    try {
      for (const deptName of Object.keys(editingLinks)) {
        await handleSaveMonthlyLink(deptName, editingLinks[deptName]);
      }
      setIsEditingMonthlyLinks(false);
      setStatus({
        type: "success",
        text: `Monthly links for ${selectedMonth} updated successfully.`,
      });
    } catch (err) {
      setStatus({ type: "error", text: "Failed to save some links." });
    } finally {
      hideLoading();
    }
  };

  const handleSaveSignature = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "email_signature", value: signature }),
      });
      if (res.ok) {
        setIsEditingSignature(false);
        setStatus({ type: "success", text: "Signature saved successfully." });
      }
    } catch (err) {
      setStatus({ type: "error", text: "Failed to save signature." });
    }
  };

  const fetchDeptEmails = async () => {
    try {
      const res = await fetch("/api/department-emails");
      if (res.ok) {
        const data = await res.json();
        setDeptEmails(data);
      }
    } catch (err) {
      console.error("Failed to fetch dept emails", err);
    }
  };

  const fetchSentHistory = async () => {
    try {
      const res = await fetch("/api/sent-reports");
      if (res.ok) {
        const data = await res.json();
        setSentHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch sent history", err);
    }
  };

  const handleSaveDeptEmail = async (dept: DepartmentEmail) => {
    try {
      const res = await fetch("/api/department-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dept),
      });
      if (res.ok) {
        fetchDeptEmails();
        setIsAddingDept(false);
        setNewDept({ department_name: "", to_emails: "", cc_emails: "" });
        setStatus({
          type: "success",
          text: "Department contact settings saved.",
        });
      }
    } catch (err) {
      setStatus({ type: "error", text: "Failed to save settings." });
    }
  };

  const handleDeleteDeptEmail = async (deptName: string) => {
    if (!window.confirm(`Delete settings and monthly links for ${deptName}?`))
      return;
    try {
      const res = await fetch(
        `/api/department-emails/${encodeURIComponent(deptName)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        fetchDeptEmails();
        fetchMonthlyLinks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Main logic for Smart Dispatch (One-Click)
  const handleSmartDispatch = async () => {
    if (deptEmails.length === 0) {
      setStatus({
        type: "error",
        text: "Please configure department emails first.",
      });
      return;
    }

    const confirmSend = window.confirm(
      `This will send customized emails to ${deptEmails.length} departments for the month of ${selectedMonth}. Continue?`,
    );
    if (!confirmSend) return;

    setSending(true);
    showLoading();
    let successCount = 0;
    let failCount = 0;

    const [year, month] = selectedMonth.split("-");
    const monthName = new Date(
      parseInt(year),
      parseInt(month) - 1,
      1,
    ).toLocaleString("en-US", { month: "long", year: "numeric" });

    for (const deptConfig of deptEmails) {
      try {
        const deptName = deptConfig.department_name;
        const deptTo = deptConfig.to_emails;
        const deptCc = deptConfig.cc_emails;
        const deptLinkObj = monthlyLinks.find(
          (l) => l.department_name === deptName,
        );
        const deptLink = deptLinkObj ? deptLinkObj.link : "";

        // 1. Generate customized body using state message and replacing placeholders
        let messageOnlyBody = message
          .replace("[Month-Year]", monthName)
          .replace(
            "[REPORT_LINK_WILL_BE_INSERTED_HERE]",
            deptLink || "Please contact administrator for link.",
          );

        // 2. Send via Server API (No attachment)
        const res = await fetch("/api/send-report-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: deptTo,
            cc: deptCc,
            subject: `${subject} - [${deptName}]`,
            body: messageOnlyBody,
            signatureText: signature,
            attachmentName: `Summary_${deptName.replace(/\s+/g, "_")}_${selectedMonth}`,
          }),
        });

        if (res.ok) successCount++;
        else failCount++;
      } catch (err) {
        console.error(`Failed to send for ${deptConfig.department_name}`, err);
        failCount++;
      }
    }

    setSending(false);
    hideLoading();
    setStatus({
      type: successCount > 0 ? "success" : "error",
      text: `Dispatch Complete. Success: ${successCount}, Failed: ${failCount}`,
    });
    fetchSentHistory();
  };

  // --- Attachment helpers for the Gmail-style compose popup ---
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalAttachmentBytes = useMemo(
    () => customAttachments.reduce((sum, f) => sum + f.size, 0),
    [customAttachments],
  );

  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const incomingBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalAttachmentBytes + incomingBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      setStatus({
        type: "error",
        text: "Total attachment size can't exceed 20MB.",
      });
    } else {
      setCustomAttachments((prev) => [...prev, ...files]);
    }
    // Reset the input so selecting the same file again still fires onChange
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setCustomAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  useEffect(() => {
    const handleClickOutsideCompose = (event: MouseEvent) => {
      if (
        composeDropdownRef.current &&
        !composeDropdownRef.current.contains(event.target as Node)
      ) {
        setComposeEmailDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutsideCompose);
    return () =>
      document.removeEventListener("mousedown", handleClickOutsideCompose);
  }, []);

  const composeFilteredEmployees = useMemo(() => {
    return allEmailEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(composeEmailSearch.toLowerCase()) ||
        emp.email.toLowerCase().includes(composeEmailSearch.toLowerCase()),
    );
  }, [allEmailEmployees, composeEmailSearch]);

  const addEmailToCompose = (email: string, field: "to" | "cc" | "bcc") => {
    const currentVal =
      field === "to" ? recipient : field === "cc" ? customCc : customBcc;
    const setter =
      field === "to"
        ? setRecipient
        : field === "cc"
          ? setCustomCc
          : setCustomBcc;
    const emails = currentVal
      ? currentVal.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (!emails.includes(email)) {
      setter([...emails, email].join(", "));
    }
    setComposeEmailSearch("");
  };

  const resetComposePopup = () => {
    setRecipient("");
    setCustomCc("");
    setCustomBcc("");
    setCustomSubject("");
    setCustomMessage("");
    setCustomLink("");
    setCustomAttachments([]);
    setShowCcField(false);
    setShowBccField(false);
    setIsComposeMinimized(false);
    setIsComposeExpanded(false);
    setComposeEmailDropdown(null);
    setComposeEmailSearch("");
    setComposeSize(DEFAULT_COMPOSE_SIZE);
  };

  // Employee-suggestion dropdown shown under the To/Cc/Bcc fields of the
  // custom compose popup. Shared markup for all three fields.
  const renderComposeEmailDropdown = (field: "to" | "cc" | "bcc") => {
    if (composeEmailDropdown !== field) return null;
    return (
      <div
        ref={composeDropdownRef}
        className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-56 overflow-y-auto p-1 animate-slide-in-up"
      >
        <div className="p-2 border-b border-slate-50 mb-1 sticky top-0 bg-white">
          <input
            autoFocus
            type="text"
            placeholder="Search employees..."
            value={composeEmailSearch}
            onChange={(e) => setComposeEmailSearch(e.target.value)}
            className="w-full text-[10px] p-1.5 border border-slate-100 rounded bg-slate-50 outline-none focus:bg-white focus:border-orange-200"
          />
        </div>
        {composeFilteredEmployees.length > 0 ? (
          composeFilteredEmployees.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => addEmailToCompose(emp.email, field)}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 rounded-lg transition-colors flex flex-col group"
            >
              <span className="text-xs font-bold text-slate-700 group-hover:text-orange-700">
                {emp.name}
              </span>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 group-hover:text-orange-500 font-mono">
                  {emp.email}
                </span>
                <span className="text-[9px] text-slate-300 font-medium">
                  {emp.department}
                </span>
              </div>
            </button>
          ))
        ) : (
          <div className="px-3 py-4 text-center text-[10px] text-slate-400 font-bold uppercase">
            No matches
          </div>
        )}
      </div>
    );
  };

  // Sends a fully custom one-off email — its own To/CC/BCC, subject,
  // message body, and file attachments, independent of the main compose
  // form above. Does not touch or affect the existing department
  // "Smart Dispatch" flow.
  const handleSendCustomEmail = async () => {
    if (!recipient.trim()) {
      setStatus({ type: "error", text: "Please enter a recipient email." });
      setIsComposeMinimized(false);
      return;
    }
    if (!customSubject.trim()) {
      setStatus({ type: "error", text: "Please enter a subject." });
      setIsComposeMinimized(false);
      return;
    }

    setSendingCustom(true);
    showLoading();

    try {
      // If a link is provided, drop it into the message wherever the
      // placeholder appears; if the user didn't use the placeholder,
      // just append the link to the end of the message.
      let customBody = customMessage;
      if (customLink.trim()) {
        if (customBody.includes("[REPORT_LINK_WILL_BE_INSERTED_HERE]")) {
          customBody = customBody.replace(
            "[REPORT_LINK_WILL_BE_INSERTED_HERE]",
            customLink,
          );
        } else {
          customBody = `${customBody}\n\n${customLink}`;
        }
      }

      // Convert any attached files to base64 for the mail server
      const attachments =
        customAttachments.length > 0
          ? await Promise.all(
              customAttachments.map(async (file) => ({
                filename: file.name,
                content: await fileToBase64(file),
              })),
            )
          : undefined;

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          cc: customCc,
          bcc: customBcc,
          subject: customSubject,
          body: customBody,
          signatureText: signature,
          attachments,
          // Kept for backward compatibility with older single-attachment callers
          attachmentName:
            customAttachments.length > 0
              ? customAttachments.length === 1
                ? customAttachments[0].name
                : `Custom_Report_${selectedMonth}`
              : `Custom_Report_${selectedMonth}`,
        }),
      });

      if (res.ok) {
        setStatus({ type: "success", text: `Email sent to ${recipient}.` });
        fetchSentHistory();
        resetComposePopup();
        setShowCustomEmail(false);
      } else {
        const result = await res.json().catch(() => null);
        setStatus({
          type: "error",
          text: result?.error
            ? `${result.error}${result.hint ? ` — ${result.hint}` : ""}`
            : "Failed to send custom email.",
        });
      }
    } catch (err) {
      console.error("Failed to send custom email", err);
      setStatus({ type: "error", text: "Failed to send custom email." });
    } finally {
      setSendingCustom(false);
      hideLoading();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Mail className="h-7 w-7 text-orange-600" />
              Report Mailer Pro
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage departmental dispatches and email reports with ease.
            </p>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("compose")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "compose" ? "bg-white text-orange-600 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              Compose
            </button>
            <button
              onClick={() => setActiveTab("departments")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "departments" ? "bg-white text-orange-600 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "history" ? "bg-white text-orange-600 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              History
            </button>
          </div>
        </div>
      </div>

      {status && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 animate-slide-in-up border ${
            status.type === "success"
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : "bg-rose-50 text-rose-700 border-rose-100"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span className="font-bold text-sm">{status.text}</span>
          <button
            onClick={() => setStatus(null)}
            className="ml-auto text-current opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {activeTab === "compose" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  Email Dispatch Form
                </span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-xs font-bold border-none bg-transparent focus:ring-0 text-orange-600 cursor-pointer"
                />
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                  <p className="text-[11px] text-orange-800 leading-relaxed font-medium">
                    <strong>Note:</strong> ইমেইল ফরম্যাট এবং লিংক অটোমেটিক সেট
                    করা থাকবে। আপনি শুধু "Smart Dispatch" এ ক্লিক করলে প্রতিটি
                    ডিপার্টমেন্টে আলাদা আলাদা লিংক এবং সিগনেচার সহ মেইল চলে
                    যাবে।
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter email subject..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all font-bold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                    Message Body
                  </label>
                  <textarea
                    rows={10}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all text-slate-700 resize-none h-[350px] text-sm"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Use [REPORT_LINK_WILL_BE_INSERTED_HERE] to specify where the
                    departmental link should appear. Use [Month-Year] for the
                    selected month.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Email Signature
                    </label>
                    <button
                      onClick={() => setIsEditingSignature(!isEditingSignature)}
                      className="text-[10px] text-orange-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Edit3 className="h-3 w-3" />
                      {isEditingSignature ? "Cancel" : "Edit Signature"}
                    </button>
                  </div>
                  {isEditingSignature ? (
                    <div className="space-y-2">
                      <textarea
                        rows={4}
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-orange-200 bg-orange-50/30 focus:border-orange-500 outline-none transition-all text-sm text-slate-700"
                      />
                      <button
                        onClick={handleSaveSignature}
                        className="flex items-center gap-1 bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-700"
                      >
                        <Save className="h-3 w-3" /> Save Signature
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 italic whitespace-pre-wrap">
                      {signature}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Send className="h-4 w-4 text-orange-600" />
                Dispatch Options
              </h3>

              <div className="space-y-3">
                <button
                  onClick={handleSmartDispatch}
                  disabled={sending || deptEmails.length === 0}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 active:scale-95 transition-all"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MailPlus className="h-4 w-4" />
                  )}
                  Run Smart Dispatch
                </button>
                <p className="text-[10px] text-slate-400 text-center uppercase font-bold tracking-widest">
                  Sends {deptEmails.length} individualized reports
                </p>
              </div>

              {/* Custom Email — fully independent one-off compose, separate from Smart Dispatch */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowCustomEmail(true);
                    setIsComposeMinimized(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 hover:text-orange-600 border border-dashed border-slate-200 hover:border-orange-300 rounded-xl py-3 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Send Custom Email
                </button>
                <p className="text-[9px] text-slate-400 text-center mt-2 italic">
                  Opens a Gmail-style compose window with attachment support.
                </p>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Selected Month Summary
                </h4>
                <div className="space-y-2">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">
                        Departments Configured:
                      </span>
                      <span className="font-bold">{deptEmails.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">
                        Links set for {selectedMonth}:
                      </span>
                      <span className="font-bold">
                        {monthlyLinks.length} / {deptEmails.length}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab("departments");
                      setIsEditingMonthlyLinks(true);
                    }}
                    className="w-full py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    <LinkIcon className="h-3 w-3" /> Update Monthly Links
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "departments" && (
        <div className="space-y-6">
          {/* Monthly Links Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-orange-50/30">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-orange-600" />
                  Monthly Report Links
                </h2>
                <p className="text-slate-500 text-xs">
                  Update specific report links for{" "}
                  <strong>{selectedMonth}</strong>.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                />
                {!isEditingMonthlyLinks ? (
                  <button
                    onClick={() => setIsEditingMonthlyLinks(true)}
                    className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-700 transition-all font-mono"
                  >
                    <Edit3 className="h-4 w-4" />
                    Update All links
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingMonthlyLinks(false)}
                      className="px-4 py-2 text-slate-500 font-bold text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAllLinks}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100"
                    >
                      Save All Changes
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deptEmails.map((d) => (
                  <div
                    key={d.department_name}
                    className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all"
                  >
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                      {d.department_name}
                    </label>
                    {isEditingMonthlyLinks ? (
                      <input
                        type="text"
                        placeholder="https://drive.google.com/..."
                        value={editingLinks[d.department_name] || ""}
                        onChange={(e) =>
                          setEditingLinks((prev) => ({
                            ...prev,
                            [d.department_name]: e.target.value,
                          }))
                        }
                        className="w-full p-2 text-xs border border-orange-200 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none"
                      />
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 truncate mr-2 italic">
                          {monthlyLinks.find(
                            (l) => l.department_name === d.department_name,
                          )?.link || "No link set"}
                        </span>
                        {monthlyLinks.find(
                          (l) => l.department_name === d.department_name,
                        )?.link && (
                          <a
                            href={
                              monthlyLinks.find(
                                (l) => l.department_name === d.department_name,
                              )?.link
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-orange-600"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Department Contacts section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-slate-500" />
                  Base Department Contacts
                </h2>
                <p className="text-slate-500 text-xs">
                  Configured recipients for each department (rarely changes).
                </p>
              </div>
              <button
                onClick={() => setIsAddingDept(true)}
                className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Department
              </button>
            </div>

            {isAddingDept && (
              <div className="p-6 bg-slate-50 border-b border-slate-200 animate-slide-in-down">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Department
                    </label>
                    <select
                      value={newDept.department_name}
                      onChange={(e) =>
                        setNewDept((prev) => ({
                          ...prev,
                          department_name: e.target.value,
                        }))
                      }
                      className="w-full p-2 rounded-lg border border-slate-300 text-sm"
                    >
                      <option value="">Select Dept</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 relative">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      To Recipients
                    </label>
                    <input
                      type="text"
                      value={newDept.to_emails}
                      onChange={(e) =>
                        setNewDept((prev) => ({
                          ...prev,
                          to_emails: e.target.value,
                        }))
                      }
                      onFocus={() => setActiveEmailDropdown("to")}
                      placeholder="Comma separated emails"
                      className="w-full p-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-orange-500"
                    />
                    {activeEmailDropdown === "to" &&
                      filteredDeptEmployees.length > 0 && (
                        <div
                          ref={dropdownRef}
                          className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto p-1 animate-slide-in-up"
                        >
                          <div className="p-2 border-b border-slate-50 mb-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              Select from {newDept.department_name}
                            </span>
                          </div>
                          {filteredDeptEmployees.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => addEmailToDept(emp.email, "to")}
                              className="w-full text-left px-3 py-2 hover:bg-orange-50 rounded-lg transition-colors flex flex-col group"
                            >
                              <span className="text-xs font-bold text-slate-700 group-hover:text-orange-700">
                                {emp.name}
                              </span>
                              <span className="text-[10px] text-slate-400 group-hover:text-orange-500 font-mono">
                                {emp.email}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    {activeEmailDropdown === "to" &&
                      filteredDeptEmployees.length === 0 &&
                      newDept.department_name && (
                        <div
                          ref={dropdownRef}
                          className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl p-4 text-center animate-slide-in-up"
                        >
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            No emails found for this dept.
                          </p>
                        </div>
                      )}
                  </div>
                  <div className="space-y-1 relative">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      CC Recipients
                    </label>
                    <input
                      type="text"
                      value={newDept.cc_emails}
                      onChange={(e) =>
                        setNewDept((prev) => ({
                          ...prev,
                          cc_emails: e.target.value,
                        }))
                      }
                      onFocus={() => setActiveEmailDropdown("cc")}
                      placeholder="Optional"
                      className="w-full p-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-orange-500"
                    />
                    {activeEmailDropdown === "cc" && (
                      <div
                        ref={dropdownRef}
                        className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-64 overflow-y-auto p-1 animate-slide-in-up"
                      >
                        <div className="p-2 border-b border-slate-50 mb-1 sticky top-0 bg-white">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search employees..."
                            value={emailSearch}
                            onChange={(e) => setEmailSearch(e.target.value)}
                            className="w-full text-[10px] p-1.5 border border-slate-100 rounded bg-slate-50 outline-none focus:bg-white focus:border-orange-200"
                          />
                        </div>
                        {allEmailEmployees
                          .filter(
                            (emp) =>
                              emp.name
                                .toLowerCase()
                                .includes(emailSearch.toLowerCase()) ||
                              emp.email
                                .toLowerCase()
                                .includes(emailSearch.toLowerCase()),
                          )
                          .map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => addEmailToDept(emp.email, "cc")}
                              className="w-full text-left px-3 py-2 hover:bg-orange-50 rounded-lg transition-colors flex flex-col group"
                            >
                              <span className="text-xs font-bold text-slate-700 group-hover:text-orange-700">
                                {emp.name}
                              </span>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 group-hover:text-orange-500 font-mono">
                                  {emp.email}
                                </span>
                                <span className="text-[9px] text-slate-300 font-medium">
                                  {emp.department}
                                </span>
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setIsAddingDept(false)}
                    className="px-4 py-2 text-slate-500 font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveDeptEmail(newDept)}
                    disabled={!newDept.department_name || !newDept.to_emails}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold disabled:bg-slate-300"
                  >
                    Save Contact
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4">Primary (TO)</th>
                    <th className="px-6 py-4">Copies (CC)</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {deptEmails.length > 0 ? (
                    deptEmails.map((d) => {
                      const isEditing = editingDeptId === d.id;
                      const toList = isEditing
                        ? editDeptData.to_emails
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [];
                      const ccList = isEditing
                        ? editDeptData.cc_emails
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [];
                      const editSuggestions = (
                        editEmailDropdown === "to"
                          ? filteredEditDeptEmployees
                          : allEmailEmployees
                      )
                        .filter(
                          (emp) =>
                            !(editEmailDropdown === "to"
                              ? toList
                              : ccList
                            ).includes(emp.email),
                        )
                        .filter(
                          (emp) =>
                            !editEmailInputValue ||
                            emp.name
                              .toLowerCase()
                              .includes(editEmailInputValue.toLowerCase()) ||
                            emp.email
                              .toLowerCase()
                              .includes(editEmailInputValue.toLowerCase()),
                        );

                      const renderEmailField = (type: "to" | "cc") => {
                        const list = type === "to" ? toList : ccList;
                        return (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              {list.length > 0 ? (
                                list.map((email) => (
                                  <span
                                    key={email}
                                    className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full pl-2.5 pr-1 py-1 font-mono text-[11px] text-slate-600"
                                  >
                                    {email}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeEmailFromEditDept(email, type)
                                      }
                                      className="p-0.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                      title="Remove email"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  No recipients
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                value={
                                  editEmailDropdown === type
                                    ? editEmailInputValue
                                    : ""
                                }
                                onChange={(e) =>
                                  setEditEmailInputValue(e.target.value)
                                }
                                onFocus={() => {
                                  setEditEmailDropdown(type);
                                  setEditEmailInputValue("");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addEmailToEditDept(
                                      editEmailInputValue,
                                      type,
                                    );
                                  }
                                }}
                                placeholder="Type or pick an email, Enter to add"
                                className="w-full p-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-orange-500"
                              />
                              {editEmailDropdown === type && (
                                <div
                                  ref={editDropdownRef}
                                  className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-40 overflow-y-auto p-1 animate-slide-in-up"
                                >
                                  {editSuggestions.length > 0 ? (
                                    editSuggestions.map((emp) => (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        onClick={() =>
                                          addEmailToEditDept(emp.email, type)
                                        }
                                        className="w-full text-left px-3 py-1.5 hover:bg-orange-50 rounded-lg transition-colors flex flex-col group"
                                      >
                                        <span className="text-xs font-bold text-slate-700 group-hover:text-orange-700">
                                          {emp.name}
                                        </span>
                                        <span className="text-[10px] text-slate-400 group-hover:text-orange-500 font-mono">
                                          {emp.email}
                                        </span>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-[10px] text-slate-400 font-bold uppercase">
                                      No matches
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      };

                      return (
                        <tr
                          key={d.id}
                          className={`transition-colors ${isEditing ? "bg-orange-50/40" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-6 py-4 font-bold text-slate-700 align-top">
                            {d.department_name}
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-mono text-xs align-top min-w-[220px]">
                            {isEditing ? renderEmailField("to") : d.to_emails}
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-mono text-xs align-top min-w-[220px]">
                            {isEditing
                              ? renderEmailField("cc")
                              : d.cc_emails || "None"}
                          </td>
                          <td className="px-6 py-4 text-right align-top">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={handleUpdateDeptEmail}
                                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                  title="Save changes"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={cancelEditDept}
                                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-all"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => startEditDept(d)}
                                  className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                                  title="Add / remove emails"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteDeptEmail(d.department_name)
                                  }
                                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete department"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-10 text-center italic text-slate-400 uppercase text-[10px] font-bold tracking-widest"
                      >
                        No base mappings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History className="h-5 w-5 text-orange-600" />
              Dispatch History
            </h2>
            <button
              onClick={fetchSentHistory}
              className="text-slate-400 hover:text-slate-600 p-2"
            >
              <Clock className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-4">Month</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Recipient</th>
                  <th className="px-6 py-4">Sent At</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sentHistory.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {log.report_month}
                      </td>
                      <td className="px-6 py-4 uppercase text-[10px] font-black bg-slate-100 inline-block m-2 px-2 py-1 rounded text-slate-500">
                        {log.report_type}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">
                            {log.recipient_email}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[250px]">
                            {log.subject}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(log.sent_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              setViewingLog(
                                viewingLog?.id === log.id ? null : log,
                              )
                            }
                            className={`p-2 rounded-lg transition-all ${viewingLog?.id === log.id ? "bg-orange-600 text-white" : "text-slate-400 hover:bg-slate-100"}`}
                            title="View Message"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <span className="text-emerald-600 flex items-center gap-1 font-bold text-xs whitespace-nowrap">
                            <CheckCircle2 className="h-3 w-3" />
                            Delivered
                          </span>
                        </div>
                      </td>
                    </tr>
                    {viewingLog?.id === log.id && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-8 py-6 bg-slate-50 border-y border-slate-100 animate-slide-in-down"
                        >
                          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                Message Body History
                              </h4>
                              <button
                                onClick={() => setViewingLog(null)}
                                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                              >
                                ×
                              </button>
                            </div>
                            <div className="text-slate-700 text-sm leading-relaxed">
                              {formatLogMessage(log.message_body)}
                            </div>
                            <div className="pt-4 border-t border-slate-50 flex justify-end">
                              <span className="text-[10px] text-slate-400 font-mono">
                                Attachment: {log.attachment_name}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {sentHistory.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-20 text-center italic text-slate-400"
                    >
                      No dispatch history available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gmail-style floating compose popup for the custom one-off email */}
      {showCustomEmail && (
        <div
          className={`fixed z-50 bg-white shadow-2xl border border-slate-300 flex flex-col overflow-hidden transition-all ${
            isComposeExpanded
              ? "inset-4 md:inset-10 rounded-2xl"
              : `bottom-0 right-4 md:right-8 rounded-t-2xl ${
                  isComposeMinimized
                    ? "h-12 w-[calc(100%-2rem)] max-w-[440px]"
                    : "max-h-[85vh]"
                }`
          }`}
          style={
            !isComposeExpanded && !isComposeMinimized
              ? {
                  width: `min(${composeSize.width}px, calc(100% - 2rem))`,
                  height: `${composeSize.height}px`,
                }
              : undefined
          }
        >
          {/* Drag handle — free-resize the popup from its top-left corner.
              Only active when not fullscreen-expanded and not minimized. */}
          {!isComposeExpanded && !isComposeMinimized && (
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-10 group"
              title="টেনে সাইজ পরিবর্তন করুন"
            >
              <div className="w-2.5 h-2.5 m-0.5 border-t-2 border-l-2 border-slate-300 group-hover:border-orange-500 rounded-tl-sm transition-colors" />
            </div>
          )}

          {/* Header bar */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white cursor-pointer select-none shrink-0"
            onClick={() => {
              if (!isComposeExpanded) setIsComposeMinimized((v) => !v);
            }}
          >
            <span className="text-sm font-bold flex items-center gap-2 truncate">
              <Mail className="h-4 w-4" />
              {customSubject.trim() ? customSubject : "New Message"}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {!isComposeExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsComposeMinimized((v) => !v);
                  }}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  title={isComposeMinimized ? "Restore" : "Minimize"}
                >
                  {isComposeMinimized ? (
                    <Maximize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsComposeExpanded((v) => !v);
                  setIsComposeMinimized(false);
                }}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title={isComposeExpanded ? "Restore size" : "Expand"}
              >
                {isComposeExpanded ? (
                  <Shrink className="h-3.5 w-3.5" />
                ) : (
                  <Expand className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCustomEmail(false);
                }}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isComposeMinimized && (
            <>
              {/* Scrollable form body */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* To */}
                <div className="relative flex items-center border-b border-slate-100 px-4 py-2">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    onFocus={() => {
                      setComposeEmailDropdown("to");
                      setComposeEmailSearch("");
                    }}
                    placeholder="To"
                    className="flex-1 text-sm outline-none text-slate-800 placeholder:text-slate-400"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {!showCcField && (
                      <button
                        onClick={() => setShowCcField(true)}
                        className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                      >
                        Cc
                      </button>
                    )}
                    {!showBccField && (
                      <button
                        onClick={() => setShowBccField(true)}
                        className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                      >
                        Bcc
                      </button>
                    )}
                  </div>
                  {renderComposeEmailDropdown("to")}
                </div>

                {/* Cc */}
                {showCcField && (
                  <div className="relative flex items-center border-b border-slate-100 px-4 py-2">
                    <input
                      type="text"
                      value={customCc}
                      onChange={(e) => setCustomCc(e.target.value)}
                      onFocus={() => {
                        setComposeEmailDropdown("cc");
                        setComposeEmailSearch("");
                      }}
                      placeholder="Cc"
                      className="flex-1 text-sm outline-none text-slate-800 placeholder:text-slate-400"
                    />
                    <button
                      onClick={() => {
                        setShowCcField(false);
                        setCustomCc("");
                      }}
                      className="text-slate-300 hover:text-slate-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {renderComposeEmailDropdown("cc")}
                  </div>
                )}

                {/* Bcc */}
                {showBccField && (
                  <div className="relative flex items-center border-b border-slate-100 px-4 py-2">
                    <input
                      type="text"
                      value={customBcc}
                      onChange={(e) => setCustomBcc(e.target.value)}
                      onFocus={() => {
                        setComposeEmailDropdown("bcc");
                        setComposeEmailSearch("");
                      }}
                      placeholder="Bcc"
                      className="flex-1 text-sm outline-none text-slate-800 placeholder:text-slate-400"
                    />
                    <button
                      onClick={() => {
                        setShowBccField(false);
                        setCustomBcc("");
                      }}
                      className="text-slate-300 hover:text-slate-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {renderComposeEmailDropdown("bcc")}
                  </div>
                )}

                {/* Subject */}
                <div className="border-b border-slate-100 px-4 py-2">
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full text-sm outline-none text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                {/* Optional report link */}
                <div className="border-b border-slate-100 px-4 py-2">
                  <input
                    type="text"
                    value={customLink}
                    onChange={(e) => setCustomLink(e.target.value)}
                    placeholder="Link to insert (optional) — https://..."
                    className="w-full text-xs outline-none text-slate-600 placeholder:text-slate-400"
                  />
                </div>

                {/* Message body */}
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Write your message here..."
                  className={`flex-1 px-4 py-3 text-sm text-slate-700 outline-none resize-none ${
                    isComposeExpanded ? "min-h-[320px]" : "min-h-[140px]"
                  }`}
                />

                {/* Attachment chips */}
                {customAttachments.length > 0 && (
                  <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {customAttachments.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-full pl-2.5 pr-1.5 py-1.5 text-xs text-slate-700 font-medium max-w-full"
                      >
                        <FileIcon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        <span className="truncate max-w-[160px]">
                          {file.name}
                        </span>
                        <span className="text-slate-400 shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="p-0.5 hover:bg-slate-300 rounded-full shrink-0"
                          title="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendCustomEmail}
                    disabled={
                      sendingCustom ||
                      !recipient.trim() ||
                      !customSubject.trim()
                    }
                    className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-5 py-2 rounded-full font-bold text-sm shadow-sm active:scale-95 transition-all"
                  >
                    {sendingCustom ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </button>
                  <input
                    ref={customFileInputRef}
                    type="file"
                    multiple
                    onChange={handleAttachFiles}
                    className="hidden"
                  />
                  <button
                    onClick={() => customFileInputRef.current?.click()}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                    title="Attach files"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Discard this draft?")) {
                      resetComposePopup();
                      setShowCustomEmail(false);
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
                  title="Discard draft"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportMailer;