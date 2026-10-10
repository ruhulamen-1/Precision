import React, { useState, useEffect } from 'react';
import { Project, MprNumber, Entry, Budget, BudgetItem, User, MprUsage } from '../types';
import { Calendar, Building2, FileText, Package, Clock, Plus, AlertTriangle, CheckCircle2, ChevronRight, X, Trash2, Edit2, Lock, Wallet, ArrowLeft, FolderOpen, ListChecks, Search, Save, Briefcase, FileDown } from 'lucide-react';
import { apiUrl } from '../lib/api';
import { formatDate, todayDateOnlyString } from '../lib/formatDate';
import { useStableCallback } from '../lib/useStableCallback';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface UserPanelProps {
  token: string;
  user: User;
}

// Every date (inclusive) between `from` and `to` (both "YYYY-MM-DD"), for rendering a
// SELECT-only Delivery Date picker once the Admin has set a bounded window on the
// Budget — a plain text/typed date input can be made to hold an out-of-range value
// (the server always re-validates it and would reject it, but a picker that simply
// can't represent an invalid value is a better experience than a rejected submit).
const dateRangeOptions = (from: string, to: string): string[] => {
  const out: string[] = [];
  // Parsed as explicit UTC ('Z' suffix) and stepped with setUTCDate so the string
  // we push out never gets shifted by the browser's local timezone offset — without
  // this, `new Date(\`${from}T00:00:00\`)` (no 'Z') is interpreted as LOCAL midnight,
  // and toISOString() then converts that back to UTC, which for timezones ahead of
  // UTC (e.g. Bangladesh, UTC+6) rolls every date in the list back by one day.
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
  // Guard against an accidentally huge range (e.g. a typo'd year) turning into an
  // unusably long dropdown.
  const MAX_DAYS = 1000;
  for (let d = new Date(start), i = 0; d <= end && i < MAX_DAYS; d.setUTCDate(d.getUTCDate() + 1), i++) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const formatDateLabel = (iso: string): string => formatDate(iso) || iso;

// One row = one MPR No + its own Item Name + its own Delivery Date.
// Multiple rows can be added under the same Job Name / Job No submission.
// Once a row is no longer the active one being filled in (a later row was added),
// it collapses down to just MPR No + Delivery Date to keep the form compact.
// One imported Budget Excel row (budget_items.id + its Description of Materials)
// that a selected MPR No carries — kept as an id+name pair (not just the text) so two
// rows that happen to share the exact same Description are still treated as two
// separate items instead of collapsing into one.
interface MprItemOption {
  budgetItemId: number;
  name: string;
}

interface MprRow {
  rowId: string;
  mprId: string;
  mprSearchText: string;
  showDropdown: boolean;
  // A selected MPR No can carry more than one imported Excel row — EVERY one of them
  // is auto-filled in here (instead of making the user pick just one, and instead of
  // silently merging rows that share the same Description text), and each becomes its
  // own entry on submit.
  itemNames: MprItemOption[];
  deliveryDate: string;
  collapsed: boolean;
}

const makeEmptyRow = (): MprRow => ({
  rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  mprId: '',
  mprSearchText: '',
  showDropdown: false,
  itemNames: [],
  deliveryDate: '',
  collapsed: false
});

interface EntryRowProps {
  it: Entry;
  idx: number;
  isEditing: boolean;
  canEdit: boolean;
  deletingEntryId: number | null;
  onStartEdit: (entry: Entry) => void;
  onCancelEdit: () => void;
  onSaveEdit: (entryId: number) => void;
  onDelete: (entryId: number) => void;
  onSelectEditMpr: (m: MprNumber) => void;
  // Edit-mode-only state — only actually read by the row currently being edited,
  // but always passed down (cheap primitives/arrays) since only ONE row is ever
  // editing at a time, and passing them doesn't affect memoization of the other rows.
  editJobName: string;
  setEditJobName: (v: string) => void;
  editMprSearchText: string;
  setEditMprSearchText: (v: string) => void;
  editShowMprDropdown: boolean;
  setEditShowMprDropdown: (v: boolean) => void;
  editMprId: string;
  setEditMprId: (v: string) => void;
  editMprOptions: MprNumber[];
  editItemName: string;
  editItemBudgetItemId: number | null;
  // Picking an option sets BOTH the display text and the specific source Excel row
  // (budgetItemId) at once, so two options with the same Description text still each
  // resolve to their own row.
  onEditItemChange: (opt: MprItemOption) => void;
  editItemOptions: MprItemOption[];
  editLoadingOptions: boolean;
  editJobDuration: string;
  setEditJobDuration: (v: string) => void;
  editDeliveryRange: { from: string | null; to: string | null };
  editDeliveryDate: string;
  setEditDeliveryDate: (v: string) => void;
  editSaving: boolean;
}

// Memoized so that typing anywhere ELSE in the panel (Add Entry form fields, column
// filters, etc.) does not force React to re-diff every row of a potentially long
// entries table — only the row(s) whose props actually changed re-render.
const EntryRow = React.memo(function EntryRow({
  it, idx, isEditing, canEdit, deletingEntryId,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete, onSelectEditMpr,
  editJobName, setEditJobName,
  editMprSearchText, setEditMprSearchText,
  editShowMprDropdown, setEditShowMprDropdown,
  editMprId, setEditMprId, editMprOptions,
  editItemName, editItemBudgetItemId, onEditItemChange, editItemOptions, editLoadingOptions,
  editJobDuration, setEditJobDuration,
  editDeliveryRange, editDeliveryDate, setEditDeliveryDate,
  editSaving
}: EntryRowProps) {
  return (
    <tr className="hover:bg-slate-50/80">
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{idx + 1}</td>
      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-blue-600">{it.job_no}</td>
      <td className="px-3 py-2.5 min-w-[140px] text-slate-900 font-medium">
        {isEditing ? (
          <input
            type="text"
            value={editJobName}
            onChange={(e) => setEditJobName(e.target.value)}
            className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        ) : (
          it.job_name
        )}
      </td>
      <td className="px-3 py-2.5 min-w-[150px] text-slate-900 relative">
        {isEditing ? (
          it.budget_id ? (
            <>
              <input
                type="text"
                value={editMprSearchText}
                onChange={(e) => {
                  setEditMprSearchText(e.target.value);
                  setEditShowMprDropdown(true);
                  if (editMprId) setEditMprId('');
                }}
                onFocus={() => setEditShowMprDropdown(true)}
                onBlur={() => setTimeout(() => setEditShowMprDropdown(false), 150)}
                autoComplete="off"
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {editShowMprDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {editMprOptions.length > 0 ? (
                    editMprOptions.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelectEditMpr(m)}
                        className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${
                          editMprId === String(m.id) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {m.mpr_no}
                      </button>
                    ))
                  ) : (
                    <div className="px-2.5 py-1.5 text-[11px] text-slate-400">No matching MPR No found</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <span className="text-slate-500">{it.mpr_no} <span className="text-[10px]">(not editable — no Budget)</span></span>
          )
        ) : (
          it.mpr_no
        )}
      </td>
      <td className="px-3 py-2.5 min-w-[180px] text-slate-700">
        {isEditing ? (
          editLoadingOptions ? (
            <span className="text-slate-400">Loading options...</span>
          ) : editItemOptions.length > 1 ? (
            <select
              value={editItemBudgetItemId ?? ''}
              onChange={(e) => {
                const opt = editItemOptions.find((o) => String(o.budgetItemId) === e.target.value);
                if (opt) onEditItemChange(opt);
              }}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              {editItemOptions.map((opt) => (
                <option key={opt.budgetItemId} value={opt.budgetItemId}>{opt.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-slate-500">{editItemName} <span className="text-[10px]">(only option)</span></span>
          )
        ) : (
          it.item_name
        )}
      </td>
      <td className="px-3 py-2.5 min-w-[150px] text-slate-600">{it.specification || '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{it.req_qty || '—'}</td>
      <td className="px-3 py-2.5 min-w-[110px] text-slate-600">
        {isEditing ? (
          <input
            type="text"
            value={editJobDuration}
            onChange={(e) => setEditJobDuration(e.target.value)}
            className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        ) : (
          it.job_duration
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
        {isEditing ? (
          <>
            {editDeliveryRange.from && editDeliveryRange.to ? (
              <select
                value={editDeliveryDate}
                onChange={(e) => setEditDeliveryDate(e.target.value)}
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none appearance-none"
              >
                <option value="">Select...</option>
                {dateRangeOptions(editDeliveryRange.from, editDeliveryRange.to).map((d) => (
                  <option key={d} value={d}>{formatDateLabel(d)}</option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={editDeliveryDate}
                onChange={(e) => setEditDeliveryDate(e.target.value)}
                min={editDeliveryRange.from || undefined}
                max={editDeliveryRange.to || undefined}
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            )}
            {(editDeliveryRange.from || editDeliveryRange.to) && (
              <div className="text-[9px] text-slate-400 mt-1">
                {formatDate(editDeliveryRange.from) || '—'} to {formatDate(editDeliveryRange.to) || '—'}
              </div>
            )}
          </>
        ) : (
          formatDate(it.delivery_date)
        )}
      </td>
      <td className="px-3 py-2.5 min-w-[110px] text-slate-500">
        {it.budget_name || '—'}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSaveEdit(it.id)}
              disabled={editSaving}
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
              title="Save"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={editSaving}
              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : canEdit ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStartEdit(it)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit before final submission"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(it.id)}
              disabled={deletingEntryId === it.id}
              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
              title="Delete this Job Entry"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-300 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
      </td>
    </tr>
  );
});

// Same data/behavior as EntryRow, laid out as a stacked card instead of table cells —
// used on narrow screens so the "Job Entry Details" list never needs horizontal
// scrolling on mobile (see the `md:hidden` / `hidden md:block` split further down).
const EntryCard = React.memo(function EntryCard({
  it, idx, isEditing, canEdit, deletingEntryId,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete, onSelectEditMpr,
  editJobName, setEditJobName,
  editMprSearchText, setEditMprSearchText,
  editShowMprDropdown, setEditShowMprDropdown,
  editMprId, setEditMprId, editMprOptions,
  editItemName, editItemBudgetItemId, onEditItemChange, editItemOptions, editLoadingOptions,
  editJobDuration, setEditJobDuration,
  editDeliveryRange, editDeliveryDate, setEditDeliveryDate,
  editSaving
}: EntryRowProps) {
  const fieldLabel = "text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1";
  const inputCls = "w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none";
  // Compact "label ⋯ value" line used by the read-only (non-editing) layout — packs
  // far more fields into the same height than a label-above-value block per field.
  const statRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-dashed border-slate-100 last:border-b-0">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-700 text-right truncate">{value}</span>
    </div>
  );

  return (
    <div className="p-3.5 border border-slate-200 rounded-xl bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 flex-shrink-0">#{idx + 1}</span>
            <span className="font-semibold text-blue-600 text-sm truncate">{it.job_no}</span>
          </div>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => onSaveEdit(it.id)}
              disabled={editSaving}
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
              title="Save"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={editSaving}
              className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : canEdit ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => onStartEdit(it)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit before final submission"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(it.id)}
              disabled={deletingEntryId === it.id}
              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
              title="Delete this Job Entry"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-300 flex items-center gap-1 flex-shrink-0">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
      </div>

      {!isEditing ? (
        // --- Compact read-only layout ---
        <div className="mt-1.5">
          <div className="text-sm font-medium text-slate-900 truncate">{it.job_name}</div>
          <div className="text-xs text-slate-600 truncate">{it.item_name}</div>
          <div className="mt-1.5">
            {statRow('MPR No', it.mpr_no)}
            {statRow('Specification', it.specification || '—')}
            {statRow('Qty', it.req_qty || '—')}
            {statRow('Job Duration', it.job_duration)}
            {statRow('Delivery Date', formatDate(it.delivery_date))}
            {statRow('Budget', it.budget_name || '—')}
          </div>
        </div>
      ) : (
        // --- Edit form (spacious — needs room for inputs/dropdowns) ---
        <div className="mt-2 space-y-3">
          <div>
            <div className={fieldLabel}>Job Name</div>
            <input
              type="text"
              value={editJobName}
              onChange={(e) => setEditJobName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="relative">
            <div className={fieldLabel}>MPR No</div>
            {it.budget_id ? (
              <>
                <input
                  type="text"
                  value={editMprSearchText}
                  onChange={(e) => {
                    setEditMprSearchText(e.target.value);
                    setEditShowMprDropdown(true);
                    if (editMprId) setEditMprId('');
                  }}
                  onFocus={() => setEditShowMprDropdown(true)}
                  onBlur={() => setTimeout(() => setEditShowMprDropdown(false), 150)}
                  autoComplete="off"
                  className={inputCls}
                />
                {editShowMprDropdown && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {editMprOptions.length > 0 ? (
                      editMprOptions.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onSelectEditMpr(m)}
                          className={`w-full text-left px-2.5 py-2 text-sm transition-colors ${
                            editMprId === String(m.id) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {m.mpr_no}
                        </button>
                      ))
                    ) : (
                      <div className="px-2.5 py-2 text-xs text-slate-400">No matching MPR No found</div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-sm text-slate-500">{it.mpr_no} <span className="text-[10px]">(not editable — no Budget)</span></span>
            )}
          </div>

          <div>
            <div className={fieldLabel}>Item Name</div>
            {editLoadingOptions ? (
              <span className="text-sm text-slate-400">Loading options...</span>
            ) : editItemOptions.length > 1 ? (
              <select
                value={editItemBudgetItemId ?? ''}
                onChange={(e) => {
                  const opt = editItemOptions.find((o) => String(o.budgetItemId) === e.target.value);
                  if (opt) onEditItemChange(opt);
                }}
                className={inputCls}
              >
                {editItemOptions.map((opt) => (
                  <option key={opt.budgetItemId} value={opt.budgetItemId}>{opt.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-500">{editItemName} <span className="text-[10px]">(only option)</span></span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className={fieldLabel}>Specification</div>
              <div className="text-slate-600">{it.specification || '—'}</div>
            </div>
            <div>
              <div className={fieldLabel}>Qty</div>
              <div className="text-slate-600">{it.req_qty || '—'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={fieldLabel}>Job Duration</div>
              <input
                type="text"
                value={editJobDuration}
                onChange={(e) => setEditJobDuration(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <div className={fieldLabel}>Delivery Date</div>
              {editDeliveryRange.from && editDeliveryRange.to ? (
                <select
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">Select...</option>
                  {dateRangeOptions(editDeliveryRange.from, editDeliveryRange.to).map((d) => (
                    <option key={d} value={d}>{formatDateLabel(d)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                  min={editDeliveryRange.from || undefined}
                  max={editDeliveryRange.to || undefined}
                  className={inputCls}
                />
              )}
            </div>
          </div>

          <div>
            <div className={fieldLabel}>Budget</div>
            <div className="text-sm text-slate-500">{it.budget_name || '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
});

export const UserPanel: React.FC<UserPanelProps> = ({ token, user }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [mprNumbers, setMprNumbers] = useState<MprNumber[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  // System-wide "which Job is this MPR No already used under" lookup — kept separate
  // from `entries` (which is now scoped to just this user's own entries) since MPR
  // No uniqueness is enforced across ALL users, not just this one.
  const [mprUsage, setMprUsage] = useState<MprUsage[]>([]);

  // Budget picker state — a User must pick a Budget the Admin has created & imported
  // BEFORE they're allowed to start a new MPR Entry. Everything in the Entry form
  // below (Project choices, MPR No choices, Item Name auto-fill) is scoped to
  // whichever Budget is currently selected.
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(false);
  // Per-column filters for the "Job Entry Details" table below — one small search input
  // directly under each header, each filtering only its own column. This replaced the
  // old raw "Budget Sheet" import preview — the User now searches their own submitted
  // entries instead of the full imported sheet.
  const [entryColumnFilters, setEntryColumnFilters] = useState({
    job_no: '',
    job_name: '',
    mpr_no: '',
    item_name: '',
    specification: '',
    req_qty: '',
    job_duration: '',
    // Delivery Date is a range (From/To date inputs), not free text like the other
    // columns — either side left blank means "no lower/upper bound".
    delivery_date_from: '',
    delivery_date_to: '',
    budget_name: ''
  });
  // Column filters live in a collapsible panel on mobile (there's no room for 9 inline
  // filter boxes above a card list the way there is above a table's header row).
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Form state
  const [entryDate, setEntryDate] = useState<string>(todayDateOnlyString());
  const [projectId, setProjectId] = useState<string>('');
  // Project Name is now a type-to-search dropdown (same pattern as MPR No) instead of
  // a plain <select> — projectSearchText holds what's typed/shown, showProjectDropdown
  // toggles the suggestion list.
  const [projectSearchText, setProjectSearchText] = useState<string>('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [jobName, setJobName] = useState<string>('');
  const [jobDuration, setJobDuration] = useState<string>('');
  const [mprRows, setMprRows] = useState<MprRow[]>([makeEmptyRow()]);

  const [loading, setLoading] = useState(false);
  const [submittingBudget, setSubmittingBudget] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);


  // Editing a single MPR row inside the Job Entry Details popup — only allowed for the
  // User's own entries, and only while the entry's Budget hasn't been submitted yet.
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  // Which specific imported Excel row (budget_items.id) editItemName currently refers
  // to — kept alongside the text so that picking a row whose Description text happens
  // to match another row still resolves to the exact right Specification/Qty.
  const [editItemBudgetItemId, setEditItemBudgetItemId] = useState<number | null>(null);
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [editItemOptions, setEditItemOptions] = useState<MprItemOption[]>([]);
  const [editLoadingOptions, setEditLoadingOptions] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  // Deleting a single MPR row inside the Job Entry Details popup — only allowed for
  // the User's own (unlocked) entries. A delete moves the entry into the Admin's Job
  // Recycle bin, it isn't erased outright.
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');
  // Job Name / Job Duration / MPR No — also editable now (Item Name / Delivery Date
  // were already editable above). Job Name and Job Duration apply to the whole Job
  // (every MPR row under it), not just this one row.
  const [editJobName, setEditJobName] = useState('');
  const [editJobDuration, setEditJobDuration] = useState('');
  const [editMprId, setEditMprId] = useState('');
  const [editMprSearchText, setEditMprSearchText] = useState('');
  const [editShowMprDropdown, setEditShowMprDropdown] = useState(false);
  // The entry being edited's own Budget's imported items — used both for the Item Name
  // options (as before) and now for scoping which MPR Nos are pickable in the dropdown.
  const [editBudgetItems, setEditBudgetItems] = useState<BudgetItem[]>([]);
  // Delivery Date window (if any) for the Budget the entry being edited belongs to —
  // looked up from the already-fetched budgets list so the edit date input can be
  // constrained with the same min/max as the main entry form.
  const [editDeliveryRange, setEditDeliveryRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null
  });

  useEffect(() => {
    fetchMasterData();
    fetchEntries();
    fetchMprUsage();
  }, [token]);

  const fetchMasterData = async () => {
    try {
      const [projRes, mprRes, budgetRes] = await Promise.all([
        fetch(apiUrl('/api/projects'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/mpr-numbers'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/budgets'), { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (projRes.ok) setProjects(await projRes.json());
      if (mprRes.ok) setMprNumbers(await mprRes.json());
      if (budgetRes.ok) setBudgets(await budgetRes.json());
    } catch (err) {
      console.error('Failed to load master data', err);
    }
  };

  // Only Budgets the Admin has actually imported an Excel sheet into are usable for a
  // new MPR Entry — a Budget that's only been named but has nothing imported yet has
  // no Project/MPR No choices to offer.
  const usableBudgets = React.useMemo(
    () => budgets.filter((b) => (b.item_count || 0) > 0),
    [budgets]
  );

  const openBudget = async (budget: Budget) => {
    setSelectedBudget(budget);
    setBudgetItems([]);
    setMessage(null);
    // Reset the form whenever a (new) Budget is opened, so a stale row from a
    // previously opened Budget can never carry over into this one.
    setJobName('');
    setJobDuration('');
    setProjectId('');
    setProjectSearchText('');
    setShowProjectDropdown(false);
    setMprRows([makeEmptyRow()]);
    setLoadingBudgetItems(true);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${budget.id}/items`), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBudgetItems(await res.json());
    } catch (err) {
      console.error('Failed to load budget items', err);
    } finally {
      setLoadingBudgetItems(false);
    }
  };

  const closeBudget = () => {
    setSelectedBudget(null);
    setBudgetItems([]);
    setMessage(null);
  };

  const clearEntryColumnFilters = () =>
    setEntryColumnFilters({
      job_no: '',
      job_name: '',
      mpr_no: '',
      item_name: '',
      specification: '',
      req_qty: '',
      job_duration: '',
      delivery_date_from: '',
      delivery_date_to: '',
      budget_name: ''
    });

  const hasActiveEntryColumnFilter = Object.values(entryColumnFilters).some((v) => v.trim());

  // Whether the CURRENT user has already created at least one entry under the
  // selected Budget — "Submit This Budget" only makes sense once there's something
  // to submit, so the button stays disabled (and the request is rejected server-side
  // too) until this is true.
  const hasOwnEntriesInSelectedBudget = React.useMemo(() => {
    if (!selectedBudget) return false;
    return entries.some((e) => e.budget_id === selectedBudget.id && e.created_by === user.id);
  }, [entries, selectedBudget, user.id]);

  // Live preview of what this User's next Job No under the selected Budget WILL
  // become on submit — mirrors the server's own "JOB-000X, sequential per user per
  // budget" logic (COUNT of this user's distinct Jobs under this Budget, + 1) so the
  // Job No field shows something meaningful instead of sitting blank until submit.
  const nextJobNoPreview = React.useMemo(() => {
    if (!selectedBudget) return '';
    const myJobNosInBudget = new Set(
      entries
        .filter((e) => e.budget_id === selectedBudget.id && e.created_by === user.id)
        .map((e) => e.job_no)
    );
    return `JOB-${String(myJobNosInBudget.size + 1).padStart(4, '0')}`;
  }, [entries, selectedBudget, user.id]);

  // Only Projects that were actually imported into the selected Budget's Excel sheet
  // (and that this User already has access to) may be picked for a new entry.
  const scopedProjects = React.useMemo(() => {
    if (!selectedBudget) return [];
    const namesInBudget = new Set(
      budgetItems.filter((bi) => bi.project_name).map((bi) => bi.project_name!.trim().toLowerCase())
    );
    return projects.filter((p) => namesInBudget.has(p.project_name.trim().toLowerCase()));
  }, [selectedBudget, budgetItems, projects]);

  // Suggestions for the Project Name type-to-search dropdown — scoped to this
  // Budget's imported Projects, filtered by whatever's currently typed.
  const filteredScopedProjects = React.useMemo(() => {
    const q = projectSearchText.trim().toLowerCase();
    if (!q) return scopedProjects;
    return scopedProjects.filter((p) => p.project_name.toLowerCase().includes(q));
  }, [scopedProjects, projectSearchText]);

  // If this User only has ONE Project available for the selected Budget, there's
  // nothing to actually choose — auto-fill it instead of making them search/select
  // a list of one. Still re-runs if the Budget (and so scopedProjects) changes.
  useEffect(() => {
    if (scopedProjects.length === 1 && projectId !== String(scopedProjects[0].id)) {
      setProjectId(String(scopedProjects[0].id));
      setProjectSearchText(scopedProjects[0].project_name);
    }
  }, [scopedProjects]);

  const selectProject = (project: Project) => {
    setProjectId(String(project.id));
    setProjectSearchText(project.project_name);
    setShowProjectDropdown(false);
    // A different Project can have a completely different set of valid MPR Nos, so
    // any rows already filled in against the old Project no longer make sense —
    // reset back to a single empty row.
    setMprRows([makeEmptyRow()]);
  };

  // One MPR No can carry more than one imported Excel row (several distinct line
  // items requisitioned under the same MRF No) — this returns EVERY row imported for
  // that MPR No in the selected Budget, so the Item Name field can offer all of them
  // instead of silently picking one. Rows are kept as individual budget_items — even
  // when two rows share the exact same "Description of Materials" text (different
  // Qty/Specification/Sl.No.), each is still its own entry, not merged into one.
  const itemsForMprInBudget = (mprNo: string): MprItemOption[] => {
    const out: MprItemOption[] = [];
    for (const bi of budgetItems) {
      if ((bi.mrf_no || '').trim().toLowerCase() !== mprNo.trim().toLowerCase()) continue;
      const desc = (bi.description || '').trim();
      if (!desc) continue;
      out.push({ budgetItemId: bi.id, name: desc });
    }
    return out;
  };

  const fetchEntries = async () => {
    try {
      const res = await fetch(apiUrl('/api/entries'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEntries(await res.json());
    } catch (err) {
      console.error('Failed to load entries', err);
    }
  };

  const fetchMprUsage = async () => {
    try {
      const res = await fetch(apiUrl('/api/entries/mpr-usage'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMprUsage(await res.json());
    } catch (err) {
      console.error('Failed to load MPR usage', err);
    }
  };

  // --- MPR row helpers (one row = one MPR No + Item Name + Delivery Date) ---
  const updateRow = (rowId: string, patch: Partial<MprRow>) => {
    setMprRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const selectMprForRow = (rowId: string, mprId: string, mprNo: string) => {
    // Auto-fill EVERY Excel row imported under this MPR No — when an MPR No carries
    // several items in the Budget Excel (including rows with a duplicate Description),
    // all of them are entered together for this row instead of making the user pick
    // just one or silently dropping duplicates.
    const items = itemsForMprInBudget(mprNo);
    updateRow(rowId, { mprId, mprSearchText: mprNo, showDropdown: false, itemNames: items });
  };

  // Adding a new MPR row leaves BOTH the MPR No and Delivery Date blank — each row
  // must have its Delivery Date picked manually. (Previously the Delivery Date carried
  // over from the last row; that's intentionally removed now so "Select a Delivery
  // Date..." always shows until the user picks one.) An MPR No must never be
  // pre-filled/duplicated into a new row, since the same MPR No cannot be reused within
  // one Job submission. The row being left behind collapses down to just MPR No +
  // Delivery Date to keep the form compact.
  // Blocked if the current last row's MPR No or Delivery Date is still blank — forces
  // that row to be fully filled in before another one can be started, instead of
  // letting several incomplete rows pile up.
  const addRow = () => {
    const last = mprRows[mprRows.length - 1];
    if (last && !last.mprId) {
      setMessage({ type: 'error', text: 'Select an MPR No for the current row before adding another one.' });
      return;
    }
    if (last && !last.deliveryDate) {
      setMessage({ type: 'error', text: 'Select a Delivery Date for the current row before adding another one.' });
      return;
    }
    const newRow = makeEmptyRow();
    setMprRows((prev) => [...prev.map((r) => ({ ...r, collapsed: true })), newRow]);
  };

  const removeRow = (rowId: string) => {
    setMprRows((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev));
  };

  // An MPR No is excluded from the dropdown once it's no longer available to pick:
  // - not imported under the currently selected Project (within this Budget's sheet)
  // - already selected in another row of THIS form (can't use the same MPR twice in one Job)
  // - already used in ANY past entry, by any user (each MPR No is meant to be used only once
  //   system-wide, so once it's been entered against a job it's considered used up)
  const filteredMprFor = (row: MprRow) => {
    const selectedProject = projects.find((p) => String(p.id) === projectId);
    const selectedProjectName = selectedProject ? selectedProject.project_name.trim().toLowerCase() : '';
    // Scoped to the imported rows for THIS Project only — an MPR No imported under a
    // different Project in the same Budget sheet must not show up here.
    const allowedInBudget = new Set(
      budgetItems
        .filter((bi) => bi.mrf_no && (bi.project_name || '').trim().toLowerCase() === selectedProjectName)
        .map((bi) => bi.mrf_no!.trim().toLowerCase())
    );
    const usedByOtherRows = new Set(
      mprRows.filter((r) => r.rowId !== row.rowId && r.mprId).map((r) => r.mprId)
    );
    // System-wide — sourced from mprUsage (every user's entries), not just this
    // user's own `entries`, since an MPR No is only ever usable once, period.
    const usedInPastEntries = new Set(mprUsage.map((u) => String(u.mpr_id)));
    if (!selectedProjectName) return [];
    return mprNumbers.filter(
      (m) =>
        allowedInBudget.has(m.mpr_no.trim().toLowerCase()) &&
        m.mpr_no.toLowerCase().includes(row.mprSearchText.toLowerCase()) &&
        !usedByOtherRows.has(String(m.id)) &&
        !usedInPastEntries.has(String(m.id))
    );
  };

  // Looks up whether the MPR No currently typed into a row exactly matches one
  // that's already been entered (by anyone) — used to explain WHY it disappeared
  // from the dropdown instead of just showing "No matching MPR No found".
  const mprUsageForSearchText = (searchText: string): MprUsage | null => {
    const q = searchText.trim().toLowerCase();
    if (!q) return null;
    return mprUsage.find((u) => u.mpr_no.trim().toLowerCase() === q) || null;
  };

  // "Recent Entries" now shows every one of the User's own submitted MPR rows directly
  // as a flat "Job Entry Details" table (no more grouped Job list you had to click into
  // to open a popup) — newest first.
  const sortedEntries: Entry[] = React.useMemo(
    () => [...entries].sort((a, b) => b.id - a.id),
    [entries]
  );

  // Each column filter narrows "Job Entry Details" independently (AND across columns) —
  // case-insensitive substring match, blank filter = no restriction on that column.
  const filteredEntries: Entry[] = React.useMemo(() => {
    const f = {
      job_no: entryColumnFilters.job_no.trim().toLowerCase(),
      job_name: entryColumnFilters.job_name.trim().toLowerCase(),
      mpr_no: entryColumnFilters.mpr_no.trim().toLowerCase(),
      item_name: entryColumnFilters.item_name.trim().toLowerCase(),
      specification: entryColumnFilters.specification.trim().toLowerCase(),
      req_qty: entryColumnFilters.req_qty.trim().toLowerCase(),
      job_duration: entryColumnFilters.job_duration.trim().toLowerCase(),
      delivery_date_from: entryColumnFilters.delivery_date_from.trim(),
      delivery_date_to: entryColumnFilters.delivery_date_to.trim(),
      budget_name: entryColumnFilters.budget_name.trim().toLowerCase()
    };
    const anyFilterActive = Object.values(f).some((v) => v);
    if (!anyFilterActive) return sortedEntries;
    return sortedEntries.filter((ent) =>
      (!f.job_no || ent.job_no.toLowerCase().includes(f.job_no)) &&
      (!f.job_name || ent.job_name.toLowerCase().includes(f.job_name)) &&
      (!f.mpr_no || (ent.mpr_no || '').toLowerCase().includes(f.mpr_no)) &&
      (!f.item_name || (ent.item_name || '').toLowerCase().includes(f.item_name)) &&
      (!f.specification || (ent.specification || '').toLowerCase().includes(f.specification)) &&
      (!f.req_qty || (ent.req_qty || '').toLowerCase().includes(f.req_qty)) &&
      (!f.job_duration || (ent.job_duration || '').toLowerCase().includes(f.job_duration)) &&
      // Delivery Date strings are already "YYYY-MM-DD", so plain string comparison
      // sorts correctly as a date range — no Date object / timezone conversion needed.
      (!f.delivery_date_from || !ent.delivery_date || ent.delivery_date >= f.delivery_date_from) &&
      (!f.delivery_date_to || !ent.delivery_date || ent.delivery_date <= f.delivery_date_to) &&
      (!f.budget_name || (ent.budget_name || '').toLowerCase().includes(f.budget_name))
    );
  }, [sortedEntries, entryColumnFilters]);

  // Every distinct Job this user has ever submitted, as a Job No + Job Name pair —
  // most recent first (unaffected by the column filters below, a running list, not a
  // filtered one). One row per Job No, keeping whichever entry's Job Name is newest
  // if it was ever edited.
  const uniqueJobsList = React.useMemo(() => {
    const seen = new Map<string, { job_no: string; job_name: string }>();
    for (const e of sortedEntries) {
      if (!seen.has(e.job_no)) {
        seen.set(e.job_no, { job_no: e.job_no, job_name: e.job_name });
      }
    }
    return Array.from(seen.values());
  }, [sortedEntries]);
  const totalJobsCount = uniqueJobsList.length;

  // "Export PDF" for Job Entry Details — a PDF laid out as a table (same columns as
  // the on-screen table), not an actual .xlsx file. Exports whatever is currently
  // showing (respects the active column filters, same rows as filteredEntries).
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text('Job Entry Details', 14, 12);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated ${formatDate(todayDateOnlyString())}`, 14, 18);

    autoTable(doc, {
      startY: 23,
      head: [['SL', 'Job No', 'Job Name', 'MPR No', 'Item Name', 'Specification', 'Qty', 'Job Duration', 'Delivery Date', 'Budget']],
      body: filteredEntries.map((it, idx) => [
        String(idx + 1),
        it.job_no || '',
        it.job_name || '',
        it.mpr_no || '',
        it.item_name || '',
        it.specification || '',
        it.req_qty || '',
        it.job_duration || '',
        formatDate(it.delivery_date) || '',
        it.budget_name || ''
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`Job_Entry_Details_${todayDateOnlyString()}.pdf`);
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedBudget) {
      setMessage({ type: 'error', text: 'Please select a Budget first.' });
      return;
    }

    if (!projectId || !jobName.trim() || !jobDuration.trim()) {
      setMessage({ type: 'error', text: 'Project, Job Name and Job Duration are required.' });
      return;
    }

    const incompleteRow = mprRows.find((r) => !r.mprId || r.itemNames.length === 0 || !r.deliveryDate);
    if (incompleteRow) {
      setMessage({ type: 'error', text: 'Every MPR No row needs an MPR No (with at least one Item Name) and a Delivery Date.' });
      return;
    }

    // If the Admin has set an allowed Delivery Date window for this Budget, every
    // row's Delivery Date must fall inside it (the date pickers already enforce this
    // via min/max, but this catches anything that slipped through, e.g. typed dates).
    const deliveryFrom = selectedBudget.delivery_date_from || '';
    const deliveryTo = selectedBudget.delivery_date_to || '';
    if (deliveryFrom || deliveryTo) {
      const outOfRangeRow = mprRows.find(
        (r) => (deliveryFrom && r.deliveryDate < deliveryFrom) || (deliveryTo && r.deliveryDate > deliveryTo)
      );
      if (outOfRangeRow) {
        setMessage({
          type: 'error',
          text: `Delivery Date must be between ${deliveryFrom || '—'} and ${deliveryTo || '—'} for this Budget.`
        });
        return;
      }
    }

    const mprIdsUsed = mprRows.map((r) => r.mprId);
    if (new Set(mprIdsUsed).size !== mprIdsUsed.length) {
      setMessage({ type: 'warning', text: 'The same MPR No is selected in more than one row. Please choose different MPR Nos.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/entries'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          budget_id: selectedBudget.id,
          project_id: Number(projectId),
          job_name: jobName.trim(),
          job_duration: jobDuration.trim(),
          // Each MPR row can expand into several entries — one per Excel row imported
          // under that MPR No (even ones sharing the same Description text) — all
          // sharing the same MPR No and Delivery Date.
          items: mprRows.flatMap((r) =>
            r.itemNames.map((opt) => ({
              mpr_id: Number(r.mprId),
              budget_item_id: opt.budgetItemId,
              item_name: opt.name.trim(),
              delivery_date: r.deliveryDate
            }))
          )
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.warning) {
          setMessage({ type: 'warning', text: data.error || 'Duplicate entry warning!' });
        } else {
          throw new Error(data.error || 'Failed to create entry');
        }
        return;
      }

      setMessage({ type: 'success', text: `Job ${data.job_no || ''} saved with ${data.count || mprRows.length} MPR No entr${(data.count || mprRows.length) === 1 ? 'y' : 'ies'}!` });
      // Reset form fields except project
      setJobName('');
      setJobDuration('');
      setMprRows([makeEmptyRow()]);
      fetchEntries();
      fetchMprUsage();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Marks the currently selected Budget as finished for THIS user. After this, the
  // server rejects any new entries from this user under this Budget — irreversible
  // from the User side, so confirm before firing.
  const handleSubmitBudget = async () => {
    if (!selectedBudget || selectedBudget.submitted) return;
    if (!hasOwnEntriesInSelectedBudget) {
      setMessage({ type: 'error', text: 'Add at least one MPR entry to this Budget before submitting it as finished.' });
      return;
    }
    const confirmed = window.confirm(
      `Submit "${selectedBudget.budget_name}"? Once submitted, you won't be able to add any more entries to this Budget.`
    );
    if (!confirmed) return;

    setSubmittingBudget(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${selectedBudget.id}/submit`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit budget');

      setMessage({ type: 'success', text: `Budget "${selectedBudget.budget_name}" submitted. No more entries can be added to it.` });
      setSelectedBudget((prev) => (prev ? { ...prev, submitted: true } : prev));
      setBudgets((prev) => prev.map((b) => (b.id === selectedBudget.id ? { ...b, submitted: true } : b)));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingBudget(false);
    }
  };

  // (Re)loads Item options for a given Budget + MPR No — used on first opening the
  // edit row, and again whenever the MPR No is changed mid-edit. Every imported Excel
  // row is offered individually (not deduped by Description text), so a row whose
  // Description matches another row is still its own selectable option.
  const loadEditItemOptions = async (budgetId: number | null | undefined, mprNo: string): Promise<MprItemOption[]> => {
    setEditItemOptions([]);
    if (!budgetId) return [];
    setEditLoadingOptions(true);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${budgetId}/items`), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const items: BudgetItem[] = await res.json();
        setEditBudgetItems(items);
        const out: MprItemOption[] = [];
        for (const bi of items) {
          if ((bi.mrf_no || '').trim().toLowerCase() !== mprNo.trim().toLowerCase()) continue;
          const desc = (bi.description || '').trim();
          if (!desc) continue;
          out.push({ budgetItemId: bi.id, name: desc });
        }
        setEditItemOptions(out);
        return out;
      }
    } catch (err) {
      console.error('Failed to load item options for edit', err);
    } finally {
      setEditLoadingOptions(false);
    }
    return [];
  };

  // Start editing one MPR row from the Job Entry Details popup. Loads that entry's own
  // Budget items (not necessarily the currently-opened Budget) so the Item Name / MPR
  // No options shown are correct even if the User navigated away from that Budget already.
  const startEditEntry = async (entry: Entry) => {
    setEditingEntryId(entry.id);
    setEditItemName(entry.item_name);
    setEditItemBudgetItemId(entry.budget_item_id ?? null);
    setEditDeliveryDate(entry.delivery_date);
    setEditJobName(entry.job_name);
    setEditJobDuration(entry.job_duration);
    setEditMprId(String(entry.mpr_id));
    setEditMprSearchText(entry.mpr_no);
    setEditShowMprDropdown(false);
    setEditError('');
    setEditItemOptions([]);
    setEditBudgetItems([]);
    const owningBudget = entry.budget_id ? budgets.find((b) => b.id === entry.budget_id) : null;
    setEditDeliveryRange({
      from: owningBudget?.delivery_date_from || null,
      to: owningBudget?.delivery_date_to || null
    });
    await loadEditItemOptions(entry.budget_id, entry.mpr_no);
  };

  const cancelEditEntry = () => {
    setEditingEntryId(null);
    setEditItemName('');
    setEditItemBudgetItemId(null);
    setEditDeliveryDate('');
    setEditItemOptions([]);
    setEditError('');
    setDeleteError('');
    setEditDeliveryRange({ from: null, to: null });
    setEditJobName('');
    setEditJobDuration('');
    setEditMprId('');
    setEditMprSearchText('');
    setEditShowMprDropdown(false);
    setEditBudgetItems([]);
  };

  // MPR Nos pickable for the row currently being edited — scoped to that entry's own
  // Project within its own Budget (same rule as the create form), excluding any MPR No
  // already used by a DIFFERENT entry. Only offered when the entry came from a Budget;
  // older entries without one keep MPR No as read-only text (nothing to scope against).
  const filteredEditMprOptions = () => {
    const currentEntry = entries.find((it) => it.id === editingEntryId);
    if (!currentEntry || !currentEntry.budget_id) return [];
    const projectNameLower = currentEntry.project_name.trim().toLowerCase();
    const allowedInBudget = new Set(
      editBudgetItems
        .filter((bi) => bi.mrf_no && (bi.project_name || '').trim().toLowerCase() === projectNameLower)
        .map((bi) => bi.mrf_no!.trim().toLowerCase())
    );
    // System-wide usage, excluding this same entry's own current MPR No (so it still
    // shows up as pickable — re-selecting the entry's own MPR No must stay allowed).
    const usedByOtherEntries = new Set(
      mprUsage.filter((u) => String(u.mpr_id) !== String(currentEntry.mpr_id)).map((u) => String(u.mpr_id))
    );
    return mprNumbers.filter(
      (m) =>
        allowedInBudget.has(m.mpr_no.trim().toLowerCase()) &&
        m.mpr_no.toLowerCase().includes(editMprSearchText.toLowerCase()) &&
        !usedByOtherEntries.has(String(m.id))
    );
  };

  const selectEditMpr = async (m: MprNumber) => {
    const currentEntry = entries.find((it) => it.id === editingEntryId);
    setEditMprId(String(m.id));
    setEditMprSearchText(m.mpr_no);
    setEditShowMprDropdown(false);
    // A different MPR No can carry a completely different set of Item options —
    // reload them and clear the current pick so the User re-selects explicitly.
    setEditItemName('');
    setEditItemBudgetItemId(null);
    const opts = await loadEditItemOptions(currentEntry?.budget_id, m.mpr_no);
    // If there's only one possible Item under the newly-picked MPR No, auto-select it
    // (matches how the create form auto-fills a single option) instead of leaving the
    // "only option" display blank until the user does something.
    if (opts.length === 1) handleEditItemChange(opts[0]);
  };

  // Picking an Item option from the dropdown sets BOTH the display text and the
  // specific source Excel row (budgetItemId) together, so two options that happen to
  // share the same Description text still each resolve to their own row.
  const handleEditItemChange = (opt: MprItemOption) => {
    setEditItemName(opt.name);
    setEditItemBudgetItemId(opt.budgetItemId);
  };

  const saveEditEntry = async (entryId: number) => {
    if (!editItemName.trim() || !editDeliveryDate || !editJobName.trim() || !editJobDuration.trim() || !editMprId) {
      setEditError('Job Name, Job Duration, MPR No, Item Name and Delivery Date are all required.');
      return;
    }
    if (
      (editDeliveryRange.from && editDeliveryDate < editDeliveryRange.from) ||
      (editDeliveryRange.to && editDeliveryDate > editDeliveryRange.to)
    ) {
      setEditError(
        `Delivery Date must be between ${editDeliveryRange.from || '—'} and ${editDeliveryRange.to || '—'} for this Budget.`
      );
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(apiUrl(`/api/entries/${entryId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          item_name: editItemName.trim(),
          budget_item_id: editItemBudgetItemId,
          delivery_date: editDeliveryDate,
          job_name: editJobName.trim(),
          job_duration: editJobDuration.trim(),
          mpr_id: Number(editMprId)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update entry');

      // Reflect the change immediately in the Recent Entries table, then re-sync with
      // the server in the background. Item Name / Delivery Date / MPR No only change
      // this row; Job Name / Job Duration are shared, so every row under the same Job
      // picks up the change too.
      const newJobName = editJobName.trim();
      const newJobDuration = editJobDuration.trim();
      const newMprId = Number(editMprId);
      const newMprNo = editMprSearchText;
      const jobNo = entries.find((e) => e.id === entryId)?.job_no;

      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === entryId) {
            return {
              ...e,
              item_name: editItemName.trim(),
              budget_item_id: editItemBudgetItemId,
              delivery_date: editDeliveryDate,
              mpr_id: newMprId,
              mpr_no: newMprNo,
              job_name: newJobName,
              job_duration: newJobDuration
            };
          }
          if (jobNo && e.job_no === jobNo) {
            return { ...e, job_name: newJobName, job_duration: newJobDuration };
          }
          return e;
        })
      );
      cancelEditEntry();
      fetchEntries();
      fetchMprUsage();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // Deleting your own Job Entry moves it into the Admin's Job Recycle bin (a soft
  // delete) — it isn't gone forever, but it disappears from your own list right away
  // and its MPR No becomes usable again.
  const handleDeleteEntry = async (entryId: number) => {
    if (!confirm('Delete this Job Entry? An Admin will be able to restore it from the Job Recycle bin if needed.')) return;
    setDeletingEntryId(entryId);
    setDeleteError('');
    try {
      const res = await fetch(apiUrl(`/api/entries/${entryId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete entry');

      // Drop it from the Recent Entries table right away, then re-sync with the server
      // in the background.
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      if (editingEntryId === entryId) cancelEditEntry();
      fetchEntries();
      fetchMprUsage();
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingEntryId(null);
    }
  };

  // Stable-identity wrappers (see useStableCallback above) — passed to EntryRow so
  // React.memo can actually skip re-rendering rows unaffected by the current keystroke.
  const stableStartEditEntry = useStableCallback(startEditEntry);
  const stableCancelEditEntry = useStableCallback(cancelEditEntry);
  const stableSaveEditEntry = useStableCallback(saveEditEntry);
  const stableHandleDeleteEntry = useStableCallback(handleDeleteEntry);
  const stableSelectEditMpr = useStableCallback(selectEditMpr);
  // Computed once per render (only actually consulted by the single row being
  // edited, if any) instead of being re-derived twice per render as before.
  const editMprOptions = filteredEditMprOptions();

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-[#dceeff] min-h-[calc(100vh-4rem)] text-slate-900">
      {/* Message Banner */}
      {message && (
        <div className={`p-4 rounded-xl border flex items-center space-x-3 text-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          message.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
          'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />}
          {message.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />}
          {message.type === 'error' && <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />}
          <div className="font-medium">{message.text}</div>
        </div>
      )}

      {/* Entry Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          {!selectedBudget ? (
            /* Budget Picker — a User must choose a Budget the Admin has created &
               imported before a new MPR Entry can be started. */
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm lg:sticky lg:top-24">
              <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-600" /> Select a Budget
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Pick a Budget imported by the Admin to start a new MPR entry under it.
              </p>

              {usableBudgets.length === 0 ? (
                <div className="text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl py-8 px-4 flex flex-col items-center gap-2">
                  <FolderOpen className="w-6 h-6 text-slate-300" />
                  No Budget has been imported by the Admin yet. Please check back later.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                  {usableBudgets.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => openBudget(b)}
                      className="w-full flex items-center justify-between gap-3 text-left p-3.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate group-hover:text-blue-700 flex items-center gap-1.5">
                          <span className="truncate">{b.budget_name}</span>
                          {b.submitted && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex-shrink-0">
                              <Lock className="w-2.5 h-2.5" /> Submitted
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <ListChecks className="w-3 h-3" /> {b.item_count || 0} imported item{(b.item_count || 0) === 1 ? '' : 's'}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-6 lg:sticky lg:top-24">
            <button
              type="button"
              onClick={closeBudget}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Budgets
            </button>
            <h3 className="text-xl font-semibold text-slate-900 mb-1">
              {selectedBudget.submitted ? 'Budget Submitted' : 'New MPR Entry'}
            </h3>
            <p className="text-sm text-slate-500 mb-5 truncate">
              Budget: <span className="text-slate-700 font-medium">{selectedBudget.budget_name}</span>
            </p>

            {selectedBudget.submitted ? (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 flex items-start gap-2.5">
                <Lock className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                <span>
                  You already submitted this Budget as finished. No new MPR entries can be added to it anymore.
                  Use <span className="font-semibold">Back to Budgets</span> to pick a different Budget.
                </span>
              </div>
            ) : (
            <>
            {loadingBudgetItems && (
              <p className="text-xs text-slate-400 mb-3">Loading this Budget's imported items…</p>
            )}

            <form onSubmit={handleSubmitEntry} className="space-y-4">
              {/* Job Name (Manually entered by the user) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Job Name <span className="text-slate-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="e.g. Site Foundation Work"
                  className="block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
                />
              </div>

              {/* Project Name + Job No + Entry Date — kept together in one row.
                  Project Name is a type-to-search dropdown (auto-filled/read-only when
                  this User only has ONE Project available for this Budget). Job No and
                  Entry Date are server-assigned/read-only: Job No shows a live preview
                  of what it WILL become on submit (JOB-000X, based on how many Jobs
                  this User has already submitted under this Budget) instead of sitting
                  blank, and Entry Date is always today. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Project Name <span className="text-slate-400">*</span>
                  </label>
                  {scopedProjects.length === 1 ? (
                    <input
                      type="text"
                      readOnly
                      value={scopedProjects[0].project_name}
                      className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm cursor-not-allowed"
                    />
                  ) : (
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={projectSearchText}
                      onChange={(e) => {
                        setProjectSearchText(e.target.value);
                        setShowProjectDropdown(true);
                        if (projectId) {
                          // Typing again after a Project was already picked invalidates that
                          // pick — clear it (and any rows filled in under it) until a fresh
                          // suggestion is chosen.
                          setProjectId('');
                          setMprRows([makeEmptyRow()]);
                        }
                      }}
                      onFocus={() => setShowProjectDropdown(true)}
                      onBlur={() => setTimeout(() => setShowProjectDropdown(false), 150)}
                      placeholder="Type to search Project Name..."
                      autoComplete="off"
                      className="block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
                    />

                    {showProjectDropdown && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-md max-h-48 overflow-y-auto">
                        {filteredScopedProjects.length > 0 ? (
                          filteredScopedProjects.map((p) => (
                            <button
                              type="button"
                              key={p.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectProject(p)}
                              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                                projectId === String(p.id) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {p.project_name}
                            </button>
                          ))
                        ) : (
                          <div className="px-3.5 py-2 text-xs text-slate-400">No matching Project found</div>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                  {scopedProjects.length !== 1 && !projectId && projectSearchText && (
                    <p className="text-xs text-amber-600 mt-1.5">Please select a Project from the list.</p>
                  )}
                  {scopedProjects.length === 0 && !loadingBudgetItems && (
                    <p className="text-xs text-amber-600 mt-1.5">
                      No Project from this Budget is available to you yet. Contact your Administrator.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Job No <span className="text-xs text-slate-400 font-normal">(auto)</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value={nextJobNoPreview}
                    placeholder="Assigned on submit"
                    className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-medium text-sm cursor-not-allowed placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Entry Date <span className="text-xs text-slate-400 font-normal">(today)</span>
                  </label>
                  <input
                    type="date"
                    disabled
                    value={entryDate}
                    className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Job Duration */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Job Duration <span className="text-slate-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={jobDuration}
                  onChange={(e) => setJobDuration(e.target.value)}
                  placeholder="e.g. 3 Months"
                  className="block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
                />
              </div>

              {/* MPR No rows — one Job Name/Job No can hold multiple MPR Nos,
                  each with its own Item Name and Delivery Date.
                  Hidden until a Project is selected: which MPR Nos are valid depends
                  on the Project, so there's nothing meaningful to pick before then. */}
              {!projectId ? (
                <div className="pt-5 border-t border-slate-200">
                  <div className="text-center text-sm text-slate-400 py-6">
                    Select a Project Name above to add MPR No entries.
                  </div>
                </div>
              ) : (
              <div className="pt-5 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  MPR No Entries <span className="text-slate-400">*</span>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                    {mprRows.filter((r) => r.mprId).length} added
                  </span>
                </label>

                <div className="space-y-4">
                  {mprRows.map((row, idx) => {
                    const filteredMprNumbers = filteredMprFor(row);
                    const mprUsageMatch = mprUsageForSearchText(row.mprSearchText);

                    // Collapsed view: an earlier row that's no longer being actively
                    // filled in — shows only MPR No + Delivery Date, plus Edit/Remove.
                    if (row.collapsed) {
                      return (
                        <div key={row.rowId} className="border border-slate-200 rounded-lg p-3.5">
                          {/* Row label + actions get their own line so the MPR No /
                              Delivery Date pair below has full width to breathe on
                              narrow phone screens, instead of everything being squeezed
                              into one horizontal row. */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs text-slate-400">
                              MPR Row {idx + 1}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => updateRow(row.rowId, { collapsed: false })}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-2 -m-1 rounded-lg"
                                aria-label="Edit MPR row"
                                title="Edit this row"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {mprRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeRow(row.rowId)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-2 -m-1 rounded-lg"
                                  aria-label="Remove MPR row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-slate-400">MPR No</div>
                              <div className="text-slate-800 text-sm font-medium truncate">{row.mprSearchText || '—'}</div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs text-slate-400">Delivery Date</div>
                              <div className="text-slate-800 text-sm font-medium truncate">{row.deliveryDate || '—'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={row.rowId} className="border border-slate-200 rounded-lg p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            MPR Row {idx + 1}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {row.mprId && row.itemNames.length > 0 && row.deliveryDate && (
                              <button
                                type="button"
                                onClick={() => updateRow(row.rowId, { collapsed: true })}
                                className="text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors p-2 -m-1 rounded-lg"
                                aria-label="Mark this MPR row done and minimize it"
                                title="Done — minimize this row"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {mprRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRow(row.rowId)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-2 -m-1 rounded-lg"
                                aria-label="Remove MPR row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* MPR No Typeahead (type to search, select from Admin list) */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            MPR No <span className="text-slate-400">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={row.mprSearchText}
                              onChange={(e) =>
                                updateRow(row.rowId, { mprSearchText: e.target.value, mprId: '', showDropdown: true, itemNames: [] })
                              }
                              onFocus={() => updateRow(row.rowId, { showDropdown: true })}
                              onBlur={() => setTimeout(() => updateRow(row.rowId, { showDropdown: false }), 150)}
                              placeholder="Type to search MPR No..."
                              autoComplete="off"
                              className="block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
                            />

                            {row.showDropdown && (
                              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-md max-h-48 overflow-y-auto">
                                {filteredMprNumbers.length > 0 ? (
                                  filteredMprNumbers.map((m) => (
                                    <button
                                      type="button"
                                      key={m.id}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => selectMprForRow(row.rowId, String(m.id), m.mpr_no)}
                                      className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                                        row.mprId === String(m.id) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      {m.mpr_no}
                                    </button>
                                  ))
                                ) : mprUsageMatch ? (
                                  <div className="px-3.5 py-2 text-xs text-rose-600">
                                    <span className="font-semibold">{mprUsageMatch.mpr_no}</span> is already entered — under Job{' '}
                                    <span className="font-semibold">{mprUsageMatch.job_no}</span> ({mprUsageMatch.job_name}).
                                  </div>
                                ) : (
                                  <div className="px-3.5 py-2 text-xs text-slate-400">No matching MPR No found</div>
                                )}
                              </div>
                            )}
                          </div>
                          {mprUsageMatch ? (
                            <p className="text-xs text-rose-600 mt-1.5">
                              Already entered under Job <span className="font-semibold">{mprUsageMatch.job_no}</span> ({mprUsageMatch.job_name}). Pick a different MPR No.
                            </p>
                          ) : (
                            !row.mprId && row.mprSearchText && (
                              <p className="text-xs text-amber-600 mt-1.5">Please select an MPR No from the list.</p>
                            )
                          )}
                        </div>

                        {/* Item Name — comes from the Budget Excel's "Description of
                            Materials" column for the selected MPR No. A single MRF No can
                            carry several unique Descriptions in the imported sheet: when it
                            does, EVERY one of them is auto-filled here and each becomes its
                            own entry on submit (instead of making the user pick just one). */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Item Name <span className="text-slate-400">*</span>
                          </label>
                          <p className="text-xs text-slate-400 mb-1.5">
                            {row.itemNames.length > 1
                              ? `${row.itemNames.length} items under this MPR — all will be entered`
                              : 'Auto-filled from Budget Excel'}
                          </p>
                          {row.itemNames.length > 1 ? (
                            <ul className="border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                              {row.itemNames.map((opt) => (
                                <li key={opt.budgetItemId} className="px-3.5 py-2 text-sm text-slate-700 bg-slate-50">
                                  <span className="truncate">{opt.name}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <input
                              type="text"
                              required
                              readOnly
                              value={row.itemNames[0]?.name || ''}
                              placeholder="Select an MPR No above to auto-fill this"
                              className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm cursor-not-allowed placeholder-slate-400"
                            />
                          )}
                          {row.mprId && row.itemNames.length === 0 && (
                            <p className="text-xs text-amber-600 mt-1.5">
                              No Description of Materials found in the imported Budget Excel for this MPR No.
                            </p>
                          )}
                        </div>

                        {/* Delivery Date (separate per MPR No) — a SELECT-only picker
                            (no typing) once the Admin has set a bounded window on this
                            Budget, so an out-of-range date can't be typed in at all;
                            falls back to the normal date picker when no window (or only
                            one side of it) is set. */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Delivery Date <span className="text-slate-400">*</span>
                          </label>
                          {selectedBudget?.delivery_date_from && selectedBudget?.delivery_date_to ? (
                            <select
                              required
                              value={row.deliveryDate}
                              onChange={(e) => updateRow(row.rowId, { deliveryDate: e.target.value })}
                              className="block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value="">Select a Delivery Date...</option>
                              {dateRangeOptions(selectedBudget.delivery_date_from, selectedBudget.delivery_date_to).map((d) => (
                                <option key={d} value={d}>{formatDateLabel(d)}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="date"
                              required
                              value={row.deliveryDate}
                              onChange={(e) => updateRow(row.rowId, { deliveryDate: e.target.value })}
                              min={selectedBudget?.delivery_date_from || undefined}
                              max={selectedBudget?.delivery_date_to || undefined}
                              className="block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          )}
                          {(selectedBudget?.delivery_date_from || selectedBudget?.delivery_date_to) && (
                            <p className="text-xs text-slate-400 mt-1.5">
                              Allowed range: {formatDate(selectedBudget?.delivery_date_from) || '—'} to {formatDate(selectedBudget?.delivery_date_to) || '—'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Same "Add MPR No" action repeated here at the bottom of the row list —
                    with several rows already added, this saves scrolling back up to the
                    header button just to add one more. */}
                <button
                  type="button"
                  onClick={addRow}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add MPR No
                </button>
              </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm disabled:opacity-50 mt-5"
              >
                {loading ? 'Saving Entry...' : 'Submit MPR Entry'}
              </button>
            </form>

            {/* Submit Budget — locks THIS user out of adding any more entries under
                this Budget once every Job they intend to enter has been saved above. */}
            <div className="mt-5 pt-5 border-t border-dashed border-slate-200">
              <p className="text-[11px] text-slate-500 mb-2">
                {hasOwnEntriesInSelectedBudget
                  ? "Finished entering every Job for this Budget? Submitting it will lock it — you won't be able to add more entries here afterward."
                  : 'Add at least one MPR entry to this Budget before you can submit it as finished.'}
              </p>
              <button
                type="button"
                onClick={handleSubmitBudget}
                disabled={submittingBudget || !hasOwnEntriesInSelectedBudget}
                title={!hasOwnEntriesInSelectedBudget ? 'Add at least one entry to this Budget first' : undefined}
                className="w-full py-2.5 px-4 bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {submittingBudget ? 'Submitting Budget...' : 'Submit This Budget (Finish)'}
              </button>
            </div>
            </>
            )}
          </div>
          )}
        </div>

        {/* Entries Table / List — grouped by Job, one line per Job (not per MPR) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Jobs summary card — every distinct Job this user has submitted, as a
              scrollable Job No + Job Name list (not just a bare count). */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-900">Jobs</div>
                  <div className="text-xs text-slate-400">Total Job entries submitted</div>
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-full">
                {totalJobsCount}
              </span>
            </div>
            {uniqueJobsList.length === 0 ? (
              <p className="text-sm text-slate-400 px-5 py-4">No Job entries submitted yet.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                {uniqueJobsList.map((j) => (
                  <div key={j.job_no} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="text-sm font-medium text-blue-600 flex-shrink-0">{j.job_no}</span>
                    <span className="text-sm text-slate-600 truncate text-right">{j.job_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Job Entry Details</h3>
                  <p className="text-xs text-slate-500">Every one of your own submitted MPR entries — search or filter any column below</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200 whitespace-nowrap">
                    {new Set(filteredEntries.map((e) => e.job_no)).size} Job{new Set(filteredEntries.map((e) => e.job_no)).size === 1 ? '' : 's'} • {filteredEntries.length} MPR Entr{filteredEntries.length === 1 ? 'y' : 'ies'}
                  </span>
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={filteredEntries.length === 0}
                    title="Download this table as a PDF"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Export PDF
                  </button>
                </div>
              </div>

              {/* Desktop: per-column filters live inline in the table header instead.
                  Mobile: a collapsible panel, since there's no room for 9 filter boxes
                  above a stacked card list. */}
              <div className="md:hidden mt-3">
                <button
                  type="button"
                  onClick={() => setShowMobileFilters((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600"
                >
                  <span className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" /> Filters
                    {hasActiveEntryColumnFilter && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}
                  </span>
                  <span>{showMobileFilters ? '▲' : '▼'}</span>
                </button>
                {showMobileFilters && (
                  <div className="mt-2 grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <input
                      type="text"
                      value={entryColumnFilters.job_no}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, job_no: e.target.value }))}
                      placeholder="Job No"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={entryColumnFilters.job_name}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, job_name: e.target.value }))}
                      placeholder="Job Name"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={entryColumnFilters.mpr_no}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, mpr_no: e.target.value }))}
                      placeholder="MPR No"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={entryColumnFilters.item_name}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, item_name: e.target.value }))}
                      placeholder="Item Name"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={entryColumnFilters.specification}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, specification: e.target.value }))}
                      placeholder="Specification"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={entryColumnFilters.req_qty}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, req_qty: e.target.value }))}
                      placeholder="Qty"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={entryColumnFilters.job_duration}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, job_duration: e.target.value }))}
                      placeholder="Job Duration"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <div className="col-span-2">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Delivery Date Range
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={entryColumnFilters.delivery_date_from}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, delivery_date_from: e.target.value }))}
                          className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                          title="Delivery Date from"
                        />
                        <input
                          type="date"
                          value={entryColumnFilters.delivery_date_to}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, delivery_date_to: e.target.value }))}
                          className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                          title="Delivery Date to"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={entryColumnFilters.budget_name}
                      onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, budget_name: e.target.value }))}
                      placeholder="Budget"
                      className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none col-span-2"
                    />
                    {hasActiveEntryColumnFilter && (
                      <button
                        type="button"
                        onClick={clearEntryColumnFilters}
                        className="col-span-2 text-[11px] font-semibold text-blue-600 hover:text-blue-800 text-center py-1"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {hasActiveEntryColumnFilter && (
                <div className="hidden md:flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={clearEntryColumnFilters}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>

            {filteredEntries.length === 0 && !hasActiveEntryColumnFilter ? (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">
                No entries found. Create your first MPR entry using the form.
              </div>
            ) : (
              <>
              {/* Mobile: stacked cards — no horizontal scrolling needed. */}
              <div className="md:hidden max-h-[36rem] overflow-y-auto p-4 space-y-3">
                {filteredEntries.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">No entries match your filters.</p>
                ) : (
                  filteredEntries.map((it, idx) => {
                    const isEditing = editingEntryId === it.id;
                    const canEdit = it.created_by === user.id && !it.budget_locked;
                    return (
                      <EntryCard
                        key={it.id}
                        it={it}
                        idx={idx}
                        isEditing={isEditing}
                        canEdit={canEdit}
                        deletingEntryId={deletingEntryId}
                        onStartEdit={stableStartEditEntry}
                        onCancelEdit={stableCancelEditEntry}
                        onSaveEdit={stableSaveEditEntry}
                        onDelete={stableHandleDeleteEntry}
                        onSelectEditMpr={stableSelectEditMpr}
                        editJobName={editJobName}
                        setEditJobName={setEditJobName}
                        editMprSearchText={editMprSearchText}
                        setEditMprSearchText={setEditMprSearchText}
                        editShowMprDropdown={editShowMprDropdown}
                        setEditShowMprDropdown={setEditShowMprDropdown}
                        editMprId={editMprId}
                        setEditMprId={setEditMprId}
                        editMprOptions={editMprOptions}
                        editItemName={editItemName}
                        editItemBudgetItemId={editItemBudgetItemId}
                        onEditItemChange={handleEditItemChange}
                        editItemOptions={editItemOptions}
                        editLoadingOptions={editLoadingOptions}
                        editJobDuration={editJobDuration}
                        setEditJobDuration={setEditJobDuration}
                        editDeliveryRange={editDeliveryRange}
                        editDeliveryDate={editDeliveryDate}
                        setEditDeliveryDate={setEditDeliveryDate}
                        editSaving={editSaving}
                      />
                    );
                  })
                )}
                {editError && <p className="text-[11px] text-rose-600">{editError}</p>}
                {deleteError && <p className="text-[11px] text-rose-600">{deleteError}</p>}
              </div>

              {/* Desktop / tablet: full table. */}
              <div className="hidden md:block overflow-auto max-h-[32rem]">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  {/*
                    Sticky header fix: previously `sticky top-0` was applied to the whole
                    <thead>, which held BOTH the label row and the filter-input row. Any
                    positioned descendant in the scrolling <tbody> (e.g. the MPR No edit
                    cell below, which is `relative` with a `z-20` dropdown) could then
                    paint above an unstacked <thead>, making it look like the MPR No
                    header/filter box gets overlapped by body rows while scrolling.
                    Fix: stick EACH header row individually with an explicit stacking
                    context (`z-30`, higher than the in-body dropdowns' `z-20`) and an
                    explicit background so nothing shows through while scrolling.
                  */}
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <tr className="sticky top-0 z-30 bg-slate-50">
                      <th className="px-3 py-2.5 text-left">SL</th>
                      <th className="px-3 py-2.5 text-left">Job No</th>
                      <th className="px-3 py-2.5 text-left">Job Name</th>
                      <th className="px-3 py-2.5 text-left">MPR No</th>
                      <th className="px-3 py-2.5 text-left">Item Name</th>
                      <th className="px-3 py-2.5 text-left">Specification</th>
                      <th className="px-3 py-2.5 text-left">Qty</th>
                      <th className="px-3 py-2.5 text-left">Job Duration</th>
                      <th className="px-3 py-2.5 text-left">Delivery Date</th>
                      <th className="px-3 py-2.5 text-left">Budget</th>
                      <th className="px-3 py-2.5 text-left">Action</th>
                    </tr>
                    {/*
                      top-[2.375rem] ≈ the rendered height of the label row above
                      (px-3 py-2.5 + text-xs line height). If your header still looks
                      off by a couple of px after this fix, measure the label row's
                      actual height in devtools and adjust this value to match exactly.
                    */}
                    <tr className="sticky top-[2.375rem] z-30 bg-white normal-case">
                      <th className="px-3 pb-2.5"></th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.job_no}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, job_no: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.job_name}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, job_name: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.mpr_no}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, mpr_no: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.item_name}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, item_name: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.specification}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, specification: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.req_qty}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, req_qty: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.job_duration}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, job_duration: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={entryColumnFilters.delivery_date_from}
                            onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, delivery_date_from: e.target.value }))}
                            title="Delivery Date from"
                            className="w-full px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none"
                          />
                          <input
                            type="date"
                            value={entryColumnFilters.delivery_date_to}
                            onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, delivery_date_to: e.target.value }))}
                            title="Delivery Date to"
                            className="w-full px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none"
                          />
                        </div>
                      </th>
                      <th className="px-3 pb-2.5">
                        <input
                          type="text"
                          value={entryColumnFilters.budget_name}
                          onChange={(e) => setEntryColumnFilters((prev) => ({ ...prev, budget_name: e.target.value }))}
                          placeholder="Filter..."
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-normal focus:ring-2 focus:ring-blue-600 focus:outline-none placeholder-slate-400"
                        />
                      </th>
                      <th className="px-3 pb-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-3 py-6 text-center text-slate-400">No entries match your filters.</td>
                      </tr>
                    ) : (
                    filteredEntries.map((it, idx) => {
                      const isEditing = editingEntryId === it.id;
                      const canEdit = it.created_by === user.id && !it.budget_locked;
                      return (
                        <EntryRow
                          key={it.id}
                          it={it}
                          idx={idx}
                          isEditing={isEditing}
                          canEdit={canEdit}
                          deletingEntryId={deletingEntryId}
                          onStartEdit={stableStartEditEntry}
                          onCancelEdit={stableCancelEditEntry}
                          onSaveEdit={stableSaveEditEntry}
                          onDelete={stableHandleDeleteEntry}
                          onSelectEditMpr={stableSelectEditMpr}
                          editJobName={editJobName}
                          setEditJobName={setEditJobName}
                          editMprSearchText={editMprSearchText}
                          setEditMprSearchText={setEditMprSearchText}
                          editShowMprDropdown={editShowMprDropdown}
                          setEditShowMprDropdown={setEditShowMprDropdown}
                          editMprId={editMprId}
                          setEditMprId={setEditMprId}
                          editMprOptions={editMprOptions}
                          editItemName={editItemName}
                          editItemBudgetItemId={editItemBudgetItemId}
                          onEditItemChange={handleEditItemChange}
                          editItemOptions={editItemOptions}
                          editLoadingOptions={editLoadingOptions}
                          editJobDuration={editJobDuration}
                          setEditJobDuration={setEditJobDuration}
                          editDeliveryRange={editDeliveryRange}
                          editDeliveryDate={editDeliveryDate}
                          setEditDeliveryDate={setEditDeliveryDate}
                          editSaving={editSaving}
                        />
                      );
                    })
                    )}
                  </tbody>
                </table>
                {editError && (
                  <p className="px-3 py-3 text-[11px] text-rose-600">{editError}</p>
                )}
                {deleteError && (
                  <p className="px-3 py-3 text-[11px] text-rose-600">{deleteError}</p>
                )}
              </div>
              </>
            )}
            <div className="px-6 py-3 border-t border-slate-200">
              <p className="text-[10px] text-slate-400">
                You can edit or delete your own entries until you submit that entry's Budget as finished. All edits are recorded server-side; a deleted entry moves into the Admin's Job Recycle bin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};