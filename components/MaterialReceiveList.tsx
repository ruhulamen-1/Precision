import React, { useState, useMemo, useRef, useEffect } from "react";
import { MaterialReceiveItem, User, Project } from "../types";
import _ from "lodash";
import FeedbackMessage from "./FeedbackMessage";
import { jsPDF } from "jspdf";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// MOCK DATA
const ALL_RECEIPTS: MaterialReceiveItem[] = [];

interface MaterialReceiveListProps {
  currentUser: User;
  projects: Project[];
}

const formatDateForPDF = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

const parseToIsoDate = (dateStr: string): string => {
  if (!dateStr) return dateStr;
  
  // Handles: DD-MM-YY, DD-MMM-YY, YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr; 

  const day = parts[0];
  const monthPart = parts[1];
  const yearPart = parts[2].length === 4 ? parts[2] : '20' + parts[2]; 

  let month: string;
  const months: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  if (isNaN(parseInt(monthPart))) {
    month = months[monthPart.toLowerCase()] || '01';
  } else {
    month = monthPart.padStart(2, '0');
  }

  return `${yearPart}-${month}-${day.padStart(2, '0')}`;
};

const displayFormattedDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "null" || dateStr === "-") return "-";
  
  const date = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  if (isNaN(date.getTime())) return dateStr;

  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = String(date.getFullYear()).slice(-2);
  
  return `${day}-${month.toLowerCase()}-${year}`; // DD-mmm-YY
};

// Entry Date column: DD-MMM-YYYY (full year) + time, e.g. "27-Aug-2026 02:30 PM"
const displayFormattedEntryDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "null" || dateStr === "-") return "-";

  const date = new Date(dateStr.includes("T") || dateStr.includes(" ") ? dateStr : `${dateStr}T00:00:00`);
  if (isNaN(date.getTime())) return dateStr;

  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  return `${day}-${month}-${year} ${time}`; // DD-Mmm-YYYY hh:mm AM/PM
};

const PRESENCE_OPTIONS = ["Present", "Absent"];

const CAMERA_LOCATION_OPTIONS = [
  "Camera Working Fine",
  "Missing - Electricity Issue",
  "Missing - Network Issue",
  "Not Installed Yet",
  "Handover Project (Camera Already Disconnected)",
  "Faulty / Under Repair",
  "Storage Full or Damaged",
  "Angle Not Covering Area",
  "Other",
];

const MaterialReceiveList: React.FC<MaterialReceiveListProps> = ({
  currentUser,
  projects,
}) => {
  const [receipts, setReceipts] = useState<MaterialReceiveItem[]>(ALL_RECEIPTS);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entryStartDate, setEntryStartDate] = useState("");
  const [entryEndDate, setEntryEndDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState({
    projectName: "",
    mrf: "",
    supplierName: "",
    materialName: "",
    quantity: "",
    unit: "",
    receivingDate: "",
    receivingTime: "",
    vehicle: "",
    receivedBy: "",
    entryDate: "",
    status: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<MaterialReceiveItem | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [auditFormData, setAuditFormData] = useState({
    presenceMeApa: "",
    sgPresence: "",
    cameraLocation: "",
    auditRemarks: "",
    auditBy: "",
  });
  const isSuperAdminOrAdmin = currentUser.role === 'super_admin' || currentUser.role === 'admin';
  const [showFilters, setShowFilters] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [isAuditSectionOpen, setIsAuditSectionOpen] = useState(false);

  // ── WhatsApp Import state ──────────────────────────────────────────────────
  const [showWAImport, setShowWAImport] = useState(false);
  const [waRawText, setWaRawText] = useState('');
  const [waParsed, setWaParsed] = useState<MaterialReceiveItem[]>([]);
  const [waStep, setWaStep] = useState<'input' | 'review'>('input');
  const [waSaving, setWaSaving] = useState(false);

  const parseWhatsAppText = (text: string): MaterialReceiveItem[] => {
    const results: MaterialReceiveItem[] = [];

    // ── helpers ──────────────────────────────────────────────────────────────
    const normalizeKey = (k: string) =>
      k.toLowerCase()
        .replace(/[\u0980-\u09FF]+/g, '')   // strip Bengali chars from key
        .replace(/[:\-\.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const classify = (nk: string): string => {
      if (/project/.test(nk)) return 'project';
      if (/receiving\s*date|^date$/.test(nk)) return 'date';
      if (/receiving\s*time|in\s*time|^time$/.test(nk)) return 'time';
      if (/mpr|mrf/.test(nk)) return 'mpr';
      if (/supplier|suplayer/.test(nk)) return 'supplier';
      if (/material/.test(nk)) return 'material';
      if (/quantity|^qty$/.test(nk)) return 'qty';
      if (/truck|vehicle/.test(nk)) return 'truck';
      if (/received\s*by/.test(nk)) return 'receivedby';
      return '';
    };

    const parseDate = (raw: string): string => {
      if (!raw) return '';
      const token = raw.trim().split(/\s/)[0];
      const clean = token.replace(/\./g, '-').replace(/\//g, '-');
      const parts = clean.split('-');
      if (parts.length !== 3) return '';
      const [d, m, y] = parts;
      if (!d || !m || !y) return '';
      const year = y.length <= 2 ? '20' + y.padStart(2,'0') : y;
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    };

    const parseTime = (raw: string): string => {
      // Normalize dot-separator: "11.05" → "11:05" (only if it looks like HH.MM)
      const normalized = raw.replace(/^(\d{1,2})\.(\d{2})(\s*[aApP][mM])?$/, '$1:$2$3')
                            .replace(/(\d{1,2})\.(\d{2})(?=\s*(am|pm|to|$))/gi, '$1:$2');
      // Handle range "01:50 to 3:05 am" → take last time token
      const allTimes = [...normalized.matchAll(/(\d{1,2}:\d{2})(\s*[aApP][mM])?/g)];
      if (!allTimes.length) return raw.trim();
      const last = allTimes[allTimes.length - 1];
      const hm = last[1];
      const ampm = last[2] ? last[2].trim().toLowerCase() : '';
      const [h, min] = hm.split(':');
      return `${h.padStart(2,'0')}:${min}${ampm}`;
    };

    const isPending = (val: string): boolean =>
      !val || /^(pending|-)$|^\s*$/.test(val.toLowerCase().trim());

    const parseQty = (val: string) => {
      const trimmed = val.trim();
      if (!/\d/.test(trimmed)) return { qty: 1, unit: 'Lot' };
      const m = trimmed.match(/^([\d,]+\.?\d*)\s*([a-zA-Z"\/\s%]{0,10})?/);
      if (m) return { qty: parseFloat(m[1].replace(/,/g, '')), unit: (m[2] || '').trim().toUpperCase() };
      return { qty: 1, unit: 'Lot' };
    };

    // Extract qty+unit from patterns like "Name = 14 Nos", "Name - 520 sft", "Name 520 sft"
    const extractInlineQty = (raw: string): { name: string; qty: number; unit: string } => {
      const eqMatch = raw.match(/^(.+?)\s*[=\-]\s*([\d,\.]+)\s*([a-zA-Z"\/]{1,10})\s*$/);
      if (eqMatch) {
        const p = parseQty(eqMatch[2] + ' ' + eqMatch[3]);
        return { name: eqMatch[1].trim(), qty: p.qty, unit: p.unit };
      }
      const endMatch = raw.match(/^(.+?)\s+([\d,\.]+)\s*([a-zA-Z"\/]{1,10})\s*$/);
      if (endMatch) {
        const p = parseQty(endMatch[2] + ' ' + endMatch[3]);
        return { name: endMatch[1].trim(), qty: p.qty, unit: p.unit };
      }
      return { name: raw.trim(), qty: 0, unit: '' };
    };

    const cleanReceivedBy = (val: string) =>
      val.replace(/\s*\(.*?\)\s*$/, '').replace(/\.$/, '').trim();

    // ── split into blocks by "Project:" keyword ───────────────────────────────
    // Works even when there are no blank lines between entries
    // Strip correction/edit prefixes before splitting
    const cleanedText = text
      .replace(/^(Correction[s]?[\.…]*|Edited[:\s]*|Correction entry[:\s]*)[\s\n]*/gim, '');

    const blockTexts = cleanedText
      .split(/(?=^Project\s*:)/im)
      .map(b => b.trim())
      .filter(b => b.length > 0);

    blockTexts.forEach((block, i) => {
      const lines = block
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^[-–—]+$/.test(l));

      const rec: any = { project: '', date: '', time: '', mpr: '', supplier: '', materials: [], truck: '', receivedby: '' };
      let lastField = '';
      let inMaterialSection = false;  // true after "Material Name :" with empty value

      // ── Pre-pass: fix "Truck No\n2357" → merge value onto key line ────────────
      const mergedLines: string[] = [];
      for (let li = 0; li < lines.length; li++) {
        const cur = lines[li];
        const nxt = lines[li + 1] || '';
        // If current line is ONLY a known field name with no value (no colon or empty after colon)
        // and next line has no colon (so it's likely the value)
        const truckOnlyKey = /^(track|truck)\s*[Nn]o\.?\s*$/i.test(cur.replace(/:/,'').trim());
        if (truckOnlyKey && nxt && !nxt.includes(':')) {
          mergedLines.push('Truck No: ' + nxt.trim());
          li++; // skip next line
        } else {
          mergedLines.push(cur);
        }
      }

      mergedLines.forEach(line => {
        // Normalize: "Truck No." → "Truck No:" so colon-split works
        const normalizedLine = line.replace(/^(Track|Truck)\s*[Nn]o\.\s*/i, 'Truck No: ');
        const colonIdx = normalizedLine.indexOf(':');

        if (colonIdx > 0) {
          const rawKey = normalizedLine.substring(0, colonIdx).trim();
          const val    = normalizedLine.substring(colonIdx + 1).trim();
          const field  = classify(normalizeKey(rawKey));

          if (field) {
            // ── Pattern ⑥: repeated "Material Name:" field in same block ──────
            // When we see a second material field, close inMaterialSection first
            if (field !== 'material' && field !== 'qty') inMaterialSection = false;
            lastField = field;

            switch (field) {
              case 'project':    rec.project  = val; break;
              case 'date':       rec.date     = parseDate(val); break;
              case 'time':       rec.time     = parseTime(val); break;
              case 'mpr': {
                // ── Pattern ④: comma-separated MPR "64607,64656" → keep all as string
                const mprVal = isPending(val) ? 'PENDING' : val.replace(/[()]/g, '').trim();
                rec.mpr = mprVal;
                break;
              }
              case 'supplier':   rec.supplier = val; break;
              case 'material':
                if (val) {
                  const parsed = extractInlineQty(val);
                  rec.materials.push(parsed);
                  lastField = 'material';
                  inMaterialSection = true;
                } else {
                  inMaterialSection = true;
                }
                break;
              case 'qty': {
                const p = parseQty(val);
                if (rec.materials.length > 0) {
                  const last = rec.materials[rec.materials.length - 1];
                  if (!last.qty) { last.qty = p.qty; last.unit = last.unit || p.unit; }
                } else {
                  rec.materials.push({ name: '', qty: p.qty, unit: p.unit });
                }
                break;
              }
              case 'truck': {
                // Strip leading junk: ":-A-lot" → "A-lot", "-A-lot" → "A-lot"
                const tv = val.replace(/[()]/g, '').replace(/^[:\-\s]+/, '').trim();
                const naMatch = tv.match(/[Nn]\/[Aa]\s*(.+)?/);
                if (naMatch) {
                  rec.truck = naMatch[1] ? naMatch[1].trim() : 'N/A';
                } else {
                  rec.truck = tv || 'N/A';
                }
                inMaterialSection = false;
                break;
              }
              case 'receivedby':
                rec.receivedby = cleanReceivedBy(val);
                inMaterialSection = false;
                break;
            }
          } else if (inMaterialSection) {
            const matItemMatch = normalizedLine.match(/^\d+[.)\s]+(.+)/);
            if (matItemMatch) {
              const raw = matItemMatch[1];
              const inlineQty = raw.match(/[Qq]ty\s*[:\-]?\s*([\d,\.]+)\s*([a-zA-Z"\/\s]{0,10})/);
              let qty = 0, unit = '';
              if (inlineQty) { const p = parseQty(inlineQty[1] + ' ' + inlineQty[2]); qty = p.qty; unit = p.unit; }
              const name = raw.split(/[Qq]ty/)[0].split(/[=\-]\s*[\d]/)[0].replace(/[,.\s]+$/, '').trim();
              rec.materials.push({ name, qty, unit });
            }
          }
        } else {
          // No colon in line
          const matItemMatch = normalizedLine.match(/^\d+[.)\s]+(.+)/);
          if (matItemMatch && (inMaterialSection || lastField === 'material')) {
            // Numbered item → always a new material row
            const raw = matItemMatch[1];
            const parsed = extractInlineQty(raw);
            const qtyKw = raw.match(/[Qq]ty\s*[:\-=]?\s*([\d,\.]+)\s*([a-zA-Z"\/]{1,10})/);
            if (qtyKw && !parsed.qty) {
              const p = parseQty(qtyKw[1] + ' ' + qtyKw[2]);
              parsed.qty = p.qty; parsed.unit = p.unit;
              parsed.name = raw.split(/[Qq]ty/)[0].replace(/[,=\s]+$/, '').trim();
            }
            rec.materials.push(parsed);
            inMaterialSection = true;
          } else if (inMaterialSection && normalizedLine && lastField === 'material') {
            // Un-numbered line after Material Name → could be:
            //   (a) continuation of previous material name: "Canvas\npipe - 3\"" → join
            //   (b) a new separate material item: "Flat number plate - 10 nos"
            // Heuristic: if there is exactly ONE material so far AND it has no qty yet
            // AND this line looks like a spec/continuation (no standalone qty pattern that
            // would imply a separate item was intended by the sender) → JOIN.
            const lastMat = rec.materials[rec.materials.length - 1];
            const looksLikeQtyLine = /^\d/.test(normalizedLine); // starts with digit → separate item
            if (lastMat && !lastMat.qty && !looksLikeQtyLine) {
              // Try to extract qty from this continuation line
              const cont = extractInlineQty(normalizedLine);
              if (cont.qty) {
                // e.g. "pipe - 3\"" has no numeric qty → but "pipe - 3\" 200 Rft" would
                // Append spec to name, take qty
                lastMat.name = lastMat.name + ' ' + cont.name;
                lastMat.qty  = cont.qty;
                lastMat.unit = cont.unit;
              } else {
                // Pure name continuation: "Canvas" + "pipe - 3\"" → "Canvas pipe - 3\""
                lastMat.name = lastMat.name + ' ' + normalizedLine;
              }
            } else {
              // Separate material item
              const parsed = extractInlineQty(normalizedLine);
              if (parsed.name) rec.materials.push(parsed);
            }
          }
        }
      });

      if (!rec.project) return;

      // Produce one row per material item; if none detected, push a single blank-material row
      const materialList = rec.materials.length > 0 ? rec.materials : [{ name: '', qty: 0, unit: '' }];

      materialList.forEach((mat: any, mi: number) => {
        results.push({
          id: Date.now() + i * 100 + mi,
          mrf:           rec.mpr       || 'PENDING',
          projectName:   rec.project,
          supplierName:  rec.supplier  || '',
          materialName:  mat.name      || '',
          quantity:      mat.qty       || 0,
          unit:          mat.unit      || 'N/A',
          vehicle:       rec.truck     || 'N/A',
          vehicleNumber: rec.truck     || undefined,
          receivedBy:    rec.receivedby || '',
          receivingDate: rec.date      || '',
          receivingTime: rec.time      || '',
          entryDate:     new Date().toISOString(),
        });
      });
    });

    return results;
  };

  const handleWAParse = () => {
    const parsed = parseWhatsAppText(waRawText);
    if (!parsed.length) {
      setFeedback({ message: 'কোনো data parse করা যায়নি। Format check করুন।', type: 'error' });
      return;
    }
    setWaParsed(parsed);
    setWaStep('review');
  };

  const handleWASave = () => {
    if (!waParsed.length) return;
    setWaSaving(true);
    fetch('/api/material-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(waParsed),
    })
      .then(res => { if (!res.ok) throw new Error('Save failed'); return res.json(); })
      .then(() => {
        setReceipts(prev => [...waParsed, ...prev]);
        setFeedback({ message: `✓ ${waParsed.length}টি entry সফলভাবে import হয়েছে!`, type: 'success' });
        setShowWAImport(false);
        setWaRawText('');
        setWaParsed([]);
        setWaStep('input');
      })
      .catch(() => setFeedback({ message: 'Server-এ save করতে ব্যর্থ হয়েছে।', type: 'error' }))
      .finally(() => setWaSaving(false));
  };

  const closeWAImport = () => {
    setShowWAImport(false);
    setWaRawText('');
    setWaParsed([]);
    setWaStep('input');
  };
  // ── end WhatsApp Import ────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/material-receipts')
      .then(res => res.json())
      .then(data => {
        const mappedData = data.map((item: any) => ({
          id: item.id,
          mrf: item.mrf,
          projectName: item.project_name,
          supplierName: item.supplier_name,
          materialName: item.material_name,
          quantity: item.quantity,
          unit: item.unit,
          vehicle: "N/A", // Not in DB schema
          receivedBy: item.received_by,
          receivingDate: item.receiving_date,
          receivingTime: item.receiving_time,
          entryDate: item.entry_date,
          presenceMeApa: item.presence_me_apa,
          sgPresence: item.sg_presence,
          cameraLocation: item.camera_location,
          auditRemarks: item.audit_remarks,
          auditBy: item.audit_by
        }));
        setReceipts(mappedData);
      })
      .catch(err => console.error('Error fetching receipts', err));
  }, []);

  const projectNames = useMemo(
    () => _.uniq(projects.map((p) => p.name || "Unnamed")).sort(),
    [projects],
  );

  const startEditing = (receipt: MaterialReceiveItem) => {
    setSelectedReceipt(receipt);
    setEditForm({
      mrf: receipt.mrf || '',
      projectName: receipt.projectName || '',
      supplierName: receipt.supplierName || '',
      materialName: receipt.materialName || '',
      quantity: receipt.quantity ?? '',
      unit: receipt.unit || '',
      receivedBy: receipt.receivedBy || '',
      receivingDate: receipt.receivingDate || '',
      receivingTime: receipt.receivingTime || '',
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedReceipt(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (!selectedReceipt) return;
    fetch(`/api/material-receipts/${selectedReceipt.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    })
    .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.details || data?.error || 'Update failed');
        return data;
    })
    .then(() => {
        setReceipts(prev => prev.map(r => r.id === selectedReceipt.id ? { ...r, ...editForm } : r));
        closeEditModal();
        setFeedback({ message: 'Receipt updated', type: 'success' });
    })
    .catch(err => setFeedback({ message: `Failed to update: ${err.message}`, type: 'error' }));
  };

  const deleteReceipt = (id: number) => {
      if (!window.confirm('Are you sure you want to delete this receipt?')) return;
      fetch(`/api/material-receipts/${id}`, { method: 'DELETE' })
      .then(res => {
          if (!res.ok) throw new Error('Delete failed');
          return res.json();
      })
      .then(() => {
          setReceipts(prev => prev.filter(r => r.id !== id));
          setFeedback({ message: 'Receipt deleted', type: 'success' });
      })
      .catch(err => setFeedback({ message: 'Failed to delete', type: 'error' }));
  };

  const handleSaveAudit = () => {
    if (!selectedReceipt) return;
    fetch(`/api/material-receipts/${selectedReceipt.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auditFormData),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.details || data?.error || "Update failed");
        return data;
      })
      .then(() => {
        setReceipts((prev) =>
          prev.map((r) =>
            r.id === selectedReceipt.id ? { ...r, ...auditFormData } : r
          )
        );
        setShowDetailPanel(false);
        setFeedback({ message: "Audit saved successfully!", type: "success" });
      })
      .catch((err) =>
        setFeedback({ message: `Failed to save audit: ${err.message}`, type: "error" })
      );
  };

  const getHasAuditData = (receipt: MaterialReceiveItem) =>
    !!(
      (receipt.presenceMeApa && receipt.presenceMeApa.trim() !== "") ||
      (receipt.sgPresence && receipt.sgPresence.trim() !== "") ||
      (receipt.auditRemarks && receipt.auditRemarks.trim() !== "") ||
      (receipt.auditBy && receipt.auditBy.trim() !== "")
    );

  const filteredReceipts = useMemo(() => {
    // Split into individual words so extra/trailing spaces (or multi-word
    // queries) don't wipe out matches — every word just needs to appear
    // *somewhere* across the searchable fields, not all in one substring.
    const searchWords = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return receipts.filter((receipt) => {
      const startDateMatch = !startDate || receipt.receivingDate >= startDate;
      const endDateMatch = !endDate || receipt.receivingDate <= endDate;
      const entryDateOnly = receipt.entryDate ? String(receipt.entryDate).slice(0, 10) : "";
      const entryStartMatch = !entryStartDate || entryDateOnly >= entryStartDate;
      const entryEndMatch = !entryEndDate || entryDateOnly <= entryEndDate;
      const projectMatch =
        !projectFilter || receipt.projectName === projectFilter;

      const haystack = [
        receipt.projectName,
        receipt.mrf,
        receipt.supplierName,
        receipt.materialName,
        String(receipt.quantity),
        receipt.unit,
        receipt.vehicle,
        receipt.vehicleNumber || "",
        receipt.receivedBy,
        receipt.receivingDate,
        receipt.receivingTime,
        displayFormattedEntryDate(receipt.entryDate),
      ]
        .join(" ")
        .toLowerCase();

      const searchMatch =
        searchWords.length === 0 ||
        searchWords.every((word) => haystack.includes(word));

      if (!(startDateMatch && endDateMatch && entryStartMatch && entryEndMatch && projectMatch && searchMatch)) {
        return false;
      }

      const cf = columnFilters;
      const status = getHasAuditData(receipt) ? "checked" : "pending";
      // Match against both the raw value and the on-screen DD-Mmm-YYYY formatted
      // string, since that's what the user actually sees and types in the
      // column header search box.
      const entryDateStr = `${receipt.entryDate || ""} ${displayFormattedEntryDate(receipt.entryDate)}`.toLowerCase();
      const vehicleStr = `${receipt.vehicle} ${receipt.vehicleNumber || ""}`.toLowerCase();
      // Match against both the raw ISO date and the on-screen formatted date
      // (e.g. "15-aug-26"), since that's what the user actually sees and types.
      const receivingDateStr = `${receipt.receivingDate} ${displayFormattedDate(receipt.receivingDate)}`.toLowerCase();

      return (
        (!cf.projectName || receipt.projectName.toLowerCase().includes(cf.projectName.toLowerCase())) &&
        (!cf.mrf || receipt.mrf.toLowerCase().includes(cf.mrf.toLowerCase())) &&
        (!cf.supplierName || receipt.supplierName.toLowerCase().includes(cf.supplierName.toLowerCase())) &&
        (!cf.materialName || receipt.materialName.toLowerCase().includes(cf.materialName.toLowerCase())) &&
        (!cf.quantity || String(receipt.quantity).includes(cf.quantity)) &&
        (!cf.unit || receipt.unit.toLowerCase().includes(cf.unit.toLowerCase())) &&
        (!cf.receivingDate || receivingDateStr.includes(cf.receivingDate.toLowerCase())) &&
        (!cf.receivingTime || receipt.receivingTime.toLowerCase().includes(cf.receivingTime.toLowerCase())) &&
        (!cf.vehicle || vehicleStr.includes(cf.vehicle.toLowerCase())) &&
        (!cf.receivedBy || receipt.receivedBy.toLowerCase().includes(cf.receivedBy.toLowerCase())) &&
        (!cf.entryDate || entryDateStr.includes(cf.entryDate.toLowerCase())) &&
        (!cf.status || cf.status === status)
      );
    });
  }, [receipts, startDate, endDate, entryStartDate, entryEndDate, projectFilter, searchQuery, columnFilters]);

  // Reset to page 1 whenever the filtered set changes
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, entryStartDate, entryEndDate, projectFilter, searchQuery, columnFilters]);

  const paginatedReceipts = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredReceipts.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredReceipts, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredReceipts.length / rowsPerPage) || 1;

  const handleDownloadTemplate = () => {
    const headers = [
      "Project Name",
      "MRF No",
      "Supplier Name",
      "Material Name",
      "Quantity",
      "Unit",
      "Receiving Date",
      "Receiving Time",
      "Received By",
    ];
    const exampleData = [
      [
        "Lake Lofts",
        "MRF-101",
        "Local Supplier Inc.",
        "Sand",
        10,
        "CFT",
        "2024-09-01",
        "11:00",
        "Ruhul Amen",
      ],
      [
        "Gladiolus",
        "MRF-102",
        "Major Cement Co.",
        "Portland Cement",
        500,
        "Bags",
        "2024-09-02",
        "14:30",
        "Admin User",
      ],
    ];
    const csv = Papa.unparse({ fields: headers, data: exampleData });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "material_receipt_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback({
      message: "Template downloaded successfully!",
      type: "success",
    });
  };

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
        const requiredHeaders = [
          "Project Name",
          "MRF No",
          "Supplier Name",
          "Material Name",
          "Quantity",
          "Unit",
          "Receiving Date",
          "Receiving Time",
          "Received By",
        ];
        const headers = results.meta.fields;

        if (!requiredHeaders.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              "CSV is missing required headers. Please use the template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const newReceipts: MaterialReceiveItem[] = [];
        let errorOccurred = false;
        const projectNamesSet = new Set(projects.map((p) => p.name));

        for (const [index, row] of results.data.entries()) {
          if (errorOccurred) break;
          if (!requiredHeaders.every((h) => row[h] && String(row[h]).trim())) {
            setFeedback({
              message: `Row ${index + 2}: Missing data for a required field.`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }
          if (!projectNamesSet.has(row["Project Name"])) {
            setFeedback({
              message: `Row ${index + 2}: Project "${row["Project Name"]}" does not exist.`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }
          if (isNaN(parseFloat(row["Quantity"]))) {
            setFeedback({
              message: `Row ${index + 2}: Quantity "${row["Quantity"]}" is not a valid number.`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }

          newReceipts.push({
            id: Date.now() + index,
            mrf: row["MRF No"],
            projectName: row["Project Name"],
            supplierName: row["Supplier Name"],
            materialName: row["Material Name"],
            quantity: parseFloat(row.Quantity),
            unit: row.Unit,
            vehicle: "N/A",
            vehicleNumber: undefined,
            receivedBy: row["Received By"],
            receivingDate: parseToIsoDate(row["Receiving Date"]), // Assumes YYYY-MM-DD or DD-MM-YY or DD-MMM-YY
            receivingTime: row["Receiving Time"], // Assumes HH:MM
            entryDate: new Date().toISOString(),
          });
        }

        if (!errorOccurred) {
          fetch('/api/material-receipts', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(newReceipts)
          })
          .then(res => {
              if (!res.ok) throw new Error('Failed to save');
              return res.json();
          })
          .then(data => {
            setReceipts((prev) => [...prev, ...newReceipts]);
            setFeedback({
              message: `Successfully imported ${newReceipts.length} records.`,
              type: "success",
            });
          })
          .catch(err => {
              setFeedback({ message: 'Error saving to server', type: 'error'});
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

  const handleDownloadCSV = () => {
    const headers = [
      "Project Name",
      "MRF NO",
      "Supplier Name",
      "Material Name",
      "Quantity",
      "Unit",
      "Receiving Date",
      "Receiving Time",
      "Vehicle",
      "Received By",
      "Entry Date",
      "Presence ME/APA",
      "SG Presence",
      "Camera Location",
      "Audit Remarks",
      "Audit By",
    ];

    const rows = filteredReceipts.map((r) => {
      const entryDateFormatted = displayFormattedEntryDate(r.entryDate);
      const vehicleInfo = `${r.vehicle}${r.vehicleNumber ? ` (${r.vehicleNumber})` : ""}`;

      return [
        `"${r.projectName}"`,
        `"${r.mrf}"`,
        `"${r.supplierName}"`,
        `"${r.materialName}"`,
        r.quantity,
        `"${r.unit}"`,
        `"${r.receivingDate}"`,
        `"${r.receivingTime}"`,
        `"${vehicleInfo}"`,
        `"${r.receivedBy}"`,
        `"${entryDateFormatted}"`,
        `"${r.presenceMeApa || ""}"`,
        `"${r.sgPresence || ""}"`,
        `"${r.cameraLocation || ""}"`,
        `"${r.auditRemarks || ""}"`,
        `"${r.auditBy || ""}"`,
      ].join(",");
    });

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `material-receipts-report-${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Header
    const headerStartY = 15;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(234, 88, 12);
    doc.setDrawColor(234, 88, 12);
    const smallFontSize = 11; // Corresponds to 'recision'
    const largeFontSize = 14.7; // Corresponds to 'P'
    const sloganFontSize = 4.3;
    doc.setFontSize(largeFontSize);
    doc.setLineWidth(0.25);
    const largeP_X = margin;
    doc.text("P", largeP_X, headerStartY, { renderingMode: "fillThenStroke" });
    const largePWidth = doc.getTextWidth("P");
    doc.setFontSize(smallFontSize);
    doc.setLineWidth(0.15);
    const restOfName = "RECISION";
    doc.text(restOfName, largeP_X + largePWidth, headerStartY, {
      renderingMode: "fillThenStroke",
    });
    const restOfNameWidth = doc.getTextWidth(restOfName);
    const totalNameWidth = largePWidth + restOfNameWidth;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(sloganFontSize);
    doc.setTextColor(150);
    const sloganText = "Eyes on Every Site";
    const sloganWidth = doc.getTextWidth(sloganText);
    const sloganX = largeP_X + totalNameWidth / 2 - sloganWidth / 2; // Center slogan
    const sloganY = headerStartY + 2;
    doc.text(sloganText, sloganX, sloganY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text("Credence Housing Limited", pageWidth / 2, headerStartY, {
      align: "center",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
      pageWidth / 2,
      headerStartY + 6,
      { align: "center" },
    );
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(margin, 28, pageWidth - margin, 28);
    const contentStartY = 35;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    doc.text("Material Receive Report", pageWidth / 2, contentStartY, {
      align: "center",
    });
    const preparingDateStr = `Preparing Date: ${formatDateForPDF(new Date())}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(preparingDateStr, pageWidth - margin, contentStartY, {
      align: "right",
    });
    doc.setFontSize(10);
    doc.setTextColor(100);
    const start = startDate
      ? formatDateForPDF(new Date(startDate + "T00:00:00"))
      : "N/A";
    const end = endDate
      ? formatDateForPDF(new Date(endDate + "T00:00:00"))
      : "N/A";
    let filterInfo = `Receiving Date: ${start} to ${end} | Project: ${projectFilter || "All"} | Search: ${searchQuery || "None"}`;
    if (entryStartDate || entryEndDate) {
      const entryStart = entryStartDate ? formatDateForPDF(new Date(entryStartDate + "T00:00:00")) : "N/A";
      const entryEnd = entryEndDate ? formatDateForPDF(new Date(entryEndDate + "T00:00:00")) : "N/A";
      filterInfo += ` | Entry Date: ${entryStart} to ${entryEnd}`;
    }
    doc.text(filterInfo, pageWidth / 2, contentStartY + 8, { align: "center" });

    // Voucher slips — one card per receipt instead of a flat table
    const cardsPerRow = 3;
    const gapX = 6;
    const gapY = 6;
    const cardWidth = (pageWidth - 2 * margin - (cardsPerRow - 1) * gapX) / cardsPerRow;
    const cardHeight = 40;
    const bottomLimit = pageHeight - 26;

    const drawVoucherCard = (x: number, y: number, r: (typeof filteredReceipts)[number]) => {
      const hasAudit = !!(
        (r.presenceMeApa && r.presenceMeApa.trim() !== "") ||
        (r.sgPresence && r.sgPresence.trim() !== "") ||
        (r.auditRemarks && r.auditRemarks.trim() !== "") ||
        (r.auditBy && r.auditBy.trim() !== "")
      );
      const vehicleInfo = `${r.vehicle}${r.vehicleNumber ? ` (${r.vehicleNumber})` : ""}`;
      const pad = 3;

      // dashed card border
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      (doc as any).setLineDash([1, 1], 0);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "S");
      (doc as any).setLineDash([], 0);

      // voucher no. + date
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(150);
      doc.text(`Voucher #${r.mrf}`, x + pad, y + pad + 2);
      doc.text(displayFormattedDate(r.receivingDate), x + cardWidth - pad, y + pad + 2, { align: "right" });

      // material name + qty
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(40);
      const materialLine = doc.splitTextToSize(r.materialName, cardWidth - pad * 2)[0] || r.materialName;
      doc.text(materialLine, x + pad, y + pad + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90);
      doc.text(`${r.quantity} ${r.unit}`, x + pad, y + pad + 13);

      // project + supplier
      doc.setFontSize(6.5);
      doc.setTextColor(120);
      const subLine = doc.splitTextToSize(`${r.projectName} | ${r.supplierName}`, cardWidth - pad * 2)[0] || "";
      doc.text(subLine, x + pad, y + pad + 18);
      const vehicleLine = doc.splitTextToSize(`Vehicle: ${vehicleInfo}`, cardWidth - pad * 2)[0] || "";
      doc.text(vehicleLine, x + pad, y + pad + 22);

      // dashed divider
      doc.setDrawColor(220);
      (doc as any).setLineDash([1, 1], 0);
      doc.line(x + pad, y + cardHeight - 10, x + cardWidth - pad, y + cardHeight - 10);
      (doc as any).setLineDash([], 0);

      // received by (bottom left)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(120);
      const receivedLine = doc.splitTextToSize(`By ${r.receivedBy}`, cardWidth * 0.55)[0] || "";
      doc.text(receivedLine, x + pad, y + cardHeight - 4);

      // status badge (bottom right)
      const statusLabel = hasAudit ? `Checked${r.auditBy ? " - " + r.auditBy : ""}` : "Pending";
      doc.setFontSize(6.5);
      const badgeText = doc.splitTextToSize(statusLabel, cardWidth * 0.5)[0] || statusLabel;
      const badgeWidth = doc.getTextWidth(badgeText) + 4;
      const badgeX = x + cardWidth - pad - badgeWidth;
      const badgeY = y + cardHeight - 8;
      if (hasAudit) {
        doc.setFillColor(220, 245, 230);
        doc.setTextColor(20, 120, 70);
      } else {
        doc.setFillColor(255, 240, 210);
        doc.setTextColor(160, 110, 10);
      }
      doc.roundedRect(badgeX, badgeY, badgeWidth, 5, 1, 1, "F");
      doc.text(badgeText, badgeX + badgeWidth / 2, badgeY + 3.5, { align: "center" });
    };

    let cardX = margin;
    let cardY = contentStartY + 14;
    let col = 0;

    filteredReceipts.forEach((r) => {
      if (cardY + cardHeight > bottomLimit) {
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.text("Material Receive Report (contd.)", margin, 15);
        cardY = 25;
        cardX = margin;
        col = 0;
      }

      drawVoucherCard(cardX, cardY, r);

      col++;
      if (col >= cardsPerRow) {
        col = 0;
        cardX = margin;
        cardY += cardHeight + gapY;
      } else {
        cardX += cardWidth + gapX;
      }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150);
      const preparedByStr = `Prepared by\n${currentUser.name}\n${currentUser.designation}`;
      doc.text(preparedByStr, margin, pageHeight - 20);
      doc.text("Dept. HOD", pageWidth / 2, pageHeight - 10, {
        align: "center",
      });
      const pageStr = `Page ${i} of ${pageCount}`;
      doc.text(pageStr, pageWidth - margin, pageHeight - 10, {
        align: "right",
      });
    }

    doc.save(
      `material-receipts-report-${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  return (
    <>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="bg-white/40 backdrop-blur-md p-6 rounded-xl border border-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800">
              Filter Material Receipts
            </h2>
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label
                htmlFor="start-date-filter"
                className="block text-sm font-medium text-slate-700"
              >
                Receiving Start Date
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
                Receiving End Date
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
                htmlFor="entry-start-date-filter"
                className="block text-sm font-medium text-slate-700"
              >
                Entry Start Date
              </label>
              <input
                type="date"
                id="entry-start-date-filter"
                value={entryStartDate}
                onChange={(e) => setEntryStartDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label
                htmlFor="entry-end-date-filter"
                className="block text-sm font-medium text-slate-700"
              >
                Entry End Date
              </label>
              <input
                type="date"
                id="entry-end-date-filter"
                value={entryEndDate}
                onChange={(e) => setEntryEndDate(e.target.value)}
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
                htmlFor="search-filter"
                className="block text-sm font-medium text-slate-700"
              >
                Search
              </label>
              <input
                type="text"
                id="search-filter"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all fields..."
                className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-800">
              Receipts ({filteredReceipts.length})
            </h2>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {/* ── WhatsApp Import Button ── */}
              <button
                onClick={() => { setShowWAImport(true); setWaStep('input'); }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-green-500 text-sm font-medium rounded-md shadow-sm text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp Import
              </button>
              <label
                htmlFor="csv-upload"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
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
                Import (CSV)
              </label>
              <input
                id="csv-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="sr-only"
                accept=".csv"
              />
              <button
                onClick={handleDownloadTemplate}
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
              <button
                onClick={handleDownloadCSV}
                disabled={filteredReceipts.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                aria-label="Download report as CSV"
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
                Export Excel (CSV)
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={filteredReceipts.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
                aria-label="Download report as PDF"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                    clipRule="evenodd"
                  />
                </svg>
                Export PDF
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6 py-3 border-b border-slate-200 text-sm text-slate-600">
            <div>
              Page {currentPage} of {totalPages} ({filteredReceipts.length} Records)
            </div>
            <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-b-xl">
              <table className="w-full table-fixed text-xs" style={{ borderCollapse: "separate", borderSpacing: "0 10px" }}>
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead className="bg-slate-50 sticky top-0 z-20">
                  <tr>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Project Name
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      MRF NO
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Supplier Name
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Material
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Qty
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Unit
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Receiving Date
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Time
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Vehicle
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Received By
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Entry Date
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider truncate"
                    >
                      Actions
                    </th>
                  </tr>
                  <tr className="bg-slate-50 border-t border-slate-100">
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.projectName} onChange={(e) => setColumnFilters({ ...columnFilters, projectName: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.mrf} onChange={(e) => setColumnFilters({ ...columnFilters, mrf: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.supplierName} onChange={(e) => setColumnFilters({ ...columnFilters, supplierName: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.materialName} onChange={(e) => setColumnFilters({ ...columnFilters, materialName: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.quantity} onChange={(e) => setColumnFilters({ ...columnFilters, quantity: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400 text-right" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.unit} onChange={(e) => setColumnFilters({ ...columnFilters, unit: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.receivingDate} onChange={(e) => setColumnFilters({ ...columnFilters, receivingDate: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.receivingTime} onChange={(e) => setColumnFilters({ ...columnFilters, receivingTime: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.vehicle} onChange={(e) => setColumnFilters({ ...columnFilters, vehicle: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.receivedBy} onChange={(e) => setColumnFilters({ ...columnFilters, receivedBy: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <input type="text" value={columnFilters.entryDate} onChange={(e) => setColumnFilters({ ...columnFilters, entryDate: e.target.value })} placeholder="Search..." className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400" />
                    </th>
                    <th className="px-2 py-1.5">
                      <select value={columnFilters.status} onChange={(e) => setColumnFilters({ ...columnFilters, status: e.target.value })} className="w-full px-1 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-400">
                        <option value="">All</option>
                        <option value="checked">Checked</option>
                        <option value="pending">Pending</option>
                      </select>
                    </th>
                    <th className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setColumnFilters({ projectName: "", mrf: "", supplierName: "", materialName: "", quantity: "", unit: "", receivingDate: "", receivingTime: "", vehicle: "", receivedBy: "", entryDate: "", status: "" })}
                        className="text-xs font-semibold text-orange-600 hover:text-orange-800 whitespace-nowrap"
                      >
                        Clear
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-transparent">
                  {filteredReceipts.length === 0 && (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-slate-500">
                        No receipts found matching your criteria.
                      </td>
                    </tr>
                  )}
                  {paginatedReceipts.map((receipt) => {
                    const hasAuditData = getHasAuditData(receipt);
                    const cellBase = "py-3 px-2 text-sm border-t border-b border-dashed border-slate-300 bg-white group-hover:bg-orange-50/40 transition-colors truncate";
                    return (
                      <React.Fragment key={receipt.id}>
                      <tr
                        className="group cursor-pointer"
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setAuditFormData({
                            presenceMeApa: receipt.presenceMeApa || "",
                            sgPresence: receipt.sgPresence || "",
                            cameraLocation: receipt.cameraLocation || "",
                            auditRemarks: receipt.auditRemarks || "",
                            auditBy: receipt.auditBy || currentUser.name || "",
                          });
                          setIsAuditSectionOpen(false);
                          setShowDetailPanel(true);
                        }}
                      >
                        <td className={`${cellBase} pl-3 border-l rounded-l-lg font-semibold text-slate-900`} title={receipt.projectName}>
                          {hasAuditData && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1" title="Audit filled" />
                          )}
                          {receipt.projectName}
                        </td>
                        <td className={`${cellBase} font-mono text-[11px] text-slate-400`} title={receipt.mrf}>
                          #{receipt.mrf}
                        </td>
                        <td className={`${cellBase} text-slate-500`} title={receipt.supplierName}>
                          {receipt.supplierName}
                        </td>
                        <td className={`${cellBase} font-semibold text-slate-800`} title={receipt.materialName}>
                          {receipt.materialName}
                        </td>
                        <td className={`${cellBase} text-right font-semibold text-slate-800`}>
                          {receipt.quantity}
                        </td>
                        <td className={`${cellBase} text-slate-500`}>
                          {receipt.unit}
                        </td>
                        <td className={`${cellBase} text-slate-500`}>
                          {displayFormattedDate(receipt.receivingDate)}
                        </td>
                        <td className={`${cellBase} text-slate-500`}>
                          {receipt.receivingTime}
                        </td>
                        <td className={`${cellBase} text-slate-500`} title={`${receipt.vehicle}${receipt.vehicleNumber ? ` (${receipt.vehicleNumber})` : ""}`}>
                          {receipt.vehicle}
                          {receipt.vehicleNumber
                            ? ` (${receipt.vehicleNumber})`
                            : ""}
                        </td>
                        <td className={`${cellBase} text-slate-500`} title={receipt.receivedBy}>
                          {receipt.receivedBy}
                        </td>
                        <td className={`${cellBase} text-slate-500`}>
                          {displayFormattedEntryDate(receipt.entryDate)}
                        </td>
                        <td className={cellBase}>
                           <button
                             onClick={(e) => { e.stopPropagation(); setExpandedRowId(expandedRowId === receipt.id ? null : receipt.id); }}
                             className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${hasAuditData ? "text-green-700 bg-green-50 border-green-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}
                           >
                             {hasAuditData ? "Checked" : "Pending"}
                             <svg
                               xmlns="http://www.w3.org/2000/svg"
                               className={`h-3 w-3 transition-transform ${expandedRowId === receipt.id ? "rotate-180" : ""}`}
                               fill="none"
                               viewBox="0 0 24 24"
                               stroke="currentColor"
                             >
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                             </svg>
                           </button>
                        </td>
                        <td className={`${cellBase} pr-3 border-r rounded-r-lg text-slate-500`}>
                           <div className="flex items-center gap-2">
                             {isSuperAdminOrAdmin && <button onClick={(e) => { e.stopPropagation(); startEditing(receipt); }} className="text-orange-600 font-bold underline">Edit</button>}
                             {currentUser.role === 'super_admin' && <button onClick={(e) => { e.stopPropagation(); deleteReceipt(receipt.id); }} className="text-red-600 font-bold underline">Delete</button>}
                           </div>
                        </td>
                      </tr>
                      {expandedRowId === receipt.id && (
                        <tr>
                          <td colSpan={13} className="px-4 py-3 bg-slate-50/70 border border-dashed border-slate-300 rounded-lg">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                              <div>
                                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Presence ME/APA</p>
                                <p className="text-slate-700">{receipt.presenceMeApa || "-"}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">SG Presence</p>
                                <p className="text-slate-700">{receipt.sgPresence || "-"}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Camera Location</p>
                                <p className="text-slate-700">{receipt.cameraLocation || "-"}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Audit Remarks</p>
                                <p className="text-slate-700">{receipt.auditRemarks || "-"}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Audit By</p>
                                <p className="text-slate-700">{receipt.auditBy || "-"}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
          </div>
        </div>
      </div>
      {isEditModalOpen && selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Edit Receipt</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700">Project Name</label>
                <input value={editForm.projectName} onChange={e => setEditForm({...editForm, projectName: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">MRF No</label>
                <input value={editForm.mrf} onChange={e => setEditForm({...editForm, mrf: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Supplier Name</label>
                <input value={editForm.supplierName} onChange={e => setEditForm({...editForm, supplierName: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Material</label>
                <input value={editForm.materialName} onChange={e => setEditForm({...editForm, materialName: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Quantity</label>
                  <input type="number" value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Unit</label>
                  <input value={editForm.unit} onChange={e => setEditForm({...editForm, unit: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Received By</label>
                <input value={editForm.receivedBy} onChange={e => setEditForm({...editForm, receivedBy: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Receiving Date</label>
                <input type="date" value={editForm.receivingDate} onChange={e => setEditForm({...editForm, receivingDate: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Receiving Time</label>
                <input type="time" value={editForm.receivingTime} onChange={e => setEditForm({...editForm, receivingTime: e.target.value})} className="mt-1 block w-full border p-1.5 text-sm rounded" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeEditModal} className="px-4 py-2 border rounded text-gray-600">Cancel</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">Save</button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showDetailPanel && selectedReceipt && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowDetailPanel(false)}
            />
            {/* Centered Modal Container */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Entry Details</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{selectedReceipt.materialName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDetailPanel(false)}
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* SECTION 1 - Entry Information (read-only display) */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Entry Information</h4>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-3 p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Project Name</p>
                        <p className="text-sm font-medium text-slate-800">{selectedReceipt.projectName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">MRF No</p>
                        <p className="text-sm font-medium text-slate-800">{selectedReceipt.mrf}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Supplier Name</p>
                        <p className="text-sm font-medium text-slate-800">{selectedReceipt.supplierName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Material Name</p>
                        <p className="text-sm font-medium text-slate-800">{selectedReceipt.materialName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Quantity + Unit</p>
                        <p className="text-sm font-medium text-slate-800">{`${selectedReceipt.quantity} ${selectedReceipt.unit}`}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Receiving Date</p>
                        <p className="text-sm font-medium text-slate-800">{displayFormattedDate(selectedReceipt.receivingDate)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Receiving Time</p>
                        <p className="text-sm font-medium text-slate-800">{selectedReceipt.receivingTime}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Vehicle</p>
                        <p className="text-sm font-medium text-slate-800">
                          {`${selectedReceipt.vehicle}${selectedReceipt.vehicleNumber ? ` (${selectedReceipt.vehicleNumber})` : ""}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Received By</p>
                        <p className="text-sm font-medium text-slate-800">{selectedReceipt.receivedBy}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Entry Date</p>
                        <p className="text-sm font-medium text-slate-800">
                          {displayFormattedEntryDate(selectedReceipt.entryDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2 - Audit Information (collapsible, editable fields) */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsAuditSectionOpen((prev) => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Audit Information</h4>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isAuditSectionOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <AnimatePresence initial={false}>
                      {isAuditSectionOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Presence ME/APA
                              </label>
                              <select
                                value={auditFormData.presenceMeApa}
                                onChange={(e) => setAuditFormData({ ...auditFormData, presenceMeApa: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                              >
                                <option value="">Select...</option>
                                {PRESENCE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                SG Presence
                              </label>
                              <select
                                value={auditFormData.sgPresence}
                                onChange={(e) => setAuditFormData({ ...auditFormData, sgPresence: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                              >
                                <option value="">Select...</option>
                                {PRESENCE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Camera Location
                              </label>
                              <select
                                value={auditFormData.cameraLocation}
                                onChange={(e) => setAuditFormData({ ...auditFormData, cameraLocation: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                              >
                                <option value="">Select...</option>
                                {CAMERA_LOCATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Audit By
                              </label>
                              <input
                                type="text"
                                value={auditFormData.auditBy}
                                onChange={(e) => setAuditFormData({ ...auditFormData, auditBy: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Audit Remarks
                              </label>
                              <textarea
                                rows={2}
                                value={auditFormData.auditRemarks}
                                onChange={(e) => setAuditFormData({ ...auditFormData, auditRemarks: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 flex items-center gap-3 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setShowDetailPanel(false)}
                    className="flex-1 px-4 py-2 border border-slate-200 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAudit}
                    className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-sm font-medium text-white rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                  >
                    Save Audit
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      {/* ── WhatsApp Import Modal ───────────────────────────────────────────── */}
      {showWAImport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-green-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">WhatsApp Import</h3>
                  <p className="text-xs text-slate-500">
                    {waStep === 'input' ? 'WhatsApp-এর text paste করুন' : `${waParsed.length}টি entry পাওয়া গেছে — review করুন`}
                  </p>
                </div>
              </div>
              <button onClick={closeWAImport} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step indicator */}
            <div className="px-5 pt-4 flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${waStep === 'input' ? 'text-green-600' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${waStep === 'input' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
                Text Paste
              </div>
              <div className="flex-1 h-px bg-slate-200" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${waStep === 'review' ? 'text-green-600' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${waStep === 'review' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                Review & Save
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {waStep === 'input' ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    WhatsApp group থেকে material receive-এর text copy করে নিচে paste করুন। একাধিক entry একসাথে paste করতে পারবেন।
                  </p>
                  <textarea
                    value={waRawText}
                    onChange={e => setWaRawText(e.target.value)}
                    onPaste={e => {
                      const pasted = e.clipboardData.getData('text');
                      if (!pasted) return;
                      e.preventDefault();
                      const textarea = e.currentTarget;
                      // Auto-append a blank line after the pasted block so the
                      // next Ctrl+V starts on a fresh entry without needing Enter.
                      const insert = pasted.replace(/\s+$/, '') + '\n\n';
                      // execCommand keeps this in the browser's native undo (Ctrl+Z)
                      // history, unlike manually setting the React state directly.
                      document.execCommand('insertText', false, insert);
                      requestAnimationFrame(() => {
                        textarea.scrollTop = textarea.scrollHeight;
                      });
                    }}
                    rows={22}
                    placeholder={`Project: Doll house\nReceiving date: 20.05.26\nReceiving time: 04:20 am\nSupplier name: ABC Star International\nMaterial: Vity Sand\nQuantity: 200 cft\nMPR No: 108047\nTruck num: 0782\nReceived By: Mrinmoy Sarker`}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 resize-none text-slate-700 placeholder-slate-300"
                  />
                  <p className="text-xs text-slate-400">
                    💡 Project, Date, Time, MPR No, Supplier, Material, Quantity, Truck No, Received By — সব automatically detect হবে।
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">নিচের entries গুলো database-এ save হবে। কোনো ভুল থাকলে Cancel করে text ঠিক করুন।</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-[11px]">
                      <thead className="bg-slate-50">
                        <tr>
                          {['#', 'Project', 'Date', 'Time', 'MPR No', 'Supplier', 'Material', 'Qty', 'Unit', 'Truck', 'Received By'].map(h => (
                            <th key={h} className="px-2 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {waParsed.map((r, i) => {
                          const hasMissingFields = !r.projectName || !r.receivingDate || !r.materialName;
                          return (
                          <tr key={i} className={hasMissingFields ? "hover:bg-orange-50/30 bg-orange-50/20" : "hover:bg-green-50/30"}>
                            <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1.5 font-medium text-slate-800 whitespace-nowrap">
                              {r.projectName || <span className="text-red-400 text-[10px]">⚠ blank</span>}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                              {r.receivingDate ? displayFormattedDate(r.receivingDate) : <span className="text-orange-400 text-[10px]">⚠ blank</span>}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.receivingTime || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                              {r.mrf === 'PENDING'
                                ? <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">PENDING</span>
                                : r.mrf}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.supplierName || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-600 max-w-[120px] truncate" title={r.materialName}>
                              {r.materialName || <span className="text-orange-400 text-[10px]">⚠ blank</span>}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 text-right">{r.quantity || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-600">{r.unit || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.vehicle !== 'N/A' ? r.vehicle : '—'}</td>
                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.receivedBy || '—'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {(() => {
                    const warningCount = waParsed.filter(r => !r.projectName || !r.receivingDate || !r.materialName).length;
                    return (
                      <div className={`flex items-center gap-2 p-3 rounded-lg border ${warningCount > 0 ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 flex-shrink-0 ${warningCount > 0 ? 'text-orange-500' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className={`text-xs ${warningCount > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                          মোট <strong>{waParsed.length}টি</strong> entry import হবে।{warningCount > 0 && <> <strong className="text-orange-600">{warningCount}টি row-এ ⚠ চিহ্নিত field blank আছে</strong> — তবু save করা যাবে, পরে edit করা যাবে।</>} Save করার পরে list-এ দেখা যাবে।
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
              <button onClick={closeWAImport} className="px-4 py-2 border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {waStep === 'review' && (
                  <button
                    onClick={() => setWaStep('input')}
                    className="px-4 py-2 border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    ← পিছনে যান
                  </button>
                )}
                {waStep === 'input' ? (
                  <button
                    onClick={handleWAParse}
                    disabled={!waRawText.trim()}
                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-sm font-medium text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Parse করুন →
                  </button>
                ) : (
                  <button
                    onClick={handleWASave}
                    disabled={waSaving}
                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-sm font-medium text-white rounded-lg shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {waSaving ? (
                      <><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Saving...</>
                    ) : (
                      <>{waParsed.length}টি Entry Save করুন ✓</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── end WhatsApp Import Modal ──────────────────────────────────────── */}
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

export default MaterialReceiveList;