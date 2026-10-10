import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Player } from "@lottiefiles/react-lottie-player";
import { User, Permissions, Role } from "../types";
import Avatar from "./Avatar";
import FormField from "./FormField";
import {
  Search,
  UserPlus,
  Shield,
  Trash2,
  Key,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  X,
  Lock,
  Send,
  Bell,
  Check,
} from "lucide-react";
import { canEditUser, canDeleteUser } from "../utils/permissionUtils";
import {
  loadAvailableAnimations,
  loadAnimationData,
  getDefaultAnimationOption,
  DEFAULT_NOTIFICATION_ANIMATION_KEY,
  NotificationAnimationOption,
} from "./notificationAnimations";

interface AdminPanelProps {
  allUsers: User[];
  onPermissionsChange: (userId: number, newPermissions: Permissions) => void;
  currentUser: User;
  onInviteUser: (name: string, email: string, role: Role) => void;
  onDeleteUser: (userId: number) => Promise<void>;
  onPasswordChange: (userId: number, newPassword: string) => Promise<void>;
  onUpdateUser: (userId: number, updatedData: Partial<User>) => Promise<void>;
  originalAdminUser: User | null;
  onSwitchAccount: (targetUserId: number) => void;
  onSwitchBack: () => void;
}

const ModalWrapper: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

const CreateUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onInvite: (name: string, email: string, role: Role) => void;
  currentUser: User;
}> = ({ isOpen, onClose, onInvite, currentUser }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInvite(name, email, role);
    onClose();
    setName("");
    setEmail("");
    setRole("user");
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5"
      >
        <div className="bg-white/80 dark:bg-white/8 backdrop-blur-md p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-orange-500" />
            Create New User
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Fill in the details to add a new system user.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <FormField
            id="invite-name"
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ruhul Amen"
            required
          />
          <FormField
            id="invite-email"
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ruhul@example.com"
            required
          />
          <div>
            <label
              htmlFor="invite-role"
              className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1 ml-1"
            >
              Access Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:border-orange-500 outline-none transition-all"
            >
              <option value="user">Standard User</option>
              <option value="admin">Administrator</option>
              {currentUser.role === "super_admin" && (
                <option value="super_admin">Super Admin</option>
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 bg-white/40 dark:bg-white/5 backdrop-blur-md border-t border-white dark:border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg dark:shadow-slate-900/50 shadow-orange-600/20 active:scale-95 transition-all"
          >
            Create User
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};

const EditUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUpdate: (userId: number, updatedData: Partial<User>) => Promise<void>;
  currentUser: User;
}> = ({ isOpen, onClose, user, onUpdate, currentUser }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setDesignation(user.designation || "");
      setDepartment(user.department || "");
      setRole(user.role);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const updatedData: Partial<User> = {
        name,
        email,
        designation,
        department,
        role: currentUser.role === "super_admin" ? role : user.role,
      };
      await onUpdate(user.id, updatedData);
      onClose();
    } catch (error) {
      console.error("Update failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5"
      >
        <div className="bg-white/80 dark:bg-white/8 backdrop-blur-md p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-orange-500" />
              Edit User
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Update profile information for {user?.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-100 dark:bg-slate-800 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <FormField
            id="edit-name"
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name"
            required
          />
          <FormField
            id="edit-email"
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <FormField
            id="edit-designation"
            label="Designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Designation"
          />
          <FormField
            id="edit-department"
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department"
          />

          <div>
            <label
              htmlFor="edit-role"
              className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1 ml-1"
            >
              Access Role
            </label>
            <select
              id="edit-role"
              value={role}
              disabled={currentUser.role !== "super_admin"}
              onChange={(e) => setRole(e.target.value as Role)}
              className={`w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none transition-all ${currentUser.role === "super_admin" ? "focus:border-orange-500" : "cursor-not-allowed opacity-60"}`}
            >
              <option value="user">Standard User</option>
              <option value="admin">Administrator</option>
              <option value="super_admin">Super Admin</option>
            </select>
            {currentUser.role !== "super_admin" && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 ml-1 flex items-center gap-1">
                <Lock className="h-2 w-2" /> Role can only be changed by Super
                Admin
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 bg-white/40 dark:bg-white/5 backdrop-blur-md border-t border-white dark:border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg dark:shadow-slate-900/50 shadow-orange-600/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};

const ChangePasswordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSave: (userId: number, newPassword: string) => Promise<void>;
}> = ({ isOpen, onClose, user, onSave }) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      await onSave(user.id, password);
      onClose();
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setError("Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5"
      >
        <div className="bg-white/80 dark:bg-white/8 backdrop-blur-md p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <Key className="h-5 w-5 text-orange-500" />
              Change Password
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Set a new password for {user?.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-100 dark:bg-slate-800 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100">
              {error}
            </div>
          )}
          <FormField
            id="new-password"
            label="New Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            required
          />
          <FormField
            id="confirm-password"
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-3 p-6 bg-white/40 dark:bg-white/5 backdrop-blur-md border-t border-white dark:border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg dark:shadow-slate-900/50 shadow-orange-600/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};

// Modules/tasks a custom notification can link to. The value matches the app's `View` type
// so clicking the notification takes the recipient straight to the relevant page.
const NOTIFICATION_MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "General (no link)" },
  { value: "dashboard", label: "Dashboard" },
  { value: "myDailyTask", label: "My Daily Task" },
  { value: "employeeProjectVisit", label: "Employee Project Visit" },
  { value: "salesPersonProjectVisit", label: "Sales Person Project Visit" },
  { value: "itResponseTimeline", label: "IT Response Timeline" },
  { value: "erpCorrectionReport", label: "ERP Correction Report" },
  { value: "constructionDutyAnalysis", label: "Construction Duty Analysis" },
  { value: "monthlyComparisonPrecision", label: "Monthly Comparison Precision" },
  { value: "ssvDutyAnalysis", label: "SSV Duty Analysis" },
  { value: "reportMailer", label: "Report Mailer" },
  { value: "archiveDataVerification", label: "Archive Data Verification" },
  { value: "cctvFootageCheckReports", label: "CCTV Footage Check Reports" },
  { value: "fixedAssetGPVerification", label: "Fixed Asset GP Verification" },
  { value: "rubbishVerification", label: "Rubbish Verification" },
  { value: "employeeCasualActivities", label: "Employee Casual Activities" },
  { value: "remarksManagement", label: "Remarks Management" },
  { value: "materialReceiveList", label: "Material Receive List" },
  { value: "projectCasesList", label: "Project Cases List" },
  { value: "profile", label: "Profile" },
];

// A single row in the notification animation picker. Shows the animation
// label, plays the Lottie preview only on hover/focus (and while selected)
// to keep the list lightweight, and lazy-loads the JSON the first time it's
// needed.
const AnimationPickerRow: React.FC<{
  option: NotificationAnimationOption;
  selected: boolean;
  onSelect: () => void;
}> = ({ option, selected, onSelect }) => {
  const [animationData, setAnimationData] = useState<any>(null);
  const [hovered, setHovered] = useState(false);
  const loadedRef = useRef(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAnimation = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadAnimationData(option.key)
      .then((data) => setAnimationData(data))
      .catch(() => {
        loadedRef.current = false;
      });
  }, [option.key]);

  // Debounce the fetch so quickly skimming across rows doesn't fire a
  // network request for every row the cursor passes over.
  const scheduleLoad = useCallback(() => {
    if (loadedRef.current) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(fetchAnimation, 200);
  }, [fetchAnimation]);

  const cancelScheduledLoad = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // If this row is the currently-selected animation, load it immediately
  // (no debounce) so the picker shows what's actually selected.
  useEffect(() => {
    if (selected) fetchAnimation();
  }, [selected, fetchAnimation]);

  const playing = hovered || selected;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => {
        setHovered(true);
        scheduleLoad();
      }}
      onFocus={() => {
        setHovered(true);
        fetchAnimation();
      }}
      onMouseLeave={() => {
        setHovered(false);
        cancelScheduledLoad();
      }}
      onBlur={() => setHovered(false)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
        selected
          ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10 ring-1 ring-orange-500/50"
          : "border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:bg-orange-50/50 dark:hover:bg-orange-500/5"
      }`}
    >
      <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
        {animationData ? (
          <Player
            src={animationData}
            autoplay={playing}
            loop
            style={{ width: 40, height: 40 }}
            background="transparent"
          />
        ) : (
          <Bell className="h-4 w-4 text-slate-400" />
        )}
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        {option.label}
      </span>
      {selected && <Check className="h-4 w-4 text-orange-600 shrink-0" />}
    </button>
  );
};

const SendNotificationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  recipients: User[];
  currentUser: User;
  onSend: (payload: {
    recipientIds: number[];
    title: string;
    message: string;
    linkView: string | null;
    animation: string;
  }) => Promise<void>;
}> = ({ isOpen, onClose, recipients, currentUser, onSend }) => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [linkView, setLinkView] = useState("");
  const [animation, setAnimation] = useState(DEFAULT_NOTIFICATION_ANIMATION_KEY);
  const [animationOptions, setAnimationOptions] = useState<NotificationAnimationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setMessage("");
      setLinkView("");
      setAnimation(DEFAULT_NOTIFICATION_ANIMATION_KEY);
      setError("");
      loadAvailableAnimations().then((options) => {
        setAnimationOptions(options);
        const fallback = getDefaultAnimationOption(options);
        if (fallback) setAnimation(fallback.key);
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (recipients.length === 0) {
      setError("No recipients selected.");
      return;
    }

    setLoading(true);
    try {
      await onSend({
        recipientIds: recipients.map((u) => u.id),
        title: title.trim(),
        message: message.trim(),
        linkView: linkView || null,
        animation,
      });
      onClose();
    } catch (err) {
      setError("Failed to send notification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5"
      >
        <div className="bg-white/80 dark:bg-white/8 backdrop-blur-md p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              Send Notification
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {recipients.length === 1
                ? `To ${recipients[0]?.name}`
                : `To ${recipients.length} users`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-100 dark:bg-slate-800 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100">
              {error}
            </div>
          )}

          <FormField
            id="notif-title"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Please update your visit report"
            required
          />

          <FormField
            id="notif-message"
            label="Message"
            as="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the details of what needs to be done..."
          />

          <div>
            <label
              htmlFor="notif-link-view"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Related Task / Page
            </label>
            <select
              id="notif-link-view"
              value={linkView}
              onChange={(e) => setLinkView(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-800 dark:text-slate-200 shadow-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/50"
            >
              {NOTIFICATION_MODULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Clicking the notification will take the user to this page.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Notification Animation
            </label>
            {animationOptions.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
                Loading animations...
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {animationOptions.map((opt) => (
                  <AnimationPickerRow
                    key={opt.key}
                    option={opt}
                    selected={animation === opt.key}
                    onSelect={() => setAnimation(opt.key)}
                  />
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Hover or click a row to preview. This animation will be shown to the user along with the notification.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 bg-white/40 dark:bg-white/5 backdrop-blur-md border-t border-white dark:border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg dark:shadow-slate-900/50 shadow-orange-600/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};

const EditPermissionsPage: React.FC<{
  user: User;
  onClose: () => void;
  onSave: (permissions: Permissions) => void;
}> = ({ user, onClose, onSave }) => {
  const [permissions, setPermissions] = useState<Permissions>(user.permissions);

  useEffect(() => {
    setPermissions(user.permissions);
  }, [user]);

  const handleToggle = (
    key: keyof Permissions,
    type: "view" | "edit" | "audit",
  ) => {
    setPermissions((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: {
          ...prev[key],
          [type]: !(prev[key] as any)?.[type],
        },
      };
    });
  };

  const permissionGroups = [
    {
      id: "group1",
      title: "Core System",
      accent: "bg-indigo-500",
      items: [
        { key: "dashboard", label: "Dashboard" },
        { key: "profile", label: "My Profile", hasEdit: true },
        { key: "adminPanel", label: "Admin Panel" },
        { key: "lastVisitedProjects", label: "Last Visited Projects" },
      ] as const,
    },
    {
      id: "group2",
      title: "Project Management",
      accent: "bg-orange-500",
      items: [
        { key: "projectCase", label: "Project Case", hasEdit: true },
        { key: "projectCasesList", label: "Project Cases List" },
        {
          key: "employeeProjectVisit",
          label: "Employee Project Visit",
          hasEdit: true,
        },
        { key: "employeeProjectVisit_import", label: "EPV: Import CSV" },
        {
          key: "employeeProjectVisit_template",
          label: "EPV: Download Template",
        },
        { key: "employeeProjectVisit_clear", label: "EPV: Clear Records" },
        {
          key: "salesPersonProjectVisit",
          label: "Sales Person Project Visit",
          hasEdit: true,
        },
        { key: "projectVisit", label: "Project Visit", hasEdit: true },
      ] as const,
    },
    {
      id: "group3",
      title: "Material & Assets",
      accent: "bg-emerald-500",
      items: [
        { key: "materialReceive", label: "Material Receive", hasEdit: true },
        { key: "materialReceiveList", label: "Material Receive List" },
        {
          key: "fixedAssetGPVerification",
          label: "Fixed Asset GP Verification",
          hasEdit: true,
          hasAudit: true,
        },
        {
          key: "rubbishVerification",
          label: "Rubbish Verification",
          hasEdit: true,
          hasAudit: true,
        },
      ] as const,
    },
    {
      id: "group4",
      title: "Reports & Analytics",
      accent: "bg-blue-500",
      items: [
        {
          key: "allDepartmentSummary_exportPdfFull",
          label: "ADS: Export PDF Full",
        },
        {
          key: "allDepartmentSummary_exportIndividualZip",
          label: "ADS: Export Individual Zip",
        },
        { key: "allDepartmentSummary_mailReport", label: "ADS: Mail Report" },
        { key: "allDepartmentSummary_exportExcel", label: "ADS: Export Excel" },
        { key: "allDepartmentSummary_saveSummary", label: "ADS: Save Summary" },
        {
          key: "monthlyComparisonPrecision",
          label: "Monthly Comparison Precision",
          hasEdit: true,
        },
        { key: "reportMailer", label: "Report Mailer" },
      ] as const,
    },
    {
      id: "group5",
      title: "System Tools",
      accent: "bg-slate-500",
      items: [
        {
          key: "systemManagement_addProject",
          label: "System Mgmt: Add Project",
          hasEdit: true,
        },
        {
          key: "systemManagement_projectList",
          label: "System Mgmt: Project List",
          hasEdit: true,
        },
        {
          key: "systemManagement_dashboardSettings",
          label: "System Mgmt: Dashboard Settings",
          hasEdit: true,
        },
        {
          key: "itResponseTimeline",
          label: "IT Response Timeline",
          hasEdit: true,
        },
        {
          key: "erpCorrectionReport",
          label: "ERP Correction Report",
          hasEdit: true,
        },
        {
          key: "constructionDutyAnalysis",
          label: "Construction Duty Analysis",
          hasEdit: true,
        },
        { key: "ssvDutyAnalysis", label: "SSV Duty Analysis", hasEdit: true },
        {
          key: "archiveDataVerification",
          label: "Archive Data Verification",
          hasEdit: true,
          hasAudit: true,
        },
        {
          key: "cctvFootageCheckReports",
          label: "CCTV Footage Check Reports",
          hasEdit: true,
        },
      ] as const,
    },
    {
      id: "group6",
      title: "Casual Activities",
      accent: "bg-amber-500",
      items: [
        {
          key: "employeeCasualActivities",
          label: "Employee Casual Activities",
          hasEdit: true,
        },
      ] as const,
    },
  ];

  const handleGrantAll = () => {
    setPermissions((prev) => {
      if (!prev) return prev;
      const newPerms = { ...prev };
      permissionGroups.forEach((g) => {
        g.items.forEach((item) => {
          newPerms[item.key as keyof Permissions] = { view: true } as any;
          if (item.hasEdit)
            (newPerms[item.key as keyof Permissions] as any).edit = true;
          if ((item as any).hasAudit)
            (newPerms[item.key as keyof Permissions] as any).audit = true;
        });
      });
      return newPerms;
    });
  };

  const handleRevokeAll = () => {
    setPermissions((prev) => {
      if (!prev) return prev;
      const newPerms = { ...prev };
      Object.keys(newPerms).forEach((k) => {
        newPerms[k as keyof Permissions] = {
          view: false,
          edit: false,
          audit: false,
        } as any;
      });
      return newPerms;
    });
  };

  let totalPossible = 0;
  let totalEnabled = 0;
  permissionGroups.forEach((g) => {
    g.items.forEach((item) => {
      totalPossible +=
        1 + (item.hasEdit ? 1 : 0) + ((item as any).hasAudit ? 1 : 0);
      const p = permissions[item.key as keyof Permissions] as any;
      if (p?.view) totalEnabled++;
      if (item.hasEdit && p?.edit) totalEnabled++;
      if ((item as any).hasAudit && p?.audit) totalEnabled++;
    });
  });

  const progressPct = totalPossible > 0 ? Math.round((totalEnabled / totalPossible) * 100) : 0;

  const PermChip = ({
    label,
    isOn,
    onClick,
    color,
  }: {
    label: string;
    isOn: boolean;
    onClick: () => void;
    color: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150 select-none ${
        isOn
          ? `${color} text-white shadow-sm`
          : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors group"
        >
          <ChevronDown className="h-4 w-4 rotate-90 group-hover:-translate-x-0.5 transition-transform" />
          Back to Users
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGrantAll}
            className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold transition-colors"
          >
            Grant all
          </button>
          <button
            onClick={handleRevokeAll}
            className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-500 dark:text-rose-400 rounded-lg text-xs font-semibold transition-colors"
          >
            Revoke all
          </button>
          <button
            onClick={() => onSave(permissions)}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm active:scale-95 transition-all"
          >
            Save changes
          </button>
        </div>
      </div>

      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase">
            Manage Access
          </h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{user.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{progressPct}%</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{totalEnabled} / {totalPossible} enabled</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-8">
        <div
          className="h-full bg-orange-400 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Permission groups grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {permissionGroups.map((group) => (
          <div
            key={group.id}
            className="bg-white/60 dark:bg-white/5 backdrop-blur-sm rounded-2xl border border-slate-100 dark:border-white/8 overflow-hidden"
          >
            {/* Group header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/8">
              <div className={`w-2 h-2 rounded-full ${group.accent} shrink-0`} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {group.title}
              </span>
            </div>

            {/* Items */}
            <div className="p-2">
              {group.items.map((item) => {
                const p = permissions[item.key as keyof Permissions] as any;
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <PermChip
                        label="View"
                        isOn={!!p?.view}
                        onClick={() => handleToggle(item.key as keyof Permissions, "view")}
                        color="bg-blue-400 dark:bg-blue-500"
                      />
                      {item.hasEdit && (
                        <PermChip
                          label="Edit"
                          isOn={!!p?.edit}
                          onClick={() => handleToggle(item.key as keyof Permissions, "edit")}
                          color="bg-orange-400 dark:bg-orange-500"
                        />
                      )}
                      {(item as any).hasAudit && (
                        <PermChip
                          label="Audit"
                          isOn={!!p?.audit}
                          onClick={() => handleToggle(item.key as keyof Permissions, "audit")}
                          color="bg-violet-400 dark:bg-violet-500"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom save bar */}
      <div className="mt-6 flex items-center justify-between py-4 border-t border-slate-100 dark:border-white/8">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(permissions)}
          className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm active:scale-95 transition-all"
        >
          Save changes
        </button>
      </div>
    </div>
  );
};

const UserRow: React.FC<{
  user: User;
  isAdmin: boolean;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDelete: (userId: number) => void;
  onEditPermissions: (user: User) => void;
  onEditUser: (user: User) => void;
  onChangePassword: (user: User) => void;
  onSendNotification: (user: User) => void;
  currentUser: User;
}> = ({
  user,
  isAdmin,
  isSelected,
  onSelect,
  onDelete,
  onEditPermissions,
  onEditUser,
  onChangePassword,
  onSendNotification,
  currentUser,
}) => {
  const canEdit = canEditUser(currentUser, user);
  const canDelete = canDeleteUser(currentUser, user);

  return (
    <div
      className={`group p-4 flex items-center gap-4 transition-all ${isSelected ? "bg-orange-50 dark:bg-orange-900/40/50" : "hover:bg-slate-50 dark:bg-slate-800/50 border-transparent hover:border-slate-100 dark:border-slate-800 border-l-4"}`}
      onClick={() => onSelect(user.id)}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onSelect(user.id)}
        onClick={(e) => e.stopPropagation()}
        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
      />
      <Avatar name={user.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
            {user.name}
          </p>
          {user.role === "admin" && (
            <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-[10px] font-black uppercase rounded-full">
              Admin
            </span>
          )}
          {user.role === "super_admin" && (
            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase rounded-full flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" />
              Super Admin
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {user.email}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSendNotification(user);
          }}
          className="p-2 text-slate-400 dark:text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:bg-orange-900/40 rounded-lg transition-all"
          title="Send Notification"
        >
          <Bell className="h-4 w-4" />
        </button>
        {canEdit ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditPermissions(user);
              }}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:bg-orange-900/40 rounded-lg transition-all"
              title="Edit Permissions"
            >
              <Shield className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChangePassword(user);
              }}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:bg-orange-900/40 rounded-lg transition-all"
              title="Change Password"
            >
              <Key className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="p-2 text-slate-200" title="Permission Editing Locked">
            <Lock className="h-4 w-4" />
          </div>
        )}

        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(user.id);
            }}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="Delete User"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <ChevronRight
        className="h-4 w-4 text-slate-300 group-hover:text-slate-400 dark:text-slate-500 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onEditUser(user);
        }}
      />
    </div>
  );
};

const AdminPanel: React.FC<AdminPanelProps> = ({
  allUsers,
  onPermissionsChange,
  currentUser,
  onInviteUser,
  onDeleteUser,
  onPasswordChange,
  onUpdateUser,
  originalAdminUser,
  onSwitchAccount,
  onSwitchBack,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [userToEditPermissions, setUserToEditPermissions] =
    useState<User | null>(null);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToChangePassword, setUserToChangePassword] = useState<User | null>(
    null,
  );
  const [notificationRecipients, setNotificationRecipients] = useState<
    User[] | null
  >(null);

  const filteredUsers = useMemo(() => {
    const uniqueUsers = [...new Map(allUsers.map((u) => [u.id, u])).values()];
    return uniqueUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [allUsers, searchTerm]);

  const handleBulkDelete = async () => {
    const selectedUsers = allUsers.filter((u) =>
      selectedUserIds.includes(u.id),
    );
    const hasSuperAdmin = selectedUsers.some((u) => u.role === "super_admin");

    const idsToDelete = selectedUsers
      .filter((u) => u.role !== "super_admin")
      .map((u) => u.id);

    if (idsToDelete.length === 0) {
      if (hasSuperAdmin) {
        alert("Super Admin account delete করা যাবে না।");
      }
      setSelectedUserIds([]);
      return;
    }

    if (hasSuperAdmin) {
      alert("Super Admin account delete করা যাবে না, বাদ দেওয়া হয়েছে।");
    }

    if (
      window.confirm(`আপনি কি ${idsToDelete.length} জন user delete করতে চান?`)
    ) {
      try {
        for (const id of idsToDelete) {
          await onDeleteUser(id);
        }
        setSelectedUserIds([]);
      } catch (error) {
        console.error("Bulk delete failed", error);
        alert("কিছু user delete করা সম্ভব হয়নি।");
      }
    }
  };

  const toggleSelectUser = useCallback((id: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSavePermissions = (newPermissions: Permissions) => {
    if (userToEditPermissions) {
      if (!canEditUser(currentUser, userToEditPermissions)) {
        alert("This user's permissions are locked and cannot be modified.");
        setUserToEditPermissions(null);
        return;
      }
      onPermissionsChange(userToEditPermissions.id, newPermissions);
      setUserToEditPermissions(null);
    }
  };

  const handleSendNotification = async (payload: {
    recipientIds: number[];
    title: string;
    message: string;
    linkView: string | null;
    animation: string;
  }) => {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientIds: payload.recipientIds,
        title: payload.title,
        message: payload.message,
        linkView: payload.linkView,
        linkState: { animation: payload.animation },
        senderId: currentUser.id,
        senderName: currentUser.name,
        type: "admin_message",
      }),
    });
    if (!res.ok) {
      throw new Error("Failed to send notification");
    }
    setSelectedUserIds([]);
  };

  const handleBulkSendNotification = () => {
    const targets = allUsers.filter((u) => selectedUserIds.includes(u.id));
    if (targets.length === 0) return;
    setNotificationRecipients(targets);
  };

  const admins = useMemo(
    () => filteredUsers.filter((u) => u.role === "admin"),
    [filteredUsers],
  );
  const superAdmins = useMemo(
    () => filteredUsers.filter((u) => u.role === "super_admin"),
    [filteredUsers],
  );
  const standardUsers = useMemo(
    () => filteredUsers.filter((u) => u.role === "user"),
    [filteredUsers],
  );

  if (userToEditPermissions) {
    return (
      <EditPermissionsPage
        user={userToEditPermissions}
        onClose={() => setUserToEditPermissions(null)}
        onSave={handleSavePermissions}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase">
            User Management
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage system access, roles, and user permissions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {originalAdminUser && (
            <button
              onClick={onSwitchBack}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all uppercase tracking-wider"
            >
              Switch Back to Admin
            </button>
          )}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-orange-600 shadow-xl shadow-orange-600/20 text-white px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3 active:scale-95 transition-all w-fit"
          >
            <UserPlus className="h-5 w-5" />
            New Account
          </button>
        </div>
      </div>

      <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white dark:border-white/8 shadow-sm dark:shadow-slate-900/50 overflow-hidden p-6 space-y-8">
        <div className="border-b border-white dark:border-white/8 flex flex-col sm:flex-row items-center gap-4 bg-white/20 dark:bg-white/5 p-2 rounded-2xl mb-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:border-orange-500 outline-none transition-all shadow-sm dark:shadow-slate-900/50"
            />
          </div>
        </div>

        <AnimatePresence>
          {selectedUserIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-slate-800 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
                <div className="flex items-center gap-3 px-2">
                  <div className="bg-orange-50 dark:bg-orange-900/400/20 p-2 rounded-xl">
                    <Shield className="h-4 w-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-white font-black text-sm uppercase tracking-wider">
                      {selectedUserIds.length} জন Selected
                    </p>
                    <p className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold">
                      Bulk actions will apply to these accounts.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setSelectedUserIds([])}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                  >
                    <X className="h-3 w-3" />
                    Deselect All
                  </button>
                  <button
                    onClick={handleBulkSendNotification}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg dark:shadow-slate-900/50 shadow-orange-600/20 transition-all active:scale-95"
                  >
                    <Bell className="h-3 w-3" />
                    Notify Selected
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg dark:shadow-slate-900/50 shadow-red-600/20 transition-all active:scale-95"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Selected
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {superAdmins.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2 px-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              Super Admins
              <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] rounded-full">
                {superAdmins.length}
              </span>
            </h3>
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 overflow-hidden">
              {superAdmins.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isAdmin={true}
                  isSelected={selectedUserIds.includes(user.id)}
                  onSelect={toggleSelectUser}
                  onDelete={onDeleteUser}
                  onEditPermissions={setUserToEditPermissions}
                  onEditUser={setUserToEdit}
                  onChangePassword={setUserToChangePassword}
                  onSendNotification={(u) => setNotificationRecipients([u])}
                  currentUser={currentUser}
                />
              ))}
            </div>
          </div>
        )}

        {admins.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2 px-2">
              <Shield className="h-5 w-5 text-orange-600" />
              Admins
              <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] rounded-full">
                {admins.length}
              </span>
            </h3>
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 overflow-hidden">
              {admins.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isAdmin={true}
                  isSelected={selectedUserIds.includes(user.id)}
                  onSelect={toggleSelectUser}
                  onDelete={onDeleteUser}
                  onEditPermissions={setUserToEditPermissions}
                  onEditUser={setUserToEdit}
                  onChangePassword={setUserToChangePassword}
                  onSendNotification={(u) => setNotificationRecipients([u])}
                  currentUser={currentUser}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2 px-2">
            <UserPlus className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            Standard Users
            <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] rounded-full">
              {standardUsers.length}
            </span>
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 overflow-hidden">
            {standardUsers.length > 0 ? (
              standardUsers.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isAdmin={false}
                  isSelected={selectedUserIds.includes(user.id)}
                  onSelect={toggleSelectUser}
                  onDelete={onDeleteUser}
                  onEditPermissions={setUserToEditPermissions}
                  onEditUser={setUserToEdit}
                  onChangePassword={setUserToChangePassword}
                  onSendNotification={(u) => setNotificationRecipients([u])}
                  currentUser={currentUser}
                />
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                No standard users found.
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-white/40 dark:bg-white/5 border-t border-white dark:border-white/8 flex justify-between items-center text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider rounded-b-3xl">
          <p>Total Users: {filteredUsers.length}</p>
          <p>Selected: {selectedUserIds.length}</p>
        </div>
      </div>

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onInvite={onInviteUser}
        currentUser={currentUser}
      />

      <EditUserModal
        isOpen={!!userToEdit}
        onClose={() => setUserToEdit(null)}
        user={userToEdit}
        onUpdate={onUpdateUser}
        currentUser={currentUser}
      />

      <ChangePasswordModal
        isOpen={!!userToChangePassword}
        onClose={() => setUserToChangePassword(null)}
        user={userToChangePassword}
        onSave={onPasswordChange}
      />

      <SendNotificationModal
        isOpen={!!notificationRecipients}
        onClose={() => setNotificationRecipients(null)}
        recipients={notificationRecipients || []}
        currentUser={currentUser}
        onSend={handleSendNotification}
      />
    </div>
  );
};

export default AdminPanel;