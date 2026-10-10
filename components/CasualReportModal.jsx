import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';


const EmployeeSelectionModal = ({ initialSelectedIds, onClose, onConfirm, employees }) => {
    const [selectedIds, setSelectedIds] = useState(new Set(initialSelectedIds));
    const [searchTerm, setSearchTerm] = useState('');

    const handleToggle = (employeeId) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(employeeId)) {
            newSet.delete(employeeId);
        } else {
            newSet.add(employeeId);
        }
        setSelectedIds(newSet);
    };

    const filteredEmployees = useMemo(() => {
        if (!searchTerm) return employees;
        const lowercasedTerm = searchTerm.toLowerCase();
        return employees.filter(emp =>
            emp.name.toLowerCase().includes(lowercasedTerm) ||
            emp.id.toLowerCase().includes(lowercasedTerm) ||
            emp.department.toLowerCase().includes(lowercasedTerm)
        );
    }, [searchTerm, employees]);

    const employeesByDepartment = useMemo(() => {
        return filteredEmployees.reduce((acc, employee) => {
            const { department } = employee;
            if (!acc[department]) acc[department] = [];
            acc[department].push(employee);
            return acc;
        }, {});
    }, [filteredEmployees]);

    const departments = Object.keys(employeesByDepartment);

    const handleSelectAll = () => {
        setSelectedIds(new Set(filteredEmployees.map(e => e.id)));
    };

    const handleDeselectAll = () => {
        setSelectedIds(new Set());
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex justify-center items-center z-[60] p-4">
            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-3xl flex flex-col h-[90vh] border border-white/20 dark:border-slate-700/50">
                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Select Employees</h2>
                <div className="mb-4 flex gap-4">
                    <input
                        type="text"
                        placeholder="Search by name, ID, or department..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200"
                    />
                    <button onClick={handleSelectAll} className="px-4 py-2 bg-blue-100 text-blue-800 dark:bg-sky-900/70 dark:text-sky-300 rounded text-sm font-semibold">Select All</button>
                    <button onClick={handleDeselectAll} className="px-4 py-2 bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-slate-300 rounded text-sm font-semibold">Deselect All</button>
                </div>

                <div className="flex-grow overflow-y-auto border dark:border-slate-700 rounded-lg">
                    {departments.length > 0 ? departments.map(department => (
                        <div key={department}>
                            <h3 className="bg-gray-100 dark:bg-slate-700/50 p-2 font-semibold text-gray-700 dark:text-gray-300 sticky top-0">{department}</h3>
                            <ul>
                                {employeesByDepartment[department].map(employee => (
                                    <li key={employee.id} className="flex items-center p-2 border-b border-gray-100 dark:border-slate-700">
                                        <label className="flex items-center w-full cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(employee.id)}
                                                onChange={() => handleToggle(employee.id)}
                                                className="h-4 w-4 rounded border-gray-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500 bg-transparent"
                                            />
                                            <span className="ml-3 text-sm text-gray-800 dark:text-gray-300">{employee.name} <span className="text-gray-500 dark:text-gray-400">({employee.id})</span></span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )) : (
                        <p className="text-center p-8 text-gray-500 dark:text-gray-400 italic">No employees match your search.</p>
                    )}
                </div>

                <div className="flex justify-end gap-4 mt-6 border-t dark:border-slate-700 pt-4">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600">
                        Cancel
                    </button>
                    <button onClick={() => onConfirm(Array.from(selectedIds))} className="px-6 py-2 bg-emerald-500 text-white font-semibold rounded-md hover:bg-emerald-600">
                        Confirm ({selectedIds.size})
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const CasualReportModal = ({ onClose, onGenerate, employees, activityEntries = [], availableRemarks = [], initialFilters = null }) => {
          const today = new Date().toISOString().split('T')[0];
          const [startDate, setStartDate] = useState(today);
          const [endDate, setEndDate] = useState(today);

          const [selectedDepartment, setSelectedDepartment] = useState(initialFilters?.department || '');
          const [selectedDepartments, setSelectedDepartments] = useState(initialFilters?.selectedDepartments || []);
          const [isSeparateByDept, setIsSeparateByDept] = useState(initialFilters?.isSeparateByDept || false);
          const [excludedDepartments, setExcludedDepartments] = useState(initialFilters?.excludedDepartments || []);
          const [customSelectedIds, setCustomSelectedIds] = useState(initialFilters?.customEmployeeIds || []);
          const [includeSpecialObs, setIncludeSpecialObs] = useState(initialFilters?.includeSpecialObs || false);
          const [remarksSearchTerm, setRemarksSearchTerm] = useState(initialFilters?.remarksText || '');
          const [selectedRemarkCategory, setSelectedRemarkCategory] = useState(initialFilters?.remarkCategory || '');
          const [selectedTimeZone, setSelectedTimeZone] = useState(initialFilters?.timeZone || 'all');
          const [isEmployeeSelectorOpen, setIsEmployeeSelectorOpen] = useState(false);
          const [isExcludeDropdownOpen, setIsExcludeDropdownOpen] = useState(false);
          
          const excludeDropdownRef = useRef(null);

          const departments = useMemo(() => [...new Set(employees.map(e => e.department))].sort(), [employees]);
          
          const uniqueRemarks = useMemo(() => {
              const remarksSet = new Set();
              if (activityEntries) {
                  activityEntries.forEach(entry => {
                      if (entry.remarks) remarksSet.add(entry.remarks.trim());
                  });
              }
              return Array.from(remarksSet).filter(Boolean).sort();
          }, [activityEntries]);

          const TIME_ZONES_FOR_FILTER = [
              { id: 'all', name: 'All Time Zones' },
              { id: 'Morning Drive', name: 'Morning Drive' },
              { id: 'Core Hours', name: 'Core Hours' },
              { id: 'Lunch Block', name: 'Lunch Block' },
              { id: 'Wrap-up Zone', name: 'Wrap-up Zone' }
          ];

          useEffect(() => {
              const handleClickOutside = (event) => {
                  if (excludeDropdownRef.current && !excludeDropdownRef.current.contains(event.target)) {
                      setIsExcludeDropdownOpen(false);
                  }
              };
              if (isExcludeDropdownOpen) {
                  document.addEventListener('mousedown', handleClickOutside);
              }
              return () => {
                  document.removeEventListener('mousedown', handleClickOutside);
              };
          }, [isExcludeDropdownOpen]);

          const handleGenerateClick = () => {
              if (!startDate || !endDate) {
                  alert('Please select both a start and end date.');
                  return;
              }
              if (new Date(startDate) > new Date(endDate)) {
                  alert('Start date cannot be after the end date.');
                  return;
              }

              const filters = {
                  department: selectedDepartment,
                  selectedDepartments: selectedDepartments,
                  isSeparateByDept: isSeparateByDept,
                  excludedDepartments: excludedDepartments,
                  customEmployeeIds: customSelectedIds,
                  remarksText: remarksSearchTerm,
                  remarkCategory: selectedRemarkCategory,
                  timeZone: selectedTimeZone,
                  includeSpecialObs: includeSpecialObs
              };

              onGenerate(startDate, endDate, filters);
          };

          const setDateRange = (days) => {
              const end = new Date();
              const start = new Date();
              start.setDate(end.getDate() - days);
              setStartDate(start.toISOString().split('T')[0]);
              setEndDate(end.toISOString().split('T')[0]);
          };

          const setAllTimeRange = () => {
              let minDate = new Date().toISOString().split('T')[0];
              const today = new Date().toISOString().split('T')[0];
              
              setStartDate(minDate);
              setEndDate(today);
          };

          useEffect(() => {
              if (initialFilters) {
                  setAllTimeRange();
              }
          }, [initialFilters]);

          return (
              <React.Fragment>
                  <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex justify-center items-center z-[50] p-4">
                      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh] border border-white/20 dark:border-slate-700/50">
                          <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Generate Report</h2>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                                  <input
                                      type="date"
                                      id="startDate"
                                      value={startDate}
                                      onChange={(e) => setStartDate(e.target.value)}
                                      className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 dark:[color-scheme:dark]"
                                  />
                              </div>
                              <div>
                                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                                  <input
                                      type="date"
                                      id="endDate"
                                      value={endDate}
                                      onChange={(e) => setEndDate(e.target.value)}
                                      className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 dark:[color-scheme:dark]"
                                  />
                              </div>
                          </div>

                          <div className="flex flex-wrap gap-2 mb-6">
                              <button onClick={() => setDateRange(0)} className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 py-2 px-3 rounded-md transition-colors">Today</button>
                              <button onClick={() => setDateRange(6)} className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 py-2 px-3 rounded-md transition-colors">Last 7 Days</button>
                              <button onClick={() => setDateRange(29)} className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 py-2 px-3 rounded-md transition-colors">Last 30 Days</button>
                              <button onClick={setAllTimeRange} className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 py-2 px-3 rounded-md transition-colors">All Time</button>
                          </div>

                          <div className="border-t dark:border-slate-700 pt-4 mt-4">
                              <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Filters (Optional)</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">You can combine multiple filters. Leave blank to ignore.</p>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="sm:col-span-2">
                                      <div className="flex items-center gap-2 mb-2">
                                          <input 
                                              type="checkbox" 
                                              id="separateByDept" 
                                              checked={isSeparateByDept}
                                              onChange={(e) => setIsSeparateByDept(e.target.checked)}
                                              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                                          />
                                          <label htmlFor="separateByDept" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                              Generate separate PDF for each department
                                          </label>
                                      </div>
                                  </div>

                                  <div className={isSeparateByDept ? "sm:col-span-2" : ""}>
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                          {isSeparateByDept ? "Select Departments" : "Department"}
                                      </label>
                                      {isSeparateByDept ? (
                                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border border-gray-300 dark:border-slate-600 rounded-md max-h-40 overflow-y-auto bg-gray-50 dark:bg-slate-900/50">
                                              <label className="flex items-center gap-2 cursor-pointer">
                                                  <input 
                                                      type="checkbox"
                                                      checked={selectedDepartments.length === departments.length}
                                                      onChange={(e) => {
                                                          if (e.target.checked) setSelectedDepartments([...departments]);
                                                          else setSelectedDepartments([]);
                                                      }}
                                                      className="h-3 w-3 text-emerald-600 rounded"
                                                  />
                                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">All</span>
                                              </label>
                                              {departments.map(dept => (
                                                  <label key={dept} className="flex items-center gap-2 cursor-pointer">
                                                      <input 
                                                          type="checkbox"
                                                          checked={selectedDepartments.includes(dept)}
                                                          onChange={(e) => {
                                                              if (e.target.checked) setSelectedDepartments([...selectedDepartments, dept]);
                                                              else setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
                                                          }}
                                                          className="h-3 w-3 text-emerald-600 rounded"
                                                      />
                                                      <span className="text-xs text-gray-700 dark:text-gray-200 truncate" title={dept}>{dept}</span>
                                                  </label>
                                              ))}
                                          </div>
                                      ) : (
                                          <select
                                              value={selectedDepartment}
                                              onChange={(e) => setSelectedDepartment(e.target.value)}
                                              className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm"
                                          >
                                              <option value="">All Departments</option>
                                              {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                                          </select>
                                      )}
                                  </div>

                                  {!isSeparateByDept && selectedDepartment === '' ? (
                                      <div>
                                         <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Exclude Departments</label>
                                         <div className="relative" ref={excludeDropdownRef}>
                                             <button
                                                 type="button"
                                                 onClick={() => setIsExcludeDropdownOpen(!isExcludeDropdownOpen)}
                                                 className="w-full p-2 border border-gray-300 rounded-md text-sm text-left bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 flex justify-between items-center"
                                             >
                                                 <span className="truncate">{excludedDepartments.length > 0 ? `${excludedDepartments.length} Excluded` : 'None'}</span>
                                                 <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                             </button>
                                             {isExcludeDropdownOpen && (
                                                 <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                                     {departments.map(dept => (
                                                         <label key={dept} className="flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                                                             <input
                                                                 type="checkbox"
                                                                 checked={excludedDepartments.includes(dept)}
                                                                 onChange={(e) => {
                                                                     if (e.target.checked) {
                                                                         setExcludedDepartments([...excludedDepartments, dept]);
                                                                     } else {
                                                                         setExcludedDepartments(excludedDepartments.filter(d => d !== dept));
                                                                     }
                                                                 }}
                                                                 className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                                                             />
                                                             <span className="ml-2 text-sm text-gray-700 dark:text-gray-200">{dept}</span>
                                                         </label>
                                                     ))}
                                                 </div>
                                             )}
                                         </div>
                                     </div>
                                  ) : (
                                      <div></div>
                                  )}

                                  <div>
                                       <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Specific Employees</label>
                                       <button
                                          onClick={() => setIsEmployeeSelectorOpen(true)}
                                          className={`w-full p-2 border rounded-md text-sm text-left truncate ${customSelectedIds.length > 0 ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-sky-900/30 dark:border-sky-500 dark:text-sky-300' : 'border-gray-300 text-gray-500 dark:border-slate-600 dark:text-gray-400'}`}
                                       >
                                          {customSelectedIds.length > 0 ? `${customSelectedIds.length} Employee(s) Selected` : 'Select Employees...'}
                                       </button>
                                       {customSelectedIds.length > 0 && (
                                          <button onClick={() => setCustomSelectedIds([])} className="text-xs text-red-500 hover:underline mt-1">Clear Selection</button>
                                       )}
                                  </div>

                                  <div>
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Remark Category</label>
                                      <select
                                            value={selectedRemarkCategory}
                                            onChange={(e) => setSelectedRemarkCategory(e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm"
                                        >
                                            <option value="">All Categories</option>
                                            <option value="positive">Positive (Active/Focused)</option>
                                            <option value="negative">Negative (Distracted/Idle)</option>
                                            <option value="neutral">Neutral (Discussions/Breaks)</option>
                                        </select>
                                  </div>

                                  <div>
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Time Zone</label>
                                       <select
                                            value={selectedTimeZone}
                                            onChange={(e) => setSelectedTimeZone(e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm"
                                        >
                                            {TIME_ZONES_FOR_FILTER.map(zone => (
                                                <option key={zone.id} value={zone.id}>{zone.name}</option>
                                            ))}
                                        </select>
                                  </div>
                                  
                                  <div className="sm:col-span-2">
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search in Remarks Content</label>
                                      <input
                                            type="text"
                                            list="remarks-suggestions"
                                            placeholder="Type keyword to filter..."
                                            value={remarksSearchTerm}
                                            onChange={(e) => setRemarksSearchTerm(e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm"
                                        />
                                         <datalist id="remarks-suggestions">
                                            {uniqueRemarks.map((remark, idx) => (
                                                <option key={idx} value={remark} />
                                            ))}
                                        </datalist>
                                  </div>

                                  <div className="sm:col-span-2 mt-2">
                                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-md">
                                          <input
                                              type="checkbox"
                                              id="includeSpecialObs"
                                              checked={includeSpecialObs}
                                              onChange={(e) => setIncludeSpecialObs(e.target.checked)}
                                              className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                                          />
                                          <label htmlFor="includeSpecialObs" className="text-sm font-medium text-amber-800 dark:text-amber-300 cursor-pointer">
                                              Include Special Observations in report
                                          </label>
                                      </div>
                                  </div>
                              </div>
                          </div>

                          <div className="flex justify-end gap-4 mt-8 border-t dark:border-slate-700 pt-6">
                              <button
                                  onClick={onClose}
                                  className="px-6 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                              >
                                  Cancel
                              </button>
                              <button
                                  onClick={handleGenerateClick}
                                  className="px-6 py-2 bg-emerald-500 text-white font-semibold rounded-md hover:bg-emerald-600"
                              >
                                  Generate
                              </button>
                          </div>
                      </div>
                  </div>
                  {isEmployeeSelectorOpen && (
                      <EmployeeSelectionModal
                          initialSelectedIds={customSelectedIds}
                          onClose={() => setIsEmployeeSelectorOpen(false)}
                          onConfirm={(selectedIds) => {
                              setCustomSelectedIds(selectedIds);
                              setIsEmployeeSelectorOpen(false);
                          }}
                          employees={employees}
                      />
                  )}
              </React.Fragment>
          );
      };

export default CasualReportModal;
