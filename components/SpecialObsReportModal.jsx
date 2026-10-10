import React, { useState, useMemo } from 'react';

const SpecialObsReportModal = ({ onClose, onGenerate, employees }) => {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [isEmpSelectorOpen, setIsEmpSelectorOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const departments = useMemo(() => [...new Set(employees.map(e => e.department))].sort(), [employees]);

  const setRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleGenerate = () => {
    if (!startDate || !endDate) { alert('Please select both dates.'); return; }
    if (new Date(startDate) > new Date(endDate)) { alert('Start date cannot be after end date.'); return; }
    onGenerate(startDate, endDate, { department: selectedDepartment, employeeIds: selectedEmployeeIds });
  };

  const filteredEmps = useMemo(() => {
    let list = employees;
    if (selectedDepartment) list = list.filter(e => e.department === selectedDepartment);
    if (empSearch) {
      const term = empSearch.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(term) || e.employee_id?.toLowerCase().includes(term));
    }
    return list;
  }, [employees, selectedDepartment, empSearch]);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex justify-center items-center z-[50] p-4">
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh] border border-white/20 dark:border-slate-700/50">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Special Observations Report</h2>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 dark:[color-scheme:dark]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 dark:[color-scheme:dark]" />
          </div>
        </div>

        {/* Quick Range Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[['Today', 0], ['Last 7 Days', 6], ['Last 30 Days', 29]].map(([label, days]) => (
            <button key={label} onClick={() => setRange(days)}
              className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 py-2 px-3 rounded-md transition-colors">
              {label}
            </button>
          ))}
          <button onClick={() => { setStartDate('2020-01-01'); setEndDate(today); }}
            className="flex-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 py-2 px-3 rounded-md transition-colors">
            All Time
          </button>
        </div>

        {/* Filters */}
        <div className="border-t dark:border-slate-700 pt-4">
          <h3 className="text-base font-semibold mb-3 text-gray-700 dark:text-gray-300">Filters (Optional)</h3>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Department</label>
            <select value={selectedDepartment} onChange={e => { setSelectedDepartment(e.target.value); setSelectedEmployeeIds([]); }}
              className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Specific Employees</label>
            <button onClick={() => setIsEmpSelectorOpen(!isEmpSelectorOpen)}
              className={`w-full p-2 border rounded-md text-sm text-left truncate ${selectedEmployeeIds.length > 0 ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-500 dark:text-amber-300' : 'border-gray-300 text-gray-500 dark:border-slate-600 dark:text-gray-400'}`}>
              {selectedEmployeeIds.length > 0 ? `${selectedEmployeeIds.length} Employee(s) Selected` : 'Select Employees...'}
            </button>
            {selectedEmployeeIds.length > 0 && (
              <button onClick={() => setSelectedEmployeeIds([])} className="text-xs text-red-500 hover:underline mt-1">Clear</button>
            )}
          </div>

          {isEmpSelectorOpen && (
            <div className="border border-gray-300 dark:border-slate-600 rounded-md mt-2 overflow-hidden">
              <div className="p-2 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search employees..."
                  className="w-full text-sm p-1.5 border border-gray-300 dark:border-slate-600 rounded dark:bg-slate-700 dark:text-gray-200" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setSelectedEmployeeIds(filteredEmps.map(e => e.employee_id || e.id))}
                    className="text-xs px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 rounded font-semibold">Select All</button>
                  <button onClick={() => setSelectedEmployeeIds([])}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 rounded font-semibold">Deselect All</button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {filteredEmps.map(emp => {
                  const eid = emp.employee_id || emp.id;
                  return (
                    <label key={eid} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700 last:border-0">
                      <input type="checkbox" checked={selectedEmployeeIds.includes(eid)}
                        onChange={e => {
                          if (e.target.checked) setSelectedEmployeeIds([...selectedEmployeeIds, eid]);
                          else setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== eid));
                        }}
                        className="h-4 w-4 text-amber-500 border-gray-300 rounded" />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{emp.name}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({emp.department})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4 mt-8 border-t dark:border-slate-700 pt-6">
          <button onClick={onClose}
            className="px-6 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600">
            Cancel
          </button>
          <button onClick={handleGenerate}
            className="px-6 py-2 bg-amber-500 text-white font-semibold rounded-md hover:bg-amber-600">
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpecialObsReportModal;
