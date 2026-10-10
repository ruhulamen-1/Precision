import React from "react";
import { ITAssignedIssue, User } from "../types";

const getStatusClass = (status: ITAssignedIssue["status"]) => {
  switch (status) {
    case "Issue":
      return "bg-yellow-100 text-yellow-800";
    case "Offline":
      return "bg-green-100 text-green-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};

const formatDateDDMMMYYYY = (date: Date | string | null): string => {
  if (!date) return "";
  try {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = `${date}T00:00:00Z`;
    }
    const d = new Date(date);

    if (isNaN(d.getTime())) return String(date);

    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const year = d.getUTCFullYear();

    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(date); // Fallback
  }
};

interface ITRecordsTabProps {
  currentUser: User;
  filteredIssues: ITAssignedIssue[];
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  availableMonths: string[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
  onClearRecords: () => void;
  assignedIssuesCount: number;
}

const ITRecordsTab: React.FC<ITRecordsTabProps> = ({
  currentUser,
  filteredIssues,
  statusFilter,
  onStatusFilterChange,
  monthFilter,
  onMonthFilterChange,
  availableMonths,
  searchQuery,
  onSearchQueryChange,
  fileInputRef,
  onFileUpload,
  onDownloadTemplate,
  onClearRecords,
  assignedIssuesCount,
}) => {
  const canEdit = currentUser.permissions?.itResponseTimeline?.edit || 
                  currentUser.role === 'super_admin' ||
                  currentUser.role === 'admin';

  return (
    <div className="fade-in">
      <div className="p-6 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-4 flex-grow">
            <div className="flex-1">
              <label htmlFor="search-it" className="sr-only">
                Search
              </label>
              <input
                type="text"
                id="search-it"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search by ID, issue, person..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div className="flex gap-4">
              <div>
                <label htmlFor="month-filter-it" className="sr-only">
                  Filter by Month
                </label>
                <select
                  id="month-filter-it"
                  value={monthFilter}
                  onChange={(e) => onMonthFilterChange(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="all">All Months</option>
                  {availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="status-filter-it" className="sr-only">
                  Filter by Status
                </label>
                <select
                  id="status-filter-it"
                  value={statusFilter}
                  onChange={(e) => onStatusFilterChange(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="">All Statuses</option>
                  <option value="Issue">Issue</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {canEdit && (
              <>
                <label
                  htmlFor="it-csv-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Import (CSV)
                </label>
                <input
                  id="it-csv-upload"
                  type="file"
                  ref={fileInputRef}
                  onChange={onFileUpload}
                  className="sr-only"
                  accept=".csv"
                />
                <button
                  onClick={onDownloadTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Template
                </button>
                <button
                  onClick={onClearRecords}
                  disabled={assignedIssuesCount === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        {filteredIssues.length > 0 ? (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  SL No
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Project Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Zone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Assigned Issue
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Assigned To
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredIssues.map((assignedIssue) => (
                <tr
                  key={assignedIssue.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                    {assignedIssue.id}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                    {formatDateDDMMMYYYY(assignedIssue.reportedAt)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {assignedIssue.projectName}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                    {assignedIssue.zone}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(assignedIssue.status)}`}
                    >
                      {assignedIssue.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                    {assignedIssue.issue}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                    {assignedIssue.assignedTo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-center text-slate-500">
            No assigned issues found. Try importing a CSV file.
          </p>
        )}
      </div>
    </div>
  );
};

export default ITRecordsTab;
