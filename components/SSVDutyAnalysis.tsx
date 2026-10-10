import React, { useState, useRef, useMemo } from "react";
import { User, EmployeeVisit, SSVDutyAnalysisTab } from "../types";
import FeedbackMessage from "./FeedbackMessage";
import SSVDutyAnalysisRecords from "./SSVDutyAnalysisRecords";
import SSVDutyAnalysisAnalysis from "./SSVDutyAnalysisAnalysis";
import SSVDutyAnalysisRoster from "./SSVDutyAnalysisRoster";
import _ from "lodash";
import { parseCSVRobustly } from "../utils/csvUtils";

// For TypeScript to recognize libraries loaded from CDN
declare global {
  interface Window {
    Papa: any;
  }
}

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

interface SSVDutyAnalysisProps {
  currentUser: User;
  activeTab: SSVDutyAnalysisTab;
  onTabChange: (tab: SSVDutyAnalysisTab) => void;
  allEmployeeVisits: EmployeeVisit[];
}

const SSVDutyAnalysis: React.FC<SSVDutyAnalysisProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  allEmployeeVisits,
}) => {
  const [localVisits, setLocalVisits] = useState<EmployeeVisit[]>([]);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Efficiently combine server visits with any manually imported ones
  const visits = useMemo(() => {
    const ssvFromAll = allEmployeeVisits.filter(
      (visit) =>
        visit.department?.trim() === "HR & Admin (Security)" &&
        visit.designation?.trim() === "Security Supervisor",
    );

    // Use unionBy to avoid duplicates between server and local imports
    const combined = _.unionBy(ssvFromAll, localVisits, "id");
    return _.orderBy(combined, ["date", "entryTime"], ["desc", "desc"]);
  }, [allEmployeeVisits, localVisits]);

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
      complete: (results: any) => {
        const headers = results.meta.fields;
        const isValid =
          headers &&
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

        const ssvVisits: EmployeeVisit[] = [];
        let hasError = false;

        results.data.forEach((row: any, index: number) => {
          if (hasError) return;

          // The main filtering logic
          if (
            row["Department"]?.trim() !== "HR & Admin (Security)" ||
            row["Designation"]?.trim() !== "Security Supervisor"
          ) {
            return; // Skip if not a security supervisor
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

          ssvVisits.push({
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
          setLocalVisits((prev) =>
            _.orderBy([...prev, ...ssvVisits], ["date"], ["desc"]),
          );
          setFeedback({
            message: `Successfully imported ${ssvVisits.length} Security Supervisor records.`,
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

  const handleClearRecords = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all imported SSV records? Note: Server records will remain visible until cleared globally.",
      )
    ) {
      setLocalVisits([]);
      setFeedback({
        message: "Imported SSV records have been cleared.",
        type: "info",
      });
    }
  };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden text-slate-800">
          <div className="bg-transparent">
            {activeTab === "records" && (
              <SSVDutyAnalysisRecords
                currentUser={currentUser}
                visits={visits}
                fileInputRef={fileInputRef}
                onFileUpload={handleFileUpload}
                onClearRecords={handleClearRecords}
              />
            )}
            {activeTab === "analysis" && (
              <SSVDutyAnalysisAnalysis
                currentUser={currentUser}
                visits={visits}
              />
            )}
            {activeTab === "rosterAnalysis" && (
              <SSVDutyAnalysisRoster visits={visits} />
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

export default SSVDutyAnalysis;
