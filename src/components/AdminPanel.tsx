import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Project, MprNumber, Entry, User, Budget, BudgetItem, UserProjectPermission, EntryEditHistory, BulkUserRow, BulkUserResultItem } from '../types';
import { Building2, FileText, Users, BarChart3, Plus, Trash2, Edit2, Search, Filter, Shield, UserCheck, Calendar, Download, Upload, FolderPlus, X, Eye, FileSpreadsheet, KeyRound, History, RotateCcw, Recycle, ListChecks } from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDate, todayDateOnlyString } from '../lib/formatDate';
import { useStableCallback } from '../lib/useStableCallback';

interface AdminPanelProps {
  token: string;
}

// Purely presentational, read-only row — memoized so that typing in the report
// filter inputs above (Job No, dates, etc.) only re-renders rows whose underlying
// entry object actually changed, instead of rebuilding every row in a potentially
// long "All MPR Entries" table on every keystroke.
const ReportRow = React.memo(function ReportRow({
  ent,
  onOpenHistory,
  onDelete,
  deletingEntryId
}: {
  ent: Entry;
  onOpenHistory: (entryId: number) => void;
  onDelete: (entryId: number) => void;
  deletingEntryId: number | null;
}) {
  return (
    <tr className="hover:bg-slate-50/80 transition-colors">
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{formatDate(ent.entry_date)}</td>
      <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900 text-xs">{ent.job_name}</td>
      <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-900 text-xs">{ent.project_name}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
        <div className="font-semibold text-blue-600">{ent.job_no}</div>
        <div className="text-[10px] text-slate-400">{ent.job_duration}</div>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono">
          {ent.mpr_no}
        </span>
      </td>
      <td className="px-4 py-3.5 text-slate-800 text-xs">{ent.item_name}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
        {ent.matched_rate != null ? (
          <div>
            <div className="font-semibold text-slate-900">
              ৳{Number(ent.computed_amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400">@ ৳{Number(ent.matched_rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
        ) : ent.rate_calculated_at ? (
          <span className="text-rose-500 text-[10px] font-medium">No rate match</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{ent.category_head || <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{ent.category_sub1 || <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{ent.category_sub2 || <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
        {ent.category_sub3 ? (
          <span className="text-slate-600">{ent.category_sub3}</span>
        ) : ent.rate_calculated_at && !ent.category_head ? (
          <span className="text-amber-500 text-[10px] font-medium">No category match</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{ent.category_sector || <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{formatDate(ent.delivery_date)}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 text-xs">{ent.user_name || 'User'}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
        {ent.budget_name ? (
          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-medium">
            {ent.budget_name}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenHistory(ent.id)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View edit history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(ent.id)}
            disabled={deletingEntryId === ent.id}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
            title="Delete this entry (moves to Job Recycle bin)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});

export const AdminPanel: React.FC<AdminPanelProps> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<'projects' | 'mprs' | 'imports' | 'reports' | 'users' | 'recycle'>('reports');

  const [projects, setProjects] = useState<Project[]>([]);
  const [mprNumbers, setMprNumbers] = useState<MprNumber[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [permissions, setPermissions] = useState<UserProjectPermission[]>([]);

  // Job Recycle bin — every soft-deleted entry (own delete by a User, or an Admin
  // deleting someone else's entry). Loaded on demand only when that tab is opened.
  const [recycledEntries, setRecycledEntries] = useState<Entry[]>([]);
  const [loadingRecycle, setLoadingRecycle] = useState(false);
  const [restoringEntryId, setRestoringEntryId] = useState<number | null>(null);
  const [erasingEntryId, setErasingEntryId] = useState<number | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  // Entry edit history modal (Reports tab -> History icon per row)
  const [historyEntryId, setHistoryEntryId] = useState<number | null>(null);
  const [historyRecords, setHistoryRecords] = useState<EntryEditHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openEntryHistory = async (entryId: number) => {
    setHistoryEntryId(entryId);
    setHistoryRecords([]);
    setLoadingHistory(true);
    try {
      const res = await fetch(apiUrl(`/api/entries/${entryId}/history`), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHistoryRecords(await res.json());
    } catch (err) {
      console.error('Failed to load entry history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeEntryHistory = () => {
    setHistoryEntryId(null);
    setHistoryRecords([]);
  };

  const FIELD_LABELS: Record<string, string> = {
    item_name: 'Item Name',
    delivery_date: 'Delivery Date',
    mpr_no: 'MPR No',
    job_name: 'Job Name',
    job_duration: 'Job Duration'
  };

  // Manage-Projects modal (Admin sets which Projects a User can access)
  const [managingUser, setManagingUser] = useState<User | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set());
  // Search box inside the "Project Access" modal — filters the checklist so an Admin
  // doesn't have to scroll through every Project to find the one they want.
  const [managePermSearch, setManagePermSearch] = useState('');
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Form states for adding/editing
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectListSearch, setProjectListSearch] = useState('');
  const [showAllProjects, setShowAllProjects] = useState(false);

  const [newMprNo, setNewMprNo] = useState('');
  const [editingMpr, setEditingMpr] = useState<MprNumber | null>(null);
  const [mprListSearch, setMprListSearch] = useState('');
  const [showAllMprs, setShowAllMprs] = useState(false);

  // Budget (Excel import) state
  const [showNewBudgetForm, setShowNewBudgetForm] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState('');
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [activeBudgetId, setActiveBudgetId] = useState<number | null>(null);
  const [activeBudgetName, setActiveBudgetName] = useState('');
  const [importingBudgetId, setImportingBudgetId] = useState<number | null>(null);
  const pendingImportBudgetId = useRef<number | null>(null);
  const budgetFileInputRef = useRef<HTMLInputElement | null>(null);
  // "Submit" (publish) a Budget so it becomes visible to Users — until this is clicked,
  // a Budget only exists here on the Admin's Data Import page.
  const [publishingBudgetId, setPublishingBudgetId] = useState<number | null>(null);

  // Rate File (Excel import, two sheets: "Rate" + "Materials Category") state
  const [importingRateFile, setImportingRateFile] = useState(false);
  const [rateFileSummary, setRateFileSummary] = useState<{
    rate_count: number;
    category_count: number;
    original_filename: string | null;
    imported_at: string | null;
  } | null>(null);
  const rateFileInputRef = useRef<HTMLInputElement | null>(null);

  // Rate File "View" modal
  const [showRateFileModal, setShowRateFileModal] = useState(false);
  const [rateFileModalTab, setRateFileModalTab] = useState<'rate' | 'category'>('rate');
  const [rateListData, setRateListData] = useState<any[]>([]);
  const [categoryListData, setCategoryListData] = useState<any[]>([]);
  const [loadingRateFileData, setLoadingRateFileData] = useState(false);
  const [rateFileSearch, setRateFileSearch] = useState('');

  // "Approve & Calculate" per Budget — matches Rate/Category onto every entry.
  const [approvingBudgetId, setApprovingBudgetId] = useState<number | null>(null);
  const [approveResult, setApproveResult] = useState<{
    budgetName: string;
    total_entries: number;
    matched_rate_count: number;
    missing_rate: { item_name: string; specification: string }[];
    missing_category: string[];
  } | null>(null);

  // Budget view modal (full imported Excel data for one budget)
  const [viewingBudget, setViewingBudget] = useState<Budget | null>(null);
  const [viewingBudgetItems, setViewingBudgetItems] = useState<BudgetItem[]>([]);
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(false);

  // Delivery Date range modal — lets the Admin set the allowed Delivery Date window
  // for a Budget (after it's been imported). Users then can't pick a Delivery Date
  // outside this window when creating/editing an MPR Entry under that Budget.
  const [rangeBudget, setRangeBudget] = useState<Budget | null>(null);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [savingRange, setSavingRange] = useState(false);
  const [rangeError, setRangeError] = useState('');

  // Add-user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [creatingUser, setCreatingUser] = useState(false);

  // Bulk Add Users state — a small editable table of { Project Name, Password }
  // rows (SL is just the row's position, shown for reference, not stored). Users
  // created this way log in with Project Name + Password instead of email.
  const [showBulkUsers, setShowBulkUsers] = useState(false);
  const [bulkRows, setBulkRows] = useState<{ project_name: string; password: string }[]>([
    { project_name: '', password: '' },
    { project_name: '', password: '' },
    { project_name: '', password: '' },
  ]);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: BulkUserResultItem[]; skipped: BulkUserResultItem[] } | null>(null);

  // Filters for reports
  const [filterJobNo, setFilterJobNo] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterBudgetId, setFilterBudgetId] = useState('');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchAllData();
  }, [token]);

  const fetchAllData = async () => {
    try {
      const [projRes, mprRes, entRes, userRes, budgetRes, permRes] = await Promise.all([
        fetch(apiUrl('/api/projects'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/mpr-numbers'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/entries'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/users'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/budgets'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/permissions'), { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (projRes.ok) setProjects(await projRes.json());
      if (mprRes.ok) setMprNumbers(await mprRes.json());
      if (entRes.ok) setEntries(await entRes.json());
      if (userRes.ok) setUsers(await userRes.json());
      if (budgetRes.ok) setBudgets(await budgetRes.json());
      if (permRes.ok) setPermissions(await permRes.json());
    } catch (err) {
      console.error('Failed to load admin data', err);
    }
  };

  const fetchRateFileSummary = async () => {
    try {
      const res = await fetch(apiUrl('/api/rate-file/summary'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRateFileSummary(await res.json());
    } catch (err) {
      console.error('Failed to load Rate File summary', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'imports') fetchRateFileSummary();
  }, [activeTab]);

  const openRateFileModal = async () => {
    setShowRateFileModal(true);
    setRateFileModalTab('rate');
    setRateFileSearch('');
    setLoadingRateFileData(true);
    try {
      const [rateRes, catRes] = await Promise.all([
        fetch(apiUrl('/api/rate-file/rate-list'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/rate-file/categories'), { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (rateRes.ok) setRateListData(await rateRes.json());
      if (catRes.ok) setCategoryListData(await catRes.json());
    } catch (err) {
      console.error('Failed to load Rate File data', err);
    } finally {
      setLoadingRateFileData(false);
    }
  };

  const closeRateFileModal = () => {
    setShowRateFileModal(false);
    setRateListData([]);
    setCategoryListData([]);
    setRateFileSearch('');
  };

  // Downloads the current Missing Rate / Missing Category list from an Approve &
  // Calculate result as a .xlsx — same column shape shown on screen, so it can be
  // filled in and merged back into the Rate File for re-import.
  const downloadMissingListExcel = (
    kind: 'rate' | 'category',
    result: { budgetName: string; missing_rate: { item_name: string; specification: string }[]; missing_category: string[] }
  ) => {
    const wb = XLSX.utils.book_new();
    if (kind === 'rate') {
      const sheetRows = result.missing_rate.map((r) => ({
        'Materials Name': r.item_name,
        Specification: r.specification || '',
        Rate: ''
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Missing Rate');
      XLSX.writeFile(wb, `Missing_Rate_${result.budgetName.replace(/[^a-z0-9]+/gi, '_')}.xlsx`);
    } else {
      const sheetRows = result.missing_category.map((name) => ({
        'Materials Name': name,
        Head: '',
        'Sub-1': '',
        'Sub-2': '',
        'Sub-3': '',
        Sector: ''
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Missing Category');
      XLSX.writeFile(wb, `Missing_Category_${result.budgetName.replace(/[^a-z0-9]+/gi, '_')}.xlsx`);
    }
  };

  const handleApproveBudget = async (budget: Budget) => {
    setApprovingBudgetId(budget.id);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${budget.id}/approve`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approve & Calculate failed');

      setApproveResult({
        budgetName: budget.budget_name,
        total_entries: data.total_entries,
        matched_rate_count: data.matched_rate_count,
        missing_rate: data.missing_rate || [],
        missing_category: data.missing_category || []
      });
      fetchAllData(); // refresh budgets (rate_approved_at) + entries (matched_rate/amount/category)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to approve & calculate this budget.' });
    } finally {
      setApprovingBudgetId(null);
    }
  };

  // --- Budget "Submit" (publish) Handler ---
  // Flips a Budget's visibility for Users. Until this is clicked, the Budget was only
  // ever visible here on the Admin's Data Import page — Users can't pick it, so they
  // can't see or enter anything against it.
  const handlePublishBudget = async (budget: Budget, publish: boolean) => {
    setPublishingBudgetId(budget.id);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${budget.id}/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ published: publish })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update submission status');
      setMessage({
        type: 'success',
        text: publish
          ? `Budget "${budget.budget_name}" submitted — Users can now see it.`
          : `Budget "${budget.budget_name}" withdrawn — Users can no longer see it.`
      });
      fetchAllData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update this budget\'s submission status.' });
    } finally {
      setPublishingBudgetId(null);
    }
  };

  // --- Job Recycle Handlers ---

  const fetchRecycledEntries = async () => {
    setLoadingRecycle(true);
    try {
      const res = await fetch(apiUrl('/api/entries/recycle'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRecycledEntries(await res.json());
    } catch (err) {
      console.error('Failed to load Job Recycle bin', err);
    } finally {
      setLoadingRecycle(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'recycle') fetchRecycledEntries();
  }, [activeTab]);

  const handleRestoreEntry = async (id: number) => {
    setRestoringEntryId(id);
    try {
      const res = await fetch(apiUrl(`/api/entries/${id}/restore`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to restore entry');

      setRecycledEntries((prev) => prev.filter((e) => e.id !== id));
      fetchAllData();
      setMessage({ type: 'success', text: 'Entry restored.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRestoringEntryId(null);
    }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('Permanently erase this entry? This cannot be undone.')) return;
    setErasingEntryId(id);
    try {
      const res = await fetch(apiUrl(`/api/entries/${id}/permanent`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to permanently delete entry');

      setRecycledEntries((prev) => prev.filter((e) => e.id !== id));
      setMessage({ type: 'success', text: 'Entry permanently erased.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setErasingEntryId(null);
    }
  };

  // Delete an entry from the "All MPR Entries" report (Admin-only action here, though
  // the same DELETE endpoint also lets a User delete their own). This is a SOFT
  // delete — the entry moves into the Job Recycle bin (Reports -> Job Recycle) so it
  // can still be restored, rather than being erased outright.
  const handleDeleteEntry = async (id: number) => {
    if (!confirm('Delete this entry? It will be moved to the Job Recycle bin.')) return;
    setDeletingEntryId(id);
    try {
      const res = await fetch(apiUrl(`/api/entries/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete entry');

      setEntries((prev) => prev.filter((e) => e.id !== id));
      setMessage({ type: 'success', text: 'Entry moved to the Job Recycle bin.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeletingEntryId(null);
    }
  };

  // --- Projects Handlers ---

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = editingProject ? 'PUT' : 'POST';

      const res = await fetch(apiUrl(url), {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_name: newProjectName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save project');

      setNewProjectName('');
      setEditingProject(null);
      fetchAllData();
      setMessage({ type: 'success', text: 'Project saved successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      const res = await fetch(apiUrl(`/api/projects/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAllData();
        setMessage({ type: 'success', text: 'Project deleted.' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- MPR Numbers Handlers ---
  const handleSaveMpr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMprNo.trim()) return;

    try {
      const url = editingMpr ? `/api/mpr-numbers/${editingMpr.id}` : '/api/mpr-numbers';
      const method = editingMpr ? 'PUT' : 'POST';

      const res = await fetch(apiUrl(url), {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mpr_no: newMprNo.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save MPR number');

      setNewMprNo('');
      setEditingMpr(null);
      fetchAllData();
      setMessage({ type: 'success', text: 'MPR number saved successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteMpr = async (id: number) => {
    if (!confirm('Are you sure you want to delete this MPR number?')) return;
    try {
      const res = await fetch(apiUrl(`/api/mpr-numbers/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAllData();
        setMessage({ type: 'success', text: 'MPR number deleted.' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Budget (Excel Import) Handlers ---
  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBudgetName.trim()) return;

    setCreatingBudget(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/budgets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ budget_name: newBudgetName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create budget');

      setActiveBudgetId(data.id);
      setActiveBudgetName(data.budget_name);
      setNewBudgetName('');
      setShowNewBudgetForm(false);
      fetchAllData();
      setMessage({ type: 'success', text: `Budget "${data.budget_name}" created. Now choose the Excel file to import.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreatingBudget(false);
    }
  };

  const handleDeleteBudget = async (id: number) => {
    if (!confirm('Delete this budget and all its imported rows? This cannot be undone.')) return;
    try {
      const res = await fetch(apiUrl(`/api/budgets/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (activeBudgetId === id) {
          setActiveBudgetId(null);
          setActiveBudgetName('');
        }
        fetchAllData();
        setMessage({ type: 'success', text: 'Budget deleted.' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Normalize an Excel header cell so header variants/typos still match
  // (e.g. "Sl.No.", "Req. No.", "Aproved Date" as given in the real template).
  const normalizeHeader = (h: string) =>
    h.toString().trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

  const BUDGET_HEADER_MAP: Record<string, string> = {
    'slno': 'sl_no',
    'project name': 'project_name',
    'req no': 'req_no',
    'mrf no': 'mrf_no',
    'date': 'item_date',
    'description of materials': 'description',
    'unit': 'unit',
    'specification': 'specification',
    'req qty': 'req_qty',
    'reqqty': 'req_qty',
    'req quantity': 'req_qty',
    'reqd qty': 'req_qty',
    'required qty': 'req_qty',
    'requisition qty': 'req_qty',
    'purchase order qty': 'po_qty',
    'received qty': 'received_qty',
    'balance qty': 'balance_qty',
    'entry user': 'entry_user',
    'aproved date': 'approved_date',
    'approved date': 'approved_date',
    'app user': 'app_user',
    'site sup date': 'site_sup_date'
  };

  const DATE_FIELDS = new Set(['item_date', 'approved_date', 'site_sup_date']);

  // Last-resort fallback for the Req. Qty column: if the header text isn't one of the
  // exact variants above (e.g. the real sheet has extra wording like "Req. Qty (Nos)"),
  // still catch it as long as it clearly says "req" + "qty" and isn't one of the OTHER
  // Qty columns — this is the column that feeds the Qty shown in Job Entry Details, so
  // a missed match here is what makes that column look empty after import.
  const looksLikeReqQtyHeader = (normalized: string): boolean =>
    normalized.includes('req') &&
    normalized.includes('qty') &&
    !normalized.includes('order') &&
    !normalized.includes('received') &&
    !normalized.includes('balance');

  const excelCellToString = (val: any): string => {
    if (val == null) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    return String(val).trim();
  };

  const triggerBudgetImport = (budgetId: number) => {
    pendingImportBudgetId.current = budgetId;
    budgetFileInputRef.current?.click();
  };

  const handleBudgetFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const budgetId = pendingImportBudgetId.current;
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !budgetId) return;

    setImportingBudgetId(budgetId);
    setMessage(null);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        setMessage({ type: 'error', text: 'The Excel file has no data rows.' });
        return;
      }

      const rows = rawRows.map((row) => {
        const mapped: Record<string, string> = {};
        for (const key of Object.keys(row)) {
          const normalized = normalizeHeader(key);
          let field = BUDGET_HEADER_MAP[normalized];
          if (!field && looksLikeReqQtyHeader(normalized)) field = 'req_qty';
          if (!field) continue;
          mapped[field] = DATE_FIELDS.has(field) ? excelCellToString(row[key]) : String(row[key] ?? '').trim();
        }
        return mapped;
      });

      // Also send the original file itself (base64) so the server can save it as-is —
      // the Admin can re-download/view exactly what was imported later.
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read the Excel file'));
        reader.readAsDataURL(file);
      });

      const res = await fetch(apiUrl(`/api/budgets/${budgetId}/import`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rows,
          file_base64: fileBase64,
          file_name: file.name,
          file_mimetype: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setMessage({
        type: 'success',
        text: `Imported ${data.items_inserted} row(s). MPR No added: ${data.mpr_added} (already existed: ${data.mpr_already_existing}). Projects added: ${data.projects_added} (already existed: ${data.projects_already_existing}).`
      });
      fetchAllData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to import the Excel file.' });
    } finally {
      setImportingBudgetId(null);
      pendingImportBudgetId.current = null;
    }
  };

  const triggerRateFileImport = () => {
    rateFileInputRef.current?.click();
  };

  // "Rate" sheet header -> field name
  const RATE_HEADER_MAP: Record<string, string> = {
    'materials name': 'materials_name',
    'unit': 'unit',
    'rate': 'rate',
    'specification': 'specification',
    'assigned person': 'assigned_person',
    'remarks': 'remarks'
  };

  // "Materials Category" sheet header -> field name (source header has a typo,
  // "Detials", which normalizeHeader still matches exactly as given)
  const CATEGORY_HEADER_MAP: Record<string, string> = {
    'sl no': 'sl_no',
    'head': 'head',
    'sub-1': 'sub1',
    'sub1': 'sub1',
    'sub-2': 'sub2',
    'sub2': 'sub2',
    'sub-3': 'sub3',
    'sub3': 'sub3',
    'detials': 'details',
    'details': 'details',
    'sector': 'sector'
  };

  const mapSheetRows = (rawRows: any[], headerMap: Record<string, string>) =>
    rawRows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const key of Object.keys(row)) {
        const field = headerMap[normalizeHeader(key)];
        if (!field) continue;
        mapped[field] = excelCellToString(row[key]);
      }
      return mapped;
    });

  const handleRateFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImportingRateFile(true);
    setMessage(null);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array', cellDates: true });

      const rateSheet = workbook.Sheets['Rate'];
      const categorySheet = workbook.Sheets['Materials Category'];
      if (!rateSheet && !categorySheet) {
        setMessage({
          type: 'error',
          text: 'Could not find a "Rate" or "Materials Category" sheet in this Excel file. Check the sheet tab names.'
        });
        return;
      }

      const rateRawRows: any[] = rateSheet ? XLSX.utils.sheet_to_json(rateSheet, { defval: '' }) : [];
      const categoryRawRows: any[] = categorySheet ? XLSX.utils.sheet_to_json(categorySheet, { defval: '' }) : [];

      const rate_rows = mapSheetRows(rateRawRows, RATE_HEADER_MAP);
      const category_rows = mapSheetRows(categoryRawRows, CATEGORY_HEADER_MAP);

      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read the Excel file'));
        reader.readAsDataURL(file);
      });

      const res = await fetch(apiUrl('/api/rate-file/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rate_rows,
          category_rows,
          file_base64: fileBase64,
          file_name: file.name,
          file_mimetype: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setMessage({
        type: 'success',
        text: `Rate File imported: ${data.rate_inserted} Rate row(s), ${data.category_inserted} Materials Category row(s). This replaced whatever was saved before.`
      });
      fetchRateFileSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to import the Rate file.' });
    } finally {
      setImportingRateFile(false);
    }
  };

  const openRangeModal = (budget: Budget) => {
    setRangeBudget(budget);
    setRangeFrom(budget.delivery_date_from || '');
    setRangeTo(budget.delivery_date_to || '');
    setRangeError('');
  };

  const closeRangeModal = () => {
    setRangeBudget(null);
    setRangeFrom('');
    setRangeTo('');
    setRangeError('');
  };

  const handleSaveDeliveryRange = async () => {
    if (!rangeBudget) return;
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) {
      setRangeError('Delivery Date From must be on or before Delivery Date To.');
      return;
    }
    setSavingRange(true);
    setRangeError('');
    try {
      const res = await fetch(apiUrl(`/api/budgets/${rangeBudget.id}/delivery-range`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ delivery_date_from: rangeFrom || null, delivery_date_to: rangeTo || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save Delivery Date range');

      setBudgets((prev) =>
        prev.map((b) =>
          b.id === rangeBudget.id ? { ...b, delivery_date_from: rangeFrom || null, delivery_date_to: rangeTo || null } : b
        )
      );
      setMessage({ type: 'success', text: `Delivery Date range saved for "${rangeBudget.budget_name}".` });
      closeRangeModal();
    } catch (err: any) {
      setRangeError(err.message);
    } finally {
      setSavingRange(false);
    }
  };

  const handleViewBudget = async (budget: Budget) => {
    setViewingBudget(budget);
    setViewingBudgetItems([]);
    setLoadingBudgetItems(true);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${budget.id}/items`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load budget data');
      setViewingBudgetItems(await res.json());
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load budget data' });
    } finally {
      setLoadingBudgetItems(false);
    }
  };

  const handleDownloadBudgetFile = async (budgetId: number, fallbackName: string) => {
    try {
      const res = await fetch(apiUrl(`/api/budgets/${budgetId}/file`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to download the Excel file');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? decodeURIComponent(match[1]) : `${fallbackName || 'budget'}.xlsx`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to download the Excel file' });
    }
  };

  // --- User Management Handlers ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) return;

    setCreatingUser(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      fetchAllData();
      setMessage({ type: 'success', text: `User "${data.name}" created successfully.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreatingUser(false);
    }
  };

  // --- Bulk Add Users Handlers ---
  const addBulkRow = () => setBulkRows((rows) => [...rows, { project_name: '', password: '' }]);

  const removeBulkRow = (idx: number) =>
    setBulkRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const updateBulkRow = (idx: number, field: 'project_name' | 'password', value: string) =>
    setBulkRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  // Parses pasted rows (e.g. copied straight from Excel: Project Name, Password
  // columns) — accepts tab, comma, or multi-space separated values, one row per line.
  const handleParseBulkPaste = () => {
    const lines = bulkPasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const parsed = lines.map((line) => {
      const parts = line.split(/\t|,|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      return { project_name: parts[0] || '', password: parts[1] || '' };
    });
    setBulkRows(parsed);
    setBulkPasteText('');
  };

  const handleBulkImport = async () => {
    const rows = bulkRows
      .map((r, i) => ({ sl: i + 1, project_name: r.project_name.trim(), password: r.password }))
      .filter((r) => r.project_name || r.password);

    if (rows.length === 0) {
      setMessage({ type: 'error', text: 'Add at least one row (Project Name + Password) before importing.' });
      return;
    }

    setBulkImporting(true);
    setMessage(null);
    setBulkResult(null);
    try {
      const res = await fetch(apiUrl('/api/users/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk import failed');

      setBulkResult({ created: data.created, skipped: data.skipped });
      setMessage({
        type: data.skipped_count > 0 ? 'error' : 'success',
        text: `Imported ${data.created_count} user${data.created_count === 1 ? '' : 's'}.` +
          (data.skipped_count > 0 ? ` ${data.skipped_count} row${data.skipped_count === 1 ? '' : 's'} skipped — see details below.` : '')
      });
      if (data.created_count > 0) {
        setBulkRows([{ project_name: '', password: '' }]);
        fetchAllData();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkImporting(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: 'admin' | 'user') => {
    try {
      const res = await fetch(apiUrl(`/api/users/${userId}/role`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        fetchAllData();
        setMessage({ type: 'success', text: 'User role updated.' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(apiUrl(`/api/users/${userId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      fetchAllData();
      setMessage({ type: 'success', text: 'User deleted.' });
    } catch (err: any) {
      alert(err.message);
    }
  };

  // --- User <-> Project Permissions ---

  const projectIdsForUser = (userId: number) =>
    new Set(permissions.filter((p) => p.user_id === userId).map((p) => p.project_id));

  const openManageProjects = (u: User) => {
    setSelectedProjectIds(projectIdsForUser(u.id));
    setManagePermSearch('');
    setManagingUser(u);
  };

  const toggleSelectedProject = (projectId: number) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // The "Project Access" modal's checklist, filtered by the search box.
  const filteredManageProjects = React.useMemo(() => {
    const q = managePermSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.project_name.toLowerCase().includes(q));
  }, [projects, managePermSearch]);

  const handleSavePermissions = async () => {
    if (!managingUser) return;
    setSavingPermissions(true);
    try {
      const res = await fetch(apiUrl(`/api/users/${managingUser.id}/projects`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_ids: Array.from(selectedProjectIds) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save project permissions');

      setManagingUser(null);
      fetchAllData();
      setMessage({ type: 'success', text: `Project access updated for ${managingUser.name}.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingPermissions(false);
    }
  };

  // --- Filtered Entries ---
  // Memoized: previously this ran on EVERY render of the whole Admin panel (a large,
  // multi-tab component), including renders triggered by typing in totally unrelated
  // inputs elsewhere on the page. Scoping recomputation to just these 6 dependencies
  // means unrelated keystrokes no longer re-filter (and, via stableOpenEntryHistory +
  // ReportRow below, no longer re-render) this whole entries table.
  const filteredEntries = React.useMemo(() => entries.filter((ent) => {
    const matchJob = filterJobNo ? ent.job_no.toLowerCase().includes(filterJobNo.toLowerCase()) : true;
    const matchProj = filterProjectId ? ent.project_id.toString() === filterProjectId : true;
    const matchStart = filterStartDate ? ent.entry_date >= filterStartDate : true;
    const matchEnd = filterEndDate ? ent.entry_date <= filterEndDate : true;
    const matchBudget = filterBudgetId ? String(ent.budget_id ?? '') === filterBudgetId : true;
    return matchJob && matchProj && matchStart && matchEnd && matchBudget;
  }), [entries, filterJobNo, filterProjectId, filterStartDate, filterEndDate, filterBudgetId]);

  const stableOpenEntryHistory = useStableCallback(openEntryHistory);
  const stableDeleteEntry = useStableCallback(handleDeleteEntry);

  // --- Approved Projects / MPR Numbers lists ---
  // These are imported straight from Excel and can run into the hundreds, so by
  // default only a capped number renders (search narrows it; "Show all" opts in to
  // the full list) instead of always mounting every single row at once.
  const LIST_PAGE_SIZE = 30;

  const visibleProjects = React.useMemo(() => {
    const q = projectListSearch.trim().toLowerCase();
    const filtered = q ? projects.filter((p) => p.project_name.toLowerCase().includes(q)) : projects;
    return showAllProjects || q ? filtered : filtered.slice(0, LIST_PAGE_SIZE);
  }, [projects, projectListSearch, showAllProjects]);

  const visibleMprNumbers = React.useMemo(() => {
    const q = mprListSearch.trim().toLowerCase();
    const filtered = q ? mprNumbers.filter((m) => m.mpr_no.toLowerCase().includes(q)) : mprNumbers;
    return showAllMprs || q ? filtered : filtered.slice(0, LIST_PAGE_SIZE);
  }, [mprNumbers, mprListSearch, showAllMprs]);

  // --- Export filtered entries to Excel (.xlsx) ---
  // Two groups of columns, kept together rather than interleaved:
  // 1. Entry-specific columns (things that only exist because a Job/MPR was entered —
  //    not part of the original imported sheet) — placed first.
  // 2. The original imported Budget Excel's own columns, in the EXACT same header text
  //    and order as that template (see BUDGET_HEADER_MAP above / schema.sql comment):
  //    Sl.No. | Project Name | Req. No. | MRF No | Date | Description of Materials |
  //    Unit | Specification | Req. Qty | Purchase Order Qty | Received Qty |
  //    Balance Qty | Entry User | Aproved Date | App. User | Site Sup. Date
  // Project Name / MRF No / Description of Materials come from the entry's own fields
  // (always present) rather than the joined budget_items row, so they still show even
  // for an older entry that predates the Budget feature or doesn't have a matching
  // budget_items row — every other original column comes from that joined row and is
  // blank when there's no match, which is accurate (that import data doesn't exist).
  const handleDownloadExcel = () => {
    const rows = filteredEntries.map((ent) => ({
      'Entry Date': ent.entry_date,
      'Job Name': ent.job_name,
      'Job No': ent.job_no,
      'Job Duration': ent.job_duration,
      'Delivery Date': ent.delivery_date,
      'Logged By': ent.user_name || 'User',
      Budget: ent.budget_name || '—',
      'Sl.No.': ent.bi_sl_no || '',
      'Project Name': ent.project_name,
      'Req. No.': ent.bi_req_no || '',
      'MRF No': ent.mpr_no,
      Date: ent.bi_item_date || '',
      'Description of Materials': ent.item_name,
      Unit: ent.unit || '',
      Specification: ent.specification || '',
      'Req. Qty': ent.req_qty || '',
      'Purchase Order Qty': ent.po_qty || '',
      'Received Qty': ent.received_qty || '',
      'Balance Qty': ent.balance_qty || '',
      'Entry User': ent.bi_entry_user || '',
      'Aproved Date': ent.bi_approved_date || '',
      'App. User': ent.bi_app_user || '',
      'Site Sup. Date': ent.site_sup_date || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = new Array(23).fill({ wch: 16 });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MPR Entries');
    XLSX.writeFile(workbook, `MPR_Report_${todayDateOnlyString()}.xlsx`);
  };

  // --- Export a Budget's raw imported sheet (every column, every row) to Excel ---
  const handleDownloadBudgetItemsExcel = (budget: Budget, items: BudgetItem[]) => {
    const rows = items.map((it) => ({
      'Sl.No.': it.sl_no || '',
      'Project Name': it.project_name || '',
      'Req. No.': it.req_no || '',
      'MRF No': it.mrf_no || '',
      Date: it.item_date || '',
      'Description of Materials': it.description || '',
      Unit: it.unit || '',
      Specification: it.specification || '',
      'Req. Qty': it.req_qty || '',
      'Purchase Order Qty': it.po_qty || '',
      'Received Qty': it.received_qty || '',
      'Balance Qty': it.balance_qty || '',
      'Entry User': it.entry_user || '',
      'Aproved Date': it.approved_date || '',
      'App. User': it.app_user || '',
      'Site Sup. Date': it.site_sup_date || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = new Array(16).fill({ wch: 16 });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Budget Items');
    XLSX.writeFile(workbook, `${budget.budget_name.replace(/[^\w\- ]+/g, '')}_ImportedSheet.xlsx`);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-[#dceeff] min-h-[calc(100vh-4rem)] text-slate-900">
      {/* Admin Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 mb-2">
            <Shield className="w-3.5 h-3.5 text-amber-600" /> Administrator Control Panel
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            System Management & Reports
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage projects, approved MPR numbers, view comprehensive entry reports, and control user roles.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-stretch md:self-auto">
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'reports' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <span>Reports ({entries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'projects' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Projects ({projects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('mprs')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'mprs' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            <span>MPR Nos ({mprNumbers.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('imports')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'imports' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Data Import ({budgets.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'users' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>Users ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('recycle')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'recycle' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Recycle className="w-4 h-4 text-blue-600" />
            <span>Job Recycle{recycledEntries.length > 0 ? ` (${recycledEntries.length})` : ''}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* TAB 1: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" /> Filter Entries Report
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Job No</label>
                <input
                  type="text"
                  value={filterJobNo}
                  onChange={(e) => setFilterJobNo(e.target.value)}
                  placeholder="e.g. JOB-9901"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Project Name</label>
                <select
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.project_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Budget</label>
                <select
                  value={filterBudgetId}
                  onChange={(e) => setFilterBudgetId(e.target.value)}
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Budgets</option>
                  {budgets.map(b => (
                    <option key={b.id} value={b.id}>{b.budget_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {(filterJobNo || filterProjectId || filterStartDate || filterEndDate || filterBudgetId) && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => { setFilterJobNo(''); setFilterProjectId(''); setFilterStartDate(''); setFilterEndDate(''); setFilterBudgetId(''); }}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Entries Report Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">All MPR Entries Report</h3>
                <p className="text-xs text-slate-500">Showing {filteredEntries.length} matching records</p>
              </div>
              <button
                onClick={handleDownloadExcel}
                disabled={filteredEntries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                Download Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Job Name</th>
                    <th className="px-4 py-3 text-left">Project</th>
                    <th className="px-4 py-3 text-left">Job No & Duration</th>
                    <th className="px-4 py-3 text-left">MPR No</th>
                    <th className="px-4 py-3 text-left">Item Name</th>
                    <th className="px-4 py-3 text-left">Rate &amp; Amount</th>
                    <th className="px-4 py-3 text-left">Head</th>
                    <th className="px-4 py-3 text-left">Sub-1</th>
                    <th className="px-4 py-3 text-left">Sub-2</th>
                    <th className="px-4 py-3 text-left">Sub-3</th>
                    <th className="px-4 py-3 text-left">Sector</th>
                    <th className="px-4 py-3 text-left">Delivery Date</th>
                    <th className="px-4 py-3 text-left">Logged By</th>
                    <th className="px-4 py-3 text-left">Budget</th>
                    <th className="px-4 py-3 text-left">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-6 py-12 text-center text-slate-400">
                        No entries found matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((ent) => (
                      <ReportRow key={ent.id} ent={ent} onOpenHistory={stableOpenEntryHistory} onDelete={stableDeleteEntry} deletingEntryId={deletingEntryId} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Entry Edit History Modal */}
      {historyEntryId !== null && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeEntryHistory}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-blue-600" /> Edit History — Entry #{historyEntryId}
              </h3>
              <button
                onClick={closeEntryHistory}
                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-5">
              {loadingHistory ? (
                <p className="text-xs text-slate-400 text-center py-6">Loading history...</p>
              ) : historyRecords.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No edits have been made to this entry yet.</p>
              ) : (
                <div className="space-y-3">
                  {historyRecords.map((h) => (
                    <div key={h.id} className="border border-slate-200 rounded-xl p-3 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-slate-900">{FIELD_LABELS[h.field_name] || h.field_name}</span>
                        <span className="text-[10px] text-slate-400">
                          {formatDate(h.edited_at)} {h.editor_name ? `• ${h.editor_name}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-100 line-through">
                          {h.old_value || '—'}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                          {h.new_value || '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: JOB RECYCLE — every soft-deleted entry, with Restore + permanently erase */}
      {activeTab === 'recycle' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Recycle className="w-4 h-4 text-blue-600" /> Job Recycle
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Entries deleted by Users (from their own Job Entries) or by an Admin land here first. Restore brings an
              entry back into the live Reports list; permanently erasing it cannot be undone.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Job Name</th>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Job No & Duration</th>
                  <th className="px-4 py-3 text-left">MPR No</th>
                  <th className="px-4 py-3 text-left">Item Name</th>
                  <th className="px-4 py-3 text-left">Logged By</th>
                  <th className="px-4 py-3 text-left">Deleted By</th>
                  <th className="px-4 py-3 text-left">Deleted At</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {loadingRecycle ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                      Loading Job Recycle bin...
                    </td>
                  </tr>
                ) : recycledEntries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                      Job Recycle bin is empty — no deleted entries.
                    </td>
                  </tr>
                ) : (
                  recycledEntries.map((ent) => (
                    <tr key={ent.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-xs">{formatDate(ent.entry_date)}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900 text-xs">{ent.job_name}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-900 text-xs">{ent.project_name}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                        <div className="font-semibold text-blue-600">{ent.job_no}</div>
                        <div className="text-[10px] text-slate-400">{ent.job_duration}</div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          {ent.mpr_no}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-800 text-xs">{ent.item_name}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 text-xs">{ent.user_name || 'User'}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-rose-600 text-xs">{ent.deleted_by_name || '—'}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 text-xs">
                        {ent.deleted_at ? formatDate(ent.deleted_at) : '—'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRestoreEntry(ent.id)}
                            disabled={restoringEntryId === ent.id}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Restore this entry"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePermanentDelete(ent.id)}
                            disabled={erasingEntryId === ent.id}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Permanently erase"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PROJECTS */}
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                {editingProject ? 'Edit Project' : 'Add New Project'}
              </h3>
              <form onSubmit={handleSaveProject} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Metro Rail Extension"
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-sm"
                  >
                    {editingProject ? 'Update Project' : 'Add Project'}
                  </button>
                  {editingProject && (
                    <button
                      type="button"
                      onClick={() => { setEditingProject(null); setNewProjectName(''); }}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Approved Projects List</h3>
                    <p className="text-xs text-slate-500">Users select projects strictly from this list</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200 whitespace-nowrap">
                    {projects.length} Project{projects.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-3 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={projectListSearch}
                    onChange={(e) => setProjectListSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div className="divide-y divide-slate-200 max-h-[32rem] overflow-y-auto">
                {visibleProjects.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">No projects match your search.</p>
                ) : (
                  visibleProjects.map((p) => (
                    <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-50 text-blue-600 p-2 rounded-xl border border-blue-100">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <span className="font-semibold text-slate-900 text-sm">{p.project_name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => { setEditingProject(p); setNewProjectName(p.project_name); }}
                          className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit project"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {!projectListSearch && !showAllProjects && projects.length > LIST_PAGE_SIZE && (
                <div className="p-3 border-t border-slate-200 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllProjects(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Show all {projects.length} projects
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATA IMPORT (Rate File + Budget Excel Import) */}
      {activeTab === 'imports' && (
        <div className="space-y-8">
          {/* Hidden file input shared by every "Import Excel" button */}
          <input
            ref={budgetFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleBudgetFileSelected}
            className="hidden"
          />
          <input
            ref={rateFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleRateFileSelected}
            className="hidden"
          />

          {/* Rate File Excel Import — reference data, not tied to any Budget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Import Rate File</h3>
                <p className="text-xs text-slate-500 mt-1">
                  One Excel file with two sheets — <span className="font-semibold">"Rate"</span> (materials price list) and{' '}
                  <span className="font-semibold">"Materials Category"</span> (Head / Sub-1 / Sub-2 / Sub-3 tree) — both sheets
                  are imported together, with all their columns. Re-importing replaces whatever was saved before.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {rateFileSummary && (rateFileSummary.rate_count > 0 || rateFileSummary.category_count > 0) && (
                  <button
                    type="button"
                    onClick={openRateFileModal}
                    className="flex items-center gap-1.5 py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm transition-all text-sm whitespace-nowrap"
                  >
                    <Eye className="w-4 h-4" /> View
                  </button>
                )}
                <button
                  type="button"
                  onClick={triggerRateFileImport}
                  disabled={importingRateFile}
                  className="flex items-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-sm disabled:opacity-50 whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" />
                  {importingRateFile ? 'Importing...' : 'Choose & Import Rate File'}
                </button>
              </div>
            </div>

            {rateFileSummary && (rateFileSummary.rate_count > 0 || rateFileSummary.category_count > 0) ? (
              <div className="flex items-center gap-4 flex-wrap bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-semibold text-slate-900">{rateFileSummary.rate_count}</span> Rate row(s)
                </span>
                <span className="flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-semibold text-slate-900">{rateFileSummary.category_count}</span> Materials Category row(s)
                </span>
                {rateFileSummary.original_filename && (
                  <span className="text-slate-400 truncate">
                    from <span className="font-medium text-slate-600">{rateFileSummary.original_filename}</span>
                    {rateFileSummary.imported_at && ` · ${formatDate(rateFileSummary.imported_at)}`}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl py-6 px-4">
                No Rate File imported yet.
              </div>
            )}
          </div>

          {/* Budget Excel Import */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Import Budget from Excel</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Click "New Budget", give it a name, then import the Excel sheet into it. Every MRF No in the
                  sheet is added to the Approved MPR list, and every Project Name is added to the Approved
                  Project list, automatically. A new budget stays in <span className="font-semibold">Draft</span> and
                  is hidden from Users until you click <span className="font-semibold">Submit</span> on it below.
                </p>
              </div>
              {!showNewBudgetForm && (
                <button
                  type="button"
                  onClick={() => { setShowNewBudgetForm(true); setActiveBudgetId(null); setActiveBudgetName(''); }}
                  className="flex items-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-sm whitespace-nowrap"
                >
                  <FolderPlus className="w-4 h-4" /> New Budget
                </button>
              )}
            </div>

            {/* New Budget Name form */}
            {showNewBudgetForm && (
              <form onSubmit={handleCreateBudget} className="flex items-end gap-3 flex-wrap bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Budget Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newBudgetName}
                    onChange={(e) => setNewBudgetName(e.target.value)}
                    placeholder="e.g. FY2026 Q1 Budget"
                    className="block w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingBudget}
                  className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-sm disabled:opacity-50"
                >
                  {creatingBudget ? 'Creating...' : 'Create Budget'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewBudgetForm(false); setNewBudgetName(''); }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200"
                >
                  Cancel
                </button>
              </form>
            )}

            {/* Active budget ready for import */}
            {activeBudgetId && (
              <div className="flex items-center justify-between gap-4 flex-wrap bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <div className="text-sm text-emerald-800">
                  Budget <span className="font-bold">"{activeBudgetName}"</span> is ready. Choose the Excel file to import its rows.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerBudgetImport(activeBudgetId)}
                    disabled={importingBudgetId === activeBudgetId}
                    className="flex items-center gap-1.5 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-sm transition-all text-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" />
                    {importingBudgetId === activeBudgetId ? 'Importing...' : 'Choose & Import Excel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveBudgetId(null); setActiveBudgetName(''); }}
                    className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
                    title="Done"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Existing budgets list */}
            {budgets.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Budget Name</th>
                      <th className="px-4 py-2.5 text-left">Imported Rows</th>
                      <th className="px-4 py-2.5 text-left">Delivery Date Range</th>
                      <th className="px-4 py-2.5 text-left">Rate &amp; Category</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-left">Created</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {budgets.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 text-xs">
                          <button
                            type="button"
                            onClick={() => handleViewBudget(b)}
                            className="font-semibold text-blue-700 hover:text-blue-900 hover:underline text-left"
                            title="View full imported Excel data"
                          >
                            {b.budget_name}
                          </button>
                          {b.original_filename && (
                            <div className="flex items-center gap-1 text-slate-400 text-[10px] mt-0.5">
                              <FileSpreadsheet className="w-3 h-3" /> {b.original_filename}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{b.item_count ?? 0}</td>
                        <td className="px-4 py-3 text-xs">
                          {b.delivery_date_from || b.delivery_date_to ? (
                            <span className="inline-flex items-center gap-1 text-slate-600">
                              {formatDate(b.delivery_date_from) || '—'} <span className="text-slate-300">→</span> {formatDate(b.delivery_date_to) || '—'}
                            </span>
                          ) : (
                            <span className="text-slate-300">Not restricted</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <button
                            type="button"
                            onClick={() => handleApproveBudget(b)}
                            disabled={approvingBudgetId === b.id}
                            className="flex items-center gap-1.5 py-1.5 px-2.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 font-semibold rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                            title="Match Rate + Category onto every entry in this Budget from the Rate File"
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            {approvingBudgetId === b.id ? 'Calculating...' : 'Approve & Calculate'}
                          </button>
                          {b.rate_approved_at && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              Last calculated {formatDate(b.rate_approved_at)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {b.is_published ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                              Published
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 font-semibold">
                              Draft — hidden from Users
                            </span>
                          )}
                          <div className="mt-1.5">
                            {b.is_published ? (
                              <button
                                type="button"
                                onClick={() => handlePublishBudget(b, false)}
                                disabled={publishingBudgetId === b.id}
                                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 underline disabled:opacity-50"
                                title="Hide this budget from Users again"
                              >
                                {publishingBudgetId === b.id ? 'Updating...' : 'Withdraw'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePublishBudget(b, true)}
                                disabled={publishingBudgetId === b.id}
                                className="flex items-center gap-1.5 py-1.5 px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 whitespace-nowrap text-[11px]"
                                title="Make this budget visible to Users"
                              >
                                {publishingBudgetId === b.id ? 'Submitting...' : 'Submit'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {b.created_at ? formatDate(b.created_at) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openRangeModal(b)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Set allowed Delivery Date range for this budget"
                            >
                              <Calendar className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleViewBudget(b)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="View full imported data"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {b.has_file && (
                              <button
                                onClick={() => handleDownloadBudgetFile(b.id, b.budget_name)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Download the original Excel file"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => triggerBudgetImport(b.id)}
                              disabled={importingBudgetId === b.id}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Import more rows into this budget"
                            >
                              <Upload className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBudget(b.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete budget"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !showNewBudgetForm && !activeBudgetId && (
                <p className="text-xs text-slate-400">No budgets yet. Click "New Budget" to import your first Excel sheet.</p>
              )
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MPR NUMBERS */}
      {activeTab === 'mprs' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                {editingMpr ? 'Edit MPR No' : 'Add New MPR No'}
              </h3>
              <form onSubmit={handleSaveMpr} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    MPR Number
                  </label>
                  <input
                    type="text"
                    required
                    value={newMprNo}
                    onChange={(e) => setNewMprNo(e.target.value)}
                    placeholder="e.g. MPR-2026-006"
                    className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-sm"
                  >
                    {editingMpr ? 'Update MPR' : 'Add MPR'}
                  </button>
                  {editingMpr && (
                    <button
                      type="button"
                      onClick={() => { setEditingMpr(null); setNewMprNo(''); }}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Approved MPR Numbers List</h3>
                    <p className="text-xs text-slate-500">Users select MPR numbers strictly from this list</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200 whitespace-nowrap">
                    {mprNumbers.length} MPR{mprNumbers.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-3 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mprListSearch}
                    onChange={(e) => setMprListSearch(e.target.value)}
                    placeholder="Search MPR numbers..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div className="divide-y divide-slate-200 max-h-[32rem] overflow-y-auto">
                {visibleMprNumbers.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">No MPR numbers match your search.</p>
                ) : (
                  visibleMprNumbers.map((m) => (
                    <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl border border-indigo-100">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="font-mono font-semibold text-slate-900 text-sm">{m.mpr_no}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => { setEditingMpr(m); setNewMprNo(m.mpr_no); }}
                          className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit MPR"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMpr(m.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete MPR"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {!mprListSearch && !showAllMprs && mprNumbers.length > LIST_PAGE_SIZE && (
                <div className="p-3 border-t border-slate-200 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllMprs(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Show all {mprNumbers.length} MPR numbers
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* TAB 4: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Add New User Form */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Add New User</h3>
            <p className="text-xs text-slate-500 mb-4">
              Create an account for a User or Admin. There is no public sign-up — accounts are only created here.
            </p>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="John Doe"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Password</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'user' | 'admin')}
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="lg:col-span-1">
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-sm disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {creatingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>

          {/* Bulk Add Users — SL, Project Name, Password only. These accounts log in
              with Project Name (spaces ignored) + Password instead of email. */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <button
              type="button"
              onClick={() => setShowBulkUsers((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h3 className="text-lg font-bold text-slate-900">Bulk Add Users</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add many Project logins at once — SL, Project Name, Password. These users sign in with
                  their Project Name (no spaces) + Password.
                </p>
              </div>
              <Upload className="w-5 h-5 text-slate-400 flex-shrink-0" />
            </button>

            {showBulkUsers && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Paste rows (optional) — Project Name, Password per line
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={bulkPasteText}
                      onChange={(e) => setBulkPasteText(e.target.value)}
                      placeholder={"Riverside Tower, ab12cd\nGreenfield Plaza, xy98zt"}
                      rows={3}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={handleParseBulkPaste}
                      disabled={!bulkPasteText.trim()}
                      className="self-start px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors disabled:opacity-40"
                    >
                      Fill rows below
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 text-left w-14">SL</th>
                        <th className="px-3 py-2 text-left">Project Name</th>
                        <th className="px-3 py-2 text-left w-40">Password (6 chars)</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {bulkRows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-xs text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.project_name}
                              onChange={(e) => updateBulkRow(idx, 'project_name', e.target.value)}
                              placeholder="Project Name"
                              className="block w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.password}
                              onChange={(e) => updateBulkRow(idx, 'password', e.target.value.slice(0, 6))}
                              maxLength={6}
                              placeholder="6 characters"
                              className="block w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeBulkRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Remove row"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={addBulkRow}
                    className="flex items-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkImport}
                    disabled={bulkImporting}
                    className="flex items-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all text-xs disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {bulkImporting ? 'Importing...' : 'Import Users'}
                  </button>
                </div>

                {bulkResult && (bulkResult.created.length > 0 || bulkResult.skipped.length > 0) && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 text-xs">
                    {bulkResult.created.length > 0 && (
                      <div className="p-3">
                        <p className="font-semibold text-emerald-700 mb-1.5">
                          Created ({bulkResult.created.length})
                        </p>
                        <ul className="space-y-0.5 text-slate-600">
                          {bulkResult.created.map((r) => (
                            <li key={`c-${r.sl}`}>
                              SL {r.sl}: <span className="font-medium text-slate-900">{r.project_name}</span>
                              {r.username && <span className="text-slate-400"> — login: {r.username}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {bulkResult.skipped.length > 0 && (
                      <div className="p-3">
                        <p className="font-semibold text-rose-700 mb-1.5">
                          Skipped ({bulkResult.skipped.length})
                        </p>
                        <ul className="space-y-0.5 text-slate-600">
                          {bulkResult.skipped.map((r) => (
                            <li key={`s-${r.sl}`}>
                              SL {r.sl}: <span className="font-medium text-slate-900">{r.project_name || '(blank)'}</span>
                              <span className="text-rose-500"> — {r.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">User Management</h3>
            <p className="text-xs text-slate-500">Manage system users, view roles, or promote/demote accounts</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Login ID</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-left">Project Access</th>
                  <th className="px-6 py-3 text-left">Joined</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {users.map((u) => {
                  const grantedCount = projectIdsForUser(u.id).size;
                  return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900 text-xs">{u.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-xs">
                      {u.email || (u.username ? <span className="font-mono">{u.username}</span> : '—')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as 'admin' | 'user')}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${
                          u.role === 'admin'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        <option value="admin" className="bg-white text-slate-900">Admin</option>
                        <option value="user" className="bg-white text-slate-900">User</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      {u.role === 'admin' ? (
                        <span className="text-slate-400">All projects (Admin)</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openManageProjects(u)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold transition-colors ${
                            grantedCount > 0
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {grantedCount > 0 ? `${grantedCount} Project${grantedCount === 1 ? '' : 's'}` : 'No Access — Set'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-xs">
                      {u.created_at ? formatDate(u.created_at) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* Budget full imported-data modal */}
      {viewingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{viewingBudget.budget_name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {viewingBudgetItems.length} imported row{viewingBudgetItems.length === 1 ? '' : 's'}
                  {viewingBudget.original_filename && <> — from <span className="font-medium">{viewingBudget.original_filename}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {viewingBudgetItems.length > 0 && (
                  <button
                    onClick={() => handleDownloadBudgetItemsExcel(viewingBudget, viewingBudgetItems)}
                    className="flex items-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-all shadow-sm whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Imported Sheet (All Columns)
                  </button>
                )}
                {viewingBudget.has_file && (
                  <button
                    onClick={() => handleDownloadBudgetFile(viewingBudget.id, viewingBudget.budget_name)}
                    className="flex items-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-all shadow-sm whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Original Excel
                  </button>
                )}
                <button
                  onClick={() => {
                    // Jump to the Reports tab pre-filtered to this Budget, where
                    // "Download Excel" exports every entry-MPR row with full columns.
                    setFilterBudgetId(String(viewingBudget.id));
                    setActiveTab('reports');
                    setViewingBudget(null);
                    setViewingBudgetItems([]);
                  }}
                  className="flex items-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all shadow-sm whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> View Entries Report
                </button>
                <button
                  onClick={() => { setViewingBudget(null); setViewingBudgetItems([]); }}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-auto flex-1">
              {loadingBudgetItems ? (
                <p className="text-sm text-slate-400 p-6">Loading...</p>
              ) : viewingBudgetItems.length === 0 ? (
                <p className="text-sm text-slate-400 p-6">No rows imported into this budget yet.</p>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Sl.No.</th>
                      <th className="px-3 py-2 text-left">Project Name</th>
                      <th className="px-3 py-2 text-left">Req. No.</th>
                      <th className="px-3 py-2 text-left">MRF No</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Description of Materials</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-left">Specification</th>
                      <th className="px-3 py-2 text-left">Req. Qty</th>
                      <th className="px-3 py-2 text-left">Purchase Order Qty</th>
                      <th className="px-3 py-2 text-left">Received Qty</th>
                      <th className="px-3 py-2 text-left">Balance Qty</th>
                      <th className="px-3 py-2 text-left">Entry User</th>
                      <th className="px-3 py-2 text-left">Approved Date</th>
                      <th className="px-3 py-2 text-left">App. User</th>
                      <th className="px-3 py-2 text-left">Site Sup. Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingBudgetItems.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 whitespace-nowrap">{it.sl_no}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.project_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.req_no}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.mrf_no}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(it.item_date)}</td>
                        <td className="px-3 py-2 min-w-[180px]">{it.description}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.unit}</td>
                        <td className="px-3 py-2 min-w-[150px]">{it.specification}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.req_qty}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.po_qty}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.received_qty}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.balance_qty}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.entry_user}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(it.approved_date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.app_user}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(it.site_sup_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rate File "View" modal — Rate list / Materials Category tree, each with a
          client-side search filter since Materials Category alone can run into the
          thousands of rows. */}
      {showRateFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Rate File</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {rateFileSummary?.original_filename && (
                    <>from <span className="font-medium">{rateFileSummary.original_filename}</span></>
                  )}
                </p>
              </div>
              <button
                onClick={closeRateFileModal}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tabs + search */}
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setRateFileModalTab('rate')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    rateFileModalTab === 'rate' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rate ({rateListData.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRateFileModalTab('category')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    rateFileModalTab === 'category' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Materials Category ({categoryListData.length})
                </button>
              </div>
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={rateFileSearch}
                  onChange={(e) => setRateFileSearch(e.target.value)}
                  placeholder="Search this table..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="overflow-auto flex-1">
              {loadingRateFileData ? (
                <p className="text-sm text-slate-400 p-6">Loading...</p>
              ) : rateFileModalTab === 'rate' ? (
                (() => {
                  const q = rateFileSearch.trim().toLowerCase();
                  const filtered = q
                    ? rateListData.filter((r) =>
                        [r.materials_name, r.unit, r.specification, r.assigned_person, r.remarks]
                          .some((v) => v != null && String(v).toLowerCase().includes(q))
                      )
                    : rateListData;
                  return filtered.length === 0 ? (
                    <p className="text-sm text-slate-400 p-6">No Rate rows found.</p>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Materials Name</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-left">Rate</th>
                          <th className="px-3 py-2 text-left">Specification</th>
                          <th className="px-3 py-2 text-left">Assigned Person</th>
                          <th className="px-3 py-2 text-left">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2 min-w-[180px]">{r.materials_name}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.unit}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.rate}</td>
                            <td className="px-3 py-2 min-w-[150px]">{r.specification}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.assigned_person}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.remarks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              ) : (
                (() => {
                  const q = rateFileSearch.trim().toLowerCase();
                  const filtered = q
                    ? categoryListData.filter((r) =>
                        [r.head, r.sub1, r.sub2, r.sub3, r.details, r.sector]
                          .some((v) => v != null && String(v).toLowerCase().includes(q))
                      )
                    : categoryListData;
                  return filtered.length === 0 ? (
                    <p className="text-sm text-slate-400 p-6">No Materials Category rows found.</p>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Sl No.</th>
                          <th className="px-3 py-2 text-left">Head</th>
                          <th className="px-3 py-2 text-left">Sub-1</th>
                          <th className="px-3 py-2 text-left">Sub-2</th>
                          <th className="px-3 py-2 text-left">Sub-3</th>
                          <th className="px-3 py-2 text-left">Detials</th>
                          <th className="px-3 py-2 text-left">Sector</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2 whitespace-nowrap">{r.sl_no}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.head}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.sub1}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.sub2}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.sub3}</td>
                            <td className="px-3 py-2 min-w-[180px]">{r.details}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.sector}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* "Approve & Calculate" result — Missing Rate / Missing Category review lists.
          The Admin resolves these by updating the Rate File (both sheets) and
          re-importing via "Import Rate File", then running Approve & Calculate again —
          no separate edit UI needed since that already fully replaces both tables. */}
      {approveResult && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setApproveResult(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Approve &amp; Calculate — {approveResult.budgetName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {approveResult.matched_rate_count} of {approveResult.total_entries} entr
                  {approveResult.total_entries === 1 ? 'y' : 'ies'} matched a Rate.
                </p>
              </div>
              <button
                onClick={() => setApproveResult(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-auto flex-1 p-5 space-y-6">
              {approveResult.missing_rate.length === 0 && approveResult.missing_category.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-medium">
                  Every entry matched both a Rate and a Category. Nothing to review.
                </div>
              ) : (
                <>
                  {approveResult.missing_rate.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="text-sm font-bold text-rose-700">
                          Missing Rate ({approveResult.missing_rate.length})
                        </h4>
                        <button
                          type="button"
                          onClick={() => downloadMissingListExcel('rate', approveResult)}
                          className="flex items-center gap-1 py-1 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-semibold rounded-lg text-[11px] transition-colors whitespace-nowrap"
                        >
                          <Download className="w-3 h-3" /> Download Excel
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        No exact Item Name + Specification match in the Rate sheet. Add these to the Rate File and
                        re-import, then run Approve &amp; Calculate again.
                      </p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200 text-xs">
                          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 text-left">Item Name</th>
                              <th className="px-3 py-2 text-left">Specification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {approveResult.missing_rate.map((r, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2">{r.item_name}</td>
                                <td className="px-3 py-2 text-slate-500">{r.specification || <span className="text-slate-300">(blank)</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {approveResult.missing_category.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="text-sm font-bold text-amber-700">
                          Missing Category ({approveResult.missing_category.length})
                        </h4>
                        <button
                          type="button"
                          onClick={() => downloadMissingListExcel('category', approveResult)}
                          className="flex items-center gap-1 py-1 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-semibold rounded-lg text-[11px] transition-colors whitespace-nowrap"
                        >
                          <Download className="w-3 h-3" /> Download Excel
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        No matching Item Name in the Materials Category sheet. Add these (with their Head / Sub-1 /
                        Sub-2 / Sub-3 / Sector) to the Rate File and re-import, then run Approve &amp; Calculate again.
                      </p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200 text-xs">
                          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 text-left">Item Name</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {approveResult.missing_category.map((name, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2">{name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage Projects modal — Admin sets which Projects a User can access */}
      {managingUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setManagingUser(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900">Project Access</h3>
                <p className="text-xs text-slate-500">{managingUser.name} • {managingUser.email}</p>
              </div>
              <button
                onClick={() => setManagingUser(null)}
                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {projects.length > 0 && (
              <div className="px-5 pt-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={managePermSearch}
                    onChange={(e) => setManagePermSearch(e.target.value)}
                    placeholder="Search Project Name..."
                    autoComplete="off"
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                  />
                </div>
              </div>
            )}

            <div className="p-5 overflow-y-auto flex-1 space-y-2">
              {projects.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No projects exist yet. Add one from the Projects tab first.</p>
              ) : filteredManageProjects.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No Project matches "{managePermSearch}".</p>
              ) : (
                filteredManageProjects.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.has(p.id)}
                      onChange={() => toggleSelectedProject(p.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-900">{p.project_name}</span>
                  </label>
                ))
              )}
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setManagingUser(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={savingPermissions}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                {savingPermissions ? 'Saving...' : 'Save Access'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delivery Date range modal — Admin sets the allowed Delivery Date window for
          a Budget; Users then can't pick a Delivery Date outside it. */}
      {rangeBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Set Delivery Date Range</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Budget <span className="font-semibold">"{rangeBudget.budget_name}"</span> — Users won't be able to pick a
                Delivery Date outside this range when creating or editing an MPR entry under this Budget. Leave both blank to remove the restriction.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Delivery Date From
                </label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  max={rangeTo || undefined}
                  className="block w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Delivery Date To
                </label>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  min={rangeFrom || undefined}
                  className="block w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
              {rangeError && <p className="text-xs text-rose-600">{rangeError}</p>}
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-between items-center">
              <button
                type="button"
                onClick={() => { setRangeFrom(''); setRangeTo(''); }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Clear Dates
              </button>
              <div className="flex gap-2">
                <button
                  onClick={closeRangeModal}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDeliveryRange}
                  disabled={savingRange}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
                >
                  {savingRange ? 'Saving...' : 'Save Range'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};