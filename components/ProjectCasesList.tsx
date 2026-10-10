import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import _ from "lodash";
import { Project, ProjectCase, User, PhotoAnnotation } from "../types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getEffectivePermissions } from "../utils/permissionUtils";
import { resizeImage } from "../utils/imageUtils";
import { DEPARTMENTS } from "../constants";
import SearchableSelect from "./SearchableSelect";
import PhotoAnnotator from "./PhotoAnnotator";

const ALL_PRIORITIES: ProjectCase["priority"][] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

const getPriorityBadgeClass = (
  priority: "Low" | "Medium" | "High" | "Critical",
) => {
  switch (priority) {
    case "Low":
      return "bg-green-100 text-green-800";
    case "Medium":
      return "bg-yellow-100 text-yellow-800";
    case "High":
      return "bg-orange-100 text-orange-800";
    case "Critical":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};

// RGB tuples used for jsPDF fill/text colors that mirror the badge classes above
const PRIORITY_RGB: Record<string, [number, number, number]> = {
  Low: [22, 163, 74],
  Medium: [202, 138, 4],
  High: [234, 88, 12],
  Critical: [220, 38, 38],
};

interface ProjectCasesListProps {
  projects: Project[];
  currentUser: User;
}

interface EditFormState {
  projectName: string;
  projectZone: string;
  caseName: string;
  liableDept: string;
  comments: string;
  category: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  photo: string | null;
  annotations: PhotoAnnotation[];
}

const ProjectCasesList: React.FC<ProjectCasesListProps> = ({ projects, currentUser }) => {
  const [cases, setCases] = useState<ProjectCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewCase, setPreviewCase] = useState<ProjectCase | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Edit modal state
  const [editingCase, setEditingCase] = useState<ProjectCase | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deletingCase, setDeletingCase] = useState<ProjectCase | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const permissions = getEffectivePermissions(currentUser);
  const canManageCases = !!permissions.projectCase?.edit;

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project_cases");
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data: ProjectCase[] = await res.json();
      setCases(Array.isArray(data) ? data.filter((c) => !c.is_deleted) : []);
    } catch (err) {
      console.error("Failed to fetch project cases", err);
      setError("Could not load project cases. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const projectNames = useMemo(
    () => _.uniq(projects.map((p) => p.name || "Unnamed")).sort(),
    [projects],
  );
  const projectZoneMap = useMemo(
    () =>
      projects.reduce(
        (acc, project) => {
          acc[project.name] = project.zone;
          return acc;
        },
        {} as Record<string, string>,
      ),
    [projects],
  );

  const ALL_CATEGORIES = useMemo(
    () => Array.from(new Set(cases.map((c) => c.category))).sort(),
    [cases],
  );

  const filteredCases = useMemo(() => {
    return cases
      .filter((pcase) => {
        const startDateMatch = !startDate || pcase.date >= startDate;
        const endDateMatch = !endDate || pcase.date <= endDate;
        const projectMatch =
          !projectFilter || pcase.projectName === projectFilter;
        const priorityMatch =
          !priorityFilter || pcase.priority === priorityFilter;
        const categoryMatch =
          !categoryFilter || pcase.category === categoryFilter;
        return (
          startDateMatch &&
          endDateMatch &&
          projectMatch &&
          priorityMatch &&
          categoryMatch
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [cases, startDate, endDate, projectFilter, priorityFilter, categoryFilter]);

  // ---------- Edit handlers ----------
  const handleOpenEdit = (pcase: ProjectCase) => {
    setEditingCase(pcase);
    setEditForm({
      projectName: pcase.projectName || "",
      projectZone: pcase.projectZone || "",
      caseName: pcase.caseName || "",
      liableDept: pcase.liableDept || "",
      comments: pcase.comments || "",
      category: pcase.category || "Other",
      priority: pcase.priority || "Low",
      photo: pcase.photo || null,
      annotations: pcase.annotations ? pcase.annotations.map((a) => ({ ...a })) : [],
    });
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingCase(null);
    setEditForm(null);
    setEditError(null);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  const handleEditProjectChange = (name: string) => {
    setEditForm((prev) =>
      prev ? { ...prev, projectName: name, projectZone: projectZoneMap[name] || prev.projectZone } : prev,
    );
  };

  const handleEditPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const resized = await resizeImage(reader.result as string);
          // A new photo invalidates old mark positions, so clear them.
          setEditForm((prev) => (prev ? { ...prev, photo: resized, annotations: [] } : prev));
        } catch {
          setEditError("Failed to process image.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditAnnotationsChange = (annotations: PhotoAnnotation[]) => {
    setEditForm((prev) => (prev ? { ...prev, annotations } : prev));
  };

  const handleSaveEdit = async () => {
    if (!editingCase || !editForm) return;
    if (!editForm.projectName.trim()) {
      setEditError("Please select a project.");
      return;
    }
    if (!editForm.caseName.trim()) {
      setEditError("Please enter a case name.");
      return;
    }
    if (!editForm.liableDept.trim()) {
      setEditError("Please select the liable department.");
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const payload = {
        ...editingCase,
        ...editForm,
        caseName: editForm.caseName.trim(),
        comments: editForm.comments.trim(),
      };
      const res = await fetch(`/api/project_cases/${editingCase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const saved = await res.json().catch(() => payload);
      setCases((prev) =>
        prev.map((c) => (String(c.id) === String(editingCase.id) ? { ...c, ...saved, id: c.id } : c)),
      );
      closeEditModal();
    } catch (err) {
      console.error("Failed to update project case", err);
      setEditError("Failed to save changes. Please check your connection and try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ---------- Delete handlers ----------
  const handleConfirmDelete = async () => {
    if (!deletingCase) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/project_cases/${deletingCase.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      setCases((prev) => prev.filter((c) => String(c.id) !== String(deletingCase.id)));
      setDeletingCase(null);
    } catch (err) {
      console.error("Failed to delete project case", err);
      alert("Failed to delete the case. Please check your connection and try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ---------- Audit-style PDF report with images ----------
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const generatedOn = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const addFooter = () => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(140);
        const pageStr = `Page ${i} of ${pageCount}`;
        doc.text(pageStr, pageWidth - margin - doc.getTextWidth(pageStr), pageHeight - 8);
        doc.text(`Generated on: ${generatedOn}`, margin, pageHeight - 8);
        doc.text("Credence Housing Limited - Project Visit Surveillance", pageWidth / 2, pageHeight - 8, { align: "center" });
      }
    };

    // ---- Page 1: Title / cover page ----
    doc.setFillColor(71, 85, 105);
    doc.rect(0, 0, pageWidth, 42, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Project Visit Surveillance", margin, 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Credence Housing Limited", margin, 29);
    doc.setFontSize(9);
    const uniqueProjectCount = new Set(filteredCases.map((c) => c.projectName)).size;
    doc.text(
      `Multi-Project Surveillance & Inspection Summary  •  ${uniqueProjectCount} Project(s)  •  ${filteredCases.length} Case(s)`,
      margin,
      36,
    );

    doc.setTextColor(60);
    doc.setFontSize(10);
    const start = startDate ? new Date(startDate + "T00:00:00").toLocaleDateString("en-US") : "N/A";
    const end = endDate ? new Date(endDate + "T00:00:00").toLocaleDateString("en-US") : "N/A";
    let cursorY = 54;
    const filterLines = [
      `Report Period: ${start} to ${end}`,
      `Filters — Project: ${projectFilter || "All Projects"}    Priority: ${priorityFilter || "All"}    Category: ${categoryFilter || "All"}`,
      `Generated on: ${generatedOn}`,
    ];
    doc.text(filterLines, margin, cursorY);
    cursorY += filterLines.length * 5 + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text("Findings by Priority", margin, cursorY);
    cursorY += 6;

    // Priority breakdown summary boxes
    const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    filteredCases.forEach((c) => {
      if (counts[c.priority] !== undefined) counts[c.priority]++;
    });
    const boxWidth = (pageWidth - margin * 2 - 15) / 4;
    let boxX = margin;
    (["Low", "Medium", "High", "Critical"] as const).forEach((p) => {
      const rgb = PRIORITY_RGB[p];
      doc.setDrawColor(...rgb);
      doc.setLineWidth(0.4);
      doc.roundedRect(boxX, cursorY, boxWidth, 20, 2, 2, "S");
      doc.setFontSize(16);
      doc.setTextColor(...rgb);
      doc.setFont("helvetica", "bold");
      doc.text(String(counts[p]), boxX + 5, cursorY + 12);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90);
      doc.text(p, boxX + 5, cursorY + 17);
      boxX += boxWidth + 5;
    });
    cursorY += 30;

    const uniqueReporters = Array.from(new Set(filteredCases.map((c) => c.reporter).filter(Boolean)));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text("Prepared by:", margin, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40);
    doc.text(uniqueReporters.length ? uniqueReporters.join(", ") : "-", margin + 25, cursorY);
    cursorY += 5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(90);
    doc.text("Department:", margin, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40);
    doc.text("MIS Department", margin + 25, cursorY);

    // ---- Page 2: Project-wise summary (mirrors the manual report's summary page) ----
    doc.addPage();
    doc.setFillColor(71, 85, 105);
    doc.rect(0, 0, pageWidth, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Project-wise Summary", margin, 13);

    const projectAddressMap = projects.reduce(
      (acc, p) => {
        acc[p.name] = p.address;
        return acc;
      },
      {} as Record<string, string>,
    );

    const summaryByProject = _.groupBy(filteredCases, (c) => c.projectName || "Unassigned");
    const summaryProjectNames = Object.keys(summaryByProject).sort();
    const summaryRows = summaryProjectNames.map((name, idx) => {
      const groupCases = summaryByProject[name];
      const findings = groupCases
        .slice(0, 6)
        .map((c, i) => `${i + 1}. ${c.comments?.trim() || c.caseName}`)
        .join("\n");
      const extra = groupCases.length > 6 ? `\n+ ${groupCases.length - 6} more` : "";
      return [
        String(idx + 1),
        name,
        projectAddressMap[name] || "-",
        String(groupCases.length),
        findings + extra || "Everything is fine",
      ];
    });

    autoTable(doc as any, {
      head: [["Sl.", "Project Name", "Address", "Cases", "Surveillance Remarks"]],
      body: summaryRows,
      startY: 26,
      theme: "grid" as any,
      headStyles: { fillColor: [71, 85, 105] },
      styles: { fontSize: 8.5, cellPadding: 2.5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 10 },
        3: { cellWidth: 16, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });

    // ---- Page 3: Full case-level overview table ----
    doc.addPage();
    doc.setFillColor(71, 85, 105);
    doc.rect(0, 0, pageWidth, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Case-wise Overview", margin, 13);

    const tableColumn = ["Case Name", "Project", "Liable Dept.", "Reporter", "Date", "Priority", "Category"];
    const tableRows = filteredCases.map((pcase) => [
      pcase.caseName,
      pcase.projectName,
      pcase.liableDept || "-",
      pcase.reporter || "-",
      pcase.date ? new Date(`${pcase.date}T00:00:00`).toLocaleDateString("en-US") : "-",
      pcase.priority,
      pcase.category,
    ]);

    autoTable(doc as any, {
      head: [tableColumn],
      body: tableRows,
      startY: 26,
      theme: "grid" as any,
      headStyles: { fillColor: [71, 85, 105] },
      styles: { fontSize: 8.5, cellPadding: 2 },
      margin: { left: margin, right: margin },
    });

    // ---- Grid-card pages, grouped by project (mirrors the manual report layout) ----
    const casesByProject = _.groupBy(filteredCases, (c) => c.projectName || "Unassigned");
    const projectGroups = Object.keys(casesByProject).sort();

    const COLS = 3;
    const ROWS = 2;
    const CARD_GAP = 6;
    const HEADER_H = 22; // space for the project name bar at the top of each grid page
    const contentTop = margin + HEADER_H;
    const contentBottom = pageHeight - margin - 6; // leave room for the footer
    const gridW = pageWidth - margin * 2;
    const gridH = contentBottom - contentTop;
    const cardW = (gridW - CARD_GAP * (COLS - 1)) / COLS;
    const cardH = (gridH - CARD_GAP * (ROWS - 1)) / ROWS;
    const imageBoxH = cardH * 0.62;

    const drawProjectHeader = (projectName: string) => {
      doc.setFillColor(71, 85, 105);
      doc.rect(0, 0, pageWidth, HEADER_H, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`Project: ${projectName}`, margin, HEADER_H / 2 + 4.5);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const zone = casesByProject[projectName][0]?.projectZone;
      if (zone) {
        doc.text(`Zone: ${zone}`, pageWidth - margin, HEADER_H / 2 + 4.5, { align: "right" });
      }
    };

    const drawCard = (pcase: ProjectCase, cardX: number, cardY: number) => {
      // Card border
      doc.setDrawColor(210);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, "S");

      // ---- Image box ----
      const imgBoxX = cardX + 1.5;
      const imgBoxY = cardY + 1.5;
      const imgBoxW = cardW - 3;
      const imgBoxHInner = imageBoxH - 3;

      doc.setFillColor(245, 245, 245);
      doc.rect(imgBoxX, imgBoxY, imgBoxW, imgBoxHInner, "F");

      if (pcase.photo) {
        try {
          const props = doc.getImageProperties(pcase.photo);
          const ratio = Math.min(imgBoxW / props.width, imgBoxHInner / props.height);
          const drawW = props.width * ratio;
          const drawH = props.height * ratio;
          const drawX = imgBoxX + (imgBoxW - drawW) / 2;
          const drawY = imgBoxY + (imgBoxHInner - drawH) / 2;
          doc.addImage(pcase.photo, drawX, drawY, drawW, drawH);

          // ---- Draw annotation marks on top of the image, same % positions as the app ----
          const MAX_LABEL_W = 34; // mm, caps label width so long paragraphs wrap
          const LABEL_LINE_H = 3.1; // mm

          const drawWrappedLabel = (anchorX: number, anchorY: number, preferLeft: boolean, preferAbove: boolean, text: string) => {
            if (!text) return;
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "bold");
            const lines = doc.splitTextToSize(text, MAX_LABEL_W - 3) as string[];
            const lineWidths = lines.map((l) => doc.getTextWidth(l));
            const boxW = Math.min(MAX_LABEL_W, Math.max(...lineWidths) + 3);
            const boxH = lines.length * LABEL_LINE_H + 1.6;

            let labelX = preferLeft ? anchorX - boxW - 1.5 : anchorX + 1.5;
            let labelY = preferAbove ? anchorY - boxH - 1.5 : anchorY + 1.5;
            // Clamp within the image box so the label never spills off the photo
            labelX = Math.min(Math.max(labelX, imgBoxX), imgBoxX + imgBoxW - boxW);
            labelY = Math.min(Math.max(labelY, imgBoxY), imgBoxY + imgBoxHInner - boxH);

            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(220, 38, 38);
            doc.setLineWidth(0.35);
            doc.roundedRect(labelX, labelY, boxW, boxH, 0.8, 0.8, "FD");
            doc.setTextColor(30, 30, 30);
            lines.forEach((line, i) => {
              doc.text(line, labelX + 1.5, labelY + 2.4 + i * LABEL_LINE_H);
            });
          };

          // maps a % point (relative to the image box) into absolute PDF mm coordinates
          const toPdfPoint = (pct: { x: number; y: number }) => ({
            x: imgBoxX + (pct.x / 100) * imgBoxW,
            y: imgBoxY + (pct.y / 100) * imgBoxHInner,
          });

          (pcase.annotations || []).forEach((mark) => {
            const type = mark.type || "point";

            if (type === "box" || type === "highlight") {
              const bx = imgBoxX + (mark.xPct / 100) * imgBoxW;
              const by = imgBoxY + (mark.yPct / 100) * imgBoxHInner;
              const bw = ((mark.wPct ?? 10) / 100) * imgBoxW;
              const bh = ((mark.hPct ?? 10) / 100) * imgBoxHInner;

              if (type === "highlight") {
                doc.setFillColor(253, 224, 71); // yellow-300
                doc.setGState(new (doc as any).GState({ opacity: 0.35 }));
                doc.rect(bx, by, bw, bh, "F");
                doc.setGState(new (doc as any).GState({ opacity: 1 }));
                doc.setDrawColor(234, 179, 8); // yellow-500
                doc.setLineWidth(0.4);
                doc.rect(bx, by, bw, bh, "S");
              } else {
                doc.setDrawColor(220, 38, 38);
                doc.setLineWidth(0.6);
                doc.rect(bx, by, bw, bh, "S");
              }

              const preferLeft = bx + bw + MAX_LABEL_W > imgBoxX + imgBoxW;
              const preferAbove = by - imgBoxY < 4 ? false : true;
              drawWrappedLabel(preferLeft ? bx + bw : bx, preferAbove ? by : by + bh, preferLeft, preferAbove, mark.text);
              return;
            }

            if ((type === "ruler" || type === "arrow") && mark.points && mark.points.length >= 2) {
              const a = toPdfPoint(mark.points[0]);
              const b = toPdfPoint(mark.points[1]);
              doc.setDrawColor(220, 38, 38);
              doc.setFillColor(220, 38, 38);
              doc.setLineWidth(0.5);
              doc.line(a.x, a.y, b.x, b.y);

              if (type === "ruler") {
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const px = -uy * 1.4;
                const py = ux * 1.4;
                doc.line(a.x + px, a.y + py, a.x - px, a.y - py);
                doc.line(b.x + px, b.y + py, b.x - px, b.y - py);
              } else {
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const px = -uy;
                const py = ux;
                const headLen = 3;
                const headW = 1.3;
                const baseX = b.x - ux * headLen;
                const baseY = b.y - uy * headLen;
                doc.triangle(
                  b.x, b.y,
                  baseX + px * headW, baseY + py * headW,
                  baseX - px * headW, baseY - py * headW,
                  "F",
                );
              }

              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              const midPct = mark.points ? { x: (mark.points[0].x + mark.points[1].x) / 2, y: (mark.points[0].y + mark.points[1].y) / 2 } : { x: 50, y: 50 };
              const preferLeft = midPct.x > 65;
              const preferAbove = midPct.y > 80;
              drawWrappedLabel(midX, midY, preferLeft, preferAbove, mark.text);
              return;
            }

            if (type === "freehand" && mark.points && mark.points.length >= 2) {
              doc.setDrawColor(220, 38, 38);
              doc.setLineWidth(0.55);
              const pdfPts = mark.points.map(toPdfPoint);
              for (let i = 1; i < pdfPts.length; i++) {
                doc.line(pdfPts[i - 1].x, pdfPts[i - 1].y, pdfPts[i].x, pdfPts[i].y);
              }
              const first = pdfPts[0];
              const firstPct = mark.points[0];
              drawWrappedLabel(first.x, first.y, firstPct.x > 65, firstPct.y > 80, mark.text);
              return;
            }

            // point (default)
            const mx = imgBoxX + (mark.xPct / 100) * imgBoxW;
            const my = imgBoxY + (mark.yPct / 100) * imgBoxHInner;

            doc.setFillColor(220, 38, 38);
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.3);
            doc.circle(mx, my, 1.3, "FD");

            const preferLeft = mark.xPct > 65;
            const preferAbove = mark.yPct > 80;
            drawWrappedLabel(mx, my, preferLeft, preferAbove, mark.text);
          });
        } catch (imgErr) {
          console.error("Could not embed case photo in PDF:", imgErr);
          doc.setFontSize(7.5);
          doc.setTextColor(150);
          doc.text("Image unavailable", imgBoxX + imgBoxW / 2, imgBoxY + imgBoxHInner / 2, { align: "center" });
        }
      } else {
        doc.setFontSize(7.5);
        doc.setTextColor(150);
        doc.text("No visual attached", imgBoxX + imgBoxW / 2, imgBoxY + imgBoxHInner / 2, { align: "center" });
      }

      // Priority chip, top-right corner of the image
      const rgb = PRIORITY_RGB[pcase.priority] || [100, 100, 100];
      doc.setFillColor(...rgb);
      const chipW = doc.getTextWidth(pcase.priority || "-") + 4;
      doc.roundedRect(imgBoxX + imgBoxW - chipW - 1, imgBoxY + 1, chipW, 4.2, 0.8, 0.8, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(pcase.priority || "-", imgBoxX + imgBoxW - chipW / 2 - 1, imgBoxY + 3.9, { align: "center" });

      // ---- Field rows below the image ----
      let fy = cardY + imageBoxH + 4;
      const fx = cardX + 2.5;
      const fw = cardW - 5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30);
      const titleLines = doc.splitTextToSize(pcase.caseName || "Untitled Case", fw);
      doc.text(titleLines[0], fx, fy);
      fy += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(90);
      doc.text(`${pcase.category || "-"} • ${pcase.liableDept || "-"}`, fx, fy);
      fy += 3.6;

      if (pcase.comments) {
        doc.setTextColor(60);
        const remarkLines = doc.splitTextToSize(pcase.comments, fw).slice(0, 2);
        doc.text(remarkLines, fx, fy);
        fy += remarkLines.length * 3.2;
      }

      doc.setFontSize(6.5);
      doc.setTextColor(130);
      const dateStr = pcase.date ? new Date(`${pcase.date}T00:00:00`).toLocaleDateString("en-US") : "-";
      doc.text(`${pcase.reporter || "-"}  •  ${dateStr}`, fx, cardY + cardH - 2);
    };

    projectGroups.forEach((projectName) => {
      const groupCases = casesByProject[projectName];
      groupCases.forEach((pcase, idxInGroup) => {
        const cardsPerPage = COLS * ROWS;
        const isFirstOfGroup = idxInGroup === 0;
        const positionOnPage = idxInGroup % cardsPerPage;

        if (isFirstOfGroup || positionOnPage === 0) {
          doc.addPage();
          drawProjectHeader(projectName);
        }

        const col = positionOnPage % COLS;
        const row = Math.floor(positionOnPage / COLS);
        const cardX = margin + col * (cardW + CARD_GAP);
        const cardY = contentTop + row * (cardH + CARD_GAP);
        drawCard(pcase, cardX, cardY);
      });
    });

    addFooter();
    doc.save(`project-visit-surveillance-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-slate-800">
            Filter Project Cases
          </h2>
          <button
            onClick={fetchCases}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-orange-600 border border-slate-200 rounded-md hover:bg-orange-50 transition-colors disabled:opacity-50"
          >
            <svg
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                clipRule="evenodd"
              />
            </svg>
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          {/* Date Filters */}
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
          {/* Project Filter */}
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
          {/* Priority Filter */}
          <div>
            <label
              htmlFor="priority-filter"
              className="block text-sm font-medium text-slate-700"
            >
              Priority
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            >
              <option value="">All Priorities</option>
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {/* Category Filter */}
          <div>
            <label
              htmlFor="category-filter"
              className="block text-sm font-medium text-slate-700"
            >
              Category
            </label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            >
              <option value="">All Categories</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-800">
            Results ({filteredCases.length})
          </h2>
          <button
            onClick={handleDownloadPDF}
            disabled={filteredCases.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
            aria-label="Download Project Visit Surveillance report as PDF"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Download Surveillance Report (PDF)
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 flex flex-col items-center justify-center text-slate-400">
            <svg className="animate-spin h-8 w-8 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <p className="text-sm">Loading project cases...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              onClick={fetchCases}
              className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-200 rounded-md hover:bg-orange-50"
            >
              Try Again
            </button>
          </div>
        ) : filteredCases.length > 0 ? (
          <ul className="divide-y divide-slate-200">
            {filteredCases.map((pcase) => (
              <li
                key={pcase.id}
                className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
              >
                {pcase.photo ? (
                  <button
                    onClick={() => setPreviewCase(pcase)}
                    className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity"
                    aria-label="View case photo"
                  >
                    <img src={pcase.photo} alt={pcase.caseName} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}

                <div className="min-w-0 flex-1 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
                  <div className="col-span-2 md:col-span-1">
                    <p className="font-semibold text-slate-800 truncate" title={pcase.caseName}>
                      {pcase.caseName}
                    </p>
                    <p className="text-sm text-slate-500 truncate">{pcase.projectName}</p>
                  </div>
                  <div className="hidden md:block">
                    <p className="text-sm text-slate-600">{pcase.liableDept || "-"}</p>
                    <p className="text-xs text-slate-400">by {pcase.reporter || "-"}</p>
                  </div>
                  <div className="hidden md:block">
                    <p className="text-sm text-slate-600">
                      {new Date(`${pcase.date}T00:00:00`).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "long", day: "numeric" },
                      )}
                    </p>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadgeClass(pcase.priority)}`}
                    >
                      {pcase.priority}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
                      {pcase.category}
                    </span>
                  </div>
                </div>

                {canManageCases && (
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(pcase)}
                      className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                      aria-label="Edit case"
                      title="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeletingCase(pcase)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      aria-label="Delete case"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-center text-slate-500">
            No project cases found matching your criteria.
          </p>
        )}
      </div>

      {/* Photo preview lightbox */}
      {previewCase && previewCase.photo && (
        <div
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
          onClick={() => setPreviewCase(null)}
        >
          <div className="max-w-3xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <PhotoAnnotator
              photo={previewCase.photo}
              annotations={previewCase.annotations || []}
              editable={false}
              className="rounded-lg shadow-2xl overflow-hidden"
            />
          </div>
          <button
            onClick={() => setPreviewCase(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            aria-label="Close preview"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingCase && editForm && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={closeEditModal}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="bg-slate-50 p-4 border-b border-slate-200 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Edit Case Report</h2>
              <button onClick={closeEditModal} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </header>

            <div className="p-5 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">{editError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                  <SearchableSelect
                    id="edit-case-project"
                    options={projectNames}
                    value={editForm.projectName}
                    onChange={handleEditProjectChange}
                    placeholder="Select a project"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Zone</label>
                  <input
                    type="text"
                    value={editForm.projectZone}
                    readOnly
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Case Name</label>
                <input
                  type="text"
                  value={editForm.caseName}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, caseName: e.target.value } : prev))}
                  className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Liable Department</label>
                <SearchableSelect
                  id="edit-case-liable-dept"
                  options={DEPARTMENTS}
                  value={editForm.liableDept}
                  onChange={(val) => setEditForm((prev) => (prev ? { ...prev, liableDept: val } : prev))}
                  placeholder="Select department"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm((prev) => (prev ? { ...prev, priority: e.target.value as EditFormState["priority"] } : prev))}
                    className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  >
                    {ALL_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                    className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comments</label>
                <textarea
                  rows={3}
                  value={editForm.comments}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, comments: e.target.value } : prev))}
                  className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Case Visual</label>
                {editForm.photo ? (
                  <div className="max-w-sm">
                    <PhotoAnnotator
                      photo={editForm.photo}
                      annotations={editForm.annotations}
                      onChange={handleEditAnnotationsChange}
                      editable
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 text-xs">
                    No image
                  </div>
                )}
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditPhotoChange}
                  className="mt-2 text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                />
                <p className="mt-1 text-xs text-slate-400">Uploading a new photo will clear existing marks on the old one.</p>
              </div>
            </div>

            <footer className="bg-slate-50 p-4 border-t border-slate-200 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={closeEditModal}
                disabled={isSavingEdit}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:bg-slate-400"
              >
                {isSavingEdit && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                )}
                Save Changes
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingCase && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => !isDeleting && setDeletingCase(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.492-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Delete Case Report?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              This will permanently delete "<span className="font-medium">{deletingCase.caseName}</span>". This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingCase(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-slate-400"
              >
                {isDeleting && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectCasesList;