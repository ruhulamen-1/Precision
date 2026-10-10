import React, { useState } from "react";
import { Settings, X, Plus, Check, Trash2 } from "lucide-react";

export interface DataTypeOption {
  id: number;
  name: string;
}

interface ManageTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataTypeOptions: DataTypeOption[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (type: DataTypeOption) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export const ManageTypesModal: React.FC<ManageTypesModalProps> = ({
  isOpen,
  onClose,
  dataTypeOptions,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const [newTypeName, setNewTypeName] = useState("");
  const [editingType, setEditingType] = useState<DataTypeOption | null>(null);

  const handleAdd = async () => {
    if (!newTypeName.trim()) return;
    await onAdd(newTypeName);
    setNewTypeName("");
  };

  const handleUpdate = async () => {
    if (!editingType || !editingType.name.trim()) return;
    await onUpdate(editingType);
    setEditingType(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            Manage Data Types
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:bg-slate-800 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Add New Type */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New data type name..."
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleAdd}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {/* List of Types */}
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
            {dataTypeOptions.map((type) => (
              <div
                key={type.id}
                className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 group"
              >
                {editingType?.id === type.id ? (
                  <>
                    <input
                      type="text"
                      value={editingType.name}
                      onChange={(e) =>
                        setEditingType({ ...editingType, name: e.target.value })
                      }
                      className="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-900 border rounded outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleUpdate}
                      className="text-emerald-600 hover:text-emerald-700"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingType(null)}
                      className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {type.name}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingType(type)}
                        className="p-1.5 text-indigo-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(type.id)}
                        className="p-1.5 text-rose-500 hover:bg-white dark:bg-slate-900 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
