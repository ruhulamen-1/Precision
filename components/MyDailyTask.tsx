import React, { useState, useEffect, useCallback } from "react";
import { User, DailyTask, TaskPriority, TaskStatus } from "../types";
import {
  Plus, Pencil, Trash2, CheckCircle2, Circle, Clock,
  ChevronDown, X, Search, Filter, ListTodo, User as UserIcon,
  AlertCircle, CalendarDays, Tag, Bell,
} from "lucide-react";

interface MyDailyTaskProps {
  currentUser: User;
  allUsers: User[];
}

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const STATUSES: TaskStatus[] = ["Pending", "In Progress", "Done"];

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  Low: "bg-green-100 text-green-700 border-green-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  High: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  Pending: "bg-slate-100 text-slate-600 border-slate-200",
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  Done: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  Pending: <Circle className="h-4 w-4" />,
  "In Progress": <Clock className="h-4 w-4" />,
  Done: <CheckCircle2 className="h-4 w-4" />,
};

const emptyForm = {
  title: "",
  description: "",
  priority: "Medium" as TaskPriority,
  status: "Pending" as TaskStatus,
  category: "",
  due_date: "",
  reminder_at: "",
  assigned_to_id: undefined as number | undefined,
  assigned_to_name: "",
};

// Local "YYYY-MM-DDTHH:mm" for a given day offset from today, at a default time.
const localDateTimeAt = (daysFromNow: number, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const MyDailyTask: React.FC<MyDailyTaskProps> = ({ currentUser, allUsers }) => {
  const isAdmin = currentUser.role === "super_admin" || currentUser.role === "admin";

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "All">("All");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "All">("All");
  const [filterAssignee, setFilterAssignee] = useState<string>("All");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/daily-tasks?user_id=${currentUser.id}&role=${currentUser.role}`
      );
      if (res.ok) setTasks(await res.json());
    } catch {
      showToast("Failed to load tasks", "error");
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, currentUser.role]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const openCreate = () => {
    setEditingTask(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (task: DailyTask) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      category: task.category || "",
      due_date: task.due_date || "",
      reminder_at: task.reminder_at ? task.reminder_at.slice(0, 16) : "",
      assigned_to_id: task.assigned_to_id,
      assigned_to_name: task.assigned_to_name || "",
    });
    setShowModal(true);
  };

  // Quick-pick: "Today / Tomorrow / +3 days / +7 days" — sets both the due
  // date and a default 10:00 AM reminder in one tap.
  const applyQuickSchedule = (daysFromNow: number) => {
    const dt = localDateTimeAt(daysFromNow);
    setForm((f) => ({ ...f, due_date: dt.slice(0, 10), reminder_at: dt }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast("Title দাও", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        created_by_id: currentUser.id,
        created_by_name: currentUser.name,
        due_date: form.due_date || null,
        reminder_at: form.reminder_at ? form.reminder_at.replace("T", " ") + ":00" : null,
        assigned_to_id: form.assigned_to_id || null,
        assigned_to_name: form.assigned_to_name || null,
        category: form.category || null,
      };

      if (editingTask) {
        const res = await fetch(`/api/daily-tasks/${editingTask.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        showToast("Task update হয়েছে");
      } else {
        const res = await fetch("/api/daily-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        showToast("Task তৈরি হয়েছে");
      }
      setShowModal(false);
      fetchTasks();
    } catch {
      showToast("Save হয়নি", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("এই task delete করবে?")) return;
    try {
      await fetch(`/api/daily-tasks/${id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      showToast("Task delete হয়েছে");
    } catch {
      showToast("Delete হয়নি", "error");
    }
  };

  const quickStatus = async (task: DailyTask, status: TaskStatus) => {
    try {
      await fetch(`/api/daily-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, status }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    } catch {
      showToast("Update হয়নি", "error");
    }
  };

  const handleAssigneeChange = (userId: string) => {
    if (!userId) {
      setForm((f) => ({ ...f, assigned_to_id: undefined, assigned_to_name: "" }));
      return;
    }
    const user = allUsers.find((u) => u.id === parseInt(userId));
    setForm((f) => ({
      ...f,
      assigned_to_id: user?.id,
      assigned_to_name: user?.name || "",
    }));
  };

  // Unique assignees for filter
  const assigneeOptions = isAdmin
    ? [...new Map(tasks.filter((t) => t.assigned_to_name).map((t) => [t.assigned_to_name, t.assigned_to_name])).values()]
    : [];

  const filtered = tasks.filter((t) => {
    if (filterStatus !== "All" && t.status !== filterStatus) return false;
    if (filterPriority !== "All" && t.priority !== filterPriority) return false;
    if (filterAssignee !== "All" && t.assigned_to_name !== filterAssignee) return false;
    if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase()) &&
      !(t.description || "").toLowerCase().includes(searchText.toLowerCase()) &&
      !(t.category || "").toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const counts = {
    Pending: tasks.filter((t) => t.status === "Pending").length,
    "In Progress": tasks.filter((t) => t.status === "In Progress").length,
    Done: tasks.filter((t) => t.status === "Done").length,
  };

  const isOverdue = (due: string | undefined) => {
    if (!due) return false;
    return new Date(due) < new Date(new Date().toDateString());
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${toast.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <ListTodo className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">My Daily Task</h1>
            <p className="text-xs text-slate-500">
              {isAdmin ? "সবার tasks দেখা ও manage করা যাবে" : "নিজের tasks manage করো"}
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {(["Pending", "In Progress", "Done"] as TaskStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "All" : s)}
            className={`rounded-xl border p-3 text-left transition-all ${filterStatus === s ? STATUS_STYLE[s] + " border-current shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={filterStatus === s ? "" : "text-slate-400"}>{STATUS_ICON[s]}</span>
              <span className="text-xs font-medium text-slate-500">{s}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{counts[s]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as any)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-600"
        >
          <option value="All">All Priority</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-600"
        >
          <option value="All">All Status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {isAdmin && assigneeOptions.length > 0 && (
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-600"
          >
            <option value="All">All Assignees</option>
            {assigneeOptions.map((a) => <option key={a}>{a}</option>)}
          </select>
        )}
        {(searchText || filterStatus !== "All" || filterPriority !== "All" || filterAssignee !== "All") && (
          <button
            onClick={() => { setSearchText(""); setFilterStatus("All"); setFilterPriority("All"); setFilterAssignee("All"); }}
            className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <ListTodo className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">কোনো task নেই</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((task) => (
            <div
              key={task.id}
              className={`bg-white border rounded-xl p-4 flex gap-3 items-start transition-all hover:shadow-sm ${task.status === "Done" ? "opacity-60" : ""} ${isOverdue(task.due_date) && task.status !== "Done" ? "border-red-200" : "border-slate-200"}`}
            >
              {/* Quick status toggle */}
              <button
                onClick={() => {
                  const next: TaskStatus = task.status === "Pending" ? "In Progress" : task.status === "In Progress" ? "Done" : "Pending";
                  quickStatus(task, next);
                }}
                className={`mt-0.5 flex-shrink-0 rounded-full p-1 transition-colors ${STATUS_STYLE[task.status]}`}
                title="Status change করো"
              >
                {STATUS_ICON[task.status]}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start gap-2 mb-1">
                  <p className={`text-sm font-semibold text-slate-800 flex-1 ${task.status === "Done" ? "line-through text-slate-400" : ""}`}>
                    {task.title}
                  </p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[task.status]}`}>
                    {task.status}
                  </span>
                </div>

                {task.description && (
                  <p className="text-xs text-slate-500 mb-2 leading-relaxed">{task.description}</p>
                )}

                <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
                  {task.category && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" /> {task.category}
                    </span>
                  )}
                  {task.due_date && (
                    <span className={`flex items-center gap-1 ${isOverdue(task.due_date) && task.status !== "Done" ? "text-red-500 font-medium" : ""}`}>
                      <CalendarDays className="h-3 w-3" />
                      {new Date(task.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      {isOverdue(task.due_date) && task.status !== "Done" && " (Overdue)"}
                    </span>
                  )}
                  {task.reminder_at && (
                    <span className="flex items-center gap-1 text-indigo-500">
                      <Bell className="h-3 w-3" />
                      {new Date(task.reminder_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {task.assigned_to_name && (
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> {task.assigned_to_name}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="flex items-center gap-1 text-slate-300">
                      by {task.created_by_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(task)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {(isAdmin || task.created_by_id === currentUser.id) && (
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editingTask ? "Task Edit করো" : "New Task"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Task এর নাম লেখো"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="বিস্তারিত লেখো (optional)"
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Category + Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="যেমন: Follow-up, Review"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Reminder / Popup notification */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-indigo-500" />
                  Reminder (নির্দিষ্ট সময়ে Popup আসবে)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => applyQuickSchedule(0)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    আজ
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickSchedule(1)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    কাল
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickSchedule(3)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    ৩ দিন পর
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickSchedule(7)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    ৭ দিন পর
                  </button>
                  {form.reminder_at && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, reminder_at: "" }))}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 text-red-500 hover:border-red-300 transition-colors ml-auto"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={form.reminder_at}
                  onChange={(e) => setForm((f) => ({ ...f, reminder_at: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  এই সময় হলে app-এ popup notification আসবে। খালি রাখলে reminder আসবে না।
                </p>
              </div>

              {/* Assign To (admin only) */}
              {isAdmin && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Assign To</label>
                  <select
                    value={form.assigned_to_id ?? ""}
                    onChange={(e) => handleAssigneeChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">— নিজে করবে —</option>
                    {allUsers.filter((u) => u.id !== currentUser.id).map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.department || u.designation || "—"})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : editingTask ? "Update করো" : "Save করো"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyDailyTask;