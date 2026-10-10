import React, { useState, useMemo } from "react";
import { EmployeeVisit, User } from "../types";
import _ from "lodash";
import ChangeIcon from "./ChangeIcon";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// --- Helper Functions ---
const parseDurationToSeconds = (durationStr: string): number => {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const parts = durationStr.trim().split(":").map(Number);
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

const formatSecondsToHHMM = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const getShiftType = (entryTime: string): "Day" | "Night" => {
  if (!entryTime || !/^\d{1,2}:\d{2}/.test(entryTime)) {
    return "Night"; // Default to night if time is invalid
  }
  // Day shift is from 8:00 AM (inclusive) to 8:00 PM (exclusive)
  const hour = parseInt(entryTime.split(":")[0], 10);
  return hour >= 8 && hour < 20 ? "Day" : "Night";
};

// --- Date Parsing Cache ---
const dateCache = new Map<string, Date | null>();

const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr || !timeStr) return null;
  const key = `${dateStr}_${timeStr}`;
  if (dateCache.has(key)) return dateCache.get(key) || null;

  // Normalize date format
  let normalizedDate = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
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
      if (isNaN(d.getTime())) {
        dateCache.set(key, null);
        return null;
      }
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

  if (!hourStr || !minuteStr) {
    dateCache.set(key, null);
    return null;
  }

  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (ampmMatch) {
    if (ampmMatch[0] === "PM" && hour < 12) hour += 12;
    if (ampmMatch[0] === "AM" && hour === 12) hour = 0;
  }

  const d = new Date(
    `${normalizedDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
  );
  const result = isNaN(d.getTime()) ? null : d;
  dateCache.set(key, result);
  return result;
};

const AnalysisCard: React.FC<{
  title: string;
  value: React.ReactNode;
  subtext?: string;
  icon: React.ReactNode;
}> = ({ title, value, subtext, icon }) => (
  <div className="bg-gradient-to-br from-white to-slate-50 p-5 rounded-xl border border-slate-200/80 shadow-lg flex items-center gap-4 transition-all hover:-translate-y-1">
    <div className="flex-shrink-0 h-12 w-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
      {icon}
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {subtext && (
        <p className="text-xs text-slate-400 truncate" title={subtext}>
          {subtext}
        </p>
      )}
    </div>
  </div>
);

interface SSVDutyAnalysisAnalysisProps {
  currentUser: User;
  visits: EmployeeVisit[];
}

const SSVDutyAnalysisAnalysis: React.FC<SSVDutyAnalysisAnalysisProps> = ({
  currentUser,
  visits,
}) => {
  const canEdit = currentUser.permissions?.ssvDutyAnalysis?.edit || 
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [supervisorFilter, setSupervisorFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"All" | "Day" | "Night">(
    "All",
  );

  const uniqueSupervisors = useMemo(
    () => _.uniq(visits.map((v) => v.visitorName)).sort(),
    [visits],
  );

  const analysisData = useMemo(() => {
    const filtered = visits.filter((v) => {
      let dateMatch = true;

      // New logic for single-day "duty day" filtering (8AM to 8AM)
      if (startDate && endDate && startDate === endDate) {
        const dutyDayStart = parseDateTime(startDate, "08:00");
        if (!dutyDayStart) return false;

        const dutyDayEnd = new Date(dutyDayStart);
        dutyDayEnd.setDate(dutyDayEnd.getDate() + 1); // Next day at 08:00

        const visitEntryDateTime = parseDateTime(v.date, v.entryTime);
        if (!visitEntryDateTime) return false;

        // Entry time must be within the 24-hour duty window
        dateMatch =
          visitEntryDateTime >= dutyDayStart && visitEntryDateTime < dutyDayEnd;
      } else {
        // Original logic for standard date range filtering
        const startMatch = !startDate || v.date >= startDate;
        const endMatch = !endDate || v.date <= endDate;
        dateMatch = startMatch && endMatch;
      }

      const supervisorMatch =
        !supervisorFilter || v.visitorName === supervisorFilter;
      const shiftType = getShiftType(v.entryTime);
      const shiftMatch = shiftFilter === "All" || shiftType === shiftFilter;

      return dateMatch && supervisorMatch && shiftMatch;
    });

    if (filtered.length === 0) return null;

    const totalDurationSec = _.sumBy(filtered, (v) =>
      parseDurationToSeconds(v.duration),
    );
    const totalShifts = filtered.length;
    const totalSupervisors = _.uniq(filtered.map((v) => v.visitorName)).length;

    const projectHours = _.chain(filtered)
      .groupBy("projectName")
      .map((projectVisits, name) => ({
        name,
        hours: _.sumBy(projectVisits, (v) =>
          parseDurationToSeconds(v.duration),
        ),
      }))
      .orderBy(["hours"], ["desc"])
      .value();

    const supervisorAnalysis = _.chain(filtered)
      .groupBy("visitorName")
      .map((svisits, name) => {
        const totalHoursSec = _.sumBy(svisits, (v) =>
          parseDurationToSeconds(v.duration),
        );
        const shifts = svisits.length;
        const projectsCovered = _.uniq(
          svisits.map((v) => v.projectName),
        ).length;
        const topProject =
          _.chain(svisits)
            .groupBy("projectName")
            .map((pvisits, pname) => ({
              name: pname,
              duration: _.sumBy(pvisits, (v) =>
                parseDurationToSeconds(v.duration),
              ),
            }))
            .maxBy("duration")
            .value()?.name || "N/A";

        return {
          name,
          totalShifts: shifts,
          totalHours: formatSecondsToHHMM(totalHoursSec),
          avgShiftLength: formatSecondsToHHMM(
            shifts > 0 ? totalHoursSec / shifts : 0,
          ),
          dayShifts: svisits.filter((v) => getShiftType(v.entryTime) === "Day")
            .length,
          nightShifts: svisits.filter(
            (v) => getShiftType(v.entryTime) === "Night",
          ).length,
          projectsCovered,
          topProject,
        };
      })
      .orderBy(["totalShifts"], ["desc"])
      .value();

    // Hourly Duration Analysis
    const hourlyDurationBuckets: {
      minutes: number;
      supervisors: Set<string>;
      projects: Set<string>;
    }[] = Array(24)
      .fill(0)
      .map(() => ({
        minutes: 0,
        supervisors: new Set(),
        projects: new Set(),
      }));

    filtered.forEach((visit) => {
      if (!visit.entryTime || !visit.outTime || !visit.date) return;

      let entryDate = parseDateTime(visit.date, visit.entryTime);
      let outDate = parseDateTime(visit.date, visit.outTime);

      if (!entryDate || !outDate) return;

      // If out time is on the same day but chronologically before entry time, it's an overnight shift.
      if (outDate <= entryDate) {
        outDate.setDate(outDate.getDate() + 1);
      }

      let cursor = entryDate.getTime();
      const end = outDate.getTime();

      while (cursor < end) {
        const cursorDate = new Date(cursor);
        const hour = cursorDate.getHours();

        // Calculate next hour boundary
        const nextHourStart = new Date(cursor);
        nextHourStart.setHours(hour + 1, 0, 0, 0);
        const nextHourTime = nextHourStart.getTime();

        const endOfInterval = Math.min(nextHourTime, end);
        const minutesInHour = (endOfInterval - cursor) / 60000;

        if (minutesInHour > 0) {
          hourlyDurationBuckets[hour].minutes += minutesInHour;
          hourlyDurationBuckets[hour].supervisors.add(visit.visitorName);
          hourlyDurationBuckets[hour].projects.add(visit.projectName);
        }

        cursor = endOfInterval;
      }
    });

    const allDurations = hourlyDurationBuckets.map((b) => b.minutes);
    const maxDurationMinutes = Math.max(...allDurations, 1);
    const minDurationMinutes = Math.min(...allDurations);
    const minDurationHour = allDurations.indexOf(minDurationMinutes);

    // Hourly Frequency Analysis
    const hourlyFrequencyBuckets: { count: number; visits: EmployeeVisit[] }[] =
      Array(24)
        .fill(0)
        .map(() => ({
          count: 0,
          visits: [],
        }));
    filtered.forEach((visit) => {
      if (visit.entryTime && /^\d{1,2}:\d{2}/.test(visit.entryTime)) {
        const hour = parseInt(visit.entryTime.split(":")[0], 10);
        if (hour >= 0 && hour < 24) {
          hourlyFrequencyBuckets[hour].count++;
          hourlyFrequencyBuckets[hour].visits.push(visit);
        }
      }
    });
    const allCounts = hourlyFrequencyBuckets.map((b) => b.count);
    const maxFrequency = Math.max(...allCounts, 1);
    const peakHour = allCounts.indexOf(Math.max(...allCounts));
    const lowHour = allCounts.indexOf(Math.min(...allCounts));

    // Shift Analysis
    const dayShiftVisits = filtered.filter(
      (v) => getShiftType(v.entryTime) === "Day",
    );
    const nightShiftVisits = filtered.filter(
      (v) => getShiftType(v.entryTime) === "Night",
    );

    const calculateShiftMetrics = (shiftVisits: EmployeeVisit[]) => {
      if (shiftVisits.length === 0) {
        return {
          totalShifts: 0,
          totalHours: "00:00",
          avgLength: "00:00",
          supervisors: 0,
          topProject: "N/A",
        };
      }
      const totalDurationSec = _.sumBy(shiftVisits, (v) =>
        parseDurationToSeconds(v.duration),
      );
      const totalShifts = shiftVisits.length;
      const topProject = (
        (_.chain(shiftVisits)
          .countBy("projectName")
          .toPairs()
          .maxBy(1)
          .value() || ["N/A"]) as [string, any]
      )[0];

      return {
        totalShifts: totalShifts,
        totalHours: formatSecondsToHHMM(totalDurationSec),
        avgLength: formatSecondsToHHMM(
          totalShifts > 0 ? totalDurationSec / totalShifts : 0,
        ),
        supervisors: _.uniq(shiftVisits.map((v) => v.visitorName)).length,
        topProject: topProject,
      };
    };

    const dayMetrics = calculateShiftMetrics(dayShiftVisits);
    const nightMetrics = calculateShiftMetrics(nightShiftVisits);

    return {
      totalDutyHours: formatSecondsToHHMM(totalDurationSec),
      totalSupervisorsOnDuty: totalSupervisors,
      averageDutyLength: formatSecondsToHHMM(
        totalShifts > 0 ? totalDurationSec / totalShifts : 0,
      ),
      mostActiveProject: projectHours.length > 0 ? projectHours[0].name : "N/A",
      dayShifts: filtered.filter((v) => getShiftType(v.entryTime) === "Day")
        .length,
      nightShifts: filtered.filter((v) => getShiftType(v.entryTime) === "Night")
        .length,
      supervisorAnalysis,
      projectAnalysis: projectHours.map((p) => ({
        name: p.name,
        totalHours: formatSecondsToHHMM(p.hours),
        totalShifts: filtered.filter((v) => v.projectName === p.name).length,
        supervisorCount: _.uniq(
          filtered
            .filter((v) => v.projectName === p.name)
            .map((v) => v.visitorName),
        ).length,
      })),
      hourlyDurationAnalysis: {
        buckets: hourlyDurationBuckets,
        maxMinutes: maxDurationMinutes,
        minHour: minDurationHour,
      },
      hourlyFrequencyAnalysis: {
        buckets: hourlyFrequencyBuckets,
        maxFrequency,
        peakHour,
        lowHour,
      },
      shiftAnalysis: {
        day: dayMetrics,
        night: nightMetrics,
      },
    };
  }, [visits, startDate, endDate, supervisorFilter, shiftFilter]);

  const handleExportCSV = () => {
    if (!analysisData || typeof window.Papa === "undefined") return;

    const headers = [
      "Supervisor Name",
      "Total Shifts",
      "Day Shifts",
      "Night Shifts",
      "Total Hours",
      "Avg. Shift Length",
      "Projects Covered",
      "Top Project",
    ];
    const csvData = analysisData.supervisorAnalysis.map((row) => [
      row.name,
      row.totalShifts,
      row.dayShifts,
      row.nightShifts,
      row.totalHours,
      row.avgShiftLength,
      row.projectsCovered,
      row.topProject,
    ]);

    const csv = window.Papa.unparse({ fields: headers, data: csvData });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute(
      "download",
      `ssv_duty_analysis_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!analysisData) {
      alert("No data to export.");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let lastY = 0;

    const addHeaderFooter = (
      docInstance: any,
      pageNum: number,
      pageCount: number,
    ) => {
      const renderMode = { renderingMode: "fill" };
      // Header
      const headerStartY = 10;
      docInstance.setFont("helvetica", "bold").setFontSize(14).setTextColor(40);
      docInstance.text(
        "Credence Housing Limited",
        pageWidth / 2,
        headerStartY,
        { align: "center", ...renderMode },
      );

      docInstance
        .setFont("helvetica", "normal")
        .setFontSize(9)
        .setTextColor(100);
      docInstance.text(
        "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
        pageWidth / 2,
        headerStartY + 6,
        { align: "center", ...renderMode },
      );

      docInstance.setDrawColor(220).setLineWidth(0.2);
      docInstance.line(
        margin,
        headerStartY + 8,
        pageWidth - margin,
        headerStartY + 8,
      );

      docInstance.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
      docInstance.text(
        "SSV Duty Analysis Report",
        pageWidth / 2,
        headerStartY + 14,
        { align: "center", ...renderMode },
      );

      // Footer
      docInstance
        .setFont("helvetica", "normal")
        .setFontSize(9)
        .setTextColor(150);
      const preparedByStr = `Prepared by: Ruhul Amen`;
      docInstance.text(preparedByStr, margin, pageHeight - 10, renderMode);
      const pageStr = `Page ${pageNum} of ${pageCount}`;
      docInstance.text(pageStr, pageWidth - margin, pageHeight - 10, {
        align: "right",
        ...renderMode,
      });
    };

    const tableOptions = {
      theme: "grid" as any,
      headStyles: {
        fillColor: [241, 245, 249] as any,
        textColor: [71, 85, 105] as any,
        fontSize: 8,
        fontStyle: "bold" as any,
        cellPadding: 1.5,
        lineColor: [226, 232, 240] as any,
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1, fontStyle: "normal" as any },
      styles: { overflow: "linebreak" as any },
      margin: { top: 35, bottom: 20, left: margin, right: margin },
      didDrawPage: (data: any) => {
        addHeaderFooter(
          doc,
          data.pageNumber,
          (doc as any).internal.getNumberOfPages(),
        );
      },
    };

    // Start drawing
    lastY = 35; // Start below header area

    const summaryBody = [
      ["Total Duty Hours", analysisData.totalDutyHours],
      ["Average Duty Length", `${analysisData.averageDutyLength} hrs`],
      [
        "Shift Breakdown",
        `${analysisData.dayShifts} Day / ${analysisData.nightShifts} Night`,
      ],
      ["Most Active Project", analysisData.mostActiveProject],
    ];
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(40);
    doc.text("Overall Summary", margin, lastY);
    lastY += 2;
    // @ts-ignore
    autoTable(doc as any, {
      body: summaryBody,
      startY: lastY,
      theme: "plain",
      bodyStyles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: "bold" } },
    });
    lastY = (doc as any).lastAutoTable.finalY + 8;

    // @ts-ignore
    autoTable(doc as any, {
      ...tableOptions,
      head: [
        [
          {
            content: "Supervisor Performance",
            colSpan: 8,
            styles: { halign: "center" as any, fillColor: [224, 231, 255] },
          },
        ],
        [
          "Supervisor",
          "Total Shifts",
          "Day",
          "Night",
          "Total Hours",
          "Avg. Shift",
          "Projects",
          "Top Project",
        ],
      ],
      body: analysisData.supervisorAnalysis.map((row) => [
        row.name,
        row.totalShifts,
        row.dayShifts,
        row.nightShifts,
        row.totalHours,
        row.avgShiftLength,
        row.projectsCovered,
        row.topProject,
      ]),
      startY: lastY,
    });
    lastY = (doc as any).lastAutoTable.finalY + 8;

    autoTable(doc as any, {
      ...tableOptions,
      head: [
        [
          {
            content: "Project Performance",
            colSpan: 4,
            styles: { halign: "center" as any, fillColor: [224, 231, 255] },
          },
        ],
        ["Project", "Total Hours", "Total Shifts", "Supervisors"],
      ],
      body: analysisData.projectAnalysis.map((row) => [
        row.name,
        row.totalHours,
        row.totalShifts,
        row.supervisorCount,
      ]),
      startY: lastY,
    });
    lastY = (doc as any).lastAutoTable.finalY + 8;

    autoTable(doc as any, {
      ...tableOptions,
      head: [
        [
          {
            content: "Shift Wise Report",
            colSpan: 6,
            styles: { halign: "center" as any, fillColor: [224, 231, 255] },
          },
        ],
        [
          "Shift",
          "Total Shifts",
          "Total Hours",
          "Avg. Length",
          "Supervisors",
          "Top Project",
        ],
      ],
      body: [
        [
          "Day Shift",
          analysisData.shiftAnalysis.day.totalShifts,
          analysisData.shiftAnalysis.day.totalHours,
          analysisData.shiftAnalysis.day.avgLength,
          analysisData.shiftAnalysis.day.supervisors,
          analysisData.shiftAnalysis.day.topProject,
        ],
        [
          "Night Shift",
          analysisData.shiftAnalysis.night.totalShifts,
          analysisData.shiftAnalysis.night.totalHours,
          analysisData.shiftAnalysis.night.avgLength,
          analysisData.shiftAnalysis.night.supervisors,
          analysisData.shiftAnalysis.night.topProject,
        ],
      ],
      startY: lastY,
    });
    lastY = (doc as any).lastAutoTable.finalY;

    // --- NEW CHART DRAWING LOGIC ---
    doc.addPage();
    lastY = 35; // Reset Y position for new page, below header

    const drawBarChart = (
      title: string,
      data: { value: number; projects?: number; isSpecial?: "peak" | "low" }[],
      yAxisLabel: string,
      maxValue: number,
      colorConfig: { normal: number[]; peak?: number[]; low?: number[] },
    ) => {
      const chartHeight = 60;
      const chartWidth = pageWidth - margin * 2.5;
      const chartX = margin + 10;
      const chartY = lastY;

      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(40);
      doc.text(title, margin, chartY);
      lastY += 8;

      doc.setDrawColor(200).setLineWidth(0.2);
      doc.line(chartX, lastY, chartX, lastY + chartHeight);
      doc.line(
        chartX,
        lastY + chartHeight,
        chartX + chartWidth,
        lastY + chartHeight,
      );

      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(100);
      doc.text(String(Math.ceil(maxValue)), chartX - 2, lastY + 2, {
        align: "right",
      });
      doc.text("0", chartX - 2, lastY + chartHeight, { align: "right" });
      doc.text(yAxisLabel, chartX - 5, lastY + chartHeight / 2, {
        align: "right",
        angle: -90,
      });

      const barAreaWidth = chartWidth - 5;
      const step = barAreaWidth / 24;
      const barWidth = step * 0.8;

      for (let i = 0; i < 24; i++) {
        const item = data[i] || { value: 0 };
        const value = item.value || 0;
        const projectCount = item.projects;

        const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
        const barX = chartX + i * step;
        const barY = lastY + chartHeight - barHeight;

        let color = colorConfig.normal;
        if (item.isSpecial === "peak" && colorConfig.peak)
          color = colorConfig.peak;
        else if (item.isSpecial === "low" && colorConfig.low)
          color = colorConfig.low;

        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(barX, barY, barWidth, barHeight, "F");

        if (value > 0) {
          doc.setFontSize(5.5);
          doc.setTextColor(80);
          const valueText = value.toFixed(1);
          doc.text(valueText, barX + barWidth / 2, barY - 1, {
            align: "center",
          });
        }

        if (projectCount && projectCount > 0) {
          if (barHeight > 6) {
            doc.setFontSize(5).setTextColor(255).setFont(undefined, "bold");
            doc.text(`P:${projectCount}`, barX + barWidth / 2, barY + 4, {
              align: "center",
            });
            doc.setFont(undefined, "normal");
          } else if (value > 0) {
            doc.setFontSize(5).setTextColor(120);
            doc.text(`(P${projectCount})`, barX + barWidth / 2, barY - 3, {
              align: "center",
            });
          }
        }

        if (i % 2 === 0) {
          doc.setFontSize(6).setTextColor(100);
          doc.text(
            String(i).padStart(2, "0"),
            barX + barWidth / 2,
            lastY + chartHeight + 4,
            { align: "center" },
          );
        }
      }

      lastY += chartHeight + 10;
    };

    const durationData = analysisData.hourlyDurationAnalysis.buckets.map(
      (bucket, hour) => ({
        value: bucket.minutes > 0 ? bucket.minutes / 60 : 0,
        projects: bucket.projects.size,
        // FIX: Cast string literal to its literal type to fix type widening issue.
        isSpecial:
          hour === analysisData.hourlyDurationAnalysis.minHour
            ? ("low" as "low")
            : undefined,
      }),
    );
    const maxDurationHours = Math.max(...durationData.map((d) => d.value), 0.5);

    drawBarChart(
      "Hourly Coverage (Duration in Hours & Project Count)",
      durationData,
      "Hours",
      maxDurationHours,
      { normal: [251, 146, 60], low: [239, 68, 68] }, // Orange, Red
    );

    lastY += 5;

    const frequencyData = analysisData.hourlyFrequencyAnalysis.buckets.map(
      (bucket, hour) => ({
        value: bucket.count,
        // FIX: Cast string literals to their literal types to fix type widening issue.
        isSpecial:
          hour === analysisData.hourlyFrequencyAnalysis.peakHour
            ? ("peak" as "peak")
            : hour === analysisData.hourlyFrequencyAnalysis.lowHour &&
                hour !== analysisData.hourlyFrequencyAnalysis.peakHour
              ? ("low" as "low")
              : undefined,
      }),
    );
    drawBarChart(
      "Hourly Activity (Visit Count)",
      frequencyData,
      "Visits",
      analysisData.hourlyFrequencyAnalysis.maxFrequency,
      { normal: [59, 130, 246], peak: [34, 197, 94], low: [239, 68, 68] }, // Sky, Green, Red
    );

    // Finalize page numbering
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addHeaderFooter(doc, i, totalPages);
    }

    doc.save(`ssv_duty_analysis_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label
            htmlFor="start-date-ssv"
            className="block text-sm font-medium text-slate-700"
          >
            Start Date
          </label>
          <input
            type="date"
            id="start-date-ssv"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label
            htmlFor="end-date-ssv"
            className="block text-sm font-medium text-slate-700"
          >
            End Date
          </label>
          <input
            type="date"
            id="end-date-ssv"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label
            htmlFor="supervisor-filter-ssv"
            className="block text-sm font-medium text-slate-700"
          >
            Supervisor
          </label>
          <select
            id="supervisor-filter-ssv"
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          >
            <option value="">All Supervisors</option>
            {uniqueSupervisors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="shift-filter-ssv"
            className="block text-sm font-medium text-slate-700"
          >
            Shift
          </label>
          <select
            id="shift-filter-ssv"
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value as any)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          >
            <option value="All">All Shifts</option>
            <option value="Day">Day Shift (8am-8pm)</option>
            <option value="Night">Night Shift (8pm-8am)</option>
          </select>
        </div>
      </div>

      {!analysisData ? (
        <div className="text-center py-12 text-slate-500">
          <p>No SSV data found for the selected filters.</p>
          <p className="text-sm">
            Please import data in the 'Records' tab or adjust your filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AnalysisCard
              title="Total Duty Hours"
              value={analysisData.totalDutyHours}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
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
            <AnalysisCard
              title="Average Duty Length"
              value={`${analysisData.averageDutyLength} hrs`}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                  <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                </svg>
              }
            />
            <AnalysisCard
              title="Shift Breakdown"
              value={
                <div className="flex gap-4">
                  <span className="text-sky-600">
                    {analysisData.dayShifts} Day
                  </span>{" "}
                  /{" "}
                  <span className="text-indigo-600">
                    {analysisData.nightShifts} Night
                  </span>
                </div>
              }
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 4a1 1 0 011 1v1.333a11.025 11.025 0 013.56 1.396 1 1 0 010 1.742A8.995 8.995 0 0010 17.5a8.995 8.995 0 00-4.56-9.289 1 1 0 010-1.742A11.025 11.025 0 019 6.333V5a1 1 0 011-1z" />
                </svg>
              }
            />
            <AnalysisCard
              title="Most Active Project"
              value={
                <span
                  className="truncate"
                  title={analysisData.mostActiveProject}
                >
                  {analysisData.mostActiveProject}
                </span>
              }
              subtext={`${analysisData.totalSupervisorsOnDuty} Supervisors on Duty`}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4">
                Hourly Coverage (Duration in Hours & Project Count)
              </h3>
              <p className="text-xs text-slate-500 mb-4 -mt-2">
                Total duty hours logged per hour. Red bar indicates lowest
                coverage. `P:X` denotes the number of unique projects active in
                that hour.
              </p>
              <div className="w-full h-64 flex items-end justify-between gap-1 px-2">
                {analysisData.hourlyDurationAnalysis.buckets.map(
                  (bucket, hour) => {
                    const minutes = bucket.minutes;
                    const height =
                      analysisData.hourlyDurationAnalysis.maxMinutes > 0
                        ? (minutes /
                            analysisData.hourlyDurationAnalysis.maxMinutes) *
                          100
                        : 0;
                    const isMinHour =
                      hour === analysisData.hourlyDurationAnalysis.minHour;
                    const supervisors = Array.from(bucket.supervisors).join(
                      ", ",
                    );
                    const projects = Array.from(bucket.projects).join(", ");
                    return (
                      <div
                        key={hour}
                        className="flex-1 flex flex-col items-center group relative h-full justify-end"
                      >
                        <div className="absolute top-0 text-center w-full">
                          <div className="text-[10px] font-bold text-slate-600 -mt-3.5">
                            {(minutes / 60).toFixed(1)}h
                          </div>
                        </div>
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${isMinHour ? "bg-red-400 hover:bg-red-500" : "bg-orange-400 group-hover:bg-orange-500"}`}
                          style={{ height: `${height}%` }}
                        >
                          {height > 15 && bucket.projects.size > 0 && (
                            <div className="text-white text-[10px] text-center font-bold pt-0.5">
                              P:{bucket.projects.size}
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-full mb-2 w-64 p-3 text-xs text-white bg-slate-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-left">
                          <p className="font-bold border-b border-slate-600 pb-1 mb-1">{`${String(hour).padStart(2, "0")}:00 - ${String(hour).padStart(2, "0")}:59`}</p>
                          <p>
                            <strong>Total Duration:</strong>{" "}
                            {formatSecondsToHHMM(minutes * 60)}
                          </p>
                          <p className="truncate" title={supervisors}>
                            <strong>
                              Supervisors ({bucket.supervisors.size}):
                            </strong>{" "}
                            <span className="text-slate-300">
                              {supervisors || "None"}
                            </span>
                          </p>
                          <p className="truncate" title={projects}>
                            <strong>Projects ({bucket.projects.size}):</strong>{" "}
                            <span className="text-slate-300">
                              {projects || "None"}
                            </span>
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 mt-1">
                          {String(hour).padStart(2, "0")}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4">
                Hourly Activity (Visit Count)
              </h3>
              <p className="text-xs text-slate-500 mb-4 -mt-2">
                Number of visits started per hour. Green bar is the peak hour,
                red is the lowest.
              </p>
              <div className="w-full h-64 flex items-end justify-between gap-1 px-2">
                {analysisData.hourlyFrequencyAnalysis.buckets.map(
                  (bucket, hour) => {
                    const count = bucket.count;
                    const height =
                      analysisData.hourlyFrequencyAnalysis.maxFrequency > 0
                        ? (count /
                            analysisData.hourlyFrequencyAnalysis.maxFrequency) *
                          100
                        : 0;
                    const isPeakHour =
                      hour === analysisData.hourlyFrequencyAnalysis.peakHour;
                    const isLowHour =
                      hour === analysisData.hourlyFrequencyAnalysis.lowHour;
                    let barClass = "bg-sky-400 group-hover:bg-sky-500";
                    if (isPeakHour)
                      barClass = "bg-green-400 hover:bg-green-500";
                    if (isLowHour && !isPeakHour)
                      barClass = "bg-red-400 hover:bg-red-500";
                    const supervisors = _.uniq(
                      bucket.visits.map((v) => v.visitorName),
                    ).join(", ");
                    const projects = _.uniq(
                      bucket.visits.map((v) => v.projectName),
                    ).join(", ");
                    return (
                      <div
                        key={hour}
                        className="flex-1 flex flex-col items-center group relative h-full justify-end"
                      >
                        <div className="absolute top-0 text-center w-full">
                          {count > 0 && (
                            <div className="text-[10px] font-bold text-slate-600 -mt-3.5">
                              {count}
                            </div>
                          )}
                        </div>
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${barClass}`}
                          style={{ height: `${height}%` }}
                        ></div>
                        <div className="absolute bottom-full mb-2 w-64 p-3 text-xs text-white bg-slate-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-left">
                          <p className="font-bold border-b border-slate-600 pb-1 mb-1">{`Visits starting at ${String(hour).padStart(2, "0")}:00`}</p>
                          <p>
                            <strong>Total Visits:</strong> {count}
                          </p>
                          <p className="truncate" title={supervisors}>
                            <strong>Supervisors:</strong>{" "}
                            <span className="text-slate-300">
                              {supervisors || "None"}
                            </span>
                          </p>
                          <p className="truncate" title={projects}>
                            <strong>Projects:</strong>{" "}
                            <span className="text-slate-300">
                              {projects || "None"}
                            </span>
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 mt-1">
                          {String(hour).padStart(2, "0")}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4">
                Shift Wise Report
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Shift
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Total Shifts
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Total Hours
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Avg. Length
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Supervisors
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Top Project
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    <tr>
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                        Day Shift{" "}
                        <span className="text-xs text-slate-400 font-normal">
                          (8am-8pm)
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.day.totalShifts}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.day.totalHours}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.day.avgLength}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.day.supervisors}
                      </td>
                      <td
                        className="px-3 py-2 text-left truncate max-w-[150px]"
                        title={analysisData.shiftAnalysis.day.topProject}
                      >
                        {analysisData.shiftAnalysis.day.topProject}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                        Night Shift{" "}
                        <span className="text-xs text-slate-400 font-normal">
                          (8pm-8am)
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.night.totalShifts}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.night.totalHours}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.night.avgLength}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {analysisData.shiftAnalysis.night.supervisors}
                      </td>
                      <td
                        className="px-3 py-2 text-left truncate max-w-[150px]"
                        title={analysisData.shiftAnalysis.night.topProject}
                      >
                        {analysisData.shiftAnalysis.night.topProject}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-slate-800">
                  Supervisor Performance
                </h3>
                <div className="flex gap-2">
                  {canEdit ? (
                    <>
                      <button
                        onClick={handleExportCSV}
                        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={handleExportPDF}
                        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                      >
                        Export PDF
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-400 text-[10px] bg-slate-50 px-2 py-1 rounded border italic">
                      Export: Admin Only
                    </span>
                  )}
                </div>
              </div>
              <div
                className="overflow-auto border rounded-lg"
                style={{ maxHeight: "50vh" }}
              >
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Supervisor
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Total Shifts
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Day
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Night
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Total Hours
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Avg. Shift
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Projects
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Top Project
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {analysisData.supervisorAnalysis.map((row) => (
                      <tr key={row.name}>
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">
                          {row.name}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.totalShifts}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-sky-600">
                          {row.dayShifts}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-indigo-600">
                          {row.nightShifts}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.totalHours}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.avgShiftLength}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.projectsCovered}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-left text-slate-600 truncate max-w-[150px]"
                          title={row.topProject}
                        >
                          {row.topProject}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Project Performance
              </h3>
              <div
                className="overflow-auto border rounded-lg"
                style={{ maxHeight: "50vh" }}
              >
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                        Project
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Total Hours
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Total Shifts
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">
                        Supervisors
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {analysisData.projectAnalysis.map((row) => (
                      <tr key={row.name}>
                        <td
                          className="px-3 py-2 whitespace-nowrap font-medium text-slate-900 truncate max-w-[200px]"
                          title={row.name}
                        >
                          {row.name}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.totalHours}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.totalShifts}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {row.supervisorCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SSVDutyAnalysisAnalysis;
