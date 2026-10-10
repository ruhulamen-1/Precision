import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Mail, X, Send, User, Plus, Clock, FileText, CornerUpRight, Eye, ChevronRight, Info } from 'lucide-react';
import { getTimeZone } from '../utils/casualHelpers';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

// Local formatDate helper (adapted from casualHelpers)
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Formats either a single date ("2026-07-01") or a date range ("2026-07-01 to 2026-07-31")
// for display. formatDate() alone can't parse the "X to Y" form and produces "Invalid Date".
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr.includes(' to ')) {
    const [start, end] = dateStr.split(' to ');
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  return formatDate(dateStr);
};

const CasualPreview = ({ groupedEntries, date, onClose, logo, employees, isBatchMode, onReady, departmentName, isAdmin, allProfiles, getImage, hasPermission, specialObsEntries = [] }) => {
          const [isGenerating, setIsGenerating] = useState(false);
          const [isEmailing, setIsEmailing] = useState(false);
          const [showEmailModal, setShowEmailModal] = useState(false);
          const [emailRecipient, setEmailRecipient] = useState([]);
          const [emailCC, setEmailCC] = useState([]);
          const [emailBCC, setEmailBCC] = useState([]);
          const [emailSubject, setEmailSubject] = useState('');
          const [emailMessage, setEmailMessage] = useState('Assalamu Alaikum,\nPlease find the attached activity report below for your review.');
          const [reportHtml, setReportHtml] = useState('');
          const [emailAttachments, setEmailAttachments] = useState([]);
          const [loadedGroupedEntries, setLoadedGroupedEntries] = useState(null);
          const [logoBase64, setLogoBase64] = useState(null);
          const [isLoading, setIsLoading] = useState(true);
          const [activeEmailField, setActiveEmailField] = useState(null);
          const [emailInput, setEmailInput] = useState('');
          const dropdownRef = useRef(null);
          const isDateRange = date.includes(' to ');

          useEffect(() => {
              const handleClickOutside = (event) => {
                  if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                      setActiveEmailField(null);
                  }
              };
              document.addEventListener('mousedown', handleClickOutside);
              return () => {
                  document.removeEventListener('mousedown', handleClickOutside);
              };
          }, []);

          useEffect(() => {
              const fetchImages = async () => {
                  // Pre-fetch logo to avoid CORS issues in PDF generation
                  let logoUrl = logo;
                  if (logo && logo.startsWith('http')) {
                    try {
                        const url = new URL(logo);
                        // If it's our own media API, always use a relative path to avoid hostname mismatch
                        if (url.pathname.startsWith('/api/media/')) {
                            logoUrl = url.pathname + url.search;
                        }
                    } catch (e) {}
                  }

                  if (logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('/api/'))) {
                      try {
                          const response = await fetch(logoUrl);
                          if (response.ok) {
                              const blob = await response.blob();
                              const reader = new FileReader();
                              const logoData = await new Promise((resolve) => {
                                  reader.onloadend = () => resolve(reader.result);
                                  reader.readAsDataURL(blob);
                              });
                              setLogoBase64(logoData);
                          } else {
                              setLogoBase64(logoUrl);
                          }
                      } catch (err) {
                          console.error("Error pre-fetching logo:", err);
                          setLogoBase64(logoUrl);
                      }
                  } else {
                      setLogoBase64(logoUrl);
                  }

                  if (!groupedEntries) {
                      setLoadedGroupedEntries([]);
                      setIsLoading(false);
                      return;
                  }
                  try {
                      const entriesWithImageData = await Promise.all(groupedEntries.map(async (group) => {
                          const activitiesWithImageData = await Promise.all(group.activities.map(async (activity) => {
                              let screenshots = activity.screenshots || [];
                              if (typeof screenshots === 'string') {
                                  try {
                                      screenshots = JSON.parse(screenshots);
                                  } catch (e) {
                                      screenshots = [];
                                  }
                              }
                              if (!Array.isArray(screenshots)) screenshots = [];

                              const screenshotsWithData = await Promise.all(screenshots.map(async (key) => {
                                  const rawUrl = await getImage(key);
                                  if (!rawUrl) return null;
                                  
                                  // If it's already a data URL, return it
                                  if (rawUrl.startsWith('data:')) return { data: rawUrl, key };
                                  
                                  // Fetch and convert to base64 to avoid CORS and resolution issues in PDF/Email
                                  try {
                                      const response = await fetch(rawUrl);
                                      if (response.ok) {
                                          const blob = await response.blob();
                                          const data = await new Promise((resolve) => {
                                              const reader = new FileReader();
                                              reader.onloadend = () => resolve(reader.result);
                                              reader.readAsDataURL(blob);
                                          });
                                          return { data, key };
                                      }
                                      return { data: rawUrl, key }; // Fallback to raw URL if fetch fails
                                  } catch (e) {
                                      console.error(`Failed to pre-fetch screenshot ${key}:`, e);
                                      return { data: rawUrl, key };
                                  }
                              }));
                              return { ...activity, screenshots: screenshotsWithData.filter(src => src !== null) };
                          }));
                          return { ...group, activities: activitiesWithImageData };
                      }));
                      setLoadedGroupedEntries(entriesWithImageData);
                  } catch (error) {
                      console.error("Error loading images for preview:", error);
                      setLoadedGroupedEntries(groupedEntries);
                  } finally {
                      setIsLoading(false);
                  }
              };
              fetchImages();
          }, [groupedEntries, logo, getImage]);

          const filteredEntries = useMemo(() => {
              if (!loadedGroupedEntries) return [];
              return loadedGroupedEntries.filter(
                  group => group.employeeId && group.activities.length > 0
              );
          }, [loadedGroupedEntries]);
          
          const handleSelectEmail = (email, field) => {
              if (field === 'to') {
                  if (!emailRecipient.includes(email)) {
                      setEmailRecipient(prev => [...prev, email]);
                  }
              } else if (field === 'cc') {
                  if (!emailCC.includes(email)) {
                      setEmailCC(prev => [...prev, email]);
                  }
              } else if (field === 'bcc') {
                  if (!emailBCC.includes(email)) {
                      setEmailBCC(prev => [...prev, email]);
                  }
              }
              setEmailInput('');
              setActiveEmailField(null);
          };

          const handleAddEmailChip = (e, field) => {
              if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  const val = emailInput.trim().replace(',', '');
                  if (val && val.includes('@')) {
                      if (field === 'to' && !emailRecipient.includes(val)) setEmailRecipient(prev => [...prev, val]);
                      if (field === 'cc' && !emailCC.includes(val)) setEmailCC(prev => [...prev, val]);
                      if (field === 'bcc' && !emailBCC.includes(val)) setEmailBCC(prev => [...prev, val]);
                      setEmailInput('');
                  }
              }
          };

          const removeEmailChip = (email, field) => {
              if (field === 'to') setEmailRecipient(prev => prev.filter(e => e !== email));
              if (field === 'cc') setEmailCC(prev => prev.filter(e => e !== email));
              if (field === 'bcc') setEmailBCC(prev => prev.filter(e => e !== email));
          };

          const renderEmailSuggestions = (field, value) => {
              if (activeEmailField !== field) return null;
              
              if (!value && activeEmailField !== field) return null;

              const suggestions = employees?.filter(emp => 
                  emp.email && (
                      (emp.name || '').toLowerCase().includes(value.toLowerCase()) ||
                      (emp.email || '').toLowerCase().includes(value.toLowerCase())
                  )
              ).slice(0, 10);

              if (!suggestions || suggestions.length === 0) return null;

              return (
                  <div className="absolute z-[210] w-full bg-white border border-gray-200 rounded-md shadow-xl mt-1 max-h-48 overflow-y-auto">
                      {suggestions.map(emp => (
                          <div 
                              key={emp.id} 
                              className="px-4 py-2 hover:bg-indigo-50 cursor-pointer flex flex-col border-b border-gray-100 last:border-0"
                              onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectEmail(emp.email, field);
                              }}
                          >
                              <span className="font-bold text-sm text-gray-800">{emp.name || 'Unnamed Employee'}</span>
                              <span className="text-xs text-gray-500">{emp.email}</span>
                          </div>
                      ))}
                  </div>
              );
          };

          const handleEmailReport = async () => {
              setIsEmailing(true);
              try {
                  const title = getReportTitle(date);
                  const attachments = [];
                  let imageCounter = 1;
                  
                  // Helper function for aggressive image compression
                  const compressImage = (base64Str, maxWidth = 150, quality = 0.3) => {
                      return new Promise((resolve) => {
                          const img = new Image();
                          img.onload = () => {
                              const canvas = document.createElement('canvas');
                              let width = img.width;
                              let height = img.height;
                              if (width > maxWidth) {
                                  height = Math.round((height * maxWidth) / width);
                                  width = maxWidth;
                              }
                              canvas.width = width;
                              canvas.height = height;
                              const ctx = canvas.getContext('2d');
                              ctx.fillStyle = '#ffffff';
                              ctx.fillRect(0, 0, width, height);
                              ctx.drawImage(img, 0, 0, width, height);
                              resolve(canvas.toDataURL('image/jpeg', quality));
                          };
                          img.onerror = () => resolve(base64Str);
                          img.src = base64Str;
                      });
                  };

                  // Add company logo to attachments
                  let finalLogoBase64 = null;
                  if (logoBase64) {
                    if (logoBase64.startsWith('data:image')) {
                      finalLogoBase64 = logoBase64;
                    } else if (logoBase64.startsWith('/') || logoBase64.startsWith('http')) {
                      try {
                        const logoResponse = await fetch(logoBase64);
                        if (logoResponse.ok) {
                          const blob = await logoResponse.blob();
                          finalLogoBase64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                          });
                        }
                      } catch (err) { console.error("Error fetching logo:", err); }
                    }
                  }

                  if (finalLogoBase64 && finalLogoBase64.startsWith('data:image')) {
                    finalLogoBase64 = await compressImage(finalLogoBase64, 300, 0.6); // Slightly higher resolution for logo
                    attachments.push({
                      filename: 'company-logo.jpg',
                      content: finalLogoBase64.split(',')[1],
                      encoding: 'base64',
                      cid: 'companylogo'
                    });
                  }

                  let htmlBody = `
                      <style media="print">
                        @page { size: auto; margin: 10mm; }
                        body { background-color: #ffffff; }
                        .no-print { display: none; }
                      </style>
                      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 900px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; background-color: #ffffff; color: #333;">
                          <div style="display: flex; align-items: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                              <div style="width: 150px; text-align: left;">
                                  ${attachments.find(a => a.cid === 'companylogo') ? `<img src="cid:companylogo" alt="Logo" style="max-height: 60px; max-width: 140px; width: auto; height: auto;" />` : ''}
                              </div>
                              <div style="flex: 1; text-align: center; margin-right: 150px;">
                                  <h1 style="color: #2c3e50; font-size: 26px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">Credence Housing Limited</h1>
                                  <p style="color: #64748b; font-size: 13px; margin: 4px 0 8px 0;">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
                                  <div style="display: inline-block; background-color: #97b874; color: white; padding: 5px 15px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                                      Official Activity Report
                                  </div>
                              </div>
                          </div>
                  `;

                  // Table and content logic...
                  htmlBody += `
                          <div style="margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #97b874; padding-bottom: 12px;">
                              <div style="border-left: 6px solid #97b874; padding-left: 15px;">
                                  <h2 style="color: #2c3e50; font-size: 22px; margin: 0; font-weight: 800;">${title}</h2>
                                  ${departmentName ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Department: ${departmentName}</p>` : ''}
                              </div>
                              <div style="text-align: right;">
                                  <div style="font-size: 14px; color: #334155;">
                                      <strong style="color: #475569;">Report Date:</strong> ${formatDateDisplay(date)}
                                  </div>
                              </div>
                          </div>
                          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e0e0e0;">
                              <thead>
                                  <tr style="background-color: rgb(58, 60, 57); color: #fdfdfd;">
                                      <th style="padding: 15px; text-align: left; font-size: 14px; width: 25%;">Employee</th>
                                      <th style="padding: 15px; text-align: center; font-size: 14px; width: 15%;">Time</th>
                                      <th style="padding: 15px; text-align: left; font-size: 14px; width: 35%;">Activities / Remarks</th>
                                      <th style="padding: 15px; text-align: center; font-size: 14px; width: 25%;">Proofs</th>
                                  </tr>
                              </thead>
                              <tbody>
                  `;

                  for (const group of filteredEntries) {
                      const employee = employees.find(e => e.id === group.employeeId);
                      const empName = employee ? employee.name : (group.employeeId.startsWith('DEP_') ? group.employeeId.replace('DEP_', '') : group.employeeId);
                      const empDesig = employee ? employee.designation : '';
                      
                      for (let i = 0; i < group.activities.length; i++) {
                          const activity = group.activities[i];
                          let imagesHtml = '<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 5px;">';
                          
                          if (activity.screenshots && activity.screenshots.length > 0) {
                              for (let screenshotObj of activity.screenshots) {
                                  let finalBase64 = null;
                                  const screenshotData = screenshotObj.data;
                                  const screenshotKey = screenshotObj.key;
                                  
                                  if (screenshotData && screenshotData.startsWith('/api/media/')) {
                                      try {
                                          const imgResponse = await fetch(screenshotData);
                                          if (imgResponse.ok) {
                                              const blob = await imgResponse.blob();
                                              finalBase64 = await new Promise((resolve) => {
                                                  const reader = new FileReader();
                                                  reader.onloadend = () => resolve(reader.result);
                                                  reader.readAsDataURL(blob);
                                              });
                                          }
                                      } catch (err) { console.error("Img fetch error:", err); }
                                  } else if (screenshotData && screenshotData.startsWith('data:image')) {
                                      finalBase64 = screenshotData;
                                  }

                                  if (finalBase64) {
                                      finalBase64 = await compressImage(finalBase64, 150, 0.4); // Aggressively compress screenshot
                                      const cid = `img${imageCounter++}`;
                                      attachments.push({
                                          filename: `${cid}.jpg`,
                                          content: finalBase64.split(',')[1],
                                          encoding: 'base64',
                                          cid: cid
                                      });
                                      
                                      const fullImageUrl = screenshotKey ? `${window.location.origin}/api/media/${screenshotKey}` : null;
                                      if (fullImageUrl) {
                                          imagesHtml += `<a href="${fullImageUrl}" target="_blank"><img src="cid:${cid}" alt="screenshot" style="width: 100px; height: 75px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; margin: 3px;" /></a>`;
                                      } else {
                                          imagesHtml += `<img src="cid:${cid}" alt="screenshot" style="width: 100px; height: 75px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; margin: 3px;" />`;
                                      }
                                  }
                              }
                          } else {
                              imagesHtml += '<span style="color: #95a5a6; font-size: 11px; font-style: italic;">No image</span>';
                          }
                          imagesHtml += '</div>';

                          htmlBody += `
                              <tr style="background-color: ${imageCounter % 2 === 0 ? '#f8f9fa' : '#ffffff'}; border-bottom: 1px solid #eee;">
                                  ${i === 0 ? `<td rowspan="${group.activities.length}" style="padding: 15px; vertical-align: top; border-right: 1px solid #eee;"><div style="font-weight: bold; color: #2c3e50; font-size: 14px;">${empName}</div><div style="font-size: 12px; color: #7f8c8d; margin-top: 3px;">${empDesig}</div></td>` : ''}
                                  <td style="padding: 15px; text-align: center; font-size: 13px; font-family: monospace; color: #34495e;">${isDateRange ? `<div style="font-size: 11px; background-color: #eee; padding: 2px 4px; border-radius: 4px; margin-bottom: 2px; color: #555; white-space: nowrap;">${formatDate(activity.date)}</div>` : ''}${activity.time}</td>
                                  <td style="padding: 15px; text-align: left; font-size: 13px; line-height: 1.5; color: #444;">${activity.remarks}</td>
                                  <td style="padding: 10px; text-align: center;">${imagesHtml}</td>
                              </tr>
                          `;
                      }
                  }

                  htmlBody += `
                              </tbody>
                          </table>
                          <div style="margin-top: 40px; padding: 25px; background-color: #fcfcfc; border-radius: 8px; border-left: 4px solid #97b874; line-height: 1.4;">
                              <p style="margin: 0 0 4px 0; font-size: 14px; color: #2c3e50;">With Regards,</p>
                              <p style="margin: 0; font-size: 15px; font-weight: bold; color: #2c3e50;">Management Information Systems (MIS)</p>
                              <p style="margin: 0 0 10px 0; font-size: 13px; color: #7f8c8d;">Contact: +880 1711 292424</p>
                              <div style="border-top: 1px solid #eee; padding-top: 8px;">
                                  ${attachments.find(a => a.cid === 'companylogo') ? `<img src="cid:companylogo" alt="Credence Logo" style="height: 35px; margin-bottom: 5px;" />` : ''}
                                  <p style="margin: 0; font-size: 16px; font-weight: bold; color: #2c3e50; letter-spacing: 1px;">CREDENCE HOUSING LIMITED</p>
                                  <p style="margin: 2px 0; font-size: 12px; color: #666;"><strong>Telephone:</strong> +880241021375, +880241021378 | <strong>Hotline:</strong> 16769</p>
                                  <p style="margin: 2px 0; font-size: 12px; color: #666;"><strong>Corporate Address:</strong> House-15, Road-13/A, Dhanmondi, Dhaka-1209, Bangladesh</p>
                                  <p style="margin: 10px 0 0 0; font-size: 13px; font-weight: bold;">
                                      <a href="https://www.credencehousingltd.com/" style="color: #97b874; text-decoration: none;">Website</a> | <a href="https://www.facebook.com/credencehousingltd" style="color: #3b5998; text-decoration: none;">Facebook</a> | <a href="https://www.linkedin.com/company/credencehousinglimited/" style="color: #0077b5; text-decoration: none;">LinkedIn</a>
                                  </p>
                              </div>
                          </div>
                      </div>
                  `;

                  setEmailSubject(`Activity Report: ${date} ${departmentName ? `[${departmentName}]` : ''}`);
                  setReportHtml(htmlBody);
                  setEmailAttachments(attachments);
                  setShowEmailModal(true);
              } catch (error) {
                  console.error("Email preparation error:", error);
                  alert(`Error: ${error.message}`);
              } finally {
                  setIsEmailing(false);
              }
          };

          const handleSendFinalEmail = async () => {
              if (emailRecipient.length === 0) {
                  alert("Please enter at least one recipient email address.");
                  return;
              }

              setIsEmailing(true);
              try {
                  // Wrap user message in some styling and follow with the report
                  const finalFullBody = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; margin-bottom: 25px; padding: 15px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #4f46e5;">
                        <div style="white-space: pre-wrap; font-size: 15px;">${emailMessage}</div>
                    </div>
                    ${reportHtml}
                  `;

                  let dbBody = finalFullBody;
                  if (emailAttachments && emailAttachments.length > 0) {
                      emailAttachments.forEach(att => {
                          const regex = new RegExp(`cid:${att.cid}`, 'g');
                          const cleanContent = (att.content || '').replace(/[\r\n\s]+/g, '');
                          dbBody = dbBody.replace(regex, () => `data:image/jpeg;base64,${cleanContent}`);
                      });
                  }

                  const response = await fetch('/api/send-email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          to: emailRecipient.join(', '),
                          cc: emailCC.join(', '),
                          bcc: emailBCC.join(', '),
                          subject: emailSubject,
                          body: finalFullBody,
                          dbBody: dbBody,
                          attachments: emailAttachments
                      })
                  });

                  const result = await response.json();
                  if (result.success) {
                      alert("Email sent successfully!");
                      setShowEmailModal(false);
                  } else {
                      throw new Error(result.details || result.error || "Failed to send email");
                  }
              } catch (error) {
                  console.error("Email send error:", error);
                  alert(`Error: ${error.message}`);
              } finally {
                  setIsEmailing(false);
              }
          };

          const getReportTitle = (dateString) => {
              let baseTitle = 'Activity Report';
              if (!dateString.includes(' to ')) {
                  baseTitle = 'Daily Activity Report';
              } else {
                  const [startStr, endStr] = dateString.split(' to ');
                  const startDate = new Date(`${startStr}T00:00:00`);
                  const endDate = new Date(`${endStr}T00:00:00`);
                  const timeDiff = endDate.getTime() - startDate.getTime();
                  const dayDiff = Math.round(timeDiff / (1000 * 3600 * 24)) + 1;

                  if (dayDiff === 7) {
                      baseTitle = 'Weekly Activity Report';
                  } else if (dayDiff >= 28 && dayDiff <= 31) {
                      baseTitle = 'Monthly Activity Report';
                  }
              }
              
              if (departmentName) {
                  return `${departmentName} - ${baseTitle}`;
              }
              return baseTitle;
          };

          const reportTitle = getReportTitle(date);

          const pdfContentRef = useRef(null);
          const tableRef = useRef(null);
          const headerRef = useRef(null);

          const handleDownloadPdf = useCallback(async () => {
              const contentToPrint = pdfContentRef.current;
              const tableElement = tableRef.current;
              const headerElement = headerRef.current;

              if (!contentToPrint || !tableElement || !headerElement || filteredEntries.length === 0) {
                  console.warn('Download attempt failed: content not ready or empty.', {
                      hasContent: !!contentToPrint,
                      hasTable: !!tableElement,
                      hasHeader: !!headerElement,
                      entriesCount: filteredEntries.length
                  });
                  alert('No content to download.');
                  return;
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
                  
                  const allRows = Array.from(tableElement.querySelectorAll('tbody tr'));
                  const stagingContainer = document.createElement('div');
                  stagingContainer.id = 'pdf-staging-container';
                  stagingContainer.style.position = 'fixed';
                  stagingContainer.style.top = '0';
                  stagingContainer.style.left = '0';
                  stagingContainer.style.width = '1024px';
                  stagingContainer.style.zIndex = '-9999';
                  stagingContainer.style.opacity = '1';
                  stagingContainer.style.visibility = 'visible';
                  stagingContainer.style.pointerEvents = 'none';
                  stagingContainer.style.backgroundColor = 'white';
                  stagingContainer.style.overflow = 'visible';
                  document.body.appendChild(stagingContainer);

                  const renderRowsToCanvas = async (rows) => {
                      stagingContainer.innerHTML = '';
                      
                      // Create a wrapper to mimic the original layout
                      const wrapper = document.createElement('div');
                      wrapper.className = 'bg-white p-12 w-full';
                      wrapper.style.width = '1024px';
                      wrapper.style.minHeight = '100px';
                      stagingContainer.appendChild(wrapper);

                      const clonedHeader = headerElement.cloneNode(true);
                      clonedHeader.style.display = 'block';
                      clonedHeader.style.opacity = '1';
                      clonedHeader.style.visibility = 'visible';
                      wrapper.appendChild(clonedHeader);

                      if (rows.length > 0) {
                          const newTable = tableElement.cloneNode(false);
                          newTable.className = tableElement.className + " w-full mt-4"; 
                          newTable.style.display = 'table';
                          newTable.style.opacity = '1';
                          newTable.style.visibility = 'visible';
                          
                          const originalThead = tableElement.querySelector('thead');
                          if (originalThead) {
                              const newThead = originalThead.cloneNode(true);
                              newThead.style.display = 'table-header-group';
                              newTable.appendChild(newThead);
                          }

                          const newTbody = document.createElement('tbody');
                          newTbody.style.display = 'table-row-group';
                          newTable.appendChild(newTbody);
                          wrapper.appendChild(newTable);
                          
                          rows.forEach(row => {
                              const clonedRow = row.cloneNode(true);
                              clonedRow.style.display = 'table-row';
                              clonedRow.style.opacity = '1';
                              clonedRow.style.visibility = 'visible';
                              newTbody.appendChild(clonedRow);
                          });
                      } else {
                           const noEntries = document.querySelector('.no-entries-message');
                           if (noEntries) {
                               const clonedNoEntries = noEntries.cloneNode(true);
                               clonedNoEntries.style.display = 'block';
                               clonedNoEntries.style.opacity = '1';
                               clonedNoEntries.style.visibility = 'visible';
                               wrapper.appendChild(clonedNoEntries);
                           }
                      }
                      
                      // Fix OKLCH colors for html2canvas
                      const fixOklchColors = (element) => {
                          const canvas = document.createElement('canvas');
                          canvas.width = 1;
                          canvas.height = 1;
                          const ctx = canvas.getContext('2d', { willReadFrequently: true });

                          const colorToRgba = (color) => {
                              if (!color || !color.includes('oklch')) return color;
                              ctx.clearRect(0, 0, 1, 1);
                              ctx.fillStyle = color;
                              ctx.fillRect(0, 0, 1, 1);
                              const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
                              return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
                          };

                          const elements = element.querySelectorAll('*');
                          const propsToCheck = [
                              'color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 
                              'borderBottomColor', 'borderLeftColor', 'textDecorationColor', 'outlineColor'
                          ];

                          [element, ...Array.from(elements)].forEach(el => {
                              const computedStyle = window.getComputedStyle(el);
                              propsToCheck.forEach(prop => {
                                  const val = computedStyle[prop];
                                  if (val && val.includes('oklch')) {
                                      el.style[prop] = colorToRgba(val);
                                  }
                              });
                          });
                      };
                      
                      // Apply the color fix
                      fixOklchColors(wrapper);

                      // Fix images for html2canvas
                      const images = wrapper.querySelectorAll('img');
                      await Promise.all(Array.from(images).map(img => {
                          // For our own API or external URLs, try to enable CORS
                          if (img.src && !img.src.startsWith('data:')) {
                              img.crossOrigin = 'anonymous';
                          }
                          
                          if (img.complete) return Promise.resolve();
                          return new Promise(resolve => {
                              img.onload = resolve;
                              img.onerror = resolve;
                          });
                      }));

                      // Small extra delay for layout
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      console.log(`Capturing ${rows.length} rows to canvas...`);
                      const canvas = await html2canvas(wrapper, { 
                          scale: 2, 
                          useCORS: true,
                          allowTaint: false,
                          backgroundColor: '#ffffff',
                          logging: true,
                          width: 1024,
                          windowWidth: 1024
                      });
                      console.log(`Canvas captured: ${canvas.width}x${canvas.height}`);
                      return canvas;
                  };

                  let currentRowIndex = 0;
                  let pageNumber = 0;
                  
                  if (allRows.length === 0) {
                      const canvas = await renderRowsToCanvas([]);
                      const imgData = canvas.toDataURL('image/jpeg', 0.8);
                      const canvasAspectRatio = canvas.width / canvas.height;
                      const contentImgHeight = pageContentWidth / canvasAspectRatio;
                      pdf.addImage(imgData, 'JPEG', margin, margin, pageContentWidth, contentImgHeight);
                  } else {
                      while (currentRowIndex < allRows.length) {
                          pageNumber++;
                          if (pageNumber > 1) {
                              pdf.addPage();
                          }

                          let rowsToAttempt = Math.min(10, allRows.length - currentRowIndex); // Increased to 10 for better utilization
                          let rowsForThisPage;
                          let finalCanvas;
                          let finalContentImgHeight;

                          while (rowsToAttempt > 0) {
                              rowsForThisPage = allRows.slice(currentRowIndex, currentRowIndex + rowsToAttempt);
                              const canvas = await renderRowsToCanvas(rowsForThisPage);
                              const canvasAspectRatio = canvas.width / canvas.height;
                              const contentImgHeight = pageContentWidth / canvasAspectRatio;
                              
                              if (contentImgHeight <= availablePageHeight || rowsToAttempt === 1) {
                                  finalCanvas = canvas;
                                  finalContentImgHeight = contentImgHeight;
                                  break;
                              }
                              
                              rowsToAttempt--;
                          }
                          
                          if (finalCanvas && rowsForThisPage.length > 0) {
                              const imgData = finalCanvas.toDataURL('image/jpeg', 0.8);
                              pdf.addImage(imgData, 'JPEG', margin, margin, pageContentWidth, finalContentImgHeight);
                              currentRowIndex += rowsForThisPage.length;
                          } else {
                              console.error("Could not fit any rows on the page, or loop finished.");
                              break; 
                          }
                      }
                  }

                  const totalPages = pdf.internal.getNumberOfPages();
                  for (let i = 1; i <= totalPages; i++) {
                      pdf.setPage(i);
                      pdf.setFontSize(8);
                      pdf.setTextColor(100, 100, 100);
                      const footerY = pdfHeight - margin + 5;
                      
                      pdf.text('This is a computer-generated report.', margin, footerY);
                      pdf.text(`Report generated on: ${new Date().toLocaleString()}`, margin, footerY + 10);
                      
                      const pageNumText = `Page ${i} of ${totalPages}`;
                      pdf.text(pageNumText, pdfWidth - margin, footerY + 10, { align: 'right' });
                  }
                  
                  document.body.removeChild(stagingContainer);
                  
                  const fileName = departmentName 
                    ? `${departmentName.replace(/\s+/g, '_')}_Activity_Report_${date.replace(/ to /g, '_')}.pdf`
                    : `Activity_Report_${date.replace(/ to /g, '_')}.pdf`;
                  pdf.save(fileName);

              } catch (error) {
                  console.error("Error generating PDF: ", error);
                  alert("An error occurred while generating the PDF.");
              } finally {
                  setIsGenerating(false);
              }
          }, [filteredEntries, departmentName, date]);

          useEffect(() => {
              if (isBatchMode && !isLoading && loadedGroupedEntries && onReady) {
                  const timer = setTimeout(() => {
                      onReady(handleDownloadPdf);
                  }, 1500);
                  return () => clearTimeout(timer);
              }
          }, [isBatchMode, isLoading, !!loadedGroupedEntries, onReady, handleDownloadPdf]);

          const handleDownloadExcel = () => {
              if (filteredEntries.length === 0) {
                  alert('No content to export.');
                  return;
              }

              const dataForExcel = [];
              let sl_no = 1;

              filteredEntries.forEach(group => {
                  const isDept = group.employeeId.startsWith('DEP_');
                  let empData = {};
                  if (isDept) {
                      const deptName = group.employeeId.substring(4);
                      empData = {
                          'Employee ID': 'N/A',
                          'Employee Name': 'Entire Department',
                          'Designation': 'N/A',
                          'Department': deptName
                      };
                  } else {
                      const employee = employees.find(e => e.id === group.employeeId);
                      if (employee) {
                          empData = {
                              'Employee ID': employee.id,
                              'Employee Name': employee.name,
                              'Designation': employee.designation,
                              'Department': employee.department
                          };
                      }
                  }

                  if (empData['Department'] || isDept) {
                      group.activities.forEach(activity => {
                          dataForExcel.push({
                              'S.L': sl_no++,
                              ...empData,
                              'Date': activity.date, 
                              'Time': activity.time,
                              'General Remarks': activity.remarks,
                              'Observation Details': activity.observation_details || '',
                          });
                      });
                  }
              });

              if (dataForExcel.length === 0) {
                  alert('No valid entries could be processed for the Excel export.');
                  return;
              }

              const ws = XLSX.utils.json_to_sheet(dataForExcel);

              ws['!cols'] = [
                  { wch: 5 },   
                  { wch: 15 },  
                  { wch: 30 },  
                  { wch: 25 },  
                  { wch: 30 },  
                  { wch: 12 },  
                  { wch: 10 },  
                  { wch: 60 },  
              ];

              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Activity Report');
              
              const excelFileName = departmentName 
                ? `${departmentName.replace(/\s+/g, '_')}_Activity_Report_${date.replace(/ to /g, '_')}.xlsx`
                : `Activity_Report_${date.replace(/ to /g, '_')}.xlsx`;
              XLSX.writeFile(wb, excelFileName);
          };
          
          const ReportContent = forwardRef(({ entries, slOffset = 0, id }, ref) => {
              if (!entries || entries.length === 0) {
                  return <p className="text-center text-gray-500 italic py-10 no-entries-message">No activities to display.</p>;
              }
              
              return (
                  <table ref={ref} id={id} className="w-full text-sm border-collapse border border-gray-300">
                      <thead className="bg-slate-200">
                          <tr>
                              <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[5%] text-gray-900">S.L</th>
                              <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[20%] text-gray-900">Employee Details</th>
                              <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[10%] text-gray-900">Time</th>
                              <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[35%] text-gray-900">General Remarks / Observation Details</th>
                              <th className="border border-gray-300 p-2 text-left font-semibold text-sm w-[30%] text-gray-900">Screenshot</th>
                          </tr>
                      </thead>
                      <tbody>
                          {entries.map((group, index) => {
                              const isDept = group.employeeId.startsWith('DEP_');
                              const employee = isDept ? null : employees.find(e => e.id === group.employeeId);
                              
                              const remarksGrouped = group.activities.reduce((acc, activity) => {
                                  const remarkText = (activity.remarks || '').trim();
                                  if (!acc[remarkText]) {
                                      acc[remarkText] = {
                                          remark: remarkText,
                                          instances: [],
                                          allScreenshots: [],
                                      };
                                  }
                                  acc[remarkText].instances.push(activity);
                                  acc[remarkText].allScreenshots.push(...activity.screenshots);
                                  return acc;
                              }, {});

                              const processedRemarks = Object.values(remarksGrouped).sort((a, b) => {
                                  const firstInstanceA = a.instances[0] || {};
                                  const firstInstanceB = b.instances[0] || {};
                                  const timeA = `${firstInstanceA.date || ''} ${firstInstanceA.time || ''}`;
                                  const timeB = `${firstInstanceB.date || ''} ${firstInstanceB.time || ''}`;
                                  return timeA.localeCompare(timeB);
                              });

                              return (
                                  <tr key={group.id}>
                                      <td className="border border-gray-300 p-2 align-top text-center text-gray-900">
                                          {slOffset + index + 1}
                                          {group.count > 1 && (
                                            <span className="block text-xs text-gray-500 italic">({group.count} entries)</span>
                                          )}
                                      </td>
                                      <td className="border border-gray-300 p-2 align-top">
                                          {isDept ? (
                                              <div>
                                                  <div className="font-bold text-indigo-700">{group.employeeId.substring(4)}</div>
                                                  <div className="text-xs text-gray-600">Entire Department</div>
                                              </div>
                                          ) : (employee ? (
                                              <div className="text-gray-900">
                                                  <div className="font-bold">{employee.name} ({employee.id})</div>
                                                  <div className="text-xs text-gray-600">{employee.designation}</div>
                                                  <div className="text-xs text-gray-600">{employee.department}</div>
                                              </div>
                                          ) : 'N/A')}
                                      </td>
                                      <td className="border border-gray-300 p-2 align-top">
                                          {processedRemarks.map((remarkGroup, rgIndex) => (
                                              <div key={rgIndex} className={`py-3 h-full ${rgIndex < processedRemarks.length - 1 ? 'border-b border-gray-200' : ''}`}>
                                                  <div className="flex flex-col gap-2">
                                                      {remarkGroup.instances.map((instance, instIndex) => {
                                                          const timeZone = getTimeZone(instance.time);
                                                          const timeZoneColor = timeZone ? timeZone.color.split(' ').filter(c => !c.startsWith('dark:')).join(' ') : '';
                                                          return (
                                                              <div key={instIndex} className="text-center">
                                                                  <div className="flex items-center justify-center gap-x-2">
                                                                      {isDateRange && instance.date && <span className="text-xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded font-mono">{formatDate(instance.date)}</span>}
                                                                      <span className="font-semibold text-gray-800 font-mono">{instance.time}</span>
                                                                  </div>
                                                                  {timeZone && (
                                                                      <div className={`mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-lg inline-block max-w-full whitespace-normal ${timeZoneColor}`}>
                                                                          {timeZone.name}
                                                                      </div>
                                                                  )}
                                                              </div>
                                                          )
                                                      })}
                                                  </div>
                                              </div>
                                          ))}
                                      </td>
                                      <td className="border border-gray-300 p-2 align-top">
                                        {processedRemarks.map((remarkGroup, rgIndex) => (
                                            <div key={rgIndex} className={`py-3 ${rgIndex < processedRemarks.length - 1 ? 'border-b border-gray-200' : ''}`}>
                                                <p className="text-sm whitespace-pre-wrap font-['Noto_Serif_Bengali'] text-gray-900 leading-relaxed">{remarkGroup.remark}</p>
                                                {remarkGroup.instances.map((inst, idx) => inst.observation_details ? (
                                                    <div key={idx} className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-100 italic">
                                                        {remarkGroup.instances.length > 1 && <span className="font-semibold text-amber-900 mr-1">[{inst.time}]:</span>}
                                                        {inst.observation_details}
                                                    </div>
                                                ) : null)}
                                            </div>
                                        ))}
                                      </td>
                                      <td className="border border-gray-300 p-2 align-top">
                                        {processedRemarks.map((remarkGroup, rgIndex) => (
                                            <div key={rgIndex} className={`py-3 ${rgIndex < processedRemarks.length - 1 ? 'border-b border-gray-200' : ''}`}>
                                                <div className="flex flex-col gap-2">
                                                    {remarkGroup.allScreenshots.slice(0, 10).map((src, imgIndex) => (
                                                        <a 
                                                            key={imgIndex} 
                                                            href={src.key ? `${window.location.origin}/api/media/${src.key}` : src.data} 
                                                            target="_blank" 
                                                            rel="noreferrer"
                                                            className="block transition-transform hover:scale-[1.02]"
                                                        >
                                                            <img src={src.data} alt={`screenshot`} referrerPolicy="no-referrer" className="w-full h-auto object-contain border rounded cursor-zoom-in" />
                                                        </a>
                                                    ))}
                                                </div>
                                                {remarkGroup.allScreenshots.length > 10 && (
                                                    <p className="text-xs text-gray-600 italic mt-2 text-center bg-gray-100 p-1 rounded">
                                                        (+{remarkGroup.allScreenshots.length - 10} more image{remarkGroup.allScreenshots.length - 10 > 1 ? 's' : ''})
                                                    </p>
                                                )}
                                            </div>
                                        ))}
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
              <div className={`fixed inset-0 bg-black/20 backdrop-blur-md flex flex-col items-center z-[100] p-4 overflow-y-auto ${isBatchMode ? 'pointer-events-none -z-50' : ''}`} style={isBatchMode ? { left: '-9999px' } : {}}>
                  <div className="bg-gray-100 rounded-lg w-full max-w-6xl my-8 flex-shrink-0">
                      <div className="p-4 bg-gray-100 border-b border-gray-300 flex justify-between items-center sticky top-0 z-10 rounded-t-lg">
                          <h2 className="text-xl font-bold text-gray-800">Report Preview</h2>
                          <div className="flex gap-4">
                              <button
                                  onClick={handleDownloadExcel}
                                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors"
                                  title="Export report data to an Excel file"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M3 6h18M3 18h18" />
                                  </svg>
                                  Export to Excel
                              </button>
                              <button
                                  onClick={handleDownloadPdf}
                                  disabled={isGenerating}
                                  className="flex items-center gap-2 px-5 py-2 bg-emerald-500 text-white font-semibold rounded-md hover:bg-emerald-600 disabled:bg-gray-400 transition-colors"
                              >
                                  {isGenerating ? (
                                      <React.Fragment>
                                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      Generating...
                                      </React.Fragment>
                                  ) : (
                                      <React.Fragment>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                      Download PDF
                                      </React.Fragment>
                                  )}
                              </button>
                              
                              {(isAdmin || (hasPermission && hasPermission('can_send_email'))) && (
                                  <button
                                      onClick={handleEmailReport}
                                      disabled={isEmailing}
                                      className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                                      title="Send report via email"
                                  >
                                      {isEmailing ? (
                                          <React.Fragment>
                                              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                              Processing...
                                          </React.Fragment>
                                      ) : (
                                          <React.Fragment>
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                              </svg>
                                              Email Report
                                          </React.Fragment>
                                      )}
                                  </button>
                              )}

                              {showEmailModal && createPortal(
                                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[250] p-0 md:p-4">
                                      <div className="bg-white dark:bg-slate-900 w-full h-full md:max-w-[98vw] md:h-[94vh] md:rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-300">
                                          
                                          {/* Modal Header */}
                                          <div className="p-4 md:px-6 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex justify-between items-center z-10 shrink-0">
                                              <div className="flex items-center gap-3">
                                                  <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
                                                      <Send className="h-5 w-5" />
                                                  </div>
                                                  <div>
                                                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Email Report Dashboard</h3>
                                                      <p className="text-xs text-slate-500 dark:text-slate-400">Compose and preview your report before sending</p>
                                                  </div>
                                              </div>
                                              <button 
                                                  onClick={() => setShowEmailModal(false)} 
                                                  className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-500 rounded-full transition-all"
                                              >
                                                  <X className="h-6 w-6" />
                                              </button>
                                          </div>
                                          
                                          {/* Modal Body (Split Pane) */}
                                          <div className="flex-1 flex overflow-hidden flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
                                              
                                              {/* Left Pane: Composition */}
                                              <div className="w-full md:w-[450px] lg:w-[500px] flex flex-col border-r dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar">
                                                  <div className="p-6 space-y-6">
                                                      {/* Recipients Seciton */}
                                                      <div className="space-y-4">
                                                          {/* To: */}
                                                          <div className="space-y-1.5 relative">
                                                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                                  <User className="h-3.5 w-3.5" /> Recipient (To)
                                                              </label>
                                                              <div className="min-h-[42px] flex flex-wrap gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 bg-white dark:bg-slate-800 transition-all">
                                                                  {emailRecipient.map(email => (
                                                                      <span key={email} className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border border-indigo-100 dark:border-indigo-800">
                                                                          {email}
                                                                          <button onClick={() => removeEmailChip(email, 'to')} className="hover:text-rose-500"><X className="h-3 w-3" /></button>
                                                                      </span>
                                                                  ))}
                                                                  <input 
                                                                      type="text"
                                                                      className="flex-1 min-w-[120px] bg-transparent outline-none text-sm dark:text-white h-6"
                                                                      placeholder={emailRecipient.length === 0 ? "Enter email and press Enter..." : ""}
                                                                      value={activeEmailField === 'to' ? emailInput : ''}
                                                                      onFocus={() => { setActiveEmailField('to'); setEmailInput(''); }}
                                                                      onBlur={() => { setTimeout(() => setActiveEmailField(null), 200); }}
                                                                      onChange={(e) => setEmailInput(e.target.value)}
                                                                      onKeyDown={(e) => handleAddEmailChip(e, 'to')}
                                                                  />
                                                              </div>
                                                              {activeEmailField === 'to' && renderEmailSuggestions('to', emailInput)}
                                                          </div>

                                                          {/* CC / BCC Toggle-like inputs */}
                                                          <div className="grid grid-cols-1 gap-4">
                                                              <div className="space-y-1.5 relative">
                                                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">CC</label>
                                                                  <div className="min-h-[42px] flex flex-wrap gap-1.5 p-2 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 bg-white dark:bg-slate-800 transition-all">
                                                                      {emailCC.map(email => (
                                                                          <span key={email} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg text-xs flex items-center gap-1">
                                                                              {email}
                                                                              <button onClick={() => removeEmailChip(email, 'cc')} className="hover:text-rose-500"><X className="h-3 w-3" /></button>
                                                                          </span>
                                                                      ))}
                                                                      <input 
                                                                          type="text"
                                                                          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm dark:text-white"
                                                                          value={activeEmailField === 'cc' ? emailInput : ''}
                                                                          onFocus={() => { setActiveEmailField('cc'); setEmailInput(''); }}
                                                                          onBlur={() => { setTimeout(() => setActiveEmailField(null), 200); }}
                                                                          onChange={(e) => setEmailInput(e.target.value)}
                                                                          onKeyDown={(e) => handleAddEmailChip(e, 'cc')}
                                                                      />
                                                                  </div>
                                                                  {activeEmailField === 'cc' && renderEmailSuggestions('cc', emailInput)}
                                                              </div>
                                                              <div className="space-y-1.5 relative">
                                                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">BCC</label>
                                                                  <div className="min-h-[42px] flex flex-wrap gap-1.5 p-2 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 bg-white dark:bg-slate-800 transition-all">
                                                                      {emailBCC.map(email => (
                                                                          <span key={email} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg text-xs flex items-center gap-1">
                                                                              {email}
                                                                              <button onClick={() => removeEmailChip(email, 'bcc')} className="hover:text-rose-500"><X className="h-3 w-3" /></button>
                                                                          </span>
                                                                      ))}
                                                                      <input 
                                                                          type="text"
                                                                          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm dark:text-white"
                                                                          value={activeEmailField === 'bcc' ? emailInput : ''}
                                                                          onFocus={() => { setActiveEmailField('bcc'); setEmailInput(''); }}
                                                                          onBlur={() => { setTimeout(() => setActiveEmailField(null), 200); }}
                                                                          onChange={(e) => setEmailInput(e.target.value)}
                                                                          onKeyDown={(e) => handleAddEmailChip(e, 'bcc')}
                                                                      />
                                                                  </div>
                                                                  {activeEmailField === 'bcc' && renderEmailSuggestions('bcc', emailInput)}
                                                              </div>
                                                          </div>
                                                      </div>

                                                      {/* Subject */}
                                                      <div className="space-y-1.5">
                                                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                              <FileText className="h-3.5 w-3.5" /> Subject
                                                          </label>
                                                          <input 
                                                              type="text" 
                                                              value={emailSubject} 
                                                              onChange={(e) => setEmailSubject(e.target.value)}
                                                              onFocus={() => { setActiveEmailField(null); setEmailInput(''); }}
                                                              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-sm font-semibold dark:text-white outline-none transition-all"
                                                          />
                                                      </div>

                                                      {/* Message Body */}
                                                      <div className="space-y-1.5">
                                                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                              <CornerUpRight className="h-3.5 w-3.5" /> Message Body
                                                          </label>
                                                          <div className="relative">
                                                              <textarea
                                                                  value={emailMessage}
                                                                  onChange={(e) => setEmailMessage(e.target.value)}
                                                                  onFocus={() => { setActiveEmailField(null); setEmailInput(''); }}
                                                                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-sm dark:text-white outline-none min-h-[160px] leading-relaxed resize-none custom-scrollbar"
                                                                  placeholder="Add a personalized message for the user..."
                                                              />
                                                              <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
                                                                  <span className="text-[10px] font-bold text-slate-400">PLAIN TEXT</span>
                                                              </div>
                                                          </div>
                                                          <p className="text-[10px] text-slate-400 italic flex items-center gap-1">
                                                              <Info className="h-3 w-3" /> This message will appear before the generated report in the email.
                                                          </p>
                                                      </div>
                                                  </div>
                                              </div>

                                              {/* Right Pane: Live Report Preview */}
                                              <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden relative group">
                                                  <div className="p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b dark:border-slate-800 flex justify-between items-center shrink-0">
                                                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                          <Eye className="h-4 w-4" />
                                                          <span className="text-xs font-bold uppercase tracking-widest">Report Body Preview</span>
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                          <span className="text-[10px] font-bold text-emerald-600">PRE-GENERATED</span>
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                                                      <div className="bg-white p-6 shadow-xl rounded-xl border border-slate-200 transform origin-top transition-transform duration-500 group-hover:scale-[1.01]">
                                                          {/* User Message Preview */}
                                                          <div className="mb-8 p-4 bg-indigo-50/50 border-l-4 border-indigo-500 rounded-r-lg">
                                                              <p className="text-sm text-slate-800 whitespace-pre-wrap italic">
                                                                  {emailMessage || "No additional message added."}
                                                              </p>
                                                          </div>

                                                          {/* Rendered Report */}
                                                          <div 
                                                              className="prose prose-sm max-w-none rendered-report-container overflow-x-auto"
                                                              dangerouslySetInnerHTML={{ __html: reportHtml.replace(/cid:([a-zA-Z0-9]+)/g, (match, cid) => {
                                                                  const attachment = emailAttachments.find(a => a.cid === cid);
                                                                  return attachment ? `data:image/jpeg;base64,${attachment.content}` : match;
                                                              }) }} 
                                                          />
                                                      </div>
                                                  </div>

                                                  {/* Mobile Toggle Shadow */}
                                                  <div className="absolute md:hidden bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-900/20 pointer-events-none"></div>
                                              </div>
                                          </div>
                                          
                                          {/* Modal Footer */}
                                          <div className="p-4 md:px-8 bg-white dark:bg-slate-900 border-t dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                                              <div className="flex items-center gap-4 text-xs">
                                                  <div className="flex items-center gap-1.5 text-slate-500">
                                                      <FileText className="h-4 w-4" />
                                                      <span>1 Attachment (Report Content Inline)</span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 text-slate-500">
                                                      <Clock className="h-4 w-4" />
                                                      <span>Instant delivery</span>
                                                  </div>
                                              </div>

                                              <div className="flex items-center gap-3 w-full md:w-auto">
                                                  <button 
                                                      onClick={() => setShowEmailModal(false)}
                                                      className="flex-1 md:flex-none px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                                                  >
                                                      Draft Later
                                                  </button>
                                                  <button 
                                                      onClick={handleSendFinalEmail}
                                                      disabled={isEmailing}
                                                      className="flex-1 md:flex-none px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:shadow-none"
                                                  >
                                                      {isEmailing ? (
                                                          <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                      ) : (
                                                          <>
                                                              <span>Send Official Report</span>
                                                              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                                          </>
                                                      )}
                                                  </button>
                                              </div>
                                          </div>
                                      </div>
                                  </div>,
                                  document.body
                              )}
                              <button
                                onClick={onClose}
                                className="px-5 py-2 bg-rose-500 text-white font-semibold rounded-md hover:bg-rose-600"
                              >
                                Close
                              </button>
                          </div>
                      </div>

                      <div className="p-8 bg-gray-200">
                          <div id="visible-preview-content" className="bg-white mx-auto max-w-4xl p-12 shadow-inner">
                              <div id="pdf-header-visible" className="pb-4 mb-2">
                                  <div className="relative text-center border-b pb-4">
                                      {logoBase64 && (
                                          <img 
                                              src={logoBase64} 
                                              alt="Company Logo" 
                                              referrerPolicy="no-referrer"
                                              className="absolute top-0 left-0 h-16 w-auto max-w-[150px] object-contain"
                                          />
                                      )}
                                      <h1 className="text-2xl font-bold text-gray-800 tracking-wider">
                                          Credence Housing Limited
                                      </h1>
                                      <p className="text-xs text-gray-500 mt-1">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
                                      <h2 className="text-lg font-semibold text-gray-600 mt-2">
                                          Employee Work Activities Observation
                                          {departmentName && <span className="block text-sm text-indigo-600 font-bold mt-1 uppercase tracking-loose">[{departmentName} Department]</span>}
                                      </h2>
                                  </div>
                                  <div className="flex justify-between items-end mt-4">
                                      <h3 className="text-md font-semibold text-gray-700">{reportTitle}</h3>
                                      <p className="text-sm text-gray-600 font-medium">Date: {formatDateDisplay(date)}</p>
                                  </div>
                              </div>
                               <ReportContent entries={filteredEntries} id="visible-pdf-table" />

                              {specialObsEntries && specialObsEntries.length > 0 && (
                                <div className="mt-8 border-t-2 border-amber-400 pt-6">
                                  <h3 className="text-lg font-bold text-amber-700 mb-4 flex items-center gap-2">
                                    <span>⚑</span> Special Observations
                                  </h3>
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="bg-amber-50">
                                        <th className="border border-amber-200 p-2 text-left font-semibold text-amber-800">Date</th>
                                        <th className="border border-amber-200 p-2 text-left font-semibold text-amber-800">Time</th>
                                        <th className="border border-amber-200 p-2 text-left font-semibold text-amber-800">Category</th>
                                        <th className="border border-amber-200 p-2 text-left font-semibold text-amber-800">Observation</th>
                                        <th className="border border-amber-200 p-2 text-left font-semibold text-amber-800">Action Taken</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {specialObsEntries.map((obs, idx) => (
                                        <tr key={obs.id || idx} className={idx % 2 === 0 ? "bg-white" : "bg-amber-50/40"}>
                                          <td className="border border-amber-100 p-2 text-gray-700 whitespace-nowrap">{obs.date?.split("T")[0] || ""}</td>
                                          <td className="border border-amber-100 p-2 text-gray-700 whitespace-nowrap">{obs.time || ""}</td>
                                          <td className="border border-amber-100 p-2">
                                            {obs.category && (
                                              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">{obs.category}</span>
                                            )}
                                          </td>
                                          <td className="border border-amber-100 p-2 text-gray-800 whitespace-pre-wrap">{obs.observation_details || obs.details || ""}</td>
                                          <td className="border border-amber-100 p-2 text-gray-700 whitespace-pre-wrap">{obs.action_taken || ""}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                          </div>

                           <div className="absolute left-[-9999px] top-0 w-[1024px]" aria-hidden="true">
                              <div ref={pdfContentRef} id="pdf-content-wrapper" className="bg-white mx-auto max-w-4xl p-12">
                                  <div ref={headerRef} id="pdf-header" className="pb-4 mb-2">
                                      <div className="relative text-center border-b pb-4">
                                          {logoBase64 && (
                                              <img 
                                                  src={logoBase64} 
                                                  alt="Company Logo" 
                                                  referrerPolicy="no-referrer"
                                                  className="absolute top-0 left-0 h-16 w-auto max-w-[150px] object-contain"
                                          />
                                          )}
                                          <h1 className="text-2xl font-bold text-gray-800 tracking-wider">
                                              Credence Housing Limited
                                          </h1>
                                          <p className="text-xs text-gray-500 mt-1">House-20, Road-11 (32-Old), Dhanmondi, Dhaka</p>
                                          <h2 className="text-lg font-semibold text-gray-600 mt-2">
                                              Employee Work Activities Observation
                                              {departmentName && <span className="block text-sm text-indigo-600 font-bold mt-1 uppercase tracking-loose">[{departmentName} Department]</span>}
                                          </h2>
                                      </div>
                                      <div className="flex justify-between items-end mt-4">
                                          <h3 className="text-md font-semibold text-gray-700">{reportTitle}</h3>
                                          <p className="text-sm text-gray-600 font-medium">Date: {formatDateDisplay(date)}</p>
                                      </div>
                                  </div>
                                  <ReportContent ref={tableRef} entries={filteredEntries} id="hidden-pdf-table" />
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          );
      };

export default CasualPreview;
