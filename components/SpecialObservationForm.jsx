import React from 'react';
import SpecialObservationRow from './SpecialObservationRow';

const SpecialObservationForm = ({ entries, onUpdateRow, onRemoveRow, onSaveRow, isEditing, onRowFocus, lastFocusedRowId, employees, availableRemarks, isAdmin, allProfiles, showDate, currentUserId, getImage, deleteImage, hasPermission }) => {
    return (
        <div className="overflow-auto max-h-[60vh] border border-gray-200 dark:border-slate-700 rounded-lg shadow-sm">
            <table className="w-full border-collapse bg-white dark:bg-slate-800">
                <thead>
                    <tr className="bg-amber-100 text-amber-900 font-bold dark:bg-amber-900/50 dark:text-amber-100 sticky top-0 z-10">
                        {(isEditing || showDate) && <th className="px-3 py-3 text-left text-xs uppercase w-[10%]">Date</th>}
                        <th className="px-3 py-3 text-left text-xs uppercase w-[15%]">Employee(s)</th>
                        <th className="px-3 py-3 text-left text-xs uppercase w-[15%]">Details</th>
                        <th className="px-3 py-3 text-left text-xs uppercase w-[8%]">Time</th>
                        <th className="px-3 py-3 text-left text-xs uppercase w-[15%]">General Remark</th>
                        <th className="px-3 py-3 text-left text-xs uppercase w-[22%]">Observation Detail</th>
                        <th className="px-3 py-3 text-left text-xs uppercase w-[12%]">Screenshot</th>
                        <th className="px-3 py-3 text-center text-xs uppercase w-[5%]">Action</th>
                    </tr>
                </thead>
                <tbody>{entries && entries.length > 0 ? (
                        entries.filter(e => e && e.id).map((entry) => (
                            <SpecialObservationRow
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
                        <tr>
                            <td colSpan={(isEditing || showDate) ? 8 : 7} className="p-12 text-center text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-slate-700/30">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    No special observations recorded.
                                </div>
                            </td>
                        </tr>
                    )}</tbody>
            </table>
        </div>
    );
};

export default SpecialObservationForm;
