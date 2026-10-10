import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import ActivityRow from './CasualActivityRow';

const ActivityForm = ({ entries, allEntries, onUpdateRow, onRemoveRow, onSaveRow, isEditing, onRowFocus, lastFocusedRowId, employees, availableRemarks, isAdmin, allProfiles, showDate, currentUserId, getImage, deleteImage, hasPermission }) => {
          return (
              <div className="overflow-auto max-h-[60vh] border border-gray-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full border-collapse bg-white dark:bg-slate-800">
                      <thead>
                          <tr className="bg-slate-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300 sticky top-0 z-10">
                              {(isEditing || showDate) && <th className="px-3 py-2 text-left font-semibold text-sm w-[10%]">Date</th>}
                              <th className="px-3 py-2 text-left font-semibold text-sm w-[20%]">Employee(s)</th>
                              <th className="px-3 py-2 text-left font-semibold text-sm w-[20%]">Details</th>
                              <th className="px-3 py-2 text-left font-semibold text-sm w-[10%]">Time</th>
                              <th className="px-3 py-2 text-left font-semibold text-sm w-[25%]">Remarks</th>
                              <th className="px-3 py-2 text-left font-semibold text-sm w-[15%]">Screenshot</th>
                              <th className="px-3 py-2 text-center font-semibold text-sm w-[5%]">Action</th>
                          </tr>
                      </thead>
                      <tbody>
                          {entries.length > 0 ? (
                              entries.map((entry) => (
                                  <ActivityRow
                                      key={entry.id}
                                      entry={entry}
                                      onUpdate={onUpdateRow}
                                      onRemove={onRemoveRow}
                                      onSave={onSaveRow}
                                      isEditing={isEditing}
                                      onRowFocus={onRowFocus}
                                      isFocused={entry.id === lastFocusedRowId}
                                      employees={employees}
                                      availableRemarks={availableRemarks}
                                      isAdmin={isAdmin}
                                      allProfiles={allProfiles}
                                      showDate={showDate}
                                      currentUserId={currentUserId}
                                      getImage={getImage}
                                      deleteImage={deleteImage}
                                      hasPermission={hasPermission}
                                  />
                              ))
                          ) : (
                              <tr className="border-b border-gray-200 dark:border-slate-700">
                                  <td colSpan={(isEditing || showDate) ? 7 : 6} className="p-8 text-center text-gray-500 dark:text-gray-400 italic">
                                      No matching entries found. Try changing your search term or date.
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          );
      };

export default ActivityForm;