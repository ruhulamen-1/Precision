import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';

const RemarksTable = ({ remarks, onEdit, onDelete, onImport }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRemarks = useMemo(() => {
    if (!searchTerm) return remarks;
    const lower = searchTerm.toLowerCase();
    return remarks.filter(rem =>
      rem.text_en.toLowerCase().includes(lower) ||
      (rem.text_bn && rem.text_bn.toLowerCase().includes(lower)) ||
      rem.type.toLowerCase().includes(lower)
    );
  }, [remarks, searchTerm]);

  const exportToExcel = () => {
    const data = filteredRemarks.map(rem => ({
      'English Text': rem.text_en,
      'Bengali Text': rem.text_bn,
      'Category': rem.type
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Remarks');
    XLSX.writeFile(wb, 'CHL_Remarks_Library.xlsx');
  };

  return (
    <div id="remarks-master-list" className="mt-5 border border-gray-300 dark:border-slate-700 rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="p-4 bg-gray-800 text-white flex flex-col sm:flex-row justify-between items-center dark:bg-slate-900 gap-4">
        <span className="font-semibold text-lg">Remarks Library</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              placeholder="Search remarks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-gray-700 dark:bg-slate-800 border border-gray-600 dark:border-slate-700 rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-500 w-full sm:w-48 transition-all"
            />
          </div>
          <button
            onClick={onImport}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors"
            title="Upload Excel file with columns: English Text, Bengali Text, Category (positive/negative/neutral)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Import
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-200 dark:bg-slate-700 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm w-[40%]">English Text</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm w-[40%]">Bengali Text</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm w-[10%]">Type</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm w-[10%]">Actions</th>
            </tr>
          </thead>
          <tbody className="dark:bg-slate-800 dark:text-gray-300">
            {filteredRemarks.length > 0 ? filteredRemarks.map((remark, index) => (
              <tr key={remark.id || index} className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <td className="p-2 text-sm">{remark.text_en}</td>
                <td className="p-2 text-sm font-['Noto_Serif_Bengali']">{remark.text_bn}</td>
                <td className="p-2 text-sm">
                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${
                    remark.type === 'positive' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' :
                    remark.type === 'negative' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' :
                    'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
                  }`}>
                    {remark.type}
                  </span>
                </td>
                <td className="p-2 text-sm text-center">
                  <div className="flex justify-center gap-2">
                    <button onClick={() => onEdit(remark, index)} title="Edit Remark" className="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-sky-400 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                    </button>
                    <button onClick={() => onDelete(remark.id || index)} title="Delete Remark" className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-rose-400 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 italic">No remarks found. Import from Excel or add manually to get started.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RemarksTable;
