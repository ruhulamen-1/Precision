import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Mail, X, Send, FileText, ArrowLeft } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// html2canvas can't parse modern CSS color functions (oklch/oklab/lab/lch/color-mix)
// that Tailwind v4 and browsers can produce, so resolve any computed color using
// one of those functions to rgba() and set it inline before capturing an element.
const UNSUPPORTED_COLOR_FN = /\b(oklch|oklab|lab|lch|color-mix|color)\(/;
const fixOklchColors = (element) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const colorToRgba = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  };

  const propsToCheck = [
    'color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
    'borderBottomColor', 'borderLeftColor', 'textDecorationColor', 'outlineColor',
  ];

  [element, ...Array.from(element.querySelectorAll('*'))].forEach((el) => {
    const computedStyle = window.getComputedStyle(el);
    propsToCheck.forEach((prop) => {
      const val = computedStyle[prop];
      if (val && UNSUPPORTED_COLOR_FN.test(val)) {
        el.style[prop] = colorToRgba(val);
      }
    });
  });
};

// ─── Email Tag Input ───────────────────────────────────────────────────────────
const EmailTagInput = ({ label, tags, onTagsChange, placeholder }) => {
  const [inputValue, setInputValue] = useState('');
  const addTag = (val) => {
    const v = val.trim();
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !tags.includes(v)) {
      onTagsChange([...tags, v]);
    }
    setInputValue('');
  };
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 p-2 border border-gray-300 dark:border-slate-600 rounded-md min-h-[38px] bg-white dark:bg-slate-700">
        {tags.map((t, i) => (
          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 rounded text-xs font-medium">
            {t}
            <button onClick={() => onTagsChange(tags.filter((_, j) => j !== i))} className="hover:text-red-500">×</button>
          </span>
        ))}
        <input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inputValue); } }}
          onBlur={() => addTag(inputValue)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[160px] text-sm outline-none bg-transparent dark:text-gray-200"
        />
      </div>
    </div>
  );
};

// ─── Report Table ──────────────────────────────────────────────────────────────
const ReportTable = forwardRef(({ entries, employees, isDateRange, id }, ref) => {
  if (!entries || entries.length === 0) {
    return <p className="text-center text-gray-500 italic py-10">No special observations to display.</p>;
  }
  return (
    <table ref={ref} id={id} className="w-full text-sm border-collapse border border-gray-300">
      <thead className="bg-amber-100">
        <tr>
          <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[4%] text-gray-900">S.L</th>
          {isDateRange && <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[10%] text-gray-900">Date</th>}
          <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[8%] text-gray-900">Time</th>
          <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[18%] text-gray-900">Employee</th>
          <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[20%] text-gray-900">Remarks</th>
          <th className="border border-gray-300 p-2 text-left font-semibold text-sm text-gray-900">Observation Details</th>
          <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[12%] text-gray-900">Screenshot</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((obs, idx) => {
          const empNames = Array.isArray(obs.employeeIds) && obs.employeeIds.length > 0
            ? obs.employeeIds.map(id => {
                if (id?.startsWith('DEP_')) return `[${id.substring(4)} Dept]`;
                const e = employees.find(e => e.id === id);
                return e ? `${e.name}` : id;
              }).join(', ')
            : '—';
          return (
            <tr key={obs.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/40'}>
              <td className="border border-gray-300 p-2 align-top text-center text-gray-700">{idx + 1}</td>
              {isDateRange && (
                <td className="border border-gray-300 p-2 align-top text-xs text-gray-700 whitespace-nowrap">
                  {formatDate(obs.date)}
                </td>
              )}
              <td className="border border-gray-300 p-2 align-top text-center font-mono text-gray-800">{obs.time || ''}</td>
              <td className="border border-gray-300 p-2 align-top text-gray-800">{empNames}</td>
              <td className="border border-gray-300 p-2 align-top text-gray-800 whitespace-pre-wrap font-['Noto_Serif_Bengali']">{obs.remarks || ''}</td>
              <td className="border border-gray-300 p-2 align-top text-gray-800 whitespace-pre-wrap">{obs.observation_details || ''}</td>
              <td className="border border-gray-300 p-2 align-top text-center">
                {Array.isArray(obs._loadedScreenshots) && obs._loadedScreenshots.length > 0 ? (
                  obs._loadedScreenshots.map((src, si) => (
                    <a key={si} href={src} target="_blank" rel="noreferrer">
                      <img src={src} alt="" className="max-w-[80px] max-h-[80px] object-contain mx-auto mb-1" />
                    </a>
                  ))
                ) : (Array.isArray(obs.screenshots) && obs.screenshots.length > 0 ? (
                  obs.screenshots.map((sc, si) => {
                    const key = typeof sc === 'string' ? sc : (sc.key || sc.data);
                    const src = key?.startsWith('data:') ? key : (key ? `${window.location.origin}/api/media/${key}` : null);
                    return src ? (
                      <a key={si} href={src} target="_blank" rel="noreferrer">
                        <img src={src} alt="" className="max-w-[80px] max-h-[80px] object-contain mx-auto mb-1" />
                      </a>
                    ) : null;
                  })
                ) : null)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

// ─── Main Component ────────────────────────────────────────────────────────────
const SpecialObsPreview = ({ entries, date, onClose, employees }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState([]);
  const [emailCC, setEmailCC] = useState([]);
  const [emailBCC, setEmailBCC] = useState([]);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('Assalamu Alaikum,\nPlease find the attached Special Observations report below for your review.');
  const [reportHtml, setReportHtml] = useState('');
  const [emailAttachments, setEmailAttachments] = useState([]);
  const [loadedEntries, setLoadedEntries] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const pdfContentRef = useRef(null);
  const tableRef = useRef(null);
  const headerRef = useRef(null);

  const isDateRange = date.includes(' to ');

  // Load screenshots
  useEffect(() => {
    const loadImages = async () => {
      setIsLoading(true);
      const result = await Promise.all(entries.map(async (obs) => {
        if (!Array.isArray(obs.screenshots) || obs.screenshots.length === 0) return { ...obs, _loadedScreenshots: [] };
        const loaded = await Promise.all(obs.screenshots.map(async (sc) => {
          try {
            const key = typeof sc === 'string' ? sc : (sc.key || sc.data);
            if (!key) return null;
            if (key.startsWith('data:')) return key;
            const res = await fetch(`/api/media/${key}`);
            if (res.ok) { const j = await res.json(); return j.data || null; }
            return null;
          } catch { return null; }
        }));
        return { ...obs, _loadedScreenshots: loaded.filter(Boolean) };
      }));
      setLoadedEntries(result);
      setIsLoading(false);
    };
    loadImages();
  }, [entries]);

  const reportTitle = useMemo(() => {
    if (!isDateRange) return 'Daily Special Observations Report';
    const [s, e] = date.split(' to ');
    const diff = Math.round((new Date(`${e}T00:00:00`) - new Date(`${s}T00:00:00`)) / 86400000) + 1;
    if (diff === 7) return 'Weekly Special Observations Report';
    if (diff >= 28 && diff <= 31) return 'Monthly Special Observations Report';
    return 'Special Observations Report';
  }, [date, isDateRange]);

  // ── PDF Download ─────────────────────────────────────────────────────────────
  const handleDownloadPdf = useCallback(async () => {
    if (!pdfContentRef.current || !tableRef.current || !headerRef.current) {
      alert('Content not ready.'); return;
    }
    if (!loadedEntries || loadedEntries.length === 0) {
      alert('No observations to download.'); return;
    }
    setIsGenerating(true);
    try {
      // html2canvas can't parse Tailwind v4's oklch() colors, so resolve them to rgba() first.
      fixOklchColors(pdfContentRef.current);

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 30;
      const contentW = pageW - margin * 2;

      const headerCanvas = await html2canvas(headerRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const headerImgData = headerCanvas.toDataURL('image/png');
      const headerH = (headerCanvas.height / headerCanvas.width) * contentW;
      pdf.addImage(headerImgData, 'PNG', margin, margin, contentW, headerH);

      const tableCanvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const tableImgData = tableCanvas.toDataURL('image/png');
      const tableNaturalH = (tableCanvas.height / tableCanvas.width) * contentW;

      let yOffset = margin + headerH + 10;
      const availableH = pageH - yOffset - margin;

      if (tableNaturalH <= availableH) {
        pdf.addImage(tableImgData, 'PNG', margin, yOffset, contentW, tableNaturalH);
      } else {
        const scale = tableCanvas.width / contentW;
        let srcY = 0;
        while (srcY < tableCanvas.height) {
          const sliceH = Math.min((availableH + (srcY === 0 ? 0 : 0)) * scale, tableCanvas.height - srcY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = tableCanvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d');
          ctx.drawImage(tableCanvas, 0, srcY, tableCanvas.width, sliceH, 0, 0, tableCanvas.width, sliceH);
          const sliceData = sliceCanvas.toDataURL('image/png');
          const renderH = sliceH / scale;
          pdf.addImage(sliceData, 'PNG', margin, yOffset, contentW, renderH);
          srcY += sliceH;
          if (srcY < tableCanvas.height) {
            pdf.addPage();
            const hc2 = await html2canvas(headerRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
            pdf.addImage(hc2.toDataURL('image/png'), 'PNG', margin, margin, contentW, headerH);
            yOffset = margin + headerH + 10;
          }
        }
      }

      const filename = `Special_Observations_${date.replace(/ to /g, '_')}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('PDF error:', err);
      alert('PDF generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }, [loadedEntries, date]);

  // ── XLSX Download ─────────────────────────────────────────────────────────────
  const handleDownloadXlsx = useCallback(() => {
    if (!loadedEntries || loadedEntries.length === 0) { alert('No data to export.'); return; }
    const rows = loadedEntries.map((obs, idx) => {
      const empNames = Array.isArray(obs.employeeIds) && obs.employeeIds.length > 0
        ? obs.employeeIds.map(id => {
            if (id?.startsWith('DEP_')) return `[${id.substring(4)} Dept]`;
            const e = employees.find(e => e.id === id);
            return e ? e.name : id;
          }).join(', ')
        : '—';
      return {
        'S.L': idx + 1,
        Date: obs.date?.split('T')[0] || '',
        Time: obs.time || '',
        Employee: empNames,
        Remarks: obs.remarks || '',
        'Observation Details': obs.observation_details || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Special Observations');
    XLSX.writeFile(wb, `Special_Observations_${date.replace(/ to /g, '_')}.xlsx`);
  }, [loadedEntries, employees, date]);

  // ── Email Prepare ─────────────────────────────────────────────────────────────
  const handlePrepareEmail = useCallback(async () => {
    if (!loadedEntries || loadedEntries.length === 0) { alert('No data.'); return; }
    setIsEmailing(true);
    try {
      let htmlRows = '';
      loadedEntries.forEach((obs, idx) => {
        const empNames = Array.isArray(obs.employeeIds) && obs.employeeIds.length > 0
          ? obs.employeeIds.map(id => {
              if (id?.startsWith('DEP_')) return `[${id.substring(4)} Dept]`;
              const e = employees.find(e => e.id === id);
              return e ? e.name : id;
            }).join(', ')
          : '—';
        htmlRows += `<tr style="background:${idx % 2 === 0 ? '#fff' : '#fffbeb'}">
          <td style="padding:10px;border:1px solid #fcd34d;text-align:center">${idx + 1}</td>
          ${isDateRange ? `<td style="padding:10px;border:1px solid #fcd34d;white-space:nowrap">${obs.date?.split('T')[0] || ''}</td>` : ''}
          <td style="padding:10px;border:1px solid #fcd34d;font-family:monospace;text-align:center">${obs.time || ''}</td>
          <td style="padding:10px;border:1px solid #fcd34d">${empNames}</td>
          <td style="padding:10px;border:1px solid #fcd34d">${obs.remarks || ''}</td>
          <td style="padding:10px;border:1px solid #fcd34d">${obs.observation_details || ''}</td>
        </tr>`;
      });
      const htmlBody = `<div style="font-family:'Segoe UI',sans-serif;max-width:900px;margin:0 auto">
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:8px;margin-bottom:20px">
          <h2 style="margin:0 0 4px;color:#92400e">${reportTitle}</h2>
          <p style="margin:0;color:#78350f;font-size:13px">Period: ${isDateRange ? date : formatDate(date)}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#fef3c7">
              <th style="padding:10px;border:1px solid #fcd34d;text-align:left">S.L</th>
              ${isDateRange ? '<th style="padding:10px;border:1px solid #fcd34d;text-align:left">Date</th>' : ''}
              <th style="padding:10px;border:1px solid #fcd34d;text-align:left">Time</th>
              <th style="padding:10px;border:1px solid #fcd34d;text-align:left">Employee</th>
              <th style="padding:10px;border:1px solid #fcd34d;text-align:left">Remarks</th>
              <th style="padding:10px;border:1px solid #fcd34d;text-align:left">Observation Details</th>
            </tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>
      </div>`;
      setEmailSubject(`Special Observations Report: ${date}`);
      setReportHtml(htmlBody);
      setEmailAttachments([]);
      setShowEmailModal(true);
    } catch (err) {
      console.error(err);
      alert('Email preparation failed.');
    } finally {
      setIsEmailing(false);
    }
  }, [loadedEntries, employees, date, isDateRange, reportTitle]);

  // ── Send Email ────────────────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (emailRecipient.length === 0) { alert('Please enter at least one recipient.'); return; }
    setIsEmailing(true);
    try {
      const fullBody = `<div style="font-family:'Segoe UI',sans-serif;color:#333;line-height:1.6;margin-bottom:25px;padding:15px;background:#f8fafc;border-radius:8px;border-left:4px solid #f59e0b">
        <div style="white-space:pre-wrap;font-size:15px">${emailMessage}</div>
      </div>${reportHtml}`;
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailRecipient.join(', '),
          cc: emailCC.join(', '),
          bcc: emailBCC.join(', '),
          subject: emailSubject,
          body: fullBody,
          dbBody: fullBody,
          attachments: emailAttachments,
        }),
      });
      const result = await res.json();
      if (result.success) { alert('Email sent successfully!'); setShowEmailModal(false); }
      else throw new Error(result.details || result.error || 'Failed to send email');
    } catch (err) {
      console.error(err); alert(`Error: ${err.message}`);
    } finally {
      setIsEmailing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading report data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      {/* ── Toolbar ── */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="w-px h-5 bg-slate-200" />
              <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-800 leading-none">{reportTitle}</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">{isDateRange ? date : formatDate(date)} · {loadedEntries?.length || 0} entries</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadXlsx}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-all"
              >
                <FileText className="h-3.5 w-3.5" /> XLSX
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-60"
              >
                <FileText className="h-3.5 w-3.5" />
                {isGenerating ? 'Generating…' : 'PDF'}
              </button>
              <button
                onClick={handlePrepareEmail}
                disabled={isEmailing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-xs font-bold rounded-xl hover:bg-sky-600 transition-all disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" />
                {isEmailing ? 'Preparing…' : 'Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Visible Preview ── */}
      <div className="p-8 bg-gray-200 flex-1">
        <div className="bg-white mx-auto max-w-5xl p-10 shadow-inner">
          {/* Header */}
          <div className="pb-4 mb-4 border-b">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-800 tracking-wider">Credence Housing Limited</h1>
              <p className="text-xs text-gray-500 mt-1">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
              <h2 className="text-lg font-semibold text-amber-700 mt-2">{reportTitle}</h2>
            </div>
            <div className="flex justify-between items-end mt-4">
              <p className="text-md font-semibold text-gray-700">{reportTitle}</p>
              <p className="text-sm text-gray-600 font-medium">Period: {isDateRange ? date : formatDate(date)}</p>
            </div>
          </div>
          {/* Table */}
          <ReportTable entries={loadedEntries} employees={employees} isDateRange={isDateRange} id="visible-special-obs-table" />
        </div>
      </div>

      {/* ── Hidden PDF Target ── */}
      <div className="absolute left-[-9999px] top-0 w-[1200px]" aria-hidden="true">
        <div ref={pdfContentRef} className="bg-white p-10">
          <div ref={headerRef} className="pb-4 mb-4 border-b">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-800 tracking-wider">Credence Housing Limited</h1>
              <p className="text-xs text-gray-500 mt-1">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
              <h2 className="text-lg font-semibold text-amber-700 mt-2">{reportTitle}</h2>
            </div>
            <div className="flex justify-between items-end mt-4">
              <p className="text-md font-semibold text-gray-700">{reportTitle}</p>
              <p className="text-sm text-gray-600 font-medium">Period: {isDateRange ? date : formatDate(date)}</p>
            </div>
          </div>
          <ReportTable ref={tableRef} entries={loadedEntries} employees={employees} isDateRange={isDateRange} id="hidden-special-obs-table" />
        </div>
      </div>

      {/* ── Email Modal ── */}
      {showEmailModal && createPortal(
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex justify-center items-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/20 dark:border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Send Email</h2>
              <button onClick={() => setShowEmailModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <EmailTagInput label="To" tags={emailRecipient} onTagsChange={setEmailRecipient} placeholder="recipient@email.com" />
            <EmailTagInput label="CC" tags={emailCC} onTagsChange={setEmailCC} placeholder="cc@email.com" />
            <EmailTagInput label="BCC" tags={emailBCC} onTagsChange={setEmailBCC} placeholder="bcc@email.com" />
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm" />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
              <textarea rows={4} value={emailMessage} onChange={e => setEmailMessage(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEmailModal(false)} className="px-5 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300">Cancel</button>
              <button onClick={handleSendEmail} disabled={isEmailing} className="px-5 py-2 bg-sky-500 text-white font-semibold rounded-md hover:bg-sky-600 disabled:opacity-60 flex items-center gap-2">
                <Send className="h-4 w-4" /> {isEmailing ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SpecialObsPreview;
