import React, { useMemo, useRef, useState } from "react";
import { User } from "../types";
import type { AnalysisData, PrevMonthSummary } from "../utils/itAnalytics";
import _ from "lodash";
import { useLoading } from "../contexts/LoadingContext";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const formatDateDDMMMYYYY = (date: Date | string | null): string => {
  if (!date) return "";
  try {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = `${date}T00:00:00Z`;
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(date);
  }
};

export type { AnalysisData };

interface ITAnalysisTabProps {
  analysisData: AnalysisData | null;
  currentUser: User;
  availableMonths: string[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  /** Previous calendar month, computed like-for-like (see summarizePreviousMonth) */
  prevMonthSummary?: PrevMonthSummary | null;
}

// Analysis Card component
const AnalysisCard: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = "" }) => (
  <div className={`bg-white/60 backdrop-blur-md p-4 rounded-xl border border-white shadow-sm transition-shadow hover:shadow-md ${className}`}>
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3 mb-4">
      {title}
    </h3>
    <div className="text-sm">{children}</div>
  </div>
);

const getCountColorClass = (count: number) => {
  if (count >= 10) return "text-red-600";
  if (count >= 5) return "text-orange-600";
  if (count >= 3) return "text-yellow-600";
  return "text-green-600";
};

/** Render a small % change badge */
const ChangeBadge: React.FC<{ current: number; previous: number }> = ({ current, previous }) => {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) {
    return (
      <span className="ml-2 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
        NEW
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return (
    <span className="ml-2 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
      — 0%
    </span>
  );
  const up = pct > 0;
  return (
    <span className={`ml-2 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
};

const ITAnalysisTab: React.FC<ITAnalysisTabProps> = ({
  analysisData,
  currentUser,
  availableMonths,
  selectedMonth,
  onMonthChange,
  prevMonthSummary = null,
}) => {
  const { showLoading, hideLoading } = useLoading();
  const [showAllIssues, setShowAllIssues] = useState(false);
  const canEdit =
    currentUser.permissions?.itResponseTimeline?.edit ||
    currentUser.role === "super_admin" ||
    currentUser.role === "admin";

  const prevMonthStats = prevMonthSummary;

  // ─── Resolution Time Distribution buckets (incidents closed in the period) ──
  const resolutionBuckets = useMemo(() => {
    if (!analysisData) return [];
    const resolved = analysisData.issueTimeline.filter(
      (t) => t.closedInPeriod && typeof t.resolutionTimeInDays === "number"
    );
    const buckets = [
      { label: "1 day", min: 0, max: 1, count: 0 },
      { label: "2–3 days", min: 2, max: 3, count: 0 },
      { label: "4–7 days", min: 4, max: 7, count: 0 },
      { label: "8–14 days", min: 8, max: 14, count: 0 },
      { label: "15+ days", min: 15, max: Infinity, count: 0 },
    ];
    resolved.forEach((t) => {
      const d = t.resolutionTimeInDays as number;
      const b = buckets.find((b) => d >= b.min && d <= b.max);
      if (b) b.count++;
    });
    const max = Math.max(...buckets.map((b) => b.count), 1);
    return buckets.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }));
  }, [analysisData]);

  // Incidents still unresolved when the selected (already finished) period ended
  const carryOverIssues = useMemo(
    () => (analysisData ? analysisData.issueTimeline.filter((t) => t.isCarryOver) : []),
    [analysisData],
  );

  const sortedTimelineData = useMemo(
    () => (analysisData ? _.orderBy(analysisData.issueTimeline, ["count"], ["desc"]) : []),
    [analysisData],
  );

  const fmtDays = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  // ─── PDF handlers (unchanged logic, kept intact) ───────────────────────────
  const handleSaveAsPdf = () => {
    if (!analysisData) { alert("There is no data to export."); return; }
    showLoading();
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      let lastY = 0;

      const addHeaderFooter = (currentPage: number, totalPages: number) => {
        const pageHeight = doc.internal.pageSize.getHeight();
        const headerStartY = 15;
        doc.setFont("Merriweather", "bold").setFontSize(14).setTextColor(40);
        doc.text("Credence Housing Limited", pageWidth / 2, headerStartY, { align: "center" });
        doc.setFont("Trebuchet MS", "normal").setFontSize(9).setTextColor(100);
        doc.text("House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209", pageWidth / 2, headerStartY + 6, { align: "center" });
        doc.setDrawColor(220); doc.setLineWidth(0.2);
        doc.line(margin, headerStartY + 8, pageWidth - margin, headerStartY + 8);
        const [year, month] = selectedMonth.split("-");
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("default", { month: "long", year: "numeric" });
        doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
        doc.text(`IT Response Timeline - Analysis Report (${monthName})`, pageWidth / 2, headerStartY + 14, { align: "center" });
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(150);
        doc.text(`Prepared by: Ruhul Amen`, margin, pageHeight - 10);
        doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      };

      lastY = 42;
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      doc.text("Overall Summary", margin, lastY);
      lastY += 6;

      const cardWidth = (pageWidth - margin * 2 - 15) / 4;
      const cardHeight = 12;
      const cardColors = {
        total: [224, 231, 255], issue: [254, 243, 199],
        offline: [209, 250, 229], project: [233, 213, 255],
      };

      doc.setFillColor(cardColors.total[0], cardColors.total[1], cardColors.total[2]);
      doc.roundedRect(margin, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(55, 65, 81);
      doc.text(String(analysisData.totalAssignedIssues), margin + 5, lastY + 7);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      doc.text("Incidents", margin + 5, lastY + 11);

      doc.setFillColor(cardColors.issue[0], cardColors.issue[1], cardColors.issue[2]);
      doc.roundedRect(margin + cardWidth + 5, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(55, 65, 81);
      doc.text(String(analysisData.issueCount), margin + cardWidth + 10, lastY + 7);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      doc.text("Issue Incidents", margin + cardWidth + 10, lastY + 11);

      doc.setFillColor(cardColors.offline[0], cardColors.offline[1], cardColors.offline[2]);
      doc.roundedRect(margin + (cardWidth + 5) * 2, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(55, 65, 81);
      doc.text(String(analysisData.offlineCount), margin + (cardWidth + 5) * 2 + 5, lastY + 7);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      doc.text("Offline Incidents", margin + (cardWidth + 5) * 2 + 5, lastY + 11);

      doc.setFillColor(cardColors.project[0], cardColors.project[1], cardColors.project[2]);
      doc.roundedRect(margin + (cardWidth + 5) * 3, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(55, 65, 81);
      doc.text(String(analysisData.projectSummary.length), margin + (cardWidth + 5) * 3 + 5, lastY + 7);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      doc.text("Projects w/ Issues", margin + (cardWidth + 5) * 3 + 5, lastY + 11);

      lastY += cardHeight + 10;

      const tableOptions = {
        theme: "grid" as any,
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontSize: 8, fontStyle: "bold", cellPadding: 1.5, lineColor: [226, 232, 240] },
        bodyStyles: { fontSize: 7.5, cellPadding: 1, fontStyle: "normal" },
        styles: { overflow: "linebreak" },
        margin: { top: 42, bottom: 25, left: margin, right: margin },
        didDrawPage: (data: any) => { addHeaderFooter(data.pageNumber, (doc as any).internal.getNumberOfPages()); },
      };

      // @ts-ignore
      autoTable(doc as any, {
        ...tableOptions,
        head: [[{ content: "Top 5 Common Problems", colSpan: 4, styles: { halign: "center" as any, fillColor: [224, 231, 255] } }], ["#", "Problem", "Count", "Latest Project & Date"]],
        body: analysisData.top5CommonProblems.map((p, index) => [index + 1, p.issue, p.count, `${p.latestProject}\n(${formatDateDDMMMYYYY(p.latestDate)})`]),
        startY: lastY,
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 15 }, 3: { cellWidth: 40 } },
      });
      lastY = (doc as any).lastAutoTable.finalY + 8;

      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      doc.text("Zone & Project Breakdown", margin, lastY);
      lastY += 8;

      const zoneTableY = lastY;
      // @ts-ignore
      autoTable(doc as any, {
        ...tableOptions,
        head: [["Zone", "Count", "Projects"]],
        body: analysisData.zoneSummary.map((z) => [z.zone, z.count, z.projects.join(", ")]),
        startY: zoneTableY,
        margin: { left: margin, right: pageWidth / 2 + 2 },
        tableWidth: pageWidth / 2 - margin - 2,
      });
      const zoneTableFinalY = (doc as any).lastAutoTable.finalY;

      const projectSummary = analysisData.projectSummary;
      const half = Math.ceil(projectSummary.length / 2);
      const firstHalfProjects = projectSummary.slice(0, half);
      const secondHalfProjects = projectSummary.slice(half);
      const rightHalfXStart = pageWidth / 2 + 2;
      const rightHalfWidth = pageWidth / 2 - margin - 2;
      const projectTableWidth = rightHalfWidth / 2 - 1;

      let projectTable1FinalY = zoneTableY;
      if (firstHalfProjects.length > 0) {
        // @ts-ignore
        autoTable(doc as any, {
          ...tableOptions,
          head: [["Project", "Count"]],
          body: firstHalfProjects,
          startY: zoneTableY,
          margin: { left: rightHalfXStart, right: pageWidth - rightHalfXStart - projectTableWidth },
          tableWidth: projectTableWidth,
        });
        projectTable1FinalY = (doc as any).lastAutoTable.finalY;
      }

      let projectTable2FinalY = zoneTableY;
      if (secondHalfProjects.length > 0) {
        // @ts-ignore
        autoTable(doc as any, {
          ...tableOptions,
          head: [["Project", "Count"]],
          body: secondHalfProjects,
          startY: zoneTableY,
          margin: { left: rightHalfXStart + projectTableWidth + 2, right: margin },
          tableWidth: projectTableWidth,
        });
        projectTable2FinalY = (doc as any).lastAutoTable.finalY;
      }

      lastY = Math.max(zoneTableFinalY, projectTable1FinalY, projectTable2FinalY) + 8;
      doc.addPage();
      lastY = 42;

      // @ts-ignore
      autoTable(doc as any, {
        ...tableOptions,
        head: [
          [{ content: "Unique Issue Timeline & Resolution", colSpan: 10, styles: { halign: "center" as any, fillColor: [224, 231, 255] } }],
          ["SL", "Project", "Issue", "Days Logged", "Raised On", "Span (days)", "Resolution", "Res. Date", "Status", "Carry-Over"],
        ],
        body: analysisData.issueTimeline.map((t, index) => {
          const isCO = t.isCarryOver;
          return [
            index + 1, t.projectName, t.issue, t.count,
            formatDateDDMMMYYYY(t.firstReported), t.totalActiveDays,
            t.resolutionTimeInDays !== null ? `${t.resolutionTimeInDays} Day(s)` : "N/A",
            t.solutionDate === "Ongoing" ? "N/A" : formatDateDDMMMYYYY(t.solutionDate),
            t.solutionDate === "Ongoing" ? "Ongoing" : "Resolved",
            isCO ? "Yes" : "-",
          ];
        }),
        startY: lastY,
        columnStyles: { 0: { cellWidth: 7 }, 9: { cellWidth: 16 } },
        didParseCell: (data: any) => {
          if (!analysisData || data.cell.section !== "body" || typeof data.row.index !== "number") return;
          const rowData = analysisData.issueTimeline[data.row.index];
          if (!rowData) return;
          if (rowData.isCarryOver) {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
            data.cell.styles.fontStyle = "bold";
          } else if (rowData.solutionDate === "Ongoing") {
            data.cell.styles.fillColor = [254, 249, 195];
            data.cell.styles.textColor = [133, 77, 14];
            data.cell.styles.fontStyle = "bold";
          } else {
            const topCounts = _.chain(analysisData.issueTimeline).map("count").orderBy("desc").uniq().take(3).value();
            if (topCounts.includes(rowData.count)) {
              data.cell.styles.fillColor = [219, 234, 254];
            }
          }
        },
      });

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) { doc.setPage(i); addHeaderFooter(i, totalPages); }
      doc.save(`it-analysis-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error("PDF Generation Error:", error);
      alert("An error occurred while generating the PDF.");
    } finally {
      hideLoading();
    }
  };

  const handleSaveSummaryPdf = () => {
    if (!analysisData) { alert("There is no data to export."); return; }
    showLoading();
    try {
      const doc = new jsPDF("p", "mm", "legal");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;

      const addHeaderFooterToAllPages = () => {
        const totalPages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          const headerStartY = 15;
          doc.setFont("Merriweather", "bold").setFontSize(14).setTextColor(40);
          doc.text("Credence Housing Limited", pageWidth / 2, headerStartY, { align: "center" });
          doc.setFont("Trebuchet MS", "normal").setFontSize(9).setTextColor(100);
          doc.text("House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209", pageWidth / 2, headerStartY + 6, { align: "center" });
          doc.setDrawColor(220); doc.setLineWidth(0.2);
          doc.line(margin, headerStartY + 8, pageWidth - margin, headerStartY + 8);
          const [year, month] = selectedMonth.split("-");
          const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("default", { month: "long", year: "numeric" });
          doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
          doc.text(`IT Response Timeline - Summary Report (${monthName})`, pageWidth / 2, headerStartY + 14, { align: "center" });
          doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(150);
          doc.text(`Prepared by: Ruhul Amen`, margin, pageHeight - 10);
          doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
        }
      };

      let lastY = 42;
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      doc.text("Data Analysis Summary", margin, lastY);
      lastY += 6;

      const cardWidth = (pageWidth - margin * 2 - 15) / 4;
      const cardHeight = 12;
      doc.setFillColor(224, 231, 255).roundedRect(margin, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).text(String(analysisData.totalAssignedIssues), margin + 5, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text("Incidents", margin + 5, lastY + 11);

      doc.setFillColor(254, 243, 199).roundedRect(margin + cardWidth + 5, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).text(String(analysisData.issueCount), margin + cardWidth + 10, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text("Issue Incidents", margin + cardWidth + 10, lastY + 11);

      doc.setFillColor(209, 250, 229).roundedRect(margin + (cardWidth + 5) * 2, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).text(String(analysisData.offlineCount), margin + (cardWidth + 5) * 2 + 5, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text("Offline Incidents", margin + (cardWidth + 5) * 2 + 5, lastY + 11);

      doc.setFillColor(233, 213, 255).roundedRect(margin + (cardWidth + 5) * 3, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).text(String(analysisData.projectSummary.length), margin + (cardWidth + 5) * 3 + 5, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text("Projects w/ Issues", margin + (cardWidth + 5) * 3 + 5, lastY + 11);

      lastY += cardHeight + 10;

      const tableOptions = {
        theme: "grid" as any,
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        styles: { overflow: "linebreak" },
      };
      const colWidth = (pageWidth - margin * 2 - 5) / 2;
      const leftColX = margin;

      // @ts-ignore
      autoTable(doc as any, {
        ...tableOptions,
        head: [[{ content: "Top 5 Common Problems", colSpan: 3, styles: { halign: "center" as any } }], ["#", "Problem", "Count"]],
        body: analysisData.top5CommonProblems.map((p, i) => [i + 1, p.issue, p.count]),
        startY: lastY, tableWidth: colWidth,
        margin: { left: leftColX, right: pageWidth - leftColX - colWidth },
      });
      let leftColY = (doc as any).lastAutoTable.finalY;

      // @ts-ignore
      autoTable(doc as any, {
        ...tableOptions,
        head: [[{ content: "Zone Breakdown", colSpan: 2, styles: { halign: "center" as any } }], ["Zone", "Count"]],
        body: analysisData.zoneSummary.map((z) => [z.zone, z.count]),
        startY: leftColY + 5, tableWidth: colWidth,
        margin: { left: leftColX, right: pageWidth - leftColX - colWidth },
      });

      const rightColX = margin + colWidth + 5;
      // @ts-ignore
      autoTable(doc as any, {
        ...tableOptions,
        head: [[{ content: "Project Breakdown", colSpan: 2, styles: { halign: "center" as any } }], ["Project", "Count"]],
        body: analysisData.projectSummary,
        startY: lastY, tableWidth: colWidth,
        margin: { left: rightColX, right: margin },
      });

      doc.addPage("legal", "p");
      lastY = 42;
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      doc.text("Timeline Highlights", margin, lastY);
      lastY += 6;
      doc.setFillColor(241, 245, 249).roundedRect(margin, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(14).text(analysisData.resolution.n ? `${fmtDays(analysisData.resolution.median)} Days` : "N/A", margin + 5, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text(`Median Time to Resolve (n=${analysisData.resolution.n})`, margin + 5, lastY + 11);
      doc.setFillColor(241, 245, 249).roundedRect(margin + cardWidth + 5, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(9).text(_.truncate(analysisData.longestOpenIssue?.issue || "N/A", { length: 25 }), margin + cardWidth + 10, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text(`Longest Open Issue (${analysisData.longestOpenIssue?.resolutionTimeInDays || 0} days)`, margin + cardWidth + 10, lastY + 11);
      doc.setFillColor(241, 245, 249).roundedRect(margin + (cardWidth + 5) * 2, lastY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(9).text(_.truncate(analysisData.mostFrequentIssue?.issue || "N/A", { length: 25 }), margin + (cardWidth + 5) * 2 + 5, lastY + 8);
      doc.setFont("helvetica", "normal").setFontSize(8).text(`Most Frequent Issue (${analysisData.mostFrequentIssue?.count || 0} incidents)`, margin + (cardWidth + 5) * 2 + 5, lastY + 11);
      lastY += cardHeight + 10;

      // Carry-over notice in PDF
      if (carryOverIssues.length > 0) {
        doc.setFillColor(254, 226, 226).roundedRect(margin, lastY, pageWidth - margin * 2, 10, 2, 2, "F");
        doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(153, 27, 27);
        doc.text(`⚠ ${carryOverIssues.length} issue(s) from this month are still active / carried over to the next month.`, margin + 3, lastY + 7);
        doc.setTextColor(40);
        lastY += 15;
      }

      const timelineData = analysisData.issueTimeline;
      const timelineHalf = Math.ceil(timelineData.length / 2);
      const timelineCol1 = timelineData.slice(0, timelineHalf);
      const timelineCol2 = timelineData.slice(timelineHalf);
      const timelineHeaders = [["Project", "Issue", "Count", "Status", "Carry?"]];
      const timelineTableOptions = {
        ...tableOptions,
        head: [[{ content: "Unique Issue Timeline & Resolution", colSpan: 5, styles: { halign: "center" as any } }], ...timelineHeaders],
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 12 }, 3: { cellWidth: 15 }, 4: { cellWidth: 12 } },
      };

      const getTimelineBody = (data: typeof timelineData) =>
        data.map((t) => {
          return [t.projectName, t.issue, t.count, t.solutionDate === "Ongoing" ? "Ongoing" : "Resolved", t.isCarryOver ? "Yes" : "-"];
        });

      if (timelineCol1.length > 0) {
        // @ts-ignore
        autoTable(doc as any, { ...timelineTableOptions, body: getTimelineBody(timelineCol1), startY: lastY, tableWidth: colWidth, margin: { left: leftColX, right: pageWidth - leftColX - colWidth } });
      }
      if (timelineCol2.length > 0) {
        // @ts-ignore
        autoTable(doc as any, { ...timelineTableOptions, body: getTimelineBody(timelineCol2), startY: lastY, tableWidth: colWidth, margin: { left: rightColX, right: margin } });
      }

      addHeaderFooterToAllPages();
      doc.save(`it-analysis-summary-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error("Summary PDF Generation Error:", error);
      alert("An error occurred while generating the summary PDF.");
    } finally {
      hideLoading();
    }
  };

  if (!analysisData) {
    return (
      <div className="p-8 text-center text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-slate-900">No Data for Analysis</h3>
        <p className="mt-1 text-sm text-slate-500">Please import data in the "Records & Import" tab to see the analysis.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 no-print">
        <h2 className="text-2xl font-bold text-slate-800">Data Analysis Summary</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="px-3 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
          >
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {new Date(month + "-01").toLocaleString("default", { month: "long", year: "numeric" })}
              </option>
            ))}
          </select>
          {canEdit ? (
            <>
              <button onClick={handleSaveAsPdf} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50" title="Save detailed analysis as a PDF">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                Save Detailed PDF
              </button>
              <button onClick={handleSaveSummaryPdf} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50" title="Save a compact summary">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                Save Summary PDF
              </button>
            </>
          ) : (
            <span className="text-slate-400 text-xs bg-slate-100/50 px-2 py-1 rounded border border-slate-200">Reports: Admin Only</span>
          )}
        </div>
      </div>

      {/* ── Carry-Over Alert Banner ─────────────────────────────────────────── */}
      {carryOverIssues.length > 0 && (
        <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-bold text-red-800">
              {carryOverIssues.length} incident{carryOverIssues.length > 1 ? "s" : ""} {carryOverIssues.length > 1 ? "were" : "was"} still unresolved at the end of this period (carried over)
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {carryOverIssues.map((c) => c.issue).join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white/40 backdrop-blur-md p-6 rounded-lg space-y-6 border border-white shadow-sm">
        <div id="it-analysis-summary-section">
          {/* ── Summary Cards with % Change badges ──────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Records */}
            <div className="bg-white/60 backdrop-blur-md p-4 rounded-xl border border-white shadow-sm flex items-center gap-4 transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
              </div>
              <div>
                <div className="flex items-center">
                  <p className="text-2xl font-bold text-slate-900">{analysisData.totalAssignedIssues}</p>
                  {prevMonthStats && <ChangeBadge current={analysisData.totalAssignedIssues} previous={prevMonthStats.total} />}
                </div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Incidents</p>
                <p className="text-[10px] text-slate-400 mt-0.5" title="Rows logged across all days; one long incident adds one per day">{analysisData.issueDays} issue-days</p>
                {prevMonthStats && <p className="text-[10px] text-slate-400">prev{prevMonthStats.sameDayLimit ? ` (1–${prevMonthStats.sameDayLimit})` : ""}: {prevMonthStats.total}</p>}
              </div>
            </div>
            {/* Issues Reported */}
            <div className="bg-white/60 backdrop-blur-md p-4 rounded-xl border border-white shadow-sm flex items-center gap-4 transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-yellow-50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <div className="flex items-center">
                  <p className="text-2xl font-bold text-slate-900">{analysisData.issueCount}</p>
                  {prevMonthStats && <ChangeBadge current={analysisData.issueCount} previous={prevMonthStats.issueCount} />}
                </div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Issue Incidents</p>
                {prevMonthStats && <p className="text-[10px] text-slate-400 mt-0.5">prev: {prevMonthStats.issueCount}</p>}
              </div>
            </div>
            {/* Marked Offline */}
            <div className="bg-white/60 backdrop-blur-md p-4 rounded-xl border border-white shadow-sm flex items-center gap-4 transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              </div>
              <div>
                <div className="flex items-center">
                  <p className="text-2xl font-bold text-slate-900">{analysisData.offlineCount}</p>
                  {prevMonthStats && <ChangeBadge current={analysisData.offlineCount} previous={prevMonthStats.offlineCount} />}
                </div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Offline Incidents</p>
                {prevMonthStats && <p className="text-[10px] text-slate-400 mt-0.5">prev: {prevMonthStats.offlineCount}</p>}
              </div>
            </div>
            {/* Projects with Issues */}
            <div className="bg-white/60 backdrop-blur-md p-4 rounded-xl border border-white shadow-sm flex items-center gap-4 transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m-1 4h1m5-4h1m-1 4h1m-5-4h1m-1 4h1" /></svg>
              </div>
              <div>
                <div className="flex items-center">
                  <p className="text-2xl font-bold text-slate-900">{analysisData.projectSummary.length}</p>
                  {prevMonthStats && <ChangeBadge current={analysisData.projectSummary.length} previous={prevMonthStats.projectCount} />}
                </div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Projects with Issues</p>
                {prevMonthStats && <p className="text-[10px] text-slate-400 mt-0.5">prev: {prevMonthStats.projectCount}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Data quality & lifecycle KPIs ───────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span>Data as of <b className="text-slate-700">{formatDateDDMMMYYYY(analysisData.asOf)}</b></span>
            <span title="Share of resolved incidents whose resolution date came from a 'Resolved At' value instead of being inferred from the last day the issue was logged">
              Resolution dates recorded: <b className={analysisData.dataQuality.recordedResolutionShare >= 0.8 ? "text-green-700" : "text-amber-700"}>{Math.round(analysisData.dataQuality.recordedResolutionShare * 100)}%</b>
              {analysisData.closedCount > 0 && analysisData.dataQuality.recordedResolutionShare < 1 && " (rest inferred from daily log)"}
            </span>
            {analysisData.dataQuality.duplicatesRemoved > 0 && (
              <span className="text-amber-700">{analysisData.dataQuality.duplicatesRemoved} duplicate row(s) ignored</span>
            )}
            {analysisData.dataQuality.incidentsWithoutCategory > 0 && (
              <span>{analysisData.dataQuality.incidentsWithoutCategory} incident(s) without a category</span>
            )}
            {prevMonthStats?.sameDayLimit && (
              <span>Compared with the same first {prevMonthStats.sameDayLimit} day(s) of the previous month</span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: "New", value: analysisData.newCount, hint: "Started in this period" },
              { label: "Carried in", value: analysisData.carriedInCount, hint: "Started before, still active" },
              { label: "Resolved", value: analysisData.closedCount, hint: "Closed in this period", prev: prevMonthStats?.closedCount },
              { label: "Open backlog", value: analysisData.backlogCount, hint: "Unresolved at period end" },
              { label: "Repeat", value: analysisData.repeatCount, hint: "Same issue & project again within 30 days" },
              {
                label: "First response",
                value: analysisData.firstResponse.n ? `${fmtDays(analysisData.firstResponse.median)}h` : "N/A",
                hint: analysisData.firstResponse.n ? `median, n=${analysisData.firstResponse.n}, P90 ${fmtDays(analysisData.firstResponse.p90)}h` : "Needs Reported Time + Acknowledged At",
              },
            ].map((k) => (
              <div key={k.label} className="bg-white/60 p-3 rounded-xl border border-white shadow-sm" title={k.hint}>
                <p className="text-xl font-bold text-slate-900">{k.value}</p>
                <p className="text-[10px] uppercase font-bold text-slate-400">{k.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{k.hint}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Breakdown & Top Problems ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <AnalysisCard title="Zone Breakdown (incidents)" className="lg:col-span-2">
            <div className="space-y-4">
              {analysisData.zoneSummary.map(({ zone, count, projects, devices, per100 }) => (
                <div key={zone}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-700">{zone}</span>
                    <span className="text-slate-500 font-bold">
                      {count}
                      {per100 !== null && <span className="ml-2 text-[10px] font-semibold text-slate-400" title={`${devices} devices in this zone`}>{per100.toFixed(1)} / 100 devices</span>}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 mb-1.5">
                    <div className="bg-gradient-to-r from-orange-400 to-red-500 h-2.5 rounded-full" style={{ width: `${(count / analysisData.totalAssignedIssues) * 100}%` }}></div>
                  </div>
                  {projects.length > 0 && (
                    <p className="text-xs text-slate-500 pl-1" title={projects.join(", ")}>
                      <span className="font-medium text-slate-600">Projects:</span>{" "}
                      {_.truncate(projects.join(", "), { length: 100 })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </AnalysisCard>

          <AnalysisCard title="Top 5 Common Problems (by number of incidents)" className="lg:col-span-2">
            <ol className="space-y-3 list-none">
              {analysisData.top5CommonProblems.map((p, index) => (
                <li key={p.issue} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center ring-2 ring-white">{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate" title={p.issue}>{p.issue}</p>
                    <div className="flex items-baseline text-xs text-slate-500 mt-1">
                      <p className="truncate pr-2">
                        Project: <span className="font-semibold text-slate-600" title={p.latestProject}>{p.latestProject}</span>
                        <span className="font-bold ml-1.5">(<span className={getCountColorClass(p.projectSpecificCount)}>{p.projectSpecificCount}</span><span className="text-slate-400"> / {p.count} incidents, {p.issueDays} issue-days</span>)</span>
                      </p>
                      <p className="ml-auto pl-2 whitespace-nowrap">Date: <span className="font-semibold text-slate-600">{formatDateDDMMMYYYY(p.latestDate)}</span></p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </AnalysisCard>

          <AnalysisCard title="Project Breakdown" className="lg:col-span-4">
            {(() => {
              if (!analysisData.projectSummary || analysisData.projectSummary.length === 0) {
                return <p className="text-slate-500 text-center">No project data available.</p>;
              }
              const numRows = 10;
              const numCols = Math.ceil(analysisData.projectSummary.length / numRows);
              const projectChunks = _.chunk(analysisData.projectSummary, numRows);
              const gridItems = [];
              for (let i = 0; i < numRows; i++) {
                for (let j = 0; j < numCols; j++) {
                  if (projectChunks[j] && projectChunks[j][i]) {
                    const [project, count] = projectChunks[j][i];
                    gridItems.push(
                      <div key={`${project as string}-name`} className="py-1 border-b border-slate-200/80 text-slate-700 truncate pr-2" title={project as string}>{project}</div>,
                      <div key={`${project as string}-count`} className={`py-1 border-b border-slate-200/80 font-bold text-right ${getCountColorClass(count as number)}`}>{count}</div>,
                    );
                  } else {
                    gridItems.push(<div key={`empty-${j}-${i}-name`} />, <div key={`empty-${j}-${i}-count`} />);
                  }
                }
              }
              return (
                <div className="grid gap-x-6 text-sm" style={{ gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr) auto)` }}>
                  {gridItems}
                </div>
              );
            })()}
          </AnalysisCard>

          {/* ── Timeline Highlights ─────────────────────────────────────────── */}
          <AnalysisCard title="Timeline Highlights" className="lg:col-span-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="bg-slate-100 p-3 rounded-lg">
                <p className="text-xs text-slate-500 font-semibold">Time to Resolve (median)</p>
                {analysisData.resolution.n > 0 ? (
                  <>
                    <p className="font-bold text-slate-800 text-2xl mt-1">{fmtDays(analysisData.resolution.median)} Days</p>
                    <p className="text-xs text-slate-600">P90 {fmtDays(analysisData.resolution.p90)}d · mean {fmtDays(analysisData.resolution.mean)}d · n={analysisData.resolution.n}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Resolved incidents only; {analysisData.backlogCount} still open are not included</p>
                  </>
                ) : (
                  <p className="font-bold text-slate-400 text-lg mt-1">No resolved incidents</p>
                )}
              </div>
              <div className="bg-slate-100 p-3 rounded-lg">
                <p className="text-xs text-slate-500 font-semibold">Oldest Open Incident</p>
                <p className="font-bold text-slate-800 text-lg mt-1 truncate" title={analysisData.longestOpenIssue?.issue || "N/A"}>{analysisData.longestOpenIssue?.issue || "N/A"}</p>
                <p className="text-sm text-slate-600">({analysisData.longestOpenIssue?.resolutionTimeInDays || 0} days at {analysisData.longestOpenIssue?.projectName || "N/A"})</p>
              </div>
              <div className="bg-slate-100 p-3 rounded-lg">
                <p className="text-xs text-slate-500 font-semibold">Most Frequent Issue</p>
                <p className="font-bold text-slate-800 text-lg mt-1 truncate" title={analysisData.mostFrequentIssue?.issue || "N/A"}>{analysisData.mostFrequentIssue?.issue || "N/A"}</p>
                <p className="text-sm text-slate-600">({analysisData.mostFrequentIssue?.count || 0} incidents)</p>
              </div>
            </div>
          </AnalysisCard>

          {/* ── Open backlog (oldest first) ─────────────────────────────────── */}
          <AnalysisCard title={`Open Backlog at Period End (${analysisData.backlogCount})`} className="lg:col-span-4">
            {analysisData.backlog.length === 0 ? (
              <p className="text-slate-500 text-center py-2">No unresolved incidents.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      {["Project", "Zone", "Issue", "Priority", "Assigned To", "Open Since", "Age (days)"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {analysisData.backlog.slice(0, 15).map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-medium text-slate-800">{b.projectName}</td>
                        <td className="px-3 py-2 text-slate-600">{b.zone}</td>
                        <td className="px-3 py-2 text-slate-600">{b.issue}</td>
                        <td className="px-3 py-2 text-slate-600">{b.priority || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{b.assignedTo}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDateDDMMMYYYY(b.start)}</td>
                        <td className={`px-3 py-2 font-bold ${b.ageDays >= 15 ? "text-red-600" : b.ageDays >= 8 ? "text-orange-600" : "text-slate-700"}`}>{b.ageDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analysisData.backlog.length > 15 && (
                  <p className="text-[10px] text-slate-400 pt-2">Showing the 15 oldest of {analysisData.backlog.length}.</p>
                )}
              </div>
            )}
          </AnalysisCard>

          {/* ── Workload by engineer / category ─────────────────────────────── */}
          <AnalysisCard title="Workload by Assignee" className="lg:col-span-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase">
                  <th className="text-left py-1">Assignee</th>
                  <th className="text-right py-1">Incidents</th>
                  <th className="text-right py-1">Resolved</th>
                  <th className="text-right py-1" title="Median days to resolve">Median days</th>
                </tr>
              </thead>
              <tbody>
                {analysisData.byAssignee.map((a) => (
                  <tr key={a.assignedTo} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{a.assignedTo}</td>
                    <td className="py-1 text-right font-bold text-slate-700">{a.incidents}</td>
                    <td className="py-1 text-right text-slate-600">{a.closed}</td>
                    <td className="py-1 text-right text-slate-600">{a.medianDays === null ? "—" : fmtDays(a.medianDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AnalysisCard>

          <AnalysisCard title="Incidents by Category" className="lg:col-span-2">
            {analysisData.byCategory.length === 0 ? (
              <p className="text-slate-500 text-center py-2">No category data. Add a "Category" column to the CSV to see what is causing the incidents.</p>
            ) : (
              <div className="space-y-2">
                {analysisData.byCategory.map((c) => (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">{c.category}</span>
                      <span className="font-bold text-slate-600">{c.count}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-indigo-400 h-2 rounded-full" style={{ width: `${(c.count / analysisData.totalAssignedIssues) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AnalysisCard>

          {/* ── Resolution Time Distribution (NEW) ─────────────────────────── */}
          <AnalysisCard title="Resolution Time Distribution" className="lg:col-span-4">
            {resolutionBuckets.every((b) => b.count === 0) ? (
              <p className="text-slate-500 text-center py-4">No resolved issues in this period.</p>
            ) : (
              <div className="space-y-3">
                {resolutionBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-semibold text-slate-600 text-right flex-shrink-0">{b.label}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-5 rounded-full flex items-center justify-end pr-2 transition-all duration-500 ${
                          b.label === "1 day" ? "bg-green-400" :
                          b.label === "2–3 days" ? "bg-teal-400" :
                          b.label === "4–7 days" ? "bg-yellow-400" :
                          b.label === "8–14 days" ? "bg-orange-400" : "bg-red-400"
                        }`}
                        style={{ width: `${Math.max(b.pct, b.count > 0 ? 6 : 0)}%` }}
                      >
                        {b.count > 0 && <span className="text-[10px] font-bold text-white">{b.count}</span>}
                      </div>
                    </div>
                    <span className="w-8 text-xs text-slate-400 flex-shrink-0">{b.count > 0 ? `${b.count}` : ""}</span>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 pt-1">Based on {resolutionBuckets.reduce((s, b) => s + b.count, 0)} incidents resolved in this period</p>
              </div>
            )}
          </AnalysisCard>

          {/* ── Unique Issue Timeline with Gantt bar + Carry-Over flag ─────── */}
          <AnalysisCard title="Incident Timeline & Resolution" className="lg:col-span-4">
            {(() => {
              if (sortedTimelineData.length === 0) {
                return <div className="text-center py-8 text-slate-500">No issues to display.</div>;
              }

              const hasInfrequentIssues = sortedTimelineData.some((issue) => issue.count < 2);
              const displayedTimelineData = showAllIssues
                ? sortedTimelineData
                : sortedTimelineData.filter((issue) => issue.count >= 2);

              // Gantt range: min firstReported → max lastReported among displayed
              const allDates = displayedTimelineData.flatMap((t) => [t.firstReported, t.lastReported].filter(Boolean) as Date[]);
              const ganttStart = allDates.length > 0 ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : null;
              const ganttEnd = allDates.length > 0 ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : null;
              const ganttTotalDays = ganttStart && ganttEnd ? Math.max((ganttEnd.getTime() - ganttStart.getTime()) / (1000 * 3600 * 24) + 1, 1) : 1;

              if (displayedTimelineData.length === 0 && !showAllIssues) {
                return (
                  <div className="text-center py-8 text-slate-500">
                    <p>No incident lasted more than one logged day.</p>
                    {hasInfrequentIssues && (
                      <button onClick={() => setShowAllIssues(true)} className="mt-4 px-4 py-2 text-sm font-medium text-orange-600 bg-orange-100 rounded-md hover:bg-orange-200 transition-colors">
                        View All {sortedTimelineData.length} Incidents
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <>
                  {hasInfrequentIssues && (
                    <div className="flex justify-end mb-4">
                      <button onClick={() => setShowAllIssues((prev) => !prev)} className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-100 rounded-md hover:bg-orange-200 transition-colors">
                        {showAllIssues ? "Show Only Multi-day Incidents" : `View All (${sortedTimelineData.length}) Incidents`}
                      </button>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">SL</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Project</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Issue</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">Days Logged</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Raised On</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">Span (days)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Resolution</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Res. Date</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase min-w-[140px]">Timeline</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {displayedTimelineData.map((issue, index) => {
                          const isOngoing = issue.solutionDate === "Ongoing";
                          const isCarryOver = issue.isCarryOver;

                          // Gantt bar calculation
                          let barLeft = 0, barWidth = 0;
                          if (ganttStart && issue.firstReported) {
                            const startOffset = (issue.firstReported.getTime() - ganttStart.getTime()) / (1000 * 3600 * 24);
                            const endDate = isOngoing || !issue.lastReported ? ganttEnd! : issue.lastReported;
                            const endOffset = (endDate.getTime() - ganttStart.getTime()) / (1000 * 3600 * 24);
                            barLeft = (startOffset / ganttTotalDays) * 100;
                            barWidth = Math.max(((endOffset - startOffset + 1) / ganttTotalDays) * 100, 2);
                          }

                          return (
                            <tr
                              key={`${issue.issue}-${issue.projectName}-${index}`}
                              className={isCarryOver ? "bg-red-50" : isOngoing ? "bg-yellow-50" : ""}
                            >
                              <td className="px-3 py-2 text-center text-sm text-slate-600">{index + 1}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-slate-800">
                                {issue.projectName}
                                {isCarryOver && (
                                  <span className="ml-1.5 inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide">Carry-over</span>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-normal text-sm text-slate-600">{issue.issue}</td>
                              <td className="px-3 py-2 text-center text-sm font-bold text-slate-700">{issue.count}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{formatDateDDMMMYYYY(issue.firstReported)}</td>
                              <td className="px-3 py-2 text-center text-sm text-slate-600">{issue.totalActiveDays}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">
                                {issue.resolutionTimeInDays !== null ? `${issue.resolutionTimeInDays} day(s)` : "N/A"}
                                {issue.resolutionSource && (
                                  <span className="ml-1 text-[9px] uppercase text-slate-400" title={issue.resolutionSource === "recorded" ? "From the 'Resolved At' column" : "Inferred: last day the issue appeared in the daily log"}>{issue.resolutionSource === "recorded" ? "rec." : "est."}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">
                                {isOngoing ? "N/A" : formatDateDDMMMYYYY(issue.solutionDate)}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isCarryOver ? "bg-red-100 text-red-800" : isOngoing ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                                  {isCarryOver ? "Carry-over" : isOngoing ? "Ongoing" : "Resolved"}
                                </span>
                              </td>
                              {/* Gantt bar */}
                              <td className="px-3 py-2 min-w-[140px]">
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`absolute top-0 h-4 rounded-full ${isCarryOver ? "bg-red-400" : isOngoing ? "bg-yellow-400" : "bg-green-400"}`}
                                    style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                                    title={`${formatDateDDMMMYYYY(issue.firstReported)} → ${isOngoing ? "ongoing" : formatDateDDMMMYYYY(issue.lastReported)}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-green-400"></span>Resolved</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400"></span>Ongoing</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-red-400"></span>Carry-over to next month</span>
                  </div>
                </>
              );
            })()}
          </AnalysisCard>
        </div>
      </div>
    </div>
  );
};

export default ITAnalysisTab;
