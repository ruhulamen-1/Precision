import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { MessageSquare, Plus, RefreshCw, Upload, BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import RemarksTable from './RemarksTable';
import RemarksModal from './RemarksModal';

// ── StatCard ───────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon }) => (
  <div className={`flex items-center gap-3 bg-white dark:bg-slate-800 border rounded-2xl p-4 ${color}`}>
    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.replace('border-', 'bg-').replace('-200', '-50').replace('-800/30', '-50')}`}>
      {icon}
    </div>
    <div>
      <p className="text-xl font-black text-slate-800 dark:text-white">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const RemarksManagement = ({ currentUser }) => {
  const [remarks, setRemarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [remarkToEdit, setRemarkToEdit] = useState(null);
  const importRef = useRef(null);

  const isAdmin = ["Admin", "Super Admin", "admin", "super_admin"].includes(currentUser.role ?? "");
  const canEdit = isAdmin || currentUser.permissions?.employeeCasualActivities?.edit;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRemarks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/remarks');
      if (res.ok) {
        const data = await res.json();
        setRemarks(data);
      }
    } catch (err) {
      showToast('Failed to load remarks', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRemarks(); }, [fetchRemarks]);

  // ── Save (Add / Edit) ──────────────────────────────────────────────────────
  const handleSave = async (remark) => {
    setIsSaving(true);
    try {
      if (remark.id) {
        const res = await fetch(`/api/remarks/${remark.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(remark),
        });
        if (res.ok) {
          setRemarks(prev => prev.map(r => r.id === remark.id ? { ...r, ...remark } : r));
          showToast('Remark updated successfully');
        } else {
          showToast('Failed to update remark', 'error');
        }
      } else {
        const res = await fetch('/api/remarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(remark),
        });
        if (res.ok) {
          const saved = await res.json();
          setRemarks(prev => [...prev, saved]);
          showToast('Remark added successfully');
        } else {
          showToast('Failed to add remark', 'error');
        }
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      setIsSaving(false);
      setModalOpen(false);
      setRemarkToEdit(null);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (idOrIndex) => {
    if (!window.confirm('Delete this remark?')) return;
    const remark = typeof idOrIndex === 'string'
      ? remarks.find(r => r.id === idOrIndex)
      : remarks[idOrIndex];
    if (!remark?.id) {
      setRemarks(prev => prev.filter((_, i) => i !== idOrIndex));
      return;
    }
    try {
      const res = await fetch(`/api/remarks/${remark.id}`, { method: 'DELETE' });
      if (res.ok) {
        setRemarks(prev => prev.filter(r => r.id !== remark.id));
        showToast('Remark deleted');
      } else {
        showToast('Failed to delete', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  // ── Edit handler ───────────────────────────────────────────────────────────
  const handleEdit = (remark) => {
    setRemarkToEdit(remark);
    setModalOpen(true);
  };

  // ── Import from Excel ──────────────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const validTypes = ['positive', 'negative', 'neutral'];
      const imported = rows
        .filter(r => r['English Text'])
        .map(r => ({
          text_en: String(r['English Text'] || ''),
          text_bn: String(r['Bengali Text'] || ''),
          type: validTypes.includes(String(r['Category']).toLowerCase())
            ? String(r['Category']).toLowerCase()
            : 'neutral',
        }));

      if (!imported.length) { showToast('No valid rows found in file', 'error'); return; }

      const res = await fetch('/api/remarks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imported),
      });
      if (res.ok) {
        showToast(`${imported.length} remarks imported successfully`);
        fetchRemarks();
      } else {
        showToast('Import failed', 'error');
      }
    } catch (err) {
      showToast('Failed to read file', 'error');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total: remarks.length,
    positive: remarks.filter(r => r.type === 'positive').length,
    negative: remarks.filter(r => r.type === 'negative').length,
    neutral: remarks.filter(r => r.type === 'neutral').length,
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-500" />
              Remarks Library
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage predefined remarks used in casual activity entries</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={fetchRemarks}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canEdit && (
              <>
                <input
                  ref={importRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  type="button"
                  onClick={() => importRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import Excel
                </button>
                <button
                  type="button"
                  onClick={() => { setRemarkToEdit(null); setModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-500/25 transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  Add Remark
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Total Remarks"
            value={stats.total}
            color="border-slate-200"
            icon={<BookOpen className="h-5 w-5 text-slate-500" />}
          />
          <StatCard
            label="Positive"
            value={stats.positive}
            color="border-emerald-200"
            icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          />
          <StatCard
            label="Negative"
            value={stats.negative}
            color="border-rose-200"
            icon={<TrendingDown className="h-5 w-5 text-rose-500" />}
          />
          <StatCard
            label="Neutral"
            value={stats.neutral}
            color="border-sky-200"
            icon={<Minus className="h-5 w-5 text-sky-500" />}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading remarks...</span>
          </div>
        ) : (
          <RemarksTable
            remarks={remarks}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onImport={() => importRef.current?.click()}
          />
        )}

        {/* Footer */}
        <div className="flex flex-col items-center py-8 border-t border-slate-100 mt-6">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Precision — Remarks Library</p>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <RemarksModal
          remarkToEdit={remarkToEdit}
          onClose={() => { setModalOpen(false); setRemarkToEdit(null); }}
          onSave={handleSave}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold transition-all ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default RemarksManagement;