import React from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { User, AllEmployee, EmployeeVisit, ReportData } from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import {
  SummaryDataRow,
  PROJECT_SIDE_INVENTORY_DESIGNATIONS,
} from "./AllDepartmentSummary";
import { EmailReportModal } from "./EmailReportModal";
import {
  generateReportForEmployee,
  drawSingleReportOnPage,
  addHeader as addIndividualHeader,
  addFooter as addIndividualFooter,
} from "./VisitSummaryPDFGenerator";

interface PdfExportProps {
  groupedData: Map<string, SummaryDataRow[]>;
  currentUser: User;
  selectedMonth: string;
  currentMonthName: string;
  lastMonthName: string;
  defaultCurrentWorkingDays: string;
  defaultLastWorkingDays: string;
  securityCurrentWorkingDays: string;
  securityLastWorkingDays: string;
  formatStabilityValue?: (value: number) => string;
  reportNotes: string[];
  // New props for individual member reports
  allEmployees?: AllEmployee[];
  attendanceData?: any[];
  allVisits?: EmployeeVisit[];
}

export const PdfExport: React.FC<PdfExportProps> = ({
  groupedData,
  currentUser,
  selectedMonth,
  currentMonthName,
  lastMonthName,
  defaultCurrentWorkingDays,
  defaultLastWorkingDays,
  securityCurrentWorkingDays,
  securityLastWorkingDays,
  reportNotes,
  allEmployees,
  attendanceData,
  allVisits,
}) => {
  // Stability value formatting function for PDF
  const formatStabilityValueForPDF = (
    value: number,
  ): { text: string; color: number[]; type: "up" | "down" | "none" } => {
    const absValueRaw = Math.abs(value);
    const displayValue = Math.min(absValueRaw, 1000);
    const suffix = absValueRaw > 1000 ? "+" : "";
    const text = `   ${displayValue.toFixed(2)}%${suffix}`;

    if (value > 0) {
      return { text, color: [0, 128, 0], type: "up" };
    } else if (value < 0) {
      return { text, color: [255, 0, 0], type: "down" };
    } else {
      return {
        text: `  ${displayValue.toFixed(2)}%`,
        color: [100, 100, 100],
        type: "none",
      };
    }
  };

  const generatePdfBlob = (
    dataMap: Map<string, SummaryDataRow[]>,
    isIndividual = false,
  ): Blob => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "legal",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    const [year, monthNum] = selectedMonth.split("-");
    const monthDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const monthNameFull = monthDate.toLocaleString("en-US", { month: "long" });

    const formatDateForPDF = (date: Date) => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = date.toLocaleString("en-US", { month: "short" });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    };

    // Global Header Drawing Function
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
      const title = isIndividual
        ? `Department Visit Summary Report - ${Array.from(dataMap.keys())[0]} (${monthNameFull} ${year})`
        : `Monthly Project Visit Summary Report - (${monthNameFull} ${year})`;
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

    const contentStartY = 25;

    // == TABLE CONSTRUCTION ==
    const head = [
      [
        { content: "SL No.", rowSpan: 2 },
        { content: "Visitor Name", rowSpan: 2 },
        { content: "Designation", rowSpan: 2 },
        { content: "Work Day", rowSpan: 2 },
        { content: "Visit Day", rowSpan: 2 },
        { content: "Total Projects", rowSpan: 2 },
        { content: "Visit Count", rowSpan: 2 },
        {
          content: "Duration Count",
          colSpan: 4,
          styles: { halign: "center" as any },
        },
        { content: "Target/Day", rowSpan: 2 },
        { content: "Target/Month", rowSpan: 2 },
        { content: `${currentMonthName} Actual`, rowSpan: 2 },
        { content: `${currentMonthName} %`, rowSpan: 2 },
        { content: `${lastMonthName} Actual`, rowSpan: 2 },
        { content: `${lastMonthName} %`, rowSpan: 2 },
        { content: "Stability", rowSpan: 2 },
        { content: `${lastMonthName} Avg`, rowSpan: 2 },
        { content: `${currentMonthName} Avg`, rowSpan: 2 },
        { content: "Avg Stab. %", rowSpan: 2 },
      ],
      [">20m", "10-19m", "5-9m", "<5m"],
    ];

    const body: any[] = [];
    let globalSlNo = 1;

    dataMap.forEach((employees, department) => {
      if (!employees || employees.length === 0) return;

      // Department Header Row
      body.push([
        {
          content: department,
          colSpan: 21,
          styles: {
            fontStyle: "bold",
            fillColor: [232, 234, 237],
            textColor: [51, 65, 85],
            halign: "left",
          },
        },
      ]);

      const projectSide = employees.filter((e) =>
        PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(e.designation),
      );
      const headOffice = employees.filter(
        (e) => !PROJECT_SIDE_INVENTORY_DESIGNATIONS.has(e.designation),
      );

      const addEmployeeRows = (list: SummaryDataRow[], subLabel?: string) => {
        if (list.length === 0) return;
        if (subLabel) {
          body.push([
            {
              content: subLabel,
              colSpan: 21,
              styles: {
                fontStyle: "italic",
                fillColor: [248, 250, 252],
                halign: "center",
              },
            },
          ]);
        }
        list.forEach((row) => {
          const isExempt = row.supposedlyVisitDurationDay === "00:00";
          const stab = formatStabilityValueForPDF(row.currentStability);
          const avgStab = formatStabilityValueForPDF(row.averageStability);
          body.push([
            globalSlNo++,
            row.visitorName,
            row.designation,
            row.totalWorkingDay,
            row.totalVisitedDay,
            row.totalVisitedProjectCount,
            row.totalVisitLogs,
            row.durationCount.moreThan20,
            row.durationCount.tenTo19,
            row.durationCount.fiveTo9,
            row.durationCount.lessThan5,
            row.supposedlyVisitDurationDay,
            row.supposedlyVisitDurationMonth,
            row.currentMonthActualDuration,
            isExempt
              ? row.currentMonthActualDuration
              : `${row.currentMonthDurationPercentage.toFixed(2)}%`,
            row.lastMonthActualDuration,
            isExempt
              ? row.lastMonthActualDuration
              : `${row.lastMonthDurationPercentage.toFixed(2)}%`,
            { content: stab.text, styles: { stabilityType: stab.type } },
            row.lastMonthPerDayAverage,
            row.currentMonthDayAverage,
            { content: avgStab.text, styles: { stabilityType: avgStab.type } },
          ]);
        });
      };

      if (department.includes("Inventory")) {
        addEmployeeRows(headOffice, "Head Office");
        addEmployeeRows(projectSide, "Project Side");
      } else {
        addEmployeeRows(employees);
      }
    });

    autoTable(doc as any, {
      head,
      body,
      startY: contentStartY,
      theme: "grid",
      margin: { left: margin, right: margin, bottom: 25, top: 25 },
      showHead: "everyPage",
      styles: {
        fontSize: 6.5,
        cellPadding: 0.8,
        lineWidth: 0.1,
        lineColor: [220, 220, 220],
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: 255,
        halign: "center",
        valign: "middle",
        fontSize: 6.5,
      },
      bodyStyles: { halign: "center" },
      columnStyles: {
        0: { cellWidth: 7 },
        1: { halign: "left", cellWidth: 35 },
        2: { halign: "left", cellWidth: 25 },
      },
      didDrawPage: (data: any) => {
        drawHeader(doc);
      },
      didParseCell: (data: any) => {
        if (Array.isArray(data.row.raw) && data.row.raw[0]?.colSpan) {
          Object.assign(data.cell.styles, data.row.raw[0].styles);
          return;
        }
        // Highlight <5m (Index 10) - Use a more distinctive Pink Rose
        if (data.column.index === 10 && data.section === "body") {
          data.cell.styles.fillColor = [255, 180, 190]; // More pinkish
          data.cell.styles.textColor = [150, 0, 50];
          data.cell.styles.fontStyle = "bold";
        }
        // Highlight specific columns (Current Actual, Stability, Avg, Avg Stability)
        const highlighted = [13, 17, 19, 20];
        if (
          highlighted.includes(data.column.index) &&
          data.section === "body"
        ) {
          data.cell.styles.fillColor = [255, 247, 237]; // Orange-50
        }
        const stabType = data.cell.styles.stabilityType;
        if (stabType === "up") data.cell.styles.textColor = [0, 128, 0];
        else if (stabType === "down") data.cell.styles.textColor = [255, 0, 0];
      },
      didDrawCell: (data: any) => {
        const stabType = data.cell.styles.stabilityType;
        if (
          stabType &&
          (data.column.index === 17 || data.column.index === 20)
        ) {
          const x = data.cell.x + 1.2,
            y = data.cell.y + data.cell.height / 2,
            size = 1.2;
          if (stabType === "up") {
            doc.setFillColor(0, 128, 0);
            doc.triangle(
              x,
              y + size / 2,
              x + size,
              y + size / 2,
              x + size / 2,
              y - size / 2,
              "F",
            );
          } else if (stabType === "down") {
            doc.setFillColor(255, 0, 0);
            doc.triangle(
              x,
              y - size / 2,
              x + size,
              y - size / 2,
              x + size / 2,
              y + size / 2,
              "F",
            );
          }
        }
      },
    });

    // == NOTES SECTION ==
    const notes =
      reportNotes.length > 0
        ? reportNotes
        : [
            `1. The Per Day Average Working Hours for each individual has been calculated based on the number of actual working days.`,
            `2. Negative (Red color) values indicate lower average working hours in current month compared to last month.`,
            `3. Positive (Green color) values indicate higher working hours in current month than in last month.`,
          ];

    let finalY = (doc as any).lastAutoTable?.finalY || contentStartY;
    if (finalY + 25 > pageHeight) {
      doc.addPage();
      finalY = 15;
    }

    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(60);
    doc.text("Important Notes:", margin, finalY + 8);
    doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(100);

    let currentNoteY = finalY + 12;
    notes.forEach((note) => {
      const splitNote = doc.splitTextToSize(note, pageWidth - margin * 2);
      doc.text(splitNote, margin, currentNoteY);
      currentNoteY += splitNote.length * 3;
    });

    // Finalizing Pages (Footers)
    const pageCount = (doc as any).internal.getNumberOfPages();
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
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 8,
        { align: "right" },
      );
    }

    return doc.output("blob");
  };

  const handleExportPDF = () => {
    const blob = generatePdfBlob(groupedData);
    saveAs(blob, `monthly_summary_${selectedMonth}.pdf`);
  };

  const handleExportZip = async () => {
    const zip = new JSZip();

    // Use for...of with entries() for clear iteration
    for (const [dept, employees] of Array.from(groupedData.entries())) {
      const deptFolderName = dept.replace(/[/\\?%*:|"<>]/g, "-");
      const deptFolder = zip.folder(deptFolderName);

      if (!deptFolder) continue;

      // 1. Generate and add Department Summary PDF
      const singleDeptMap = new Map([[dept, employees]]);
      const deptSummaryBlob = generatePdfBlob(singleDeptMap, true);
      deptFolder.file(
        `Summary_${deptFolderName}_${selectedMonth}.pdf`,
        deptSummaryBlob,
      );

      // 2. Generate and add Individual Member Reports if data is available
      if (allVisits && allVisits.length > 0 && attendanceData) {
        for (const employee of employees) {
          const employeeName = employee.visitorName;
          const reportData = generateReportForEmployee(
            employeeName,
            selectedMonth,
            allVisits,
            attendanceData,
          );

          if (reportData) {
            const doc = new jsPDF({
              orientation: "p",
              unit: "mm",
              format: "a4",
            });
            const [year, month] = selectedMonth.split("-");
            const monthName = new Date(
              parseInt(year),
              parseInt(month) - 1,
              1,
            ).toLocaleString("en-US", { month: "long" });
            const individualReportTitle = `Monthly Visit Report - ${monthName} ${year}`;

            // Find a visit record to get some basic info if needed
            const employeeVisitData = allVisits.find(
              (v) => v.visitorName === employeeName,
            );

            drawSingleReportOnPage(
              doc,
              reportData,
              individualReportTitle,
              currentUser,
              employeeVisitData,
              attendanceData,
              allEmployees || [],
              selectedMonth,
            );

            // Add footers to all pages
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
              doc.setPage(i);
              if (i > 1) addIndividualHeader(doc);
              addIndividualFooter(doc, currentUser, i, pageCount);
            }

            const memberPdfBlob = doc.output("blob");
            deptFolder.file(
              `Report_${employeeName.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`,
              memberPdfBlob,
            );
          }
        }
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `Department_Reports_${selectedMonth}.zip`);
  };

  const [isEmailModalOpen, setIsEmailModalOpen] = React.useState(false);

  const permissions = getEffectivePermissions(currentUser);

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExportPDF}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
        disabled={
          !(
            currentUser.role === "super_admin" ||
            currentUser.role === "admin" ||
            permissions.allDepartmentSummary_exportPdfFull?.view
          )
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
            clipRule="evenodd"
          />
        </svg>
        Export PDF (Full)
      </button>
      <button
        onClick={handleExportZip}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
        disabled={
          !(
            currentUser.role === "super_admin" ||
            currentUser.role === "admin" ||
            permissions.allDepartmentSummary_exportIndividualZip?.view
          )
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
        </svg>
        Individual (ZIP)
      </button>
      <button
        onClick={() => setIsEmailModalOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-orange-200 text-xs font-medium rounded-md shadow-sm text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors disabled:opacity-50"
        disabled={
          !(
            currentUser.role === "super_admin" ||
            currentUser.role === "admin" ||
            permissions.allDepartmentSummary_mailReport?.view
          )
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
        </svg>
        Mail Report
      </button>

      <EmailReportModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        groupedData={groupedData}
        currentUser={currentUser}
        selectedMonth={selectedMonth}
        generatePdfBlob={generatePdfBlob}
      />
    </div>
  );
};
