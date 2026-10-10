import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Sun, Moon, CloudSun, Check, ChevronDown, Bell } from "lucide-react";
import { Player } from "@lottiefiles/react-lottie-player";
import { View, User, AppNotification, AllEmployee, Project } from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import { TabNavigation } from "../hooks/useTabNavigation";
import { LiveActivityNotification } from "./LiveNotificationPopup";
import {
  loadAnimationData,
  DEFAULT_NOTIFICATION_ANIMATION_KEY,
} from "./notificationAnimations";

interface HeaderProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  title: string;
  activeView: View;
  onNavigate: (view: View, state?: any) => void;
  currentUser: User;
  onLogout: () => void;
  // Admin account switching
  allUsers: User[];
  originalAdminUser: User | null;
  onSwitchAccount: (targetUserId: number) => void;
  onSwitchBack: () => void;
  // All tab state & actions — consolidated into one object
  tabNav: TabNavigation;
  // Theme
  theme?: "light" | "sky" | "dark";
  onThemeChange?: (theme: "light" | "sky" | "dark") => void;
  /** @deprecated use theme/onThemeChange */
  onThemeToggle?: () => void;
  isDark?: boolean;
  // Notifications
  notifications?: LiveActivityNotification[];
  onClearNotifications?: () => void;
  onDismissNotification?: (id?: string) => void;
  serverNotifications?: AppNotification[];
  onNotificationClick?: (notification: AppNotification) => void;
  onMarkAllNotificationsRead?: () => void;
  // Global search
  allEmployees?: AllEmployee[];
  projects?: Project[];
  onGlobalSearchSelect?: (name: string) => void;
}

// Small thumbnail shown next to admin-sent notifications in the bell
// dropdown. Loads the chosen Lottie animation (from `link_state.animation`)
// lazily and plays it on hover; otherwise shows a static Bell icon to keep
// the dropdown lightweight.
const NotificationThumbnail: React.FC<{ animationKey: string | null }> = ({
  animationKey,
}) => {
  const [animationData, setAnimationData] = useState<any>(null);
  const [hovered, setHovered] = useState(false);
  const loadedRef = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (!animationKey || loadedRef.current) return;
    loadedRef.current = true;
    loadAnimationData(animationKey)
      .then((data) => setAnimationData(data))
      .catch(() => {
        loadedRef.current = false;
      });
  }, [animationKey]);

  if (!animationKey) {
    return <Bell className="h-4 w-4 text-orange-500" />;
  }

  return (
    <div
      className="h-6 w-6 shrink-0 rounded-md bg-orange-50 dark:bg-orange-500/10 overflow-hidden flex items-center justify-center"
      onMouseEnter={() => {
        setHovered(true);
        ensureLoaded();
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {animationData ? (
        <Player
          src={animationData}
          autoplay={hovered}
          loop
          style={{ width: 24, height: 24 }}
          background="transparent"
        />
      ) : (
        <Bell className="h-3.5 w-3.5 text-orange-500" />
      )}
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  isSidebarOpen,
  isSidebarCollapsed,
  title,
  activeView,
  onNavigate,
  currentUser,
  onLogout,
  allUsers,
  originalAdminUser,
  onSwitchAccount,
  onSwitchBack,
  tabNav,
  theme,
  onThemeChange,
  onThemeToggle,
  isDark,
  notifications = [],
  onClearNotifications,
  onDismissNotification,
  serverNotifications = [],
  onNotificationClick,
  onMarkAllNotificationsRead,
  allEmployees = [],
  projects = [],
  onGlobalSearchSelect,
}) => {
  const { state: tabs, actions: tabActions } = tabNav;
  const permissions = getEffectivePermissions(currentUser);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const initials =
    currentUser.name
      .match(/\b(\w)/g)
      ?.join("")
      .slice(0, 2)
      .toUpperCase() || "??";
  const isDashboard = activeView === "dashboard";
  const isEPV = activeView === "employeeProjectVisit";
  const isSPPV = activeView === "salesPersonProjectVisit";
  const isITRT = activeView === "itResponseTimeline";
  const isERP = activeView === "erpCorrectionReport";
  const isCDA = activeView === "constructionDutyAnalysis";
  const isMCP = activeView === "monthlyComparisonPrecision";
  const isSsvDa = activeView === "ssvDutyAnalysis";
  const isCasualActivities = activeView === "employeeCasualActivities";

  // --- ACCESSIBILITY & UX HOOKS ---
  useEffect(() => {
    // Close dropdown on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (
        notifRef.current &&
        !notifRef.current.contains(event.target as Node)
      ) {
        setIsNotifOpen(false);
      }
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
      if (
        themeMenuRef.current &&
        !themeMenuRef.current.contains(event.target as Node)
      ) {
        setIsThemeMenuOpen(false);
      }
    };
    // Close dropdown on 'Escape' key press
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProfileOpen && e.key === "Escape") {
        setIsProfileOpen(false);
      }
      if (isNotifOpen && e.key === "Escape") {
        setIsNotifOpen(false);
      }
      if (isSearchOpen && e.key === "Escape") {
        setIsSearchOpen(false);
      }
      if (isThemeMenuOpen && e.key === "Escape") {
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    // Focus trap for keyboard navigation
    if (isProfileOpen) {
      const dropdownElement =
        profileRef.current?.querySelector<HTMLElement>('[role="menu"]');
      if (dropdownElement) {
        const focusableElements = Array.from(
          dropdownElement.querySelectorAll<HTMLElement>("button, a[href]"),
        );
        if (focusableElements.length > 0) {
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          const trapFocus = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            if (e.shiftKey) {
              // Shift + Tab
              if (document.activeElement === firstElement) {
                (lastElement as HTMLElement).focus();
                e.preventDefault();
              }
            } else {
              // Tab
              if (document.activeElement === lastElement) {
                (firstElement as HTMLElement).focus();
                e.preventDefault();
              }
            }
          };
          dropdownElement.addEventListener("keydown", trapFocus);
          return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
            dropdownElement.removeEventListener("keydown", trapFocus);
          };
        }
      }
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileOpen, isNotifOpen, isSearchOpen, isThemeMenuOpen]);

  // --- GLOBAL SEARCH ---
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { employees: [], projects: [] };
    const employees = allEmployees
      .filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.employee_id?.toLowerCase().includes(q) ||
          e.designation?.toLowerCase().includes(q) ||
          e.department?.toLowerCase().includes(q),
      )
      .slice(0, 5);
    const matchedProjects = projects
      .filter((p) => p.name?.toLowerCase().includes(q))
      .slice(0, 5);
    return { employees, projects: matchedProjects };
  }, [searchQuery, allEmployees, projects]);

  const hasSearchResults =
    searchResults.employees.length > 0 || searchResults.projects.length > 0;

  // Jump to Employee Project Visit → Records tab, pre-filtered by the
  // chosen employee or project name.
  const handleSelectSearchResult = (name: string) => {
    if (onGlobalSearchSelect) {
      onGlobalSearchSelect(name);
    } else {
      // Fallback if the parent hasn't wired the dedicated handler yet.
      tabActions.setEpv("records");
      onNavigate("employeeProjectVisit", { searchQuery: name });
    }
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  // --- HANDLER FUNCTIONS ---
  const handleProfileNav = (view: View, state?: any) => {
    onNavigate(view, state);
    setIsProfileOpen(false);
  };

  const handleLogout = () => {
    onLogout();
    setIsProfileOpen(false);
  };

  const handleNotificationItemClick = (n: AppNotification) => {
    setIsNotifOpen(false);
    onNotificationClick?.(n);
  };

  // Relative time string, e.g. "5m ago", "2h ago", "3d ago"
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  // Visual style per notification type
  const getNotificationStyle = (type: string) => {
    switch (type) {
      case "adv_new_entry":
        return { color: "text-blue-500", label: "New Entry" };
      case "adv_completed":
        return { color: "text-green-500", label: "Completed" };
      case "adv_returned":
        return { color: "text-red-500", label: "Returned" };
      case "adv_re_audit":
        return { color: "text-amber-500", label: "Re-Audit" };
      default:
        return { color: "text-orange-500", label: "" };
    }
  };

  const unreadServerCount = serverNotifications.filter((n) => !n.is_read).length;
  const totalNotifCount = unreadServerCount + notifications.length;

  // Generic tab button styling logic
  const getTabButtonClasses = (isActive: boolean) => {
    const baseClasses =
      "relative flex-shrink-0 whitespace-nowrap py-1 px-5 font-semibold text-sm transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:z-10 rounded-t-lg";
    if (isActive) {
      // Active tab: looks like it's part of the content pane with scooped corners
      return `${baseClasses} bg-white text-orange-600 -mb-px z-20 scooped-tab`;
    }
    // Inactive tab: a simple button sitting on the bar without an underline effect
    return `${baseClasses} text-slate-500 hover:bg-slate-100/80 hover:text-slate-700`;
  };

  // Resolve the actual theme value: prefer the new `theme` prop, fall back to
  // the legacy `isDark` boolean so older callers keep working unmodified.
  const currentTheme: "light" | "sky" | "dark" = theme ?? (isDark ? "dark" : "light");

  // On the Dashboard, the header floats transparently over a full-bleed photo
  // hero, so it normally ignores theme entirely (a dark gradient keeps the
  // title readable over any photo). In Sky theme we still want that choice to
  // read on this page, so swap the tint instead of dropping it altogether.
  const headerBgClass = isDashboard
    ? currentTheme === "sky"
      ? "bg-gradient-to-b from-[#5b8fd6]/55 to-transparent border-b-transparent"
      : "bg-gradient-to-b from-black/50 to-transparent border-b-transparent"
    // Same frosted-glass transparency level as the Dashboard header (~50-55%
    // tint + blur), but a light tint and dark text so it stays readable over
    // ordinary page content instead of a photo hero.
    : "bg-white/50 dark:bg-white/5 sky:bg-[#c4dcff]/55 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 sky:border-[#a9c9f5] shadow-sm dark:shadow-slate-900/50";

  const THEME_OPTIONS: { value: "light" | "sky" | "dark"; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "sky", label: "Sky", icon: CloudSun },
    { value: "dark", label: "Dark", icon: Moon },
  ];
  const ActiveThemeIcon = THEME_OPTIONS.find((t) => t.value === currentTheme)?.icon ?? Sun;
  const handleThemeSelect = (value: "light" | "sky" | "dark") => {
    if (onThemeChange) {
      onThemeChange(value);
    } else if (onThemeToggle) {
      // Legacy callers only support a light/dark toggle — best effort.
      onThemeToggle();
    }
    setIsThemeMenuOpen(false);
  };

  return (
    <header
      className={`fixed top-0 right-0 z-30 flex flex-col left-0 transition-[left] duration-300 ease-in-out ${isSidebarCollapsed ? 'lg:left-24' : 'lg:left-[var(--sidebar-width)]'} ${isDashboard ? "h-12" : "h-18"} ${headerBgClass} animate-header-fade-in-down`}
      style={{ animationDelay: "1.0s" }}
    >
      <div className="px-4 sm:px-6 lg:px-8 flex-shrink-0">
        <div className="flex items-center justify-between h-12">
          {/* Left side: Menu button & Title */}
          <div className="flex-1 flex justify-start items-center gap-4">
            <button
              onClick={onMenuClick}
              className={`p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 lg:hidden ${isDashboard ? "text-white hover:bg-white/10 dark:hover:bg-white/5" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
            {!isDashboard && (
              <div ref={searchRef} className="relative hidden md:block w-56 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder="Search employee or project..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white/80 border border-slate-200 rounded-full shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 dark:bg-white/5 dark:border-white/10 dark:text-slate-200 transition-all"
                />
                {isSearchOpen && searchQuery.trim() && (
                  <div className="absolute left-0 mt-1.5 w-80 bg-white dark:bg-slate-900 rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-30 max-h-96 overflow-y-auto">
                    {!hasSearchResults ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        No matches for "{searchQuery}"
                      </div>
                    ) : (
                      <>
                        {searchResults.employees.length > 0 && (
                          <div>
                            <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Employees
                            </div>
                            {searchResults.employees.map((emp) => (
                              <button
                                key={`emp-${emp.id}`}
                                onClick={() => handleSelectSearchResult(emp.name)}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0">
                                  <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">
                                    {emp.name}
                                  </span>
                                  <span className="block text-xs text-slate-400 truncate">
                                    {emp.employee_id}
                                    {emp.designation ? ` · ${emp.designation}` : ""}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.projects.length > 0 && (
                          <div>
                            <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Projects
                            </div>
                            {searchResults.projects.map((p, idx) => (
                              <button
                                key={`proj-${idx}`}
                                onClick={() => handleSelectSearchResult(p.name)}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 text-sm text-slate-700 dark:text-slate-200 truncate"
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="relative inline-block">
              <h1
                className={`font-sans text-xl font-bold uppercase tracking-wide truncate ${isDashboard ? "text-white/90" : "text-slate-800 dark:text-slate-100"}`}
              >
                {title}
              </h1>
              {/* Decorative underline, not shown on dashboard where header is transparent.
                  Positioned with a negative offset (instead of pb-3 padding) so it doesn't
                  add extra height to this box — keeps the title vertically aligned with the
                  other header items (search, bell, theme, avatar). */}
              {!isDashboard && (
                <div
                  className="absolute -bottom-2 left-0 flex items-center w-full"
                  aria-hidden="true"
                >
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-orange-400 to-amber-500"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 -ml-[3px]"></div>
                </div>
              )}
            </div>

            {/* Toolbar slot for Employee Casual Activities — buttons portaled in from that page, sitting to the right of the title */}
            {isCasualActivities && (
              <div
                id="casual-activities-header-slot"
                className="flex items-center gap-2 flex-wrap min-w-0"
              />
            )}
          </div>

          {/* Right side: Profile and Theme buttons */}
          <div className="flex-shrink-0 flex justify-end items-center gap-2 sm:gap-4">
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setIsNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                aria-haspopup="true"
                aria-expanded={isNotifOpen}
                className={`relative p-2 rounded-xl transition-all border border-transparent hover:border-slate-100 dark:hover:border-white/10 ${
                  isDashboard
                    ? "text-white/80 hover:text-white hover:bg-white/10"
                    : "text-slate-400 hover:text-slate-600 hover:bg-white/40 dark:hover:bg-white/10 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Bell className="h-5 w-5" />
                {totalNotifCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {totalNotifCount > 9 ? "9+" : totalNotifCount}
                  </span>
                )}
              </button>

              <div
                className={`absolute right-0 mt-2 w-80 origin-top-right bg-white dark:bg-slate-900 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 transition-all duration-200 ease-out z-20 ${
                  isNotifOpen
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-95 pointer-events-none"
                }`}
                role="menu"
                aria-orientation="vertical"
              >
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Notifications
                  </span>
                  <div className="flex items-center gap-3">
                    {unreadServerCount > 0 && onMarkAllNotificationsRead && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-xs font-medium text-orange-600 hover:text-orange-700"
                      >
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && onClearNotifications && (
                      <button
                        onClick={onClearNotifications}
                        className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {/* Archive Data Verification & other server-side notifications */}
                  {serverNotifications.map((n) => {
                    const style = getNotificationStyle(n.type);

                    // Admin-sent notifications may carry a chosen animation
                    // key in link_state.animation — show its thumbnail
                    // instead of the generic Bell icon.
                    let animationKey: string | null = null;
                    if (n.type === "admin_message" && n.link_state) {
                      try {
                        const parsed = JSON.parse(n.link_state);
                        if (
                          parsed?.animation &&
                          parsed.animation !== DEFAULT_NOTIFICATION_ANIMATION_KEY
                        ) {
                          animationKey = parsed.animation;
                        }
                      } catch {
                        animationKey = null;
                      }
                    }

                    return (
                      <button
                        key={`server-${n.id}`}
                        onClick={() => handleNotificationItemClick(n)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-50 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/5 flex items-start gap-3 ${
                          !n.is_read ? "bg-orange-50/60 dark:bg-orange-500/5" : ""
                        }`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {animationKey ? (
                            <NotificationThumbnail animationKey={animationKey} />
                          ) : (
                            <Bell className={`h-4 w-4 ${style.color}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                            {n.message}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                        {!n.is_read && (
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                  {serverNotifications.length === 0 && notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map((n, idx) => (
                      <div
                        key={`live-${idx}-${n.id ?? "noid"}`}
                        className="px-4 py-3 border-b border-slate-50 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/5 flex items-start gap-3"
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          <Bell className="h-4 w-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                            {n.employeeNames
                              ? `${n.employeeNames} — new activity`
                              : "New activity logged"}
                          </p>
                          {n.remarks && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                              {n.remarks}
                            </p>
                          )}
                          {(n.date || n.time) && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {[n.date, n.time].filter(Boolean).join(" • ")}
                            </p>
                          )}
                        </div>
                        {onDismissNotification && (
                          <button
                            onClick={() => onDismissNotification(n.id)}
                            aria-label="Dismiss notification"
                            className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 flex-shrink-0"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            {(onThemeChange || onThemeToggle) && (
              <div ref={themeMenuRef} className="relative">
                <button
                  onClick={() => setIsThemeMenuOpen((prev) => !prev)}
                  aria-label="Change theme"
                  aria-haspopup="true"
                  aria-expanded={isThemeMenuOpen}
                  className="flex items-center gap-1 p-2 rounded-xl text-slate-400 hover:text-slate-600 
                                  hover:bg-white/40 dark:hover:bg-white/10 sky:hover:bg-white/40
                                  dark:text-slate-400 dark:hover:text-slate-200
                                  transition-all border border-transparent 
                                  hover:border-slate-100 dark:hover:border-white/10"
                >
                  <ActiveThemeIcon className="h-5 w-5" />
                  <ChevronDown className={`h-3 w-3 transition-transform ${isThemeMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {isThemeMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-36 origin-top-right bg-white dark:bg-slate-900 sky:bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-30 py-1"
                  >
                    {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        role="menuitem"
                        onClick={() => handleThemeSelect(value)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 text-left">{label}</span>
                        {currentTheme === value && <Check className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-orange-500 transition-transform hover:scale-105 active:scale-100"
                aria-label="View Profile"
                aria-expanded={isProfileOpen}
                aria-haspopup="true"
              >
                <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 shadow-sm dark:shadow-slate-900/50 flex items-center justify-center overflow-hidden">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-semibold text-sm text-orange-600">
                      {initials}
                    </span>
                  )}
                </div>
              </button>

              <div
                className={`absolute right-0 mt-2 w-56 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 transition-all duration-200 ease-out z-10 ${
                  isProfileOpen
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-95 pointer-events-none"
                }`}
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="user-menu-button"
              >
                <div className="py-1" role="none">
                  {originalAdminUser && (
                    <div className="px-4 py-2 text-center text-xs text-slate-500 bg-slate-50">
                      Viewing as {currentUser.name}
                    </div>
                  )}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleProfileNav("profile");
                    }}
                    role="menuitem"
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-slate-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0012 11z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>My Profile</span>
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleProfileNav("profile", { initialTab: "security" });
                    }}
                    role="menuitem"
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-slate-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 1 1 0 000-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Update Password</span>
                  </a>

                  {/* --- Account Switching UI --- */}
                  {originalAdminUser && (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onSwitchBack();
                      }}
                      role="menuitem"
                      className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M15 10a.75.75 0 01-.75.75H7.56l1.22 1.22a.75.75 0 11-1.06 1.06l-2.5-2.5a.75.75 0 010-1.06l2.5-2.5a.75.75 0 111.06 1.06L7.56 9.25H14.25A.75.75 0 0115 10z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Switch Back to Admin</span>
                    </a>
                  )}

                  {currentUser.id === 1 && !originalAdminUser && (
                    <>
                      <div className="my-1 h-px bg-slate-100 mx-2"></div>
                      <div className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-400">
                        Switch Account (Test)
                      </div>
                      {allUsers
                        .filter((u) => u.id === 2 || u.id === 3)
                        .map((user) => (
                          <a
                            key={user.id}
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              onSwitchAccount(user.id);
                            }}
                            role="menuitem"
                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <div className="w-6 h-6 rounded-full bg-orange-100 border-2 border-white flex items-center justify-center shadow-inner overflow-hidden">
                              <span className="font-semibold text-xs text-orange-600">
                                {user.name
                                  .match(/\b(\w)/g)
                                  ?.join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            </div>
                            <span>Switch to {user.name}</span>
                          </a>
                        ))}
                    </>
                  )}
                  <div className="my-1 h-px bg-slate-100 mx-2"></div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleLogout();
                    }}
                    role="menuitem"
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Logout</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conditionally rendered tab bar for ALL non-dashboard pages */}
      {!isDashboard && (
        <nav className="px-4 sm:px-6 lg:px-8 mt-auto">
          <div
            className="relative flex items-end -mb-px scooped-tab-container"
            aria-label="Tabs"
          >
            {isEPV ? (
              <>
                {(permissions.employeeProjectVisit?.view ||
                  permissions.employeeProjectVisit?.edit) && (
                  <button
                    onClick={() => tabActions.setEpv("entry")}
                    className={getTabButtonClasses(tabs.epv === "entry")}
                  >
                    Visit Entry
                  </button>
                )}
                <button
                  onClick={() => tabActions.setEpv("records")}
                  className={getTabButtonClasses(tabs.epv === "records")}
                >
                  All Records
                </button>
                <button
                  onClick={() => tabActions.setEpv("departmentSummary")}
                  className={getTabButtonClasses(
                    tabs.epv === "departmentSummary",
                  )}
                >
                  Department Summary
                </button>
                <button
                  onClick={() => tabActions.setEpv("dutyAnalysis")}
                  className={getTabButtonClasses(
                    tabs.epv === "dutyAnalysis",
                  )}
                >
                  Duty Analysis (AI)
                </button>
                <button
                  onClick={() => tabActions.setEpv("summary")}
                  className={getTabButtonClasses(tabs.epv === "summary")}
                >
                  Monthly Summary
                </button>
                <button
                  onClick={() => tabActions.setEpv("projectCompliance")}
                  className={getTabButtonClasses(tabs.epv === "projectCompliance")}
                >
                  Project Compliance
                </button>
              </>
            ) : isSPPV ? (
              <>
                <button
                  onClick={() => tabActions.setSppv("records")}
                  className={getTabButtonClasses(tabs.sppv === "records")}
                >
                  Records
                </button>
                <button
                  onClick={() => tabActions.setSppv("analysis")}
                  className={getTabButtonClasses(tabs.sppv === "analysis")}
                >
                  Reporting & Analysis
                </button>
                <button
                  onClick={() => tabActions.setSppv("teams")}
                  className={getTabButtonClasses(tabs.sppv === "teams")}
                >
                  Manage Teams
                </button>
                <button
                  onClick={() => tabActions.setSppv("employees")}
                  className={getTabButtonClasses(tabs.sppv === "employees")}
                >
                  Employee Database
                </button>
              </>
            ) : isITRT ? (
              <>
                <button
                  onClick={() => tabActions.setItrt("records")}
                  className={getTabButtonClasses(tabs.itrt === "records")}
                >
                  Records & Import
                </button>
                <button
                  onClick={() => tabActions.setItrt("analysis")}
                  className={getTabButtonClasses(tabs.itrt === "analysis")}
                >
                  Analysis
                </button>
                <button
                  onClick={() => tabActions.setItrt("credentials")}
                  className={getTabButtonClasses(tabs.itrt === "credentials")}
                >
                  Device Credentials
                </button>
                <button
                  onClick={() => tabActions.setItrt("camera-status")}
                  className={getTabButtonClasses(tabs.itrt === "camera-status")}
                >
                  Camera Status
                </button>
              </>
            ) : isERP ? (
              <>
                <button
                  onClick={() => tabActions.setErp("records")}
                  className={getTabButtonClasses(tabs.erp === "records")}
                >
                  Records
                </button>
                <button
                  onClick={() => tabActions.setErp("analysis")}
                  className={getTabButtonClasses(tabs.erp === "analysis")}
                >
                  Analysis Report
                </button>
              </>
            ) : isCDA ? (
              <>
                <button
                  onClick={() => tabActions.setCda("visit")}
                  className={getTabButtonClasses(tabs.cda === "visit")}
                >
                  Visit Analysis
                </button>
                <button
                  onClick={() => tabActions.setCda("material")}
                  className={getTabButtonClasses(tabs.cda === "material")}
                >
                  Material Analysis
                </button>
                <button
                  onClick={() => tabActions.setCda("analysis")}
                  className={getTabButtonClasses(tabs.cda === "analysis")}
                >
                  Cross Analysis
                </button>
              </>
            ) : isMCP ? (
              <>
                <button
                  onClick={() => tabActions.setMcp("records")}
                  className={getTabButtonClasses(tabs.mcp === "records")}
                >
                  All Records
                </button>
                <button
                  onClick={() => tabActions.setMcp("departmentSummary")}
                  className={getTabButtonClasses(
                    tabs.mcp === "departmentSummary",
                  )}
                >
                  Department Summary
                </button>
                <button
                  onClick={() => tabActions.setMcp("dutyAnalysis")}
                  className={getTabButtonClasses(
                    tabs.mcp === "dutyAnalysis",
                  )}
                >
                  Duty Analysis (AI)
                </button>
                <button
                  onClick={() => tabActions.setMcp("summary")}
                  className={getTabButtonClasses(tabs.mcp === "summary")}
                >
                  Monthly Summary
                </button>
              </>
            ) : isSsvDa ? (
              <>
                <button
                  onClick={() => tabActions.setSsvDa("records")}
                  className={getTabButtonClasses(tabs.ssvDa === "records")}
                >
                  Records
                </button>
                <button
                  onClick={() => tabActions.setSsvDa("analysis")}
                  className={getTabButtonClasses(tabs.ssvDa === "analysis")}
                >
                  Analysis
                </button>
                <button
                  onClick={() => tabActions.setSsvDa("rosterAnalysis")}
                  className={getTabButtonClasses(
                    tabs.ssvDa === "rosterAnalysis",
                  )}
                >
                  Roster Analysis
                </button>
              </>
            ) : (
              // Placeholder to ensure the ribbon area maintains its height on pages without tabs, matching the EPV page style.
              <div className="py-2 px-5 font-semibold text-sm invisible">
                Placeholder
              </div>
            )}
            {/* This div creates the continuous bottom border for the bar */}
            <div className="absolute bottom-0 left-0 right-0 h-px -z-10"></div>
          </div>
        </nav>
      )}
    </header>
  );
};

export default Header;