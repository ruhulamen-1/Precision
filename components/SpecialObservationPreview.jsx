import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Mail, X, Send, User, Plus, Clock, FileText, CornerUpRight, Eye, ChevronRight, Info } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const SpecialObservationPreview = ({ entries, date, onClose, logo, employees, departmentName, isAdmin, getImage, hasPermission }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState([]);
  const [emailCC, setEmailCC] = useState([]);
  const [emailBCC, setEmailBCC] = useState([]);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('Assalamu Alaikum,\nPlease find the attached special observation report below for your review.');
  const [reportHtml, setReportHtml] = useState('');
  const [emailAttachments, setEmailAttachments] = useState([]);
  const [loadedEntries, setLoadedEntries] = useState(null);
  const [logoBase64, setLogoBase64] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeEmailField, setActiveEmailField] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const dropdownRef = useRef(null);
  const pdfContentRef = useRef(null);
  const tableRef = useRef(null);
  const headerRef = useRef(null);
  const isDateRange = date && date.includes(' to ');

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setActiveEmailField(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pre-fetch images
  useEffect(() => {
    const fetchImages = async () => {
      // Logo
      let logoUrl = logo;
      if (logo && logo.startsWith('http')) {
        try {
          const url = new URL(logo);
          if (url.pathname.startsWith('/api/media/')) logoUrl = url.pathname + url.search;
        } catch (e) {}
      }
      if (logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('/api/'))) {
        try {
          const res = await fetch(logoUrl);
          if (res.ok) {
            const blob = await res.blob();
            const data = await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob); });
            setLogoBase64(data);
          } else setLogoBase64(logoUrl);
        } catch { setLogoBase64(logoUrl); }
      } else setLogoBase64(logoUrl);

      if (!entries || entries.length === 0) { setLoadedEntries([]); setIsLoading(false); return; }

      try {
        const loaded = await Promise.all(entries.map(async (entry) => {
          let screenshots = entry.screenshots || [];
          if (typeof screenshots === 'string') { try { screenshots = JSON.parse(screenshots); } catch { screenshots = []; } }
          if (!Array.isArray(screenshots)) screenshots = [];

          const screenshotsWithData = await Promise.all(screenshots.map(async (key) => {
            const rawUrl = await getImage(key);
            if (!rawUrl) return null;
            if (rawUrl.startsWith('data:')) return { data: rawUrl, key };
            try {
              const res = await fetch(rawUrl);
              if (res.ok) {
                const blob = await res.blob();
                const data = await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob); });
                return { data, key };
              }
              return { data: rawUrl, key };
            } catch { return { data: rawUrl, key }; }
          }));

          return { ...entry, screenshots: screenshotsWithData.filter(s => s !== null) };
        }));
        setLoadedEntries(loaded);
      } catch { setLoadedEntries(entries); }
      finally { setIsLoading(false); }
    };
    fetchImages();
  }, [entries, logo, getImage]);

  const filteredEntries = useMemo(() => (loadedEntries || []).filter(e => !e.is_deleted), [loadedEntries]);

  const getReportTitle = (d) => {
    if (!d) return 'Special Observation Report';
    if (!d.includes(' to ')) return departmentName ? `${departmentName} - Daily Special Observation Report` : 'Daily Special Observation Report';
    const [s, en] = d.split(' to ');
    const diff = Math.round((new Date(`${en}T00:00:00`) - new Date(`${s}T00:00:00`)) / 86400000) + 1;
    const base = diff === 7 ? 'Weekly' : diff >= 28 ? 'Monthly' : 'Special Observation';
    return departmentName ? `${departmentName} - ${base} Observation Report` : `${base} Observation Report`;
  };

  const reportTitle = getReportTitle(date);

  // Email helpers
  const handleSelectEmail = (email, field) => {
    if (field === 'to' && !emailRecipient.includes(email)) setEmailRecipient(p => [...p, email]);
    else if (field === 'cc' && !emailCC.includes(email)) setEmailCC(p => [...p, email]);
    else if (field === 'bcc' && !emailBCC.includes(email)) setEmailBCC(p => [...p, email]);
    setEmailInput(''); setActiveEmailField(null);
  };
  const handleAddEmailChip = (e, field) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = emailInput.trim().replace(',', '');
      if (val && val.includes('@')) {
        if (field === 'to' && !emailRecipient.includes(val)) setEmailRecipient(p => [...p, val]);
        if (field === 'cc' && !emailCC.includes(val)) setEmailCC(p => [...p, val]);
        if (field === 'bcc' && !emailBCC.includes(val)) setEmailBCC(p => [...p, val]);
        setEmailInput('');
      }
    }
  };
  const removeEmailChip = (email, field) => {
    if (field === 'to') setEmailRecipient(p => p.filter(e => e !== email));
    if (field === 'cc') setEmailCC(p => p.filter(e => e !== email));
    if (field === 'bcc') setEmailBCC(p => p.filter(e => e !== email));
  };
  const renderEmailSuggestions = (field, value) => {
    if (activeEmailField !== field) return null;
    const suggestions = employees?.filter(emp => emp.email && (
      (emp.name || '').toLowerCase().includes(value.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(value.toLowerCase())
    )).slice(0, 10);
    if (!suggestions || suggestions.length === 0) return null;
    return (
      <div className="absolute z-[210] w-full bg-white border border-gray-200 rounded-md shadow-xl mt-1 max-h-48 overflow-y-auto">
        {suggestions.map(emp => (
          <div key={emp.id} className="px-4 py-2 hover:bg-amber-50 cursor-pointer flex flex-col border-b border-gray-100 last:border-0"
            onMouseDown={(e) => { e.preventDefault(); handleSelectEmail(emp.email, field); }}>
            <span className="font-bold text-sm text-gray-800">{emp.name || 'Unnamed'}</span>
            <span className="text-xs text-gray-500">{emp.email}</span>
          </div>
        ))}
      </div>
    );
  };

  // Email report
  const handleEmailReport = async () => {
    setIsEmailing(true);
    try {
      const attachments = [];
      let imageCounter = 1;

      const compressImage = (base64Str, maxWidth = 150, quality = 0.3) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64Str);
        img.src = base64Str;
      });

      let finalLogoBase64 = null;
      if (logoBase64) {
        if (logoBase64.startsWith('data:image')) finalLogoBase64 = logoBase64;
        else if (logoBase64.startsWith('/') || logoBase64.startsWith('http')) {
          try {
            const r = await fetch(logoBase64);
            if (r.ok) { const blob = await r.blob(); finalLogoBase64 = await new Promise((resolve) => { const rd = new FileReader(); rd.onloadend = () => resolve(rd.result); rd.readAsDataURL(blob); }); }
          } catch {}
        }
      }
      if (finalLogoBase64 && finalLogoBase64.startsWith('data:image')) {
        finalLogoBase64 = await compressImage(finalLogoBase64, 300, 0.6);
        attachments.push({ filename: 'company-logo.jpg', content: finalLogoBase64.split(',')[1], encoding: 'base64', cid: 'companylogo' });
      }

      let htmlBody = `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:900px;margin:auto;padding:30px;border:1px solid #e0e0e0;background:#fff;color:#333;">
          <div style="display:flex;align-items:center;margin-bottom:25px;padding-bottom:15px;border-bottom:1px solid #eee;">
            <div style="width:150px;text-align:left;">${attachments.find(a => a.cid === 'companylogo') ? `<img src="cid:companylogo" alt="Logo" style="max-height:60px;max-width:140px;width:auto;height:auto;" />` : ''}</div>
            <div style="flex:1;text-align:center;margin-right:150px;">
              <h1 style="color:#2c3e50;font-size:26px;font-weight:bold;margin:0;">Credence Housing Limited</h1>
              <p style="color:#64748b;font-size:13px;margin:4px 0 8px 0;">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
              <div style="display:inline-block;background-color:#d97706;color:white;padding:5px 15px;border-radius:6px;font-size:11px;font-weight:bold;text-transform:uppercase;">Special Observation Report</div>
            </div>
          </div>
          <div style="margin-bottom:30px;display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #d97706;padding-bottom:12px;">
            <div style="border-left:6px solid #d97706;padding-left:15px;">
              <h2 style="color:#2c3e50;font-size:22px;margin:0;font-weight:800;">${reportTitle}</h2>
              ${departmentName ? `<p style="margin:4px 0 0 0;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;">Department: ${departmentName}</p>` : ''}
            </div>
            <div style="text-align:right;font-size:14px;color:#334155;"><strong>Report Date:</strong> ${formatDate(date)}</div>
          </div>
          <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:10px;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);border:1px solid #e0e0e0;">
            <thead>
              <tr style="background-color:rgb(58,60,57);color:#fdfdfd;">
                <th style="padding:15px;text-align:left;font-size:14px;width:22%;">Employee</th>
                <th style="padding:15px;text-align:center;font-size:14px;width:10%;">Time</th>
                <th style="padding:15px;text-align:left;font-size:14px;width:25%;">General Remark</th>
                <th style="padding:15px;text-align:left;font-size:14px;width:25%;">Observation Details</th>
                <th style="padding:15px;text-align:center;font-size:14px;width:18%;">Evidence</th>
              </tr>
            </thead>
            <tbody>`;

      for (const entry of filteredEntries) {
        let empIds = entry.employeeIds;
        if (typeof empIds === 'string') { try { empIds = JSON.parse(empIds); } catch { empIds = []; } }
        if (!Array.isArray(empIds)) empIds = [];

        const empNames = empIds.map(id => {
          const e = employees?.find(emp => emp.id === id || emp.employee_id === id);
          return e ? `${e.name}` : id;
        }).join(', ') || 'N/A';

        let imagesHtml = '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:5px;">';
        if (entry.screenshots && entry.screenshots.length > 0) {
          for (const screenshotObj of entry.screenshots) {
            let finalBase64 = null;
            if (screenshotObj.data && screenshotObj.data.startsWith('data:image')) {
              finalBase64 = screenshotObj.data;
            } else if (screenshotObj.data && screenshotObj.data.startsWith('/api/media/')) {
              try {
                const r = await fetch(screenshotObj.data);
                if (r.ok) { const blob = await r.blob(); finalBase64 = await new Promise((resolve) => { const rd = new FileReader(); rd.onloadend = () => resolve(rd.result); rd.readAsDataURL(blob); }); }
              } catch {}
            }
            if (finalBase64) {
              finalBase64 = await compressImage(finalBase64, 150, 0.4);
              const cid = `img${imageCounter++}`;
              attachments.push({ filename: `${cid}.jpg`, content: finalBase64.split(',')[1], encoding: 'base64', cid });
              const fullUrl = screenshotObj.key ? `${window.location.origin}/api/media/${screenshotObj.key}` : null;
              imagesHtml += fullUrl
                ? `<a href="${fullUrl}" target="_blank"><img src="cid:${cid}" alt="evidence" style="width:100px;height:75px;object-fit:cover;border:1px solid #ddd;border-radius:4px;margin:3px;" /></a>`
                : `<img src="cid:${cid}" alt="evidence" style="width:100px;height:75px;object-fit:cover;border:1px solid #ddd;border-radius:4px;margin:3px;" />`;
            }
          }
        } else {
          imagesHtml += '<span style="color:#95a5a6;font-size:11px;font-style:italic;">No image</span>';
        }
        imagesHtml += '</div>';

        htmlBody += `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:15px;vertical-align:top;border-right:1px solid #eee;">
              <div style="font-weight:bold;color:#2c3e50;font-size:14px;">${empNames}</div>
              ${isDateRange ? `<div style="font-size:11px;background-color:#eee;padding:2px 4px;border-radius:4px;margin-top:3px;color:#555;">${formatDate(entry.date)}</div>` : ''}
            </td>
            <td style="padding:15px;text-align:center;font-size:13px;font-family:monospace;color:#34495e;">${entry.time || ''}</td>
            <td style="padding:15px;text-align:left;font-size:13px;line-height:1.5;color:#444;">${entry.remarks || ''}</td>
            <td style="padding:15px;text-align:left;font-size:13px;line-height:1.5;color:#7c6b00;background-color:#fffbeb;">${entry.observation_details || '<span style="color:#aaa;font-style:italic;">—</span>'}</td>
            <td style="padding:10px;text-align:center;">${imagesHtml}</td>
          </tr>`;
      }

      htmlBody += `
            </tbody>
          </table>
          <div style="margin-top:40px;padding:25px;background-color:#fcfcfc;border-radius:8px;border-left:4px solid #d97706;line-height:1.4;">
            <p style="margin:0 0 4px 0;font-size:14px;color:#2c3e50;">With Regards,</p>
            <p style="margin:0;font-size:15px;font-weight:bold;color:#2c3e50;">Management Information Systems (MIS)</p>
            <p style="margin:0 0 10px 0;font-size:13px;color:#7f8c8d;">Contact: +880 1711 292424</p>
            <div style="border-top:1px solid #eee;padding-top:8px;">
              ${attachments.find(a => a.cid === 'companylogo') ? `<img src="cid:companylogo" alt="Logo" style="height:35px;margin-bottom:5px;" />` : ''}
              <p style="margin:0;font-size:16px;font-weight:bold;color:#2c3e50;letter-spacing:1px;">CREDENCE HOUSING LIMITED</p>
              <p style="margin:2px 0;font-size:12px;color:#666;"><strong>Telephone:</strong> +880241021375, +880241021378 | <strong>Hotline:</strong> 16769</p>
              <p style="margin:2px 0;font-size:12px;color:#666;"><strong>Corporate Address:</strong> House-15, Road-13/A, Dhanmondi, Dhaka-1209, Bangladesh</p>
            </div>
          </div>
        </div>`;

      setEmailSubject(`Special Observation Report: ${date}${departmentName ? ` [${departmentName}]` : ''}`);
      setReportHtml(htmlBody);
      setEmailAttachments(attachments);
      setShowEmailModal(true);
    } catch (err) {
      console.error('Email prep error:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setIsEmailing(false);
    }
  };

  const handleSendFinalEmail = async () => {
    if (emailRecipient.length === 0) { alert('Please enter at least one recipient.'); return; }
    setIsEmailing(true);
    try {
      const finalBody = `
        <div style="font-family:'Segoe UI',sans-serif;color:#333;line-height:1.6;margin-bottom:25px;padding:15px;background-color:#f8fafc;border-radius:8px;border-left:4px solid #d97706;">
          <div style="white-space:pre-wrap;font-size:15px;">${emailMessage}</div>
        </div>${reportHtml}`;

      let dbBody = finalBody;
      emailAttachments.forEach(att => {
        dbBody = dbBody.replace(new RegExp(`cid:${att.cid}`, 'g'), `data:image/jpeg;base64,${(att.content || '').replace(/[\r\n\s]+/g, '')}`);
      });

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailRecipient.join(', '), cc: emailCC.join(', '), bcc: emailBCC.join(', '), subject: emailSubject, body: finalBody, dbBody, attachments: emailAttachments })
      });
      const result = await res.json();
      if (result.success) { alert('Email sent successfully!'); setShowEmailModal(false); }
      else throw new Error(result.details || result.error || 'Failed to send email');
    } catch (err) {
      console.error('Email send error:', err);
      alert(`Error: ${err.message}`);
    } finally { setIsEmailing(false); }
  };

  // PDF download
  const handleDownloadPdf = useCallback(async () => {
    if (!pdfContentRef.current || !tableRef.current || !headerRef.current || filteredEntries.length === 0) {
      alert('No content to download.'); return;
    }
    setIsGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const margin = 30;
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const pageContentWidth = pdfWidth - margin * 2;
      const footerHeight = 35;
      const availablePageHeight = pdfHeight - margin - footerHeight;

      const allRows = Array.from(tableRef.current.querySelectorAll('tbody tr'));
      const staging = document.createElement('div');
      staging.style.cssText = 'position:fixed;top:0;left:0;width:1024px;z-index:-9999;background:white;overflow:visible;';
      document.body.appendChild(staging);

      const fixOklchColors = (el) => {
        const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const colorToRgba = (color) => {
          if (!color || !color.includes('oklch')) return color;
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return `rgba(${r},${g},${b},${a / 255})`;
        };
        [el, ...Array.from(el.querySelectorAll('*'))].forEach(elem => {
          ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor'].forEach(prop => {
            const val = window.getComputedStyle(elem)[prop];
            if (val && val.includes('oklch')) elem.style[prop] = colorToRgba(val);
          });
        });
      };

      const renderRows = async (rows) => {
        staging.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:1024px;background:white;padding:40px;';
        staging.appendChild(wrapper);
        const clonedHeader = headerRef.current.cloneNode(true);
        clonedHeader.style.cssText = 'display:block;opacity:1;visibility:visible;';
        wrapper.appendChild(clonedHeader);
        if (rows.length > 0) {
          const newTable = tableRef.current.cloneNode(false);
          newTable.style.cssText = 'display:table;opacity:1;visibility:visible;width:100%;margin-top:16px;';
          const thead = tableRef.current.querySelector('thead');
          if (thead) { const th = thead.cloneNode(true); th.style.display = 'table-header-group'; newTable.appendChild(th); }
          const tbody = document.createElement('tbody'); tbody.style.display = 'table-row-group'; newTable.appendChild(tbody);
          wrapper.appendChild(newTable);
          rows.forEach(row => { const r = row.cloneNode(true); r.style.cssText = 'display:table-row;opacity:1;visibility:visible;'; tbody.appendChild(r); });
        }
        fixOklchColors(wrapper);
        const imgs = wrapper.querySelectorAll('img');
        await Promise.all(Array.from(imgs).map(img => { if (!img.src.startsWith('data:')) img.crossOrigin = 'anonymous'; if (img.complete) return Promise.resolve(); return new Promise(r => { img.onload = r; img.onerror = r; }); }));
        await new Promise(r => setTimeout(r, 500));
        return await html2canvas(wrapper, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', width: 1024, windowWidth: 1024 });
      };

      let currentIdx = 0, pageNum = 0;
      if (allRows.length === 0) {
        const canvas = await renderRows([]);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, margin, pageContentWidth, pageContentWidth / (canvas.width / canvas.height));
      } else {
        while (currentIdx < allRows.length) {
          pageNum++;
          if (pageNum > 1) pdf.addPage();
          let attempt = Math.min(10, allRows.length - currentIdx);
          let finalCanvas, finalHeight, finalRows;
          while (attempt > 0) {
            finalRows = allRows.slice(currentIdx, currentIdx + attempt);
            const canvas = await renderRows(finalRows);
            const h = pageContentWidth / (canvas.width / canvas.height);
            if (h <= availablePageHeight || attempt === 1) { finalCanvas = canvas; finalHeight = h; break; }
            attempt--;
          }
          if (finalCanvas && finalRows.length > 0) {
            pdf.addImage(finalCanvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, margin, pageContentWidth, finalHeight);
            currentIdx += finalRows.length;
          } else break;
        }
      }

      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(100, 100, 100);
        const fy = pdfHeight - margin + 5;
        pdf.text('This is a computer-generated report.', margin, fy);
        pdf.text(`Report generated on: ${new Date().toLocaleString()}`, margin, fy + 10);
        pdf.text(`Page ${i} of ${totalPages}`, pdfWidth - margin, fy + 10, { align: 'right' });
      }

      document.body.removeChild(staging);
      const fileName = departmentName
        ? `${departmentName.replace(/\s+/g, '_')}_Special_Observation_Report_${date.replace(/ to /g, '_')}.pdf`
        : `Special_Observation_Report_${date.replace(/ to /g, '_')}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF error:', err);
      alert('Error generating PDF.');
    } finally { setIsGenerating(false); }
  }, [filteredEntries, departmentName, date]);

  // Excel download
  const handleDownloadExcel = () => {
    if (filteredEntries.length === 0) { alert('No content to export.'); return; }
    const data = filteredEntries.map((entry, idx) => {
      let empIds = entry.employeeIds;
      if (typeof empIds === 'string') { try { empIds = JSON.parse(empIds); } catch { empIds = []; } }
      if (!Array.isArray(empIds)) empIds = [];
      const empNames = empIds.map(id => {
        const e = employees?.find(emp => emp.id === id || emp.employee_id === id);
        return e ? e.name : id;
      }).join(', ');
      return {
        'S.L': idx + 1,
        'Employee(s)': empNames || 'N/A',
        'Date': entry.date,
        'Time': entry.time,
        'General Remark': entry.remarks || '',
        'Observation Details': entry.observation_details || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 50 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Special Observations');
    XLSX.writeFile(wb, `Special_Observation_Report_${date.replace(/ to /g, '_')}.xlsx`);
  };

  // Report table component
  const ReportContent = forwardRef(({ entries: ents }, ref) => {
    if (!ents || ents.length === 0) return <p className="text-center text-gray-500 italic py-10">No observations to display.</p>;
    return (
      <table ref={ref} className="w-full text-sm border-collapse border border-gray-300">
        <thead className="bg-amber-100">
          <tr>
            <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-[5%] text-gray-900">S.L</th>
            <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-[20%] text-gray-900">Employee(s)</th>
            <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-[10%] text-gray-900">Time</th>
            <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-[22%] text-gray-900">General Remark</th>
            <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-[25%] text-gray-900">Observation Details</th>
            <th className="border border-gray-300 p-2 text-left text-xs font-semibold w-[18%] text-gray-900">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {ents.map((entry, idx) => {
            let empIds = entry.employeeIds;
            if (typeof empIds === 'string') { try { empIds = JSON.parse(empIds); } catch { empIds = []; } }
            if (!Array.isArray(empIds)) empIds = [];
            const empInfo = empIds.map(id => {
              const e = employees?.find(emp => emp.id === id || emp.employee_id === id);
              return e ? { name: e.name, designation: e.designation, department: e.department } : { name: id };
            });
            return (
              <tr key={entry.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/30'}>
                <td className="border border-gray-300 p-2 align-top text-center text-gray-900">{idx + 1}</td>
                <td className="border border-gray-300 p-2 align-top">
                  {empInfo.map((e, i) => (
                    <div key={i} className="mb-1">
                      <div className="font-bold text-gray-900">{e.name}</div>
                      {e.designation && <div className="text-xs text-gray-500">{e.designation}</div>}
                      {e.department && <div className="text-xs text-gray-400">{e.department}</div>}
                    </div>
                  ))}
                  {isDateRange && entry.date && <div className="text-xs bg-gray-100 px-1 py-0.5 rounded mt-1 inline-block">{formatDate(entry.date)}</div>}
                </td>
                <td className="border border-gray-300 p-2 align-top text-center font-mono font-semibold text-gray-800">{entry.time || ''}</td>
                <td className="border border-gray-300 p-2 align-top text-sm whitespace-pre-wrap font-['Noto_Serif_Bengali'] text-gray-900 leading-relaxed">{entry.remarks || ''}</td>
                <td className="border border-gray-300 p-2 align-top text-sm text-amber-800 bg-amber-50/50 italic leading-relaxed">{entry.observation_details || '—'}</td>
                <td className="border border-gray-300 p-2 align-top">
                  <div className="flex flex-col gap-1">
                    {(entry.screenshots || []).slice(0, 5).map((src, i) => (
                      <a key={i} href={src.key ? `${window.location.origin}/api/media/${src.key}` : src.data} target="_blank" rel="noreferrer">
                        <img src={src.data} alt="evidence" className="w-full h-auto object-contain border rounded cursor-zoom-in" />
                      </a>
                    ))}
                    {(entry.screenshots || []).length > 5 && <p className="text-xs text-gray-500 italic text-center">+{entry.screenshots.length - 5} more</p>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex flex-col items-center justify-center z-[100] text-gray-800 dark:text-white">
        <svg className="animate-spin h-10 w-10 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-xl font-semibold">Loading Report Preview...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex flex-col items-center z-[100] p-4 overflow-y-auto">
      <div className="bg-gray-100 rounded-lg w-full max-w-6xl my-8 flex-shrink-0">
        {/* Toolbar */}
        <div className="p-4 bg-gray-100 border-b border-gray-300 flex justify-between items-center sticky top-0 z-10 rounded-t-lg">
          <h2 className="text-xl font-bold text-gray-800">Special Observation Report Preview</h2>
          <div className="flex gap-3">
            <button onClick={handleDownloadExcel} className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M3 6h18M3 18h18" /></svg>
              Export to Excel
            </button>
            <button onClick={handleDownloadPdf} disabled={isGenerating} className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white font-semibold rounded-md hover:bg-amber-600 disabled:bg-gray-400 transition-colors">
              {isGenerating ? (
                <><svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>Download PDF</>
              )}
            </button>
            {(isAdmin || (hasPermission && hasPermission('can_send_email'))) && (
              <button onClick={handleEmailReport} disabled={isEmailing} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-400 transition-colors">
                {isEmailing ? (<><svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</>) : (<><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>Email Report</>)}
              </button>
            )}

            {/* Email Modal */}
            {showEmailModal && createPortal(
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[250] p-0 md:p-4">
                <div className="bg-white dark:bg-slate-900 w-full h-full md:max-w-[98vw] md:h-[94vh] md:rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <div className="p-4 md:px-6 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl text-amber-600"><Send className="h-5 w-5" /></div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Email Report Dashboard</h3>
                        <p className="text-xs text-slate-500">Compose and preview your report before sending</p>
                      </div>
                    </div>
                    <button onClick={() => setShowEmailModal(false)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full"><X className="h-6 w-6" /></button>
                  </div>
                  <div className="flex-1 flex overflow-hidden flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
                    {/* Left pane */}
                    <div className="w-full md:w-[450px] flex flex-col border-r dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
                      <div className="p-6 space-y-5">
                        {/* To */}
                        <div className="space-y-1.5 relative" ref={dropdownRef}>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><User className="h-3.5 w-3.5" />Recipient (To)</label>
                          <div className="min-h-[42px] flex flex-wrap gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-amber-500 bg-white dark:bg-slate-800">
                            {emailRecipient.map(email => (<span key={email} className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border border-amber-100">{email}<button onClick={() => removeEmailChip(email, 'to')}><X className="h-3 w-3" /></button></span>))}
                            <input type="text" className="flex-1 min-w-[120px] bg-transparent outline-none text-sm dark:text-white" placeholder={emailRecipient.length === 0 ? 'Enter email and press Enter...' : ''} value={activeEmailField === 'to' ? emailInput : ''} onFocus={() => { setActiveEmailField('to'); setEmailInput(''); }} onBlur={() => setTimeout(() => setActiveEmailField(null), 200)} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => handleAddEmailChip(e, 'to')} />
                          </div>
                          {activeEmailField === 'to' && renderEmailSuggestions('to', emailInput)}
                        </div>
                        {/* CC */}
                        <div className="space-y-1.5 relative">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CC</label>
                          <div className="min-h-[42px] flex flex-wrap gap-1.5 p-2 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-amber-500 bg-white dark:bg-slate-800">
                            {emailCC.map(email => (<span key={email} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-xs flex items-center gap-1">{email}<button onClick={() => removeEmailChip(email, 'cc')}><X className="h-3 w-3" /></button></span>))}
                            <input type="text" className="flex-1 min-w-[80px] bg-transparent outline-none text-sm dark:text-white" value={activeEmailField === 'cc' ? emailInput : ''} onFocus={() => { setActiveEmailField('cc'); setEmailInput(''); }} onBlur={() => setTimeout(() => setActiveEmailField(null), 200)} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => handleAddEmailChip(e, 'cc')} />
                          </div>
                          {activeEmailField === 'cc' && renderEmailSuggestions('cc', emailInput)}
                        </div>
                        {/* Subject */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><FileText className="h-3.5 w-3.5" />Subject</label>
                          <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} onFocus={() => { setActiveEmailField(null); setEmailInput(''); }} className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white dark:bg-slate-800 text-sm font-semibold dark:text-white outline-none" />
                        </div>
                        {/* Message */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><CornerUpRight className="h-3.5 w-3.5" />Message Body</label>
                          <textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white dark:bg-slate-800 text-sm dark:text-white outline-none min-h-[140px] resize-none" />
                          <p className="text-[10px] text-slate-400 italic flex items-center gap-1"><Info className="h-3 w-3" />This message will appear before the report.</p>
                        </div>
                      </div>
                    </div>
                    {/* Right pane: preview */}
                    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden">
                      <div className="p-3 bg-white/80 backdrop-blur-md border-b flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2 text-slate-600"><Eye className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Report Body Preview</span></div>
                        <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></div><span className="text-[10px] font-bold text-amber-600">PRE-GENERATED</span></div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 md:p-8">
                        <div className="bg-white p-6 shadow-xl rounded-xl border border-slate-200">
                          <div className="mb-6 p-4 bg-amber-50/50 border-l-4 border-amber-500 rounded-r-lg"><p className="text-sm text-slate-800 whitespace-pre-wrap italic">{emailMessage || 'No additional message added.'}</p></div>
                          <div className="prose prose-sm max-w-none overflow-x-auto" dangerouslySetInnerHTML={{ __html: reportHtml.replace(/cid:([a-zA-Z0-9]+)/g, (match, cid) => { const att = emailAttachments.find(a => a.cid === cid); return att ? `data:image/jpeg;base64,${att.content}` : match; }) }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Footer */}
                  <div className="p-4 md:px-8 bg-white dark:bg-slate-900 border-t flex justify-between items-center gap-4 shrink-0">
                    <div className="flex items-center gap-4 text-xs text-slate-500"><Clock className="h-4 w-4" /><span>Instant delivery</span></div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setShowEmailModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Draft Later</button>
                      <button onClick={handleSendFinalEmail} disabled={isEmailing} className="px-8 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50">
                        {isEmailing ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><span>Send Official Report</span><ChevronRight className="h-4 w-4" /></>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

            <button onClick={onClose} className="px-5 py-2 bg-rose-500 text-white font-semibold rounded-md hover:bg-rose-600">Close</button>
          </div>
        </div>

        {/* Visible preview */}
        <div className="p-8 bg-gray-200">
          <div className="bg-white mx-auto max-w-4xl p-12 shadow-inner">
            <div id="pdf-header-visible" className="pb-4 mb-2">
              <div className="relative text-center border-b pb-4">
                {logoBase64 && <img src={logoBase64} alt="Logo" referrerPolicy="no-referrer" className="absolute top-0 left-0 h-16 w-auto max-w-[150px] object-contain" />}
                <h1 className="text-2xl font-bold text-gray-800 tracking-wider">Credence Housing Limited</h1>
                <p className="text-xs text-gray-500 mt-1">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
                <h2 className="text-lg font-semibold text-amber-700 mt-2">
                  Special Observations Report
                  {departmentName && <span className="block text-sm text-amber-600 font-bold mt-1 uppercase">[{departmentName} Department]</span>}
                </h2>
              </div>
              <div className="flex justify-between items-end mt-4">
                <h3 className="text-md font-semibold text-gray-700">{reportTitle}</h3>
                <p className="text-sm text-gray-600 font-medium">Date: {formatDate(date)}</p>
              </div>
            </div>
            <ReportContent entries={filteredEntries} />
          </div>

          {/* Hidden PDF content */}
          <div className="absolute left-[-9999px] top-0 w-[1024px]" aria-hidden="true">
            <div ref={pdfContentRef} className="bg-white mx-auto max-w-4xl p-12">
              <div ref={headerRef} className="pb-4 mb-2">
                <div className="relative text-center border-b pb-4">
                  {logoBase64 && <img src={logoBase64} alt="Logo" referrerPolicy="no-referrer" className="absolute top-0 left-0 h-16 w-auto max-w-[150px] object-contain" />}
                  <h1 className="text-2xl font-bold text-gray-800 tracking-wider">Credence Housing Limited</h1>
                  <p className="text-xs text-gray-500 mt-1">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
                  <h2 className="text-lg font-semibold text-amber-700 mt-2">
                    Special Observations Report
                    {departmentName && <span className="block text-sm text-amber-600 font-bold mt-1 uppercase">[{departmentName} Department]</span>}
                  </h2>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <h3 className="text-md font-semibold text-gray-700">{reportTitle}</h3>
                  <p className="text-sm text-gray-600 font-medium">Date: {formatDate(date)}</p>
                </div>
              </div>
              <ReportContent ref={tableRef} entries={filteredEntries} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpecialObservationPreview;
