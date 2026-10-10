import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { View, User } from "../types";
import {
  LayoutDashboard,
  Briefcase,
  Package,
  Eye,
  FileEdit,
  User as UserIcon,
  Shield,
  Settings,
  TrendingUp,
  Clock,
  Mail,
  Database,
  Video,
  ChevronDown,
  MoreVertical,
  RotateCw,
  ListTodo,
  ChevronsRight,
  PanelLeftClose,
} from "lucide-react";
import { getEffectivePermissions } from "../utils/permissionUtils";

const CollapsedNavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick?: () => void;
  subItems?: { label: string; isActive: boolean; onClick: () => void }[];
}> = ({ icon, label, isActive, onClick, subItems }) => {
  const hasSubItems = !!subItems && subItems.length > 0;
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
      }
    };
    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    // Close on any scroll (the rail itself scrolls internally) rather than
    // trying to keep the portal-ed menu glued to the button.
    const handleScroll = () => setIsOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  const handleButtonClick = () => {
    if (hasSubItems) {
      setIsOpen((prev) => !prev);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div className="relative group w-full flex justify-center flex-shrink-0">
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={`flex items-center justify-center h-10 w-10 rounded-xl transition-all ${
          isActive
            ? "bg-orange-500 text-white shadow-sm"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        } ${hasSubItems && isOpen ? "bg-slate-100" : ""}`}
        aria-label={label}
        aria-expanded={hasSubItems ? isOpen : undefined}
        title={!hasSubItems ? label : undefined}
      >
        {icon}
      </button>

      {hasSubItems
        ? isOpen &&
          menuPos &&
          createPortal(
            <div
              ref={menuRef}
              style={{ position: "fixed", top: menuPos.top, left: menuPos.left, transform: "translateY(-50%)" }}
              className="z-[60] bg-white sky:bg-[#f1f8ff] rounded-xl shadow-lg border border-slate-100 sky:border-[#c4dcff] py-1.5 min-w-[170px]"
            >
              <p className="px-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                {label}
              </p>
              {subItems!.map((item) => (
                <a
                  key={item.label}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    item.onClick();
                    setIsOpen(false);
                  }}
                  className={`block px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-md mx-1 ${
                    item.isActive
                      ? "text-orange-700 bg-orange-50"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>,
            document.body
          )
        : (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
            <div className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-lg">
              {label}
            </div>
          </div>
        )}
    </div>
  );
};

const NavLink: React.FC<{
  icon?: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isSubItem?: boolean;
}> = ({ icon, label, isActive, onClick, isSubItem = false }) => (
  <a
    href="#"
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? "bg-orange-50 text-orange-700 relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[60%] before:w-[3px] before:bg-orange-500 before:rounded-r-full"
        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
    } ${isSubItem ? "text-xs py-1.5 ml-4" : ""}`}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
  </a>
);

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  activeView: View;
  onNavigate: (view: View, state?: any) => void;
  currentUser: User;
  onResize: (newWidth: number) => void;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  isCollapsed,
  activeView,
  onNavigate,
  currentUser,
  onResize,
  onToggleCollapse,
}) => {
  const permissions = getEffectivePermissions(currentUser);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (key: string) => {
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const caseViews: View[] = ["projectCase", "projectCasesList"];
  const receiveViews: View[] = [
    "materialReceive",
    "materialReceiveList",
    "rubbishVerification",
  ];
  const surveillanceViews: View[] = [
    "employeeProjectVisit",
    "monthlyComparisonPrecision",
    "salesPersonProjectVisit",
    "itResponseTimeline",
    "constructionDutyAnalysis",
    "ssvDutyAnalysis",
  ];
  const archiveViews: View[] = [
    "archiveDataVerification",
    "fixedAssetGPVerification",
  ];
  const casualViews: View[] = [
    "employeeCasualActivities",
    "remarksManagement",
  ];

  useEffect(() => {
    if (caseViews.includes(activeView)) setOpenMenus((prev) => ({ ...prev, case: true }));
    if (receiveViews.includes(activeView)) setOpenMenus((prev) => ({ ...prev, receive: true }));
    if (surveillanceViews.includes(activeView)) setOpenMenus((prev) => ({ ...prev, surveillance: true }));
    if (archiveViews.includes(activeView)) setOpenMenus((prev) => ({ ...prev, archive: true }));
    if (casualViews.includes(activeView)) setOpenMenus((prev) => ({ ...prev, casual: true }));
  }, [activeView]);

  const canViewCase = permissions.projectCase?.view || permissions.projectCasesList?.view;
  const canViewReceive = permissions.materialReceive?.view || permissions.materialReceiveList?.view || permissions.rubbishVerification?.view;
  const canViewSurveillance = permissions.employeeProjectVisit?.view || permissions.monthlyComparisonPrecision?.view || permissions.salesPersonProjectVisit?.view || permissions.itResponseTimeline?.view || permissions.constructionDutyAnalysis?.view || permissions.ssvDutyAnalysis?.view;
  const canViewSystemManagement = permissions.systemManagement_addProject?.view || permissions.systemManagement_projectList?.view || permissions.systemManagement_dashboardSettings?.view;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    onResize(e.clientX);
  }, [onResize]);

  const handleMouseUp = useCallback(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ease-in-out lg:hidden ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 h-full bg-white/50 dark:bg-white/8 sky:bg-[#f1f8ff]/70 backdrop-blur-md flex flex-col z-50 transition-[left] duration-300 ease-in-out ${isOpen ? "left-0" : "left-[calc(-1*var(--sidebar-width))]"} ${isCollapsed ? "lg:left-[calc(-1*var(--sidebar-width))]" : "lg:left-0"} shadow-sm dark:shadow-slate-900/50 border-r border-slate-100 dark:border-slate-800 sky:border-[#d3e6fb]`}
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="p-4 border-b border-white/20 flex items-center justify-between h-14">
          <button
            onClick={() => onNavigate("dashboard")}
            className="transition-opacity hover:opacity-90 mx-auto lg:mx-0"
            aria-label="Go to Dashboard"
          >
            <div className="flex flex-col items-center">
              <h1 className="font-display text-2xl font-extrabold text-orange-600 uppercase tracking-wider">
                <span className="text-3xl">P</span>recision
              </h1>
              <p className="text-[8px] text-slate-500 tracking-widest uppercase -mt-1">
                Eyes on Every Site
              </p>
            </div>
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden lg:inline-flex p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 transition-colors flex-shrink-0"
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-2 pt-2 pb-1">Main</p>
          
          {permissions.dashboard?.view && (
            <NavLink
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Dashboard"
              isActive={activeView === "dashboard"}
              onClick={() => onNavigate("dashboard")}
            />
          )}

          {canViewCase && (
            <>
              <button
                onClick={() => toggleMenu('case')}
                className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  caseViews.includes(activeView)
                    ? 'text-orange-700 bg-orange-50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Briefcase className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">Project Case</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openMenus['case'] ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openMenus['case'] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="ml-4 pl-3 border-l border-slate-100 flex flex-col gap-0.5 py-1">
                      {permissions.projectCase?.view && <NavLink label="New Case Report" isActive={activeView === "projectCase"} onClick={() => onNavigate("projectCase")} isSubItem />}
                      {permissions.projectCasesList?.view && <NavLink label="All Cases" isActive={activeView === "projectCasesList"} onClick={() => onNavigate("projectCasesList")} isSubItem />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {canViewReceive && (
            <>
              <button
                onClick={() => toggleMenu('receive')}
                className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  receiveViews.includes(activeView)
                    ? 'text-orange-700 bg-orange-50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Package className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">Material Receive</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openMenus['receive'] ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openMenus['receive'] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="ml-4 pl-3 border-l border-slate-100 flex flex-col gap-0.5 py-1">
                      {permissions.materialReceiveList?.view && <NavLink label="All Receipts" isActive={activeView === "materialReceiveList"} onClick={() => onNavigate("materialReceiveList")} isSubItem />}
                      {permissions.rubbishVerification?.view && <NavLink label="Rubbish Verification" isActive={activeView === "rubbishVerification"} onClick={() => onNavigate("rubbishVerification")} isSubItem />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {canViewSurveillance && (
            <>
              <button
                onClick={() => toggleMenu('surveillance')}
                className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  surveillanceViews.includes(activeView)
                    ? 'text-orange-700 bg-orange-50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Eye className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">Surveillance</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openMenus['surveillance'] ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openMenus['surveillance'] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="ml-4 pl-3 border-l border-slate-100 flex flex-col gap-0.5 py-1">
                      {permissions.employeeProjectVisit?.view && <NavLink label="Employee Visit" isActive={activeView === "employeeProjectVisit"} onClick={() => onNavigate("employeeProjectVisit")} isSubItem />}
                      {permissions.monthlyComparisonPrecision?.view && <NavLink label="Monthly Comparison" isActive={activeView === "monthlyComparisonPrecision"} onClick={() => onNavigate("monthlyComparisonPrecision")} isSubItem />}
                      {permissions.ssvDutyAnalysis?.view && <NavLink label="SSV Duty Analysis" isActive={activeView === "ssvDutyAnalysis"} onClick={() => onNavigate("ssvDutyAnalysis")} isSubItem />}
                      {permissions.salesPersonProjectVisit?.view && <NavLink label="Sales Person Visit" isActive={activeView === "salesPersonProjectVisit"} onClick={() => onNavigate("salesPersonProjectVisit")} isSubItem />}
                      {permissions.itResponseTimeline?.view && <NavLink label="IT Response" isActive={activeView === "itResponseTimeline"} onClick={() => onNavigate("itResponseTimeline")} isSubItem />}
                      {permissions.constructionDutyAnalysis?.view && <NavLink label="Const. Duty Analysis" isActive={activeView === "constructionDutyAnalysis"} onClick={() => onNavigate("constructionDutyAnalysis")} isSubItem />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {permissions.reportMailer?.view && <NavLink icon={<Mail className="h-4 w-4" />} label="Report Mailer" isActive={activeView === "reportMailer"} onClick={() => onNavigate("reportMailer")} />}
          {permissions.erpCorrectionReport?.view && <NavLink icon={<FileEdit className="h-4 w-4" />} label="ERP Correction" isActive={activeView === "erpCorrectionReport"} onClick={() => onNavigate("erpCorrectionReport")} />}

          {(permissions.archiveDataVerification?.view || permissions.fixedAssetGPVerification?.view) && (
            <>
              <button
                onClick={() => toggleMenu('archive')}
                className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  archiveViews.includes(activeView)
                    ? 'text-orange-700 bg-orange-50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Database className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">Archive Verification</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openMenus['archive'] ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openMenus['archive'] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="ml-4 pl-3 border-l border-slate-100 flex flex-col gap-0.5 py-1">
                      {permissions.archiveDataVerification?.view && <NavLink label="Data Verification" isActive={activeView === "archiveDataVerification"} onClick={() => onNavigate("archiveDataVerification")} isSubItem />}
                      {permissions.fixedAssetGPVerification?.view && <NavLink label="Fixed Asset GP" isActive={activeView === "fixedAssetGPVerification"} onClick={() => onNavigate("fixedAssetGPVerification")} isSubItem />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {permissions.cctvFootageCheckReports?.view && <NavLink icon={<Video className="h-4 w-4" />} label="CCTV Reports" isActive={activeView === "cctvFootageCheckReports"} onClick={() => onNavigate("cctvFootageCheckReports")} />}

          {permissions.employeeCasualActivities?.view && (
            <>
              <button
                onClick={() => toggleMenu('casual')}
                className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  casualViews.includes(activeView)
                    ? 'text-orange-700 bg-orange-50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">Casual Activities</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openMenus['casual'] ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openMenus['casual'] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="ml-4 pl-3 border-l border-slate-100 flex flex-col gap-0.5 py-1">
                      <NavLink label="Activity Log" isActive={activeView === "employeeCasualActivities"} onClick={() => onNavigate("employeeCasualActivities")} isSubItem />
                      <NavLink label="Remarks Library" isActive={activeView === "remarksManagement"} onClick={() => onNavigate("remarksManagement")} isSubItem />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {permissions.myDailyTask?.view && (
            <NavLink
              icon={<ListTodo className="h-4 w-4" />}
              label="My Daily Task"
              isActive={activeView === "myDailyTask"}
              onClick={() => onNavigate("myDailyTask")}
            />
          )}

          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-2 pt-4 pb-1">Tools</p>
          <NavLink
            icon={<RotateCw className="h-4 w-4" />}
            label="Image Rotator"
            isActive={activeView === "imageRotator"}
            onClick={() => onNavigate("imageRotator")}
          />

          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-2 pt-4 pb-1">Account</p>
          {permissions.profile?.view && <NavLink icon={<UserIcon className="h-4 w-4" />} label="My Profile" isActive={activeView === "profile"} onClick={() => onNavigate("profile")} />}
          {permissions.adminPanel?.view && <NavLink icon={<Shield className="h-4 w-4" />} label="Admin Panel" isActive={activeView === "adminPanel"} onClick={() => onNavigate("adminPanel")} />}
          {canViewSystemManagement && <NavLink icon={<Settings className="h-4 w-4" />} label="System Management" isActive={activeView === "systemManagement"} onClick={() => onNavigate("systemManagement")} />}
        </nav>

        <div className="p-2 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
            <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-[9px] font-black text-orange-600 flex-shrink-0">
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">{currentUser.name}</div>
              <div className="text-[9px] text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                {currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role === 'admin' ? 'Admin' : 'User'} · Online
              </div>
            </div>
            <MoreVertical className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
          </div>
        </div>

        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize group hidden lg:block"
          role="separator"
        >
          <div className="h-full w-0.5 bg-transparent group-hover:bg-orange-300 transition-colors duration-200 mx-auto" />
        </div>
      </aside>

      {/* Collapsed floating icon rail (desktop only) */}
      <div
        className={`fixed top-20 bottom-4 left-4 z-40 hidden ${
          isCollapsed ? "lg:flex" : ""
        } flex-col items-center w-16 bg-white/50 dark:bg-white/8 sky:bg-[#f1f8ff]/70 backdrop-blur-md rounded-2xl shadow-lg dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-800 sky:border-[#d3e6fb] py-3 px-2 gap-1 overflow-y-auto`}
      >
        <button
          onClick={() => onNavigate("dashboard")}
          className="flex items-center justify-center h-9 w-9 rounded-xl mb-1 hover:bg-orange-50 transition-colors flex-shrink-0"
          aria-label="Go to Dashboard"
          title="Precision"
        >
          <span className="font-display text-lg font-extrabold text-orange-600">P</span>
        </button>
        <div className="w-8 h-px bg-slate-100 mb-1 flex-shrink-0" />

        {permissions.dashboard?.view && (
          <CollapsedNavItem
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
            isActive={activeView === "dashboard"}
            onClick={() => onNavigate("dashboard")}
          />
        )}

        {canViewCase && (
          <CollapsedNavItem
            icon={<Briefcase className="h-4 w-4" />}
            label="Project Case"
            isActive={caseViews.includes(activeView)}
            subItems={[
              ...(permissions.projectCase?.view
                ? [{ label: "New Case Report", isActive: activeView === "projectCase", onClick: () => onNavigate("projectCase") }]
                : []),
              ...(permissions.projectCasesList?.view
                ? [{ label: "All Cases", isActive: activeView === "projectCasesList", onClick: () => onNavigate("projectCasesList") }]
                : []),
            ]}
          />
        )}

        {canViewReceive && (
          <CollapsedNavItem
            icon={<Package className="h-4 w-4" />}
            label="Material Receive"
            isActive={receiveViews.includes(activeView)}
            subItems={[
              ...(permissions.materialReceiveList?.view
                ? [{ label: "All Receipts", isActive: activeView === "materialReceiveList", onClick: () => onNavigate("materialReceiveList") }]
                : []),
              ...(permissions.rubbishVerification?.view
                ? [{ label: "Rubbish Verification", isActive: activeView === "rubbishVerification", onClick: () => onNavigate("rubbishVerification") }]
                : []),
            ]}
          />
        )}

        {canViewSurveillance && (
          <CollapsedNavItem
            icon={<Eye className="h-4 w-4" />}
            label="Surveillance"
            isActive={surveillanceViews.includes(activeView)}
            subItems={[
              ...(permissions.employeeProjectVisit?.view
                ? [{ label: "Employee Visit", isActive: activeView === "employeeProjectVisit", onClick: () => onNavigate("employeeProjectVisit") }]
                : []),
              ...(permissions.monthlyComparisonPrecision?.view
                ? [{ label: "Monthly Comparison", isActive: activeView === "monthlyComparisonPrecision", onClick: () => onNavigate("monthlyComparisonPrecision") }]
                : []),
              ...(permissions.ssvDutyAnalysis?.view
                ? [{ label: "SSV Duty Analysis", isActive: activeView === "ssvDutyAnalysis", onClick: () => onNavigate("ssvDutyAnalysis") }]
                : []),
              ...(permissions.salesPersonProjectVisit?.view
                ? [{ label: "Sales Person Visit", isActive: activeView === "salesPersonProjectVisit", onClick: () => onNavigate("salesPersonProjectVisit") }]
                : []),
              ...(permissions.itResponseTimeline?.view
                ? [{ label: "IT Response", isActive: activeView === "itResponseTimeline", onClick: () => onNavigate("itResponseTimeline") }]
                : []),
              ...(permissions.constructionDutyAnalysis?.view
                ? [{ label: "Const. Duty Analysis", isActive: activeView === "constructionDutyAnalysis", onClick: () => onNavigate("constructionDutyAnalysis") }]
                : []),
            ]}
          />
        )}

        {permissions.reportMailer?.view && (
          <CollapsedNavItem icon={<Mail className="h-4 w-4" />} label="Report Mailer" isActive={activeView === "reportMailer"} onClick={() => onNavigate("reportMailer")} />
        )}
        {permissions.erpCorrectionReport?.view && (
          <CollapsedNavItem icon={<FileEdit className="h-4 w-4" />} label="ERP Correction" isActive={activeView === "erpCorrectionReport"} onClick={() => onNavigate("erpCorrectionReport")} />
        )}

        {(permissions.archiveDataVerification?.view || permissions.fixedAssetGPVerification?.view) && (
          <CollapsedNavItem
            icon={<Database className="h-4 w-4" />}
            label="Archive Verification"
            isActive={archiveViews.includes(activeView)}
            subItems={[
              ...(permissions.archiveDataVerification?.view
                ? [{ label: "Data Verification", isActive: activeView === "archiveDataVerification", onClick: () => onNavigate("archiveDataVerification") }]
                : []),
              ...(permissions.fixedAssetGPVerification?.view
                ? [{ label: "Fixed Asset GP", isActive: activeView === "fixedAssetGPVerification", onClick: () => onNavigate("fixedAssetGPVerification") }]
                : []),
            ]}
          />
        )}

        {permissions.cctvFootageCheckReports?.view && (
          <CollapsedNavItem icon={<Video className="h-4 w-4" />} label="CCTV Reports" isActive={activeView === "cctvFootageCheckReports"} onClick={() => onNavigate("cctvFootageCheckReports")} />
        )}

        {permissions.employeeCasualActivities?.view && (
          <CollapsedNavItem
            icon={<Clock className="h-4 w-4" />}
            label="Casual Activities"
            isActive={casualViews.includes(activeView)}
            subItems={[
              { label: "Activity Log", isActive: activeView === "employeeCasualActivities", onClick: () => onNavigate("employeeCasualActivities") },
              { label: "Remarks Library", isActive: activeView === "remarksManagement", onClick: () => onNavigate("remarksManagement") },
            ]}
          />
        )}

        {permissions.myDailyTask?.view && (
          <CollapsedNavItem icon={<ListTodo className="h-4 w-4" />} label="My Daily Task" isActive={activeView === "myDailyTask"} onClick={() => onNavigate("myDailyTask")} />
        )}

        <div className="w-8 h-px bg-slate-100 my-1 flex-shrink-0" />
        <CollapsedNavItem icon={<RotateCw className="h-4 w-4" />} label="Image Rotator" isActive={activeView === "imageRotator"} onClick={() => onNavigate("imageRotator")} />

        <div className="w-8 h-px bg-slate-100 my-1 flex-shrink-0" />
        {permissions.profile?.view && (
          <CollapsedNavItem icon={<UserIcon className="h-4 w-4" />} label="My Profile" isActive={activeView === "profile"} onClick={() => onNavigate("profile")} />
        )}
        {permissions.adminPanel?.view && (
          <CollapsedNavItem icon={<Shield className="h-4 w-4" />} label="Admin Panel" isActive={activeView === "adminPanel"} onClick={() => onNavigate("adminPanel")} />
        )}
        {canViewSystemManagement && (
          <CollapsedNavItem icon={<Settings className="h-4 w-4" />} label="System Management" isActive={activeView === "systemManagement"} onClick={() => onNavigate("systemManagement")} />
        )}

        <div className="mt-auto pt-2 border-t border-slate-100 w-full flex flex-col items-center gap-1 flex-shrink-0">
          <div
            className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-[9px] font-black text-orange-600 flex-shrink-0"
            title={currentUser.name}
          >
            {currentUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center h-9 w-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-orange-600 transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;