import React from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { User, ReportData, EmployeeVisit, AllEmployee } from "../types";
import _ from "lodash";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Download } from "lucide-react";

interface VisitSummaryPDFGeneratorProps {
  reportData: ReportData | null;
  reportTitle: string;
  currentUser: User;
  selectedMonth: string;
  selectedEmployee: string;
  selectedDepartment: string;
  allVisits: EmployeeVisit[];
  attendanceData: any[];
  allEmployees: AllEmployee[];
}

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

  const totalMinutes = Math.round(absSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/**
 * Generates the report data for a single employee for a given month.
 * This logic is extracted from the main component to be reusable.
 */
export const generateReportForEmployee = (
  employeeName: string,
  selectedMonth: string,
  allVisits: EmployeeVisit[],
  attendanceData: any[],
): ReportData | null => {
  const [year, month] = selectedMonth.split("-").map(Number);

  const visitsInMonth = allVisits.filter((visit) => {
    if (!visit.date) return false;
    const dateStr = String(visit.date);

    const employeeMatch =
      (visit.visitorName || "").trim() === employeeName.trim();
    if (!employeeMatch) return false;

    // Match YYYY-MM-DD
    const match = dateStr.match(/^(\d{4})-(\d{2})/);
    if (match) {
      return parseInt(match[1]) === year && parseInt(match[2]) === month;
    }

    // Fallback for other formats
    try {
      const d = new Date(dateStr);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    } catch (e) {
      return false;
    }
  });

  if (visitsInMonth.length === 0) return null;

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

  const totalVisitDays = perDayVisits.length;
  const totalProjectsVisited = _.uniqBy(visitsInMonth, "projectName").length;
  const grandTotalDuration = _.sumBy(perDayVisits, "totalDuration");

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

  const dailyProjectsLog = _.chain(visitsInMonth)
    .cloneDeep()
    .orderBy("date", "asc")
    .map((v) => ({ date: v.date, projectName: v.projectName }))
    .value();

  const visitDates = new Set(visitsInMonth.map((v) => v.date));
  const noVisitDays: { date: string; day: string; remark: string }[] = [];
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
    (rec) => rec["Emp. Name"] === employeeName,
  );

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month - 1, day);
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek >= 0 && dayOfWeek <= 4) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (!visitDates.has(dateStr)) {
        const remark = employeeAttendanceRecord
          ? employeeAttendanceRecord[String(day)] || ""
          : "";
        noVisitDays.push({ date: dateStr, day: dayNames[dayOfWeek], remark });
      }
    }
  }

  return {
    perDay: perDayVisits,
    summary: { totalVisitDays, totalProjectsVisited, grandTotalDuration },
    perProject: perProjectVisits,
    durationCounts: durationCountsArray,
    improperVisitCount: improperVisits.length,
    improperVisits,
    dailyProjects: dailyProjectsLog,
    noVisitDays,
  };
};

export const addHeader = (docInstance: any) => {
  const pageWidth = docInstance.internal.pageSize.getWidth();
  const margin = 10;
  const headerStartY = 10;

  // Credence Housing Limited in orange
  docInstance.setFont("helvetica", "bold");
  docInstance.setFontSize(16);
  docInstance.setTextColor(234, 88, 12); // Orange (#EA580C)
  docInstance.text(
    "Credence Housing Limited",
    pageWidth / 2,
    headerStartY + 5,
    { align: "center" },
  );

  // Office Address
  docInstance.setFont("helvetica", "normal");
  docInstance.setFontSize(9);
  docInstance.setTextColor(80, 80, 80);
  docInstance.text(
    "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
    pageWidth / 2,
    headerStartY + 11,
    { align: "center" },
  );

  // Horizontal Line
  docInstance.setDrawColor(200, 200, 200);
  docInstance.setLineWidth(0.4);
  docInstance.line(
    margin,
    headerStartY + 14,
    pageWidth - margin,
    headerStartY + 14,
  );
};

export const addFooter = (
  docInstance: any,
  user: User,
  pageNum: number,
  pageCount: number,
) => {
  const pageWidth = docInstance.internal.pageSize.getWidth();
  const pageHeight = docInstance.internal.pageSize.getHeight();
  const margin = 10;

  docInstance.setDrawColor(200, 200, 200);
  docInstance.setLineWidth(0.2);
  docInstance.line(
    margin,
    pageHeight - 22,
    pageWidth - margin,
    pageHeight - 22,
  );

  docInstance.setFontSize(8.5);
  docInstance.setTextColor(60, 60, 60);

  // Prepared by (Left)
  const preparedByStr = `Prepared by: ${user.name}`;
  docInstance.text(preparedByStr, margin, pageHeight - 14);

  // System Generated (Middle)
  docInstance.setFontSize(7);
  docInstance.setTextColor(100, 100, 100);
  docInstance.text(
    "Note: This is a system generated report. No signature is required.",
    pageWidth / 2,
    pageHeight - 7,
    { align: "center" },
  );

  // Page Number (Right)
  docInstance.setFontSize(8.5);
  docInstance.setTextColor(60, 60, 60);
  const pageStr = `Page ${pageNum} of ${pageCount}`;
  docInstance.text(pageStr, pageWidth - margin, pageHeight - 14, {
    align: "right",
  });
};

export const drawSingleReportOnPage = (
  doc: any,
  data: ReportData,
  title: string,
  user: User,
  employeeData?: EmployeeVisit,
  attendanceData?: any[],
  allEmployees?: AllEmployee[],
  selectedMonth?: string,
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const footerHeight = 25;

  const tableOptions = {
    theme: "grid" as any,
    headStyles: {
      fillColor: [41, 51, 61] as [number, number, number],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold" as const,
      cellPadding: 1.5,
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 1, fontStyle: "normal" as const },
    styles: { overflow: "linebreak" as const },
  };

  addHeader(doc);

  let lastY = 10 + 20;
  doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(40, 40, 40);
  doc.text(title, pageWidth / 2, lastY, { align: "center" });
  lastY += 8;

  if (employeeData || data) {
    const visitorName = (employeeData ? employeeData.visitorName : "").trim();
    const attendanceRecord = attendanceData?.find(
      (rec) => (rec["Emp. Name"] || "").trim() === visitorName,
    );
    const systemEmployee = allEmployees?.find(
      (emp) => emp.name === visitorName,
    );

    const employeeName = visitorName;
    const employeeId = systemEmployee
      ? systemEmployee.employee_id
      : attendanceRecord
        ? attendanceRecord["Emp. Code"]
        : "N/A";
    const designation = systemEmployee
      ? systemEmployee.designation
      : attendanceRecord
        ? attendanceRecord["Designation"]
        : employeeData
          ? employeeData.designation
          : "N/A";
    const department = systemEmployee
      ? systemEmployee.department
      : attendanceRecord
        ? attendanceRecord["Department"]
        : employeeData
          ? employeeData.department
          : "N/A";

    const [year, month] = (selectedMonth || "").split("-");
    const monthName =
      year && month
        ? new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString(
            "en-US",
            { month: "long", year: "numeric" },
          )
        : "N/A";
    const preparingDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const employeeDetailsBody = [
      [
        {
          content: `Name: ${employeeName}`,
          styles: { fontStyle: "bold" as const },
        },
        {
          content: `ID: ${employeeId}`,
          styles: { fontStyle: "bold" as const },
        },
        {
          content: `Month: ${monthName}`,
          styles: { fontStyle: "bold" as const },
        },
      ],
      [
        { content: `Designation: ${designation}` },
        { content: `Department: ${department}` },
        { content: `Date Generated: ${preparingDate}` },
      ],
    ];

    // @ts-ignore
    autoTable(doc as any, {
      body: employeeDetailsBody,
      startY: lastY,
      theme: "grid" as any,
      styles: {
        fontSize: 8.5,
        cellPadding: 1.5,
        lineColor: [180, 180, 180],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 50 },
        2: { cellWidth: 70 },
      },
    });
    lastY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Overall Summary Banner
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, lastY - 4, pageWidth - margin * 2, 10, "F");
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(30, 30, 30);
  const summaryText = `Total Visiting Days: ${data.summary.totalVisitDays}  |  Total Projects Visited: ${data.summary.totalProjectsVisited}  |  Grand Total Duration: ${formatSecondsToHHMM(data.summary.grandTotalDuration)}`;
  doc.text(summaryText, pageWidth / 2, lastY + 2.5, { align: "center" });
  lastY += 12;

  const columnGap = 2;
  const columnCount = 4;
  const totalGapWidth = columnGap * (columnCount - 1);
  const columnWidth = (pageWidth - margin * 2 - totalGapWidth) / columnCount;

  const col1X = margin;
  const col2X = col1X + columnWidth + columnGap;
  const col3X = col2X + columnWidth + columnGap;
  const col4X = col3X + columnWidth + columnGap;

  let colY = lastY;

  // COL 1
  doc
    .setFontSize(11)
    .setFont("helvetica", "bold")
    .text("Per Day Visit Count", col1X, colY);
  // @ts-ignore
  autoTable(doc as any, {
    theme: "grid" as any,
    headStyles: {
      fillColor: [41, 51, 61],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 1 },
    head: [["Date", "Visits", "Duration"]],
    body: data.perDay.map((d) => [
      d.date,
      d.visitCount,
      formatSecondsToHHMM(d.totalDuration),
    ]),
    startY: colY + 5,
    margin: { left: col1X, right: pageWidth - col1X - columnWidth },
    tableWidth: columnWidth,
  });

  if (data.noVisitDays.length > 0) {
    let afterVisitTableY = (doc as any).lastAutoTable.finalY + 5;
    doc
      .setFontSize(11)
      .setFont("helvetica", "bold")
      .text("No Visit Days (Weekdays)", col1X, afterVisitTableY);
    // @ts-ignore
    autoTable(doc as any, {
      theme: "grid" as any,
      headStyles: {
        fillColor: [41, 51, 61],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1 },
      head: [["Date", "Day", "Remarks"]],
      body: data.noVisitDays.map((d) => [d.date, d.day, d.remark || ""]),
      startY: afterVisitTableY + 5,
      margin: { left: col1X, right: pageWidth - col1X - columnWidth },
      tableWidth: columnWidth,
    });
  }

  // COL 2
  doc
    .setFontSize(11)
    .setFont("helvetica", "bold")
    .text("Per Project Summary", col2X, colY);
  // @ts-ignore
  autoTable(doc as any, {
    theme: "grid" as any,
    headStyles: {
      fillColor: [41, 51, 61],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 1 },
    head: [["Project", "Visits", "Duration"]],
    body: data.perProject.map((p) => [
      p.projectName,
      p.visitCount,
      formatSecondsToHHMM(p.totalDuration),
    ]),
    startY: colY + 5,
    margin: { left: col2X, right: pageWidth - col2X - columnWidth },
    tableWidth: columnWidth,
  });

  // COL 3
  doc
    .setFontSize(11)
    .setFont("helvetica", "bold")
    .text("Duration Feedback", col3X, colY);
  // @ts-ignore
  autoTable(doc as any, {
    theme: "grid" as any,
    headStyles: {
      fillColor: [41, 51, 61],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 1 },
    head: [["Category", "Count"]],
    body: [
      ...data.durationCounts.map((d) => [d.category, d.count]),
      ["Improper Visits", data.improperVisitCount],
    ],
    startY: colY + 5,
    margin: { left: col3X, right: pageWidth - col3X - columnWidth },
    tableWidth: columnWidth,
    didParseCell: (hookData: any) => {
      if (hookData.row.raw[0] === "Improper Visits") {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = [200, 0, 0];
      }
    },
  });

  // COL 4
  if (data.dailyProjects.length > 0) {
    const columnXPositions = [col1X, col2X, col3X, col4X];
    const rowHeightEstimate = 6;
    let dataToProcess = [...data.dailyProjects];
    let currentColumnIndex = 3;
    let isFirstChunkOfLog = true;

    while (dataToProcess.length > 0) {
      if (currentColumnIndex > 3) {
        doc.addPage();
        addHeader(doc);
        currentColumnIndex = 0;
      }

      const colX = columnXPositions[currentColumnIndex];
      const startY =
        doc.internal.getCurrentPageInfo().pageNumber > 1
          ? margin + 25
          : currentColumnIndex === 3 && isFirstChunkOfLog
            ? colY
            : margin + 25;

      const availableHeight = pageHeight - startY - footerHeight;
      const rowsInThisColumn = Math.max(
        1,
        Math.floor(availableHeight / rowHeightEstimate),
      );
      const chunk = dataToProcess.splice(0, rowsInThisColumn);

      if (chunk.length > 0) {
        const logTitle =
          isFirstChunkOfLog && currentColumnIndex === 3
            ? "Daily Project Log"
            : "Daily Project Log (Cont.)";
        doc
          .setFontSize(11)
          .setFont("helvetica", "bold")
          .text(logTitle, colX, startY);
        // @ts-ignore
        autoTable(doc as any, {
          theme: "grid" as any,
          headStyles: {
            fillColor: [41, 51, 61],
            textColor: 255,
            fontSize: 8,
            fontStyle: "bold",
          },
          bodyStyles: { fontSize: 7.5, cellPadding: 1 },
          head: [["Date", "Project Name"]],
          body: chunk.map((d) => [d.date, d.projectName]),
          startY: startY + 5,
          margin: { left: colX, right: pageWidth - colX - columnWidth },
          tableWidth: columnWidth,
        });
      }
      isFirstChunkOfLog = false;
      currentColumnIndex++;
    }
  }
};

const VisitSummaryPDFGenerator: React.FC<VisitSummaryPDFGeneratorProps> = ({
  reportData,
  reportTitle,
  currentUser,
  selectedMonth,
  selectedEmployee,
  selectedDepartment,
  allVisits,
  attendanceData,
  allEmployees,
}) => {
  const handleDownloadSummaryPDF = () => {
    if (!selectedEmployee && allVisits.length === 0) return;
    if (selectedEmployee && !reportData) return;

    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    const drawReport = () => {
      if (!selectedEmployee) {
        const [year, month] = selectedMonth.split("-").map(Number);
        const visitsForMonth = allVisits.filter((v) => {
          const visitDate = new Date(v.date);
          const monthMatch =
            visitDate.getFullYear() === year &&
            visitDate.getMonth() + 1 === month;
          const departmentMatch =
            !selectedDepartment || v.department === selectedDepartment;
          return monthMatch && departmentMatch;
        });
        const uniqueEmployees = _.uniq(
          visitsForMonth.map((v) => v.visitorName),
        ).sort();

        uniqueEmployees.forEach((employeeName, index) => {
          const individualReportData = generateReportForEmployee(
            employeeName,
            selectedMonth,
            allVisits,
            attendanceData,
          );
          if (individualReportData) {
            if (index > 0) {
              doc.addPage();
            }
            const monthName = new Date(year, month - 1, 1).toLocaleString(
              "en-US",
              { month: "long" },
            );
            const individualReportTitle = `Monthly Visit Report - ${monthName} ${year}`;
            const employeeVisitData = allVisits.find(
              (v) => v.visitorName === employeeName,
            );
            drawSingleReportOnPage(
              doc,
              individualReportData,
              individualReportTitle,
              currentUser,
              employeeVisitData,
              attendanceData,
              allEmployees,
              selectedMonth,
            );
          }
        });
      } else if (reportData) {
        const employeeVisitData = allVisits.find(
          (v) => v.visitorName === selectedEmployee,
        );
        drawSingleReportOnPage(
          doc,
          reportData,
          reportTitle,
          currentUser,
          employeeVisitData,
          attendanceData,
          allEmployees,
          selectedMonth,
        );
      }
    };

    drawReport();

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      if (i > 1) addHeader(doc);
      addFooter(doc, currentUser, i, pageCount);
    }

    const fileName = selectedEmployee
      ? `visit-summary-${selectedEmployee}-${selectedMonth}.pdf`
      : `visit-summary-${selectedDepartment || "all-depts"}-${selectedMonth}.pdf`;

    doc.save(fileName);
  };

  const handleDownloadIndividualPDFsAsZip = async () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const visitsForMonth = allVisits.filter((v) => {
      const visitDate = new Date(v.date);
      const monthMatch =
        visitDate.getFullYear() === year && visitDate.getMonth() + 1 === month;
      const departmentMatch =
        !selectedDepartment || v.department === selectedDepartment;
      return monthMatch && departmentMatch;
    });

    const zip = new JSZip();
    const visitsByEmployee = _.groupBy(visitsForMonth, "visitorName");
    const uniqueEmployees = Object.keys(visitsByEmployee).sort();

    for (const employeeName of uniqueEmployees) {
      const employeeVisits = visitsByEmployee[employeeName];
      const department =
        (employeeVisits[0]?.department || "Other Departments").trim() ||
        "Other Departments";

      const individualReportData = generateReportForEmployee(
        employeeName,
        selectedMonth,
        allVisits,
        attendanceData,
      );
      if (individualReportData) {
        const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", {
          month: "long",
        });
        const individualReportTitle = `Monthly Visit Report - ${monthName} ${year}`;
        const employeeVisitData = employeeVisits[0];
        drawSingleReportOnPage(
          doc,
          individualReportData,
          individualReportTitle,
          currentUser,
          employeeVisitData,
          attendanceData,
          allEmployees,
          selectedMonth,
        );

        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          if (i > 1) addHeader(doc);
          addFooter(doc, currentUser, i, pageCount);
        }

        const pdfBlob = doc.output("blob");
        zip.file(
          `${department.replace(/[/\\?%*:|"<>]/g, "-")}/report-${employeeName.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`,
          pdfBlob,
        );
      }
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(
      zipBlob,
      `reports-${selectedDepartment || "all-depts"}-${selectedMonth}.zip`,
    );
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleDownloadSummaryPDF}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        title="Download current summary as PDF. If 'All Employees' is selected, this generates one multi-page PDF."
      >
        <Download className="w-3.5 h-3.5" />
        Download PDF
      </button>
      <button
        onClick={handleDownloadIndividualPDFsAsZip}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        title="Download all employee reports as a ZIP file containing individual PDFs organized by department."
      >
        <div className="relative">
          <Download className="w-3.5 h-3.5" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full border border-white"></div>
        </div>
        Download ZIP
      </button>
    </div>
  );
};

export default VisitSummaryPDFGenerator;
