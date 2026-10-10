import React, { useState, useCallback } from 'react';
import CasualPreview from './CasualPreview';

interface DeptReport {
  department: string;
  originalEntries: any[];
  groupedEntries: any[];
  date: string;
}

interface CasualBatchReportGeneratorProps {
  reports: DeptReport[];
  logo?: string | null;
  employees: any[];
  onComplete: () => void;
  isAdmin?: boolean;
  allProfiles?: any[];
  getImage?: (key: string) => Promise<string | null>;
  hasPermission?: (perm: string) => boolean;
}

const CasualBatchReportGenerator: React.FC<CasualBatchReportGeneratorProps> = ({
  reports, logo, employees, onComplete, isAdmin, allProfiles, getImage, hasPermission
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'preview' | 'batch' | 'single-download'>('list');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const handleDownloadAll = () => {
    setViewMode('batch');
    setCurrentIndex(0);
  };

  const handlePreview = (index: number) => {
    setPreviewIndex(index);
    setViewMode('preview');
  };

  const handleDownloadSingle = (index: number) => {
    setPreviewIndex(index);
    setViewMode('single-download');
  };

  const handleAutoDownload = useCallback(async (downloadFn: () => Promise<void>) => {
    if (isGenerating) return;

    if (viewMode === 'batch') {
      setIsGenerating(true);
      try {
        await downloadFn();
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (currentIndex < reports.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          onComplete();
        }
      } catch (error) {
        console.error("Batch download error:", error);
        if (currentIndex < reports.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          onComplete();
        }
      } finally {
        setIsGenerating(false);
      }
    } else if (viewMode === 'single-download') {
      setIsGenerating(true);
      try {
        await downloadFn();
        setViewMode('list');
      } catch (error) {
        console.error("Single download error:", error);
        setViewMode('list');
      } finally {
        setIsGenerating(false);
      }
    }
  }, [currentIndex, reports, onComplete, isGenerating, viewMode]);

  if (viewMode === 'list') {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex justify-center items-center z-[100] p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Departmental Reports</h2>
            <button onClick={onComplete} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-6">The following {reports.length} departmental reports have been generated. You can preview them individually or download all as separate PDFs.</p>

          <div className="max-h-96 overflow-y-auto mb-8 border dark:border-slate-700 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0">
                <tr>
                  <th className="p-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Department</th>
                  <th className="p-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Entries</th>
                  <th className="p-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700">
                {reports.map((report, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="p-4 text-gray-800 dark:text-gray-200 font-medium">{report.department}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{report.originalEntries.length}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handlePreview(idx)}
                        className="px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-md text-sm font-medium hover:bg-indigo-200 transition-colors"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleDownloadSingle(idx)}
                        className="px-3 py-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-md text-sm font-medium hover:bg-emerald-200 transition-colors"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-4">
            <button
              onClick={onComplete}
              className="px-6 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDownloadAll}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Download All PDFs
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'preview' && previewIndex !== null) {
    const report = reports[previewIndex];
    return (
      <CasualPreview
        groupedEntries={report.groupedEntries}
        date={report.date}
        logo={logo}
        employees={employees}
        onClose={() => setViewMode('list')}
        departmentName={report.department}
        isAdmin={isAdmin}
        allProfiles={allProfiles}
        getImage={getImage}
        hasPermission={hasPermission}
      />
    );
  }

  if (viewMode === 'single-download' && previewIndex !== null) {
    const report = reports[previewIndex];
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex justify-center items-center z-[100] p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
          <div className="animate-spin h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Downloading PDF</h2>
          <p className="text-gray-500 dark:text-gray-400">Preparing report for {report.department}...</p>
          <div className="opacity-0 pointer-events-none absolute -z-50">
            <CasualPreview
              groupedEntries={report.groupedEntries}
              date={report.date}
              logo={logo}
              employees={employees}
              onClose={() => {}}
              isBatchMode={true}
              onReady={handleAutoDownload}
              departmentName={report.department}
              isAdmin={isAdmin}
              allProfiles={allProfiles}
              getImage={getImage}
              hasPermission={hasPermission}
            />
          </div>
        </div>
      </div>
    );
  }

  const currentReport = reports[currentIndex];

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex justify-center items-center z-[100] p-4">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-emerald-600 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Generating Reports</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Please wait while we prepare separate PDFs for each department.</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
            <span>Progress</span>
            <span>{currentIndex + 1} of {reports.length}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
            <div
              className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${((currentIndex + 1) / reports.length) * 100}%` }}
            ></div>
          </div>
          <p className="mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Processing: {currentReport.department}
          </p>
        </div>

        <div className="opacity-0 pointer-events-none absolute -z-50">
          <CasualPreview
            groupedEntries={currentReport.groupedEntries}
            date={currentReport.date}
            logo={logo}
            employees={employees}
            onClose={() => {}}
            isBatchMode={true}
            onReady={handleAutoDownload}
            departmentName={currentReport.department}
            isAdmin={isAdmin}
            allProfiles={allProfiles}
            getImage={getImage}
            hasPermission={hasPermission}
          />
        </div>
      </div>
    </div>
  );
};

export default CasualBatchReportGenerator;
