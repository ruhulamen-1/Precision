import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import EmployeeSearch from './CasualEmployeeSearch';
import RemarksInput from './CasualRemarksInput';
import ImageUpload from './CasualImageUpload';
import ActivityCommentModal from './CasualActivityCommentModal';
import { getTimeZone } from '../utils/casualHelpers';

const ActivityRow = ({ entry, onUpdate, onRemove, isEditing, onRowFocus, isFocused, employees, availableRemarks, isAdmin, allProfiles, showDate, currentUserId, getImage, deleteImage, hasPermission, onSave, allEntries }) => {
          if (!entry) return null;
          const remarksInputRef = useRef(null);
          const imageUploadRef = useRef(null);
          const employeeSearchRef = useRef(null);
          const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
          const [hasUnreadComments, setHasUnreadComments] = useState(false);
          const [lastCommentCount, setLastCommentCount] = useState(0);

          // Track local state for unsaved changes
          const [localEntry, setLocalEntry] = useState(entry);
          const [isDirty, setIsDirty] = useState(false);

          // Update local state when prop entry changes from outside (e.g. initial load)
          useEffect(() => {
              if (entry && entry.id && !isDirty) {
                  setLocalEntry(entry);
              }
          }, [entry, isDirty]);

          // Always sync screenshots from parent as they might be updated via paste or other external actions
          useEffect(() => {
              if (entry && entry.screenshots && localEntry && JSON.stringify(entry.screenshots) !== JSON.stringify(localEntry.screenshots)) {
                  setLocalEntry(prev => prev ? ({ ...prev, screenshots: entry.screenshots }) : prev);
              }
          }, [entry?.screenshots]);

          useEffect(() => {
              const checkComments = async () => {
                  try {
                      const response = await fetch('/api/activity_comments');
                      if (response.ok) {
                          const allComments = await response.json();
                          const commentsForActivity = allComments.filter(c => c.activity_id === entry.id);
                          const count = commentsForActivity.length;
                          
                          // Get last viewed count from local storage
                          const seenCount = parseInt(localStorage.getItem(`seen_comments_${entry.id}`) || '0');
                          
                          setHasUnreadComments(count > seenCount);
                          setLastCommentCount(count);
                      }
                  } catch (e) {
                      console.error("Error checking comments:", e);
                  }
              };
              checkComments();
              const interval = setInterval(checkComments, 30000); // Check every 30s
              return () => clearInterval(interval);
          }, [entry.id]);

          const handleOpenModal = () => {
              localStorage.setItem(`seen_comments_${entry.id}`, lastCommentCount.toString());
              setHasUnreadComments(false);
              setIsCommentModalOpen(true);
          }

          const canEdit = useMemo(() => {
              if (isAdmin) return true;
              if (entry.isNew || !entry.user_id) return true;
              return !!(hasPermission && (hasPermission('can_edit_activity') || hasPermission('can_edit_data')));
          }, [isAdmin, entry.user_id, entry.isNew, hasPermission]);

          const canDelete = useMemo(() => {
              if (isAdmin) return true;
              if (entry.isNew || !entry.user_id || entry.user_id === currentUserId) return true;
              return !!(hasPermission && (hasPermission('can_delete_activity') || hasPermission('can_edit_data')));
          }, [isAdmin, entry.user_id, entry.isNew, currentUserId, hasPermission]);

          useEffect(() => {
              if (entry.isNew && isFocused) {
                  employeeSearchRef.current?.focus();
                  const entryWithoutFlag = { ...entry };
                  delete entryWithoutFlag.isNew;
                  onUpdate(entryWithoutFlag);
              }
          }, [entry, isFocused, onUpdate]);

          const handleFieldChange = (field, value) => {
              let updatedValue = value;
              if (field === 'remarks') {
                  const targetEn = 'Present in the office but still dressed in casual attire.';
                  const targetBn = 'অফিসে উপস্থিত থেকেও এখনো ক্যাজুয়াল পোশাকে অবস্থান করছেন।';
                  // Auto-append time in bold if specific remark is selected
                  if (value === targetEn || value === targetBn) {
                      updatedValue = `${value} **${localEntry.time}**`;
                  }
              }
              const newEntry = { ...localEntry, [field]: updatedValue };
              setLocalEntry(newEntry);
              setIsDirty(true);
              // Use onUpdate ONLY to keep App state in sync for row ordering/listing, 
              // but we will control the actual sync via onSave
              onUpdate(newEntry);
          };

          const handleEmployeeSelect = (employeeIds) => {
              const newEntry = { ...localEntry, employeeIds: [...new Set(employeeIds)] };
              setLocalEntry(newEntry);
              setIsDirty(true);
              onUpdate(newEntry);
          };

          const handleSave = () => {
              if (onSave) {
                  onSave(localEntry);
                  setIsDirty(false);
              }
          };

          const handleRemarkSelected = () => {
              imageUploadRef.current?.focus();
          };

          const timeZone = useMemo(() => getTimeZone(localEntry.time), [localEntry.time]);

          // Remarks previously used for the currently selected employee(s),
          // most recent first, so they surface at the top of the Remarks
          // dropdown (tagged "Used Previously" by RemarksInput).
          const historyRemarks = useMemo(() => {
              const selectedIds = Array.isArray(localEntry.employeeIds) ? localEntry.employeeIds : [];
              if (selectedIds.length === 0 || !Array.isArray(allEntries)) return [];

              const selectedSet = new Set(selectedIds);
              const matches = allEntries
                  .filter(e =>
                      String(e.id) !== String(localEntry.id) &&
                      !e.is_deleted &&
                      e.remarks &&
                      Array.isArray(e.employeeIds) &&
                      e.employeeIds.some(id => selectedSet.has(id))
                  )
                  .sort((a, b) => {
                      const aKey = `${a.date || ''} ${a.time || ''}`;
                      const bKey = `${b.date || ''} ${b.time || ''}`;
                      return bKey.localeCompare(aKey);
                  });

              const seen = new Set();
              const result = [];
              for (const e of matches) {
                  const r = e.remarks.trim();
                  if (r && !seen.has(r)) {
                      seen.add(r);
                      result.push(r);
                  }
              }
              return result.slice(0, 10);
          }, [localEntry.employeeIds, localEntry.id, allEntries]);

          const isUnsaved = isDirty || entry.isTemporary;

          // Auto-save debounced only when dirty
          useEffect(() => {
              if (isDirty && onSave) {
                  const timer = setTimeout(() => {
                      onSave(localEntry);
                      setIsDirty(false);
                  }, 5000);
                  return () => clearTimeout(timer);
              }
          }, [isDirty, localEntry, onSave]);

          return (
              <tr 
                  className={`border-b border-gray-200 dark:border-slate-700 align-top transition-all ${isFocused ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50'} ${isUnsaved ? 'relative ring-1 ring-inset ring-red-500/50' : ''}`}
                  onFocusCapture={() => onRowFocus(entry?.id)}
                  onClickCapture={() => onRowFocus(entry?.id)}
              >
                  {(isEditing || showDate) && (
                      <td className="p-1.5">
                          {isEditing ? (
                              <input
                                  type="date"
                                  className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-md h-full bg-gray-50 dark:bg-slate-700 dark:text-gray-200 dark:[color-scheme:dark] text-sm"
                                  value={localEntry.date || ''}
                                  onChange={(e) => handleFieldChange('date', e.target.value)}
                              />
                          ) : (
                              <div className="p-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                                  {localEntry.date}
                              </div>
                          )}
                      </td>
                  )}
                  <td className="p-1.5">
                      <EmployeeSearch
                          ref={employeeSearchRef}
                          value={Array.isArray(localEntry.employeeIds) ? localEntry.employeeIds : []}
                          onSelect={handleEmployeeSelect}
                          employees={employees}
                          disabled={(showDate && !isAdmin) || !canEdit}
                      />
                  </td>
                  <td className="p-1.5">
                      <div
                          className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-300 h-full flex items-center text-sm bg-gray-50 dark:bg-slate-700"
                          aria-label="Selected employee details"
                      >
                         {(Array.isArray(localEntry.employeeIds) && localEntry.employeeIds.length > 0) ? (
                              <ul className="space-y-1">
                                  {[...new Set(localEntry.employeeIds)].map(id => {
                                      if (id.startsWith('DEP_')) {
                                           const deptName = id.substring(4);
                                           return (
                                               <li key={id} className="text-xs truncate font-bold text-indigo-600 dark:text-indigo-400" title={`Entire Department: ${deptName}`}>
                                                   {deptName} (All)
                                               </li>
                                           );
                                      }
                                      const employee = employees.find(e => e.id === id);
                                      return (
                                          <li key={id} className="text-xs truncate" title={employee ? `${employee.name} - ${employee.designation} (${employee.department})` : 'Unknown Employee'}>
                                              {employee ? `${employee.name} - ${employee.designation}` : 'Unknown Employee'}
                                          </li>
                                      );
                                  })}
                              </ul>
                          ) : (
                              <span className="text-gray-400 dark:text-gray-500">Name & Designation</span>
                          )}
                      </div>
                  </td>
                  <td className="p-1.5">
                      <div>
                          <input
                              type="time"
                              className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 dark:text-gray-200 dark:[color-scheme:dark] text-sm disabled:opacity-50"
                              value={localEntry.time}
                              onChange={(e) => handleFieldChange('time', e.target.value)}
                              required
                              disabled={(showDate && !isAdmin) || !canEdit}
                          />
                          {timeZone && (
                            <div className={`mt-1 text-center text-xs font-semibold px-2 py-0.5 rounded-full ${timeZone.color}`}>
                                {timeZone.name}
                            </div>
                          )}
                          {isAdmin && localEntry.user_id && (
                              <div className="mt-1 text-center text-[10px] text-gray-500 dark:text-gray-400 truncate" title="Created by">
                                  {allProfiles?.find(p => p.id === localEntry.user_id)?.name || 'Unknown User'}
                              </div>
                          )}
                      </div>
                  </td>
                  <td className="p-1.5 h-full relative group/remarks">
                      <RemarksInput
                          ref={remarksInputRef}
                          value={localEntry.remarks}
                          onChange={(value) => handleFieldChange('remarks', value)}
                          onRemarkSelect={handleRemarkSelected}
                          historyRemarks={historyRemarks}
                          availableRemarks={availableRemarks}
                          disabled={(showDate && !isAdmin) || !canEdit}
                      />
                  </td>
                    <td className="p-1.5 h-full">
                        <ImageUpload
                            ref={imageUploadRef}
                            screenshots={localEntry.screenshots}
                            onUpdate={(screenshots) => handleFieldChange('screenshots', screenshots)}
                            disabled={(showDate && !isAdmin) || !canEdit}
                            getImage={getImage}
                            deleteImage={deleteImage}
                        />
                    </td>
                  <td className="p-1.5">
                      <div className="flex items-center justify-center gap-1 h-full">
                          {isDirty && (
                              <button
                                  type="button"
                                  onClick={handleSave}
                                  title="Save changes"
                                  className="text-emerald-500 w-8 h-8 flex items-center justify-center rounded-full hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors animate-pulse"
                              >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                  </svg>
                              </button>
                          )}
                          {localEntry.id && !entry.isTemporary && (isAdmin || hasPermission('can_access_discussion')) && (
                              <button
                                  type="button"
                                  onClick={handleOpenModal}
                                  title="Add or view comments"
                                  className="relative text-indigo-500 w-8 h-8 flex items-center justify-center rounded-full hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors"
                              >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                  </svg>
                                  {hasUnreadComments && (
                                     <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-slate-800"></span>
                                  )}
                              </button>
                          )}
                          {((!showDate || isAdmin) && canDelete) && (
                              <button
                                  type="button"
                                  onClick={() => onRemove(localEntry.id)}
                                  title="Remove this entry"
                                  className="text-gray-400 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-500 dark:text-gray-500 dark:hover:bg-red-900/50 dark:hover:text-red-400 transition-colors"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                              </button>
                          )}
                      </div>
                      <ActivityCommentModal 
                         isOpen={isCommentModalOpen}
                         onClose={() => setIsCommentModalOpen(false)}
                         activityId={localEntry.id}
                         currentUserId={currentUserId}
                         allProfiles={allProfiles}
                      />
                  </td>
              </tr>
          );
      };

export default ActivityRow;