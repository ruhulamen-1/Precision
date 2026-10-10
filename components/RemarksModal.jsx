import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

const RemarksModal = ({ remarkToEdit, onClose, onSave }) => {
  const [textEn, setTextEn] = useState('');
  const [textBn, setTextBn] = useState('');
  const [category, setCategory] = useState('neutral');

  useEffect(() => {
    if (remarkToEdit) {
      setTextEn(remarkToEdit.text_en || '');
      setTextBn(remarkToEdit.text_bn || '');
      setCategory(remarkToEdit.type || 'neutral');
    } else {
      setTextEn('');
      setTextBn('');
      setCategory('neutral');
    }
  }, [remarkToEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!textEn.trim()) return;
    onSave({
      ...(remarkToEdit || {}),
      text_en: textEn.trim(),
      text_bn: textBn.trim(),
      type: category,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <h2 className="text-base font-bold text-slate-800">
            {remarkToEdit ? 'Edit Remark' : 'Add New Remark'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              English Remark <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full text-sm p-3 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all resize-none h-20"
              placeholder="e.g. Completed today's work early"
              required
              value={textEn}
              onChange={(e) => setTextEn(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Bengali Translation
            </label>
            <textarea
              className="w-full text-sm p-3 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all resize-none h-20"
              placeholder="e.g. আজকের কাজ দ্রুত সম্পন্ন করেছে"
              value={textBn}
              onChange={(e) => setTextBn(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['positive', 'neutral', 'negative'].map((cat) => {
                const colorMap = {
                  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700 active:ring-emerald-300',
                  neutral: 'border-indigo-200 bg-indigo-50 text-indigo-700 active:ring-indigo-300',
                  negative: 'border-rose-200 bg-rose-50 text-rose-700 active:ring-rose-300',
                };
                const activeMap = {
                  positive: 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200',
                  neutral: 'bg-indigo-500 text-white border-indigo-500 shadow-sm shadow-indigo-200',
                  negative: 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-200',
                };
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-2 text-xs font-extrabold capitalize border rounded-xl transition-all ${
                      category === cat ? activeMap[cat] : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-md shadow-amber-100 hover:shadow-lg hover:shadow-amber-200 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              Save Remark
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RemarksModal;
