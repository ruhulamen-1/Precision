import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Save } from "lucide-react";
import { User as UserType } from "../types";

export interface DataTypeOption {
  id: number;
  name: string;
}

export interface NewRecordData {
  upload_date: string;
  upload_time: string;
  data_type: string;
  file_name: string;
  submitted_by: string;
  files_count: number;
  errors_count: number;
  remarks_on_errors: string;
  check_status: "Pending";
  status: "Old Upload" | "New Upload";
}

export interface NewEntryFormProps {
  currentUser: UserType | null | undefined;
  dataTypeOptions: DataTypeOption[];
  onSave: (record: NewRecordData) => Promise<void>;
  onCancel: () => void;
  onManageTypes: () => void;
}

export const NewEntryForm: React.FC<NewEntryFormProps> = ({
  currentUser,
  dataTypeOptions,
  onSave,
  onCancel,
  onManageTypes,
}) => {
  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  const getLocalTimeString = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const [newRecord, setNewRecord] = useState<NewRecordData>({
    upload_date: getLocalDateString(),
    upload_time: getLocalTimeString(),
    data_type: "",
    file_name: "",
    submitted_by: currentUser?.name || "",
    files_count: 0,
    errors_count: 0,
    remarks_on_errors: "",
    check_status: "Pending",
    status: "New Upload",
  });

  useEffect(() => {
    if (currentUser?.name && !newRecord.submitted_by) {
      setNewRecord((prev) => ({ ...prev, submitted_by: currentUser.name }));
    }
  }, [currentUser, newRecord.submitted_by]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-8 border border-white dark:border-white/8 shadow-sm dark:shadow-slate-900/50 space-y-8"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1 flex justify-between items-center">
              Data Types
              <button
                onClick={onManageTypes}
                className="text-indigo-600 hover:text-indigo-800 transition-colors"
                title="Manage Data Types"
              >
                <Settings className="h-3 w-3" />
              </button>
            </label>
            <select
              value={newRecord.data_type}
              onChange={(e) =>
                setNewRecord({ ...newRecord, data_type: e.target.value })
              }
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-500 outline-none"
            >
              <option value="">Select Data Type</option>
              {dataTypeOptions.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">
              File Name
            </label>
            <input
              type="text"
              placeholder="Monthly_Report_April.xlsx"
              value={newRecord.file_name}
              onChange={(e) =>
                setNewRecord({ ...newRecord, file_name: e.target.value })
              }
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">
              Upload Status
            </label>
            <select
              value={newRecord.status}
              onChange={(e) => {
                const newStatus = e.target.value as "Old Upload" | "New Upload";
                setNewRecord({
                  ...newRecord,
                  status: newStatus,
                  upload_date:
                    newStatus === "New Upload"
                      ? getLocalDateString()
                      : newRecord.upload_date,
                  upload_time:
                    newStatus === "New Upload"
                      ? getLocalTimeString()
                      : newRecord.upload_time,
                });
              }}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-500 outline-none"
            >
              <option value="New Upload">New Upload</option>
              <option value="Old Upload">Old Upload</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">
              Submitted By
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRecord.submitted_by}
                readOnly
                disabled
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={newRecord.upload_date}
                  onChange={(e) =>
                    setNewRecord({ ...newRecord, upload_date: e.target.value })
                  }
                  readOnly={newRecord.status === "New Upload"}
                  className={`px-2 py-1 border rounded-lg text-[10px] font-black uppercase tracking-tighter text-center leading-tight outline-none ${newRecord.status === "New Upload" ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed" : "bg-white dark:bg-slate-900 border-indigo-200 text-indigo-600"}`}
                />
                <input
                  type="time"
                  value={newRecord.upload_time}
                  onChange={(e) =>
                    setNewRecord({ ...newRecord, upload_time: e.target.value })
                  }
                  readOnly={newRecord.status === "New Upload"}
                  className={`px-2 py-1 border rounded-lg text-[10px] font-black uppercase tracking-tighter text-center leading-tight outline-none ${newRecord.status === "New Upload" ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed" : "bg-white dark:bg-slate-900 border-indigo-200 text-indigo-600"}`}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">
              Submitted Files Count
            </label>
            <input
              type="number"
              value={newRecord.files_count}
              onChange={(e) =>
                setNewRecord({
                  ...newRecord,
                  files_count: parseInt(e.target.value) || 0,
                })
              }
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors"
          >
            Discard Changes
          </button>
          <button
            onClick={() => onSave(newRecord)}
            className="bg-indigo-600 shadow-xl shadow-indigo-600/20 text-white px-10 py-3 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3 active:scale-95 transition-all"
          >
            <Save className="h-4 w-4" />
            Initialize Audit
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
