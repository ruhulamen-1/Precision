import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './components/Login';
import { View, Role, Project, FeaturedProject, ITAssignedIssue, EmployeeVisit as EmployeeVisitType, ERPCorrectionRecord, EmployeeVisitTab, SalesPersonVisitTab, ITResponseTimelineTab, ERPCorrectionTab, ConstructionDutyAnalysisTab, MonthlyComparisonPrecisionTab, SalesPersonVisit, MaterialReceiveItem, SSVDutyAnalysisTab, AllEmployee, SalesTeam, ArchiveDataVerification as ArchiveDataVerificationType, AttendanceRecord, AppNotification } from './types';
import { User, Permissions } from './types';
import { initialUsers } from './components/users';
import { initialSalesPersonVisits, initialMaterialReceipts } from './data/analysis';
import { LoadingProvider, useLoading } from './contexts/LoadingContext';
import GlobalSpinner from './components/GlobalSpinner';
import Footer from './components/Footer';
import SplashScreen from './components/SplashScreen';
import { getEffectivePermissions } from './utils/permissionUtils';
import { hydrateITIssue } from './utils/itAnalytics';
import { useTheme } from './hooks/useTheme';
import { useTabNavigation } from './hooks/useTabNavigation';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Profile = lazy(() => import('./components/Profile'));
const LastVisitedProjects = lazy(() => import('./components/LastVisitedProjects'));
const ProjectCaseForm = lazy(() => import('./components/ProjectCaseForm'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const ProjectCasesList = lazy(() => import('./components/ProjectCasesList'));
const MaterialReceiveList = lazy(() => import('./components/MaterialReceiveList'));
const SystemManagement = lazy(() => import('./components/SystemManagement'));
const EmployeeProjectVisit = lazy(() => import('./components/EmployeeProjectVisit'));
const SalesPersonProjectVisit = lazy(() => import('./components/SalesPersonProjectVisit'));
const ITResponseTimeline = lazy(() => import('./components/ITResponseTimeline'));
const ERPCorrectionReport = lazy(() => import('./components/ERPCorrectionReport'));
const ConstructionDutyAnalysis = lazy(() => import('./components/ConstructionDutyAnalysis'));
const MonthlyComparisonPrecision = lazy(() => import('./components/MonthlyComparisonPrecision'));
const SSVDutyAnalysis = lazy(() => import('./components/SSVDutyAnalysis'));
const ReportMailer = lazy(() => import('./components/ReportMailer'));
const ArchiveDataVerification = lazy(() => import('./components/ArchiveDataVerification'));
const CCTVFootageCheckReports = lazy(() => import('./components/CCTVFootageCheckReports'));
const RubbishVerification = lazy(() => import('./components/RubbishVerification'));
const EmployeeCasualActivities = lazy(() => import('./components/EmployeeCasualActivities'));
import MandatoryNotificationModal from './components/MandatoryNotificationModal';
import TaskReminderPopup from './components/TaskReminderPopup';
const FixedAssetGPVerification = lazy(() => import('./components/FixedAssetGPVerification'));
const RemarksManagement = lazy(() => import('./components/RemarksManagement'));
const MyDailyTask = lazy(() => import('./components/MyDailyTask'));
const ImageRotator = lazy(() => import('./components/ImageRotator'));

const viewTitles: Record<View, string> = { 
    dashboard: 'Dashboard',
    // 'projectVisit': 'New Visit Report',
    profile: 'Profile',
    lastVisitedProjects: 'Last Visited Projects',
    projectCase: 'Project Case Report',
    projectCasesList: 'Project Cases',
    adminPanel: 'Admin Panel',
    materialReceive: 'Material Receive',
    materialReceiveList: 'Material Receive List',
    systemManagement: 'System Management',
    employeeProjectVisit: 'Employee Project Visit',
    salesPersonProjectVisit: 'Sales Person Project Visit',
    itResponseTimeline: 'IT Response Time Reports',
    erpCorrectionReport: 'ERP Correction Report',
    constructionDutyAnalysis: 'Construction Duty Analysis',
    monthlyComparisonPrecision: 'Monthly Comparison Precision',
    ssvDutyAnalysis: 'SSV Duty Analysis',
    reportMailer: 'Report Mailer',
    archiveDataVerification: 'Archive Data Verification',
    cctvFootageCheckReports: 'CCTV Footage Check Reports',
    fixedAssetGPVerification: 'Fixed Asset GP Verification',
    rubbishVerification: 'Rubbish Verification',
    employeeCasualActivities: 'Employee Casual Activities',
    remarksManagement: 'Remarks Library',
    myDailyTask: 'My Daily Task',
    imageRotator: 'Image Rotator'
};

import { AlertTriangle } from 'lucide-react';

const AccessDenied: React.FC = () => (
    <div className="p-6 md:p-8 text-center">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-red-200 max-w-md mx-auto">
             <AlertTriangle className="h-16 w-16 text-red-500 mx-auto" />
            <h2 className="mt-4 text-2xl font-bold text-slate-800">Access Denied</h2>
            <p className="mt-2 text-slate-600">You do not have permission to view this page. Please contact an administrator if you believe this is an error.</p>
        </div>
    </div>
);

const initialFeaturedProjects: FeaturedProject[] = [
  {
    image: 'https://media.istockphoto.com/id/1831868102/photo/dart-in-the-center-of-dartboard.jpg?s=612x612&w=0&k=20&c=EPKUN-O98zLrZJRWvi7XdJhdOhBbtqbBvX7lWe737J0=',
    title: 'Precision',
    location: 'Central Monitoring System',
    status: 'Live',
    completion: 100,
  },
];

function AppInner() {
    const { showLoading, hideLoading } = useLoading();
    const { theme, setTheme, toggle, isDark } = useTheme();
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [projects, setProjects] = useState<Project[]>([]);
    const [featuredProjects, setFeaturedProjects] = useState<FeaturedProject[]>(initialFeaturedProjects);
    
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await fetch('/api/projects');
                if (response.ok) {
                    const data = await response.json();
                    setProjects(data);
                }
            } catch (error) {
                console.error('Error fetching projects:', error);
            }
        };

        const fetchSettings = async () => {
            try {
                const response = await fetch('/api/dashboard-settings');
                if (response.ok) {
                    const data = await response.json();
                    setFeaturedProjects([data]);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            }
        };

        fetchProjects();
        fetchSettings();
    }, []);                

    // To re-enable the login page on startup, change the initial state below back to `null`.
    const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(() => {
        if (typeof window !== 'undefined') {
            const savedUser = localStorage.getItem('authenticatedUser');
            const loginTime = localStorage.getItem('loginTime');
            if (savedUser && loginTime) {
                const elapsed = Date.now() - parseInt(loginTime, 10);
                if (elapsed > 8 * 60 * 60 * 1000) {
                    // 8 ঘণ্টা পার হয়েছে — session clear
                    localStorage.removeItem('authenticatedUser');
                    localStorage.removeItem('loginTime');
                    localStorage.removeItem('activeView');
                    return null;
                }
                try {
                    return JSON.parse(savedUser);
                } catch (e) {
                    console.error('Failed to parse saved user', e);
                    return null;
                }
            }
        }
        return null;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (authenticatedUser) {
                // Exclude avatar (base64) from localStorage to avoid QuotaExceededError
                // Avatar is always re-fetched from /api/user-profile on login
                const { avatar, ...userWithoutAvatar } = authenticatedUser as any;
                try {
                    localStorage.setItem('authenticatedUser', JSON.stringify(userWithoutAvatar));
                } catch (e) {
                    console.error('localStorage setItem failed:', e);
                }
            } else {
                localStorage.removeItem('authenticatedUser');
            }
        }
    }, [authenticatedUser]);

    useEffect(() => {
        if (authenticatedUser) {
            const fetchProfile = async () => {
                try {
                    const response = await fetch(`/api/user-profile/${authenticatedUser.employeeId}`);
                    if (response.ok) {
                        const profileData = await response.json();
                        if (profileData && profileData.empId) {
                            const updatedUserFields = {
                                avatar: profileData.profilePicture || (authenticatedUser as User).avatar,
                                bio: profileData.bio || (authenticatedUser as User).bio,
                                designation: profileData.designation || (authenticatedUser as User).designation,
                                department: profileData.department || (authenticatedUser as User).department,
                                division: profileData.division || (authenticatedUser as User).division,
                                dateOfBirth: profileData.dateOfBirth || (authenticatedUser as User).dateOfBirth,
                                nationality: profileData.nationality || (authenticatedUser as User).nationality,
                                religion: profileData.religion || (authenticatedUser as User).religion,
                                gender: profileData.gender || (authenticatedUser as User).gender,
                                mobileNumber: profileData.mobileNumber || (authenticatedUser as User).mobileNumber
                            };
                            
                            setAuthenticatedUser(prev => {
                                if (!prev) return null;
                                return { ...prev, ...updatedUserFields };
                            });

                            setUsers(prevUsers => prevUsers.map(u => 
                                u.employeeId === authenticatedUser.employeeId ? { ...u, ...updatedUserFields } : u
                            ));
                        }
                    }
                } catch (error) {
                    console.error('Error fetching profile from database:', error);
                }
            };
            fetchProfile();
        }
    }, [authenticatedUser?.employeeId]);

    const [activeView, setActiveView] = useState<View>(() => {
        const savedView = typeof window !== 'undefined' ? localStorage.getItem('activeView') : null;
        return (savedView as View) || 'dashboard';
    });
    const [viewState, setViewState] = useState<any | null>(null);
    // Employee/project name picked from the header's global search — kept
    // separate from viewState so it still applies even when the person is
    // already on the Employee Project Visit page (handleNavigate skips
    // updating viewState when the target view is already active).
    const [epvGlobalSearchQuery, setEpvGlobalSearchQuery] = useState<{ query: string; ts: number } | null>(null);
    const handleGlobalSearchSelect = (name: string) => {
        setActiveView('employeeProjectVisit');
        tabNav.actions.setEpv('records');
        setEpvGlobalSearchQuery({ query: name, ts: Date.now() });
        setIsSidebarOpen(false);
    };
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('isSidebarCollapsed') : null;
        return saved === 'true';
    });
    const handleToggleSidebarCollapse = useCallback(() => {
        setIsSidebarCollapsed(prev => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('isSidebarCollapsed', String(next));
            }
            return next;
        });
    }, []);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const savedWidth = typeof window !== 'undefined' ? localStorage.getItem('sidebarWidth') : null;
        return savedWidth ? parseInt(savedWidth, 10) : 224; // Default width (w-56)
    });
    
    // State for IT Assigned Issues to persist data
    const [itAssignedIssues, setItAssignedIssues] = useState<ITAssignedIssue[]>([]);
    // State for employee visits with persistence
    const [employeeVisits, setEmployeeVisits] = useState<EmployeeVisitType[]>([]);
    const [isVisitsLoading, setIsVisitsLoading] = useState(false);
    const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
    const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([]);
    const [allEmployees, setAllEmployees] = useState<AllEmployee[]>([]);
    const [archiveRecords, setArchiveRecords] = useState<ArchiveDataVerificationType[]>([]);
    const [serverNotifications, setServerNotifications] = useState<AppNotification[]>([]);

    // Poll backend notifications (Archive Data Verification etc.) for the logged-in user
    // 8-hour session expiry check (runs every minute while app is open)
    useEffect(() => {
        if (!authenticatedUser) return;
        const interval = setInterval(() => {
            const loginTime = localStorage.getItem('loginTime');
            if (!loginTime) return;
            const elapsed = Date.now() - parseInt(loginTime, 10);
            if (elapsed > 8 * 60 * 60 * 1000) {
                handleLogout();
            }
        }, 60 * 1000); // প্রতি ১ মিনিটে check
        return () => clearInterval(interval);
    }, [authenticatedUser]);

    useEffect(() => {
        if (!authenticatedUser?.id) return;
        let isMounted = true;

        const fetchNotifications = async () => {
            try {
                const res = await fetch(`/api/notifications?userId=${authenticatedUser.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && Array.isArray(data)) {
                        const unique = data.filter(
                            (n: AppNotification, idx: number, arr: AppNotification[]) =>
                                arr.findIndex((x: AppNotification) => x.id === n.id) === idx
                        );
                        setServerNotifications(unique);
                    }
                }
            } catch (err) {
                console.error('Failed to load notifications', err);
            }
        };

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [authenticatedUser?.id]);

    useEffect(() => {
        let isMounted = true;
        const fetchSalesTeams = async () => {
            try {
                const res = await fetch('/api/sales-teams');
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) setSalesTeams(data);
                }
            } catch (err) {
                console.error('Failed to load sales teams', err);
            }
        };

        const fetchAllEmployees = async () => {
            try {
                const res = await fetch('/api/all-employees');
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && Array.isArray(data)) setAllEmployees(data);
                }
            } catch (err) {
                console.error('Failed to load all employees', err);
            }
        };

        const fetchVisits = async () => {
            if (isMounted) setIsVisitsLoading(true);
            try {
                const response = await fetch('/api/employee-visits');
                const contentType = response.headers.get("content-type");
                
                if (response.ok && contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    if (isMounted) setEmployeeVisits(data);
                } else {
                    if (isMounted) setEmployeeVisits([]);
                }
            } catch (error) {
                if (isMounted) setEmployeeVisits([]);
            } finally {
                if (isMounted) setIsVisitsLoading(false);
            }
        };

        const fetchItIssues = async () => {
            try {
                const response = await fetch('/api/it-issues');
                const contentType = response.headers.get("content-type");
                
                if (response.ok && contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    // Maps string dates from DB back into Date objects
                    const formattedData = data.map(hydrateITIssue);
                    if (isMounted) setItAssignedIssues(formattedData);
                } else {
                    if (isMounted) setItAssignedIssues([]);
                }
            } catch (error) {
                if (isMounted) setItAssignedIssues([]);
            }
        };

        const fetchSalesPersonVisits = async () => {
            try {
                const response = await fetch('/api/sales-person-visits');
                const contentType = response.headers.get("content-type");
                
                if (response.ok && contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    if (isMounted) setSalesPersonVisits(data);
                } else {
                    if (isMounted) setSalesPersonVisits([]); // Set to initial or empty if fetch fails
                }
            } catch (error) {
                if (isMounted) setSalesPersonVisits([]);
            }
        };

        const fetchUsers = async () => {
            try {
                const res = await fetch('/api/users');
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && Array.isArray(data) && data.length > 0) {
                        // Deduplicate by id to prevent React key warnings
                        const seen = new Set();
                        const unique = data.filter((u: any) => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
                        setUsers(unique);
                    }
                }
            } catch (err) {
                console.error('Failed to load users from server', err);
            }
        };

        const fetchArchiveRecords = async () => {
            try {
                const res = await fetch('/api/archive-data-verification');
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) setArchiveRecords(data);
                }
            } catch (err) {
                console.error('Failed to load archive records', err);
            }
        };

        // Critical for first render: visits (dashboard) + users (auth/profile sync)
        fetchVisits();
        fetchUsers();

        // Defer non-critical heavy queries so they don't block initial paint/interactivity.
        // Splitting into two idle-callback batches avoids 7 parallel heavy requests at mount.
        const idle = (cb: () => void) => {
            if (typeof (window as any).requestIdleCallback === 'function') {
                (window as any).requestIdleCallback(cb, { timeout: 1500 });
            } else {
                setTimeout(cb, 200);
            }
        };

        idle(() => {
            fetchItIssues();
            fetchSalesPersonVisits();
        });
        idle(() => {
            fetchAllEmployees();
            fetchSalesTeams();
            fetchArchiveRecords();
        });

        return () => { isMounted = false; };
    }, []);
    const [erpCorrectionRecords, setErpCorrectionRecords] = useState<ERPCorrectionRecord[]>([]);
    
    // New state for Analytics Dashboard data
    const [salesPersonVisits, setSalesPersonVisits] = useState<SalesPersonVisit[]>(initialSalesPersonVisits);
    const [materialReceipts, setMaterialReceipts] = useState<MaterialReceiveItem[]>(initialMaterialReceipts);

    const tabNav = useTabNavigation();

    // Persist View
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('activeView', activeView);
        }
    }, [activeView]);

    // State to manage admin account switching for testing
    const [originalAdminUser, setOriginalAdminUser] = useState<User | null>(null);

    // New state for splash screen lifecycle
    const [splashState, setSplashState] = useState<'visible' | 'exiting' | 'hidden'>(() => {
        const hasSeenSplash = typeof window !== 'undefined' && sessionStorage.getItem('hasSeenSplash') === 'true';
        return hasSeenSplash ? 'hidden' : 'visible';
    });

    useEffect(() => {
        if (splashState === 'visible') {
             // We don't mark as seen here, but in the handleSplashAnimationEnd
        }
    }, [splashState]);

    useEffect(() => {
        const isReload = typeof window !== 'undefined' && localStorage.getItem('activeView') !== null;
        if (isReload) {
            showLoading();
            const timer = setTimeout(() => {
                hideLoading();
            }, 1000); // Show "reload animation" for 1 second
            return () => clearTimeout(timer);
        }
    }, [showLoading, hideLoading]);
    
    const handleLogin = async (email: string, password: string): Promise<boolean> => {
        showLoading();
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const user = await response.json();
                setAuthenticatedUser(user);
                localStorage.setItem('loginTime', String(Date.now())); // 8-hour session timer
                setOriginalAdminUser(null); // Ensure no residual admin state on new login
                setActiveView('dashboard'); // Reset to dashboard on login
                setSplashState('visible'); // Show splash on new login
                return true;
            } else {
                console.error('Login failed');
                return false;
            }
        } catch (error) {
            console.error('Error during login:', error);
            return false;
        } finally {
            hideLoading();
        }
    };

    const handleLogout = () => {
        setAuthenticatedUser(null);
        setOriginalAdminUser(null);
        tabNav.actions.clearAll();
        if (typeof window !== 'undefined') {
            localStorage.removeItem('authenticatedUser');
            localStorage.removeItem('loginTime');
            localStorage.removeItem('activeView');
        }
    };
    
    // --- Account Switching Handlers ---
    const handleSwitchAccount = (targetUserId: number) => {
        if (!authenticatedUser || authenticatedUser.id !== 1) return; // Only the main admin can switch
        const targetUser = users.find(u => u.id === targetUserId);
        if (targetUser) {
            setOriginalAdminUser(authenticatedUser); // Store the current admin session
            setAuthenticatedUser(targetUser); // Switch to the target user
            setActiveView('dashboard'); // Navigate to a neutral view
            setIsSidebarOpen(false); // Close sidebar if open
        }
    };

    const handleSwitchBackToAdmin = () => {
        if (originalAdminUser) {
            setAuthenticatedUser(originalAdminUser);
            setOriginalAdminUser(null);
            setActiveView('dashboard'); // Navigate to a neutral view
            setIsSidebarOpen(false); // Close sidebar if open
        }
    };
    // --- End Account Switching Handlers ---

    const handleNavigate = (view: View, state: any = null) => {
        // Don't show loader if navigating to the same view
        if (activeView === view) {
            setIsSidebarOpen(false);
            return;
        }

        // Set a timer to show the loader only if navigation is perceived as slow.
        const loaderTimer = setTimeout(() => {
            showLoading();
        }, 300); // Threshold for showing the loader (e.g., 300ms)

        // The actual work of navigation. In our client-side app, this is very fast.
        // We use a small timeout to ensure the UI remains responsive and the navigation
        // feels immediate, rather than waiting for an artificial delay.
        const pageLoadTime = 50; // Simulate a fast page load.

        setTimeout(() => {
            // Update the view
            setActiveView(view);
            setViewState(state);
            setIsSidebarOpen(false);

            // Navigation is complete. Now, prevent the loader from appearing if it hasn't already.
            clearTimeout(loaderTimer);
            
            // And if the loader did somehow appear (e.g., if pageLoadTime > 300), hide it.
            hideLoading();
        }, pageLoadTime);
    };

    const markNotificationRead = async (notification: AppNotification) => {
        try {
            await fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
        } catch (err) {
            console.error('Failed to mark notification as read', err);
        }
        setServerNotifications(prev =>
            prev.map(n => n.id === notification.id ? { ...n, is_read: 1 } : n)
        );
    };

    const handleNotificationClick = async (notification: AppNotification) => {
        await markNotificationRead(notification);

        // Navigate to the relevant module using link_view / link_state
        if (notification.link_view) {
            let state: any = undefined;
            if (notification.link_state) {
                try {
                    state = JSON.parse(notification.link_state);
                } catch {
                    state = undefined;
                }
            }
            handleNavigate(notification.link_view as View, state);
        }
    };

    // Admin-sent custom notifications must be acknowledged before the user can continue.
    const mandatoryNotification = useMemo(() => {
        const unreadAdminMessages = serverNotifications
            .filter(n => n.type === 'admin_message' && !n.is_read)
            .sort((a, b) => a.id - b.id);
        return unreadAdminMessages[0] || null;
    }, [serverNotifications]);

    const handleAcknowledgeNotification = (notification: AppNotification) => {
        markNotificationRead(notification);
    };

    const handleOpenMandatoryNotification = (notification: AppNotification) => {
        handleNotificationClick(notification);
    };

    const handleMarkAllNotificationsRead = async () => {
        if (!authenticatedUser?.id) return;
        try {
            await fetch('/api/notifications/mark-all-read', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: authenticatedUser.id }),
            });
        } catch (err) {
            console.error('Failed to mark all notifications as read', err);
        }
        setServerNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    };

    
    const handleSidebarResize = useCallback((newWidth: number) => {
        const constrainedWidth = Math.max(72, Math.min(newWidth, 400)); // Min 72px, max 400px
        setSidebarWidth(constrainedWidth);
        if (typeof window !== 'undefined') {
            localStorage.setItem('sidebarWidth', String(constrainedWidth));
        }
    }, []);

    const handlePermissionsChange = async (userId: number, newPermissions: Permissions) => {
        try {
            await fetch(`/api/users/${userId}/permissions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: newPermissions })
            });
            const updatedUsers = users.map(user =>
                user.id === userId ? { ...user, permissions: newPermissions } : user
            );
            setUsers(updatedUsers);
            if (authenticatedUser && authenticatedUser.id === userId) {
                setAuthenticatedUser(updatedUsers.find(u => u.id === userId)!);
            }
        } catch (error) {
            console.error('Failed to update permissions', error);
        }
    };

    const handleInviteUser = async (name: string, email: string, role: Role) => {
        showLoading();
        try {
            const newUserReq = {
                name,
                email,
                role,
                employeeId: `EMP-${String(Date.now()).slice(-4)}`,
                designation: '',
                department: '',
                division: '',
                password: 'password123', // Default password
                permissions: role === 'admin'
                    ? {
                        dashboard: { view: true },
                        lastVisitedProjects: { view: true },
                        projectCase: { view: true, edit: true },
                        projectCasesList: { view: true },
                        profile: { view: true, edit: true },
                        adminPanel: { view: true },
                        materialReceive: { view: true, edit: true },
                        materialReceiveList: { view: true },
                        systemManagement_addProject: { view: true, edit: true },
                        systemManagement_projectList: { view: true, edit: true },
                        systemManagement_dashboardSettings: { view: true, edit: true },
                        employeeProjectVisit: { view: true, edit: true },
                        employeeProjectVisit_import: { view: true },
                        employeeProjectVisit_template: { view: true },
                        employeeProjectVisit_clear: { view: true },
                        allDepartmentSummary_exportPdfFull: { view: true },
                        allDepartmentSummary_exportIndividualZip: { view: true },
                        allDepartmentSummary_mailReport: { view: true },
                        allDepartmentSummary_exportExcel: { view: true },
                        allDepartmentSummary_saveSummary: { view: true },
                        salesPersonProjectVisit: { view: true, edit: true },
                        itResponseTimeline: { view: true, edit: true },
                        erpCorrectionReport: { view: true, edit: true },
                        constructionDutyAnalysis: { view: true, edit: true },
                        monthlyComparisonPrecision: { view: true, edit: true },
                        ssvDutyAnalysis: { view: true, edit: true },
                        projectVisit: { view: true, edit: true },
                        reportMailer: { view: true },
                        archiveDataVerification: { view: true, edit: true, audit: true },
                        cctvFootageCheckReports: { view: true, edit: true },
                        fixedAssetGPVerification: { view: true, edit: true, audit: true },
                        rubbishVerification: { view: true, edit: true, audit: true },
                        myDailyTask: { view: true, edit: true },
                    }
                    : {
                        dashboard: { view: true },
                        lastVisitedProjects: { view: false },
                        projectCase: { view: false, edit: false },
                        projectCasesList: { view: false },
                        profile: { view: true, edit: true },
                        adminPanel: { view: false },
                        materialReceive: { view: false, edit: false },
                        materialReceiveList: { view: false },
                        systemManagement_addProject: { view: false, edit: false },
                        systemManagement_projectList: { view: false, edit: false },
                        systemManagement_dashboardSettings: { view: false, edit: false },
                        employeeProjectVisit: { view: true, edit: false },
                        employeeProjectVisit_import: { view: false },
                        employeeProjectVisit_template: { view: false },
                        employeeProjectVisit_clear: { view: false },
                        allDepartmentSummary_exportPdfFull: { view: false },
                        allDepartmentSummary_exportIndividualZip: { view: false },
                        allDepartmentSummary_mailReport: { view: false },
                        allDepartmentSummary_exportExcel: { view: false },
                        allDepartmentSummary_saveSummary: { view: false },
                        salesPersonProjectVisit: { view: true, edit: false },
                        itResponseTimeline: { view: true, edit: false },
                        erpCorrectionReport: { view: true, edit: false },
                        constructionDutyAnalysis: { view: true, edit: false },
                        monthlyComparisonPrecision: { view: true, edit: false },
                        ssvDutyAnalysis: { view: true, edit: false },
                        projectVisit: { view: true, edit: false },
                        reportMailer: { view: false },
                        archiveDataVerification: { view: true, edit: true, audit: false },
                        cctvFootageCheckReports: { view: true, edit: true },
                        fixedAssetGPVerification: { view: true, edit: true, audit: false },
                        rubbishVerification: { view: true, edit: true, audit: false },
                        myDailyTask: { view: true, edit: true },
                    },
            };

            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUserReq)
            });

            if (response.ok) {
                const createdUser = await response.json();
                setUsers(prevUsers => [...prevUsers, createdUser]);
                alert('User created successfully. Default password: password123');
            } else {
                const err = await response.json();
                alert(err.error || 'Failed to create user');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert('Failed to connect to server');
        } finally {
            hideLoading();
        }
    };

    const handleUserUpdate = async (updatedData: Partial<Omit<User, 'id' | 'permissions' | 'role'>>) => {
        if (!authenticatedUser) return;

        showLoading();
        try {
            await fetch(`/api/users/${authenticatedUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const updatedUsers = users.map(user =>
                user.id === authenticatedUser.id ? { ...user, ...updatedData } : user
            );
            setUsers(updatedUsers);
            setAuthenticatedUser(prev => prev ? { ...prev, ...updatedData } : null);
        } catch (error) {
            console.error('Failed to update user', error);
        } finally {
            hideLoading();
        }
    };

    const handleUpdateUser = async (userId: number, updatedData: Partial<User>) => {
        showLoading();
        try {
            await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            setUsers(prev => prev.map(user =>
                user.id === userId ? { ...user, ...updatedData } : user
            ));
            if (authenticatedUser?.id === userId) {
                setAuthenticatedUser(prev => prev ? { ...prev, ...updatedData } : null);
            }
        } catch (error) {
            console.error('Failed to update user', error);
        } finally {
            hideLoading();
        }
    };
    
    const handleDeleteUser = async (userId: number) => {
        // Safety check: Admin cannot delete themselves.
        if (authenticatedUser && authenticatedUser.id === userId) {
            alert("Error: You cannot delete your own account.");
            return;
        }

        if (!confirm('Are you sure you want to delete this user?')) return;

        showLoading();
        try {
            const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
            if (response.ok) {
                setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
            } else {
                alert('Failed to delete user');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
        } finally {
            hideLoading();
        }
    };

    const handlePasswordChangeByAdmin = async (userId: number, newPassword: string) => {
        try {
            const response = await fetch(`/api/users/${userId}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                const updatedUsers = users.map(user =>
                    user.id === userId ? { ...user, password: newPassword } : user
                );
                setUsers(updatedUsers);
                alert('Password has been updated successfully.');
            } else {
                alert(`Failed to update password: ${data.error || 'Server error'}`);
            }
        } catch (error) {
            console.error('Error updating password:', error);
            alert('Failed to update password.');
        }
    };
    
    // Project Management Handlers
    const handleAddProject = async (projectData: Omit<Project, 'id'>) => {
        showLoading();
        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });
            if (response.ok) {
                const newProject = await response.json();
                setProjects(prevProjects => [newProject, ...prevProjects].sort((a,b) => a.name.localeCompare(b.name)));
            }
        } catch (error) {
            console.error('Error adding project:', error);
            alert('Failed to add project');
        } finally {
            hideLoading();
        }
    };

    const handleUpdateProject = async (updatedProject: Project) => {
        showLoading();
        try {
            const response = await fetch(`/api/projects/${updatedProject.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedProject)
            });
            if (response.ok) {
                setProjects(prevProjects =>
                    prevProjects.map(p => p.id === updatedProject.id ? updatedProject : p)
                );
            }
        } catch (error) {
            console.error('Error updating project:', error);
            alert('Failed to update project');
        } finally {
            hideLoading();
        }
    };

    const handleDeleteProject = async (projectId: number) => {
        showLoading();
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setProjects(prevProjects => prevProjects.filter(p => p.id !== projectId));
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            alert('Failed to delete project');
        } finally {
            hideLoading();
        }
    };
    
    const handleUpdateFeaturedProject = async (newData: Partial<FeaturedProject>) => {
        showLoading();
        try {
            const updatedData = { ...featuredProjects[0], ...newData };
            const response = await fetch('/api/dashboard-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            if (response.ok) {
                setFeaturedProjects([updatedData]);
            }
        } catch (error) {
            console.error('Error updating settings:', error);
            alert('Failed to update dashboard settings');
        } finally {
            hideLoading();
        }
    };

    const handleAddSystemEntry = async (entryData: { entry_name: string, entry_type: string, description: string }) => {
        showLoading();
        try {
            const response = await fetch('/api/system-entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entryData)
            });
            if (response.ok) {
                console.log('System entry added successfully');
            }
        } catch (error) {
            console.error('Error adding system entry:', error);
            alert('Failed to add system entry');
        } finally {
            hideLoading();
        }
    };


    const handleSplashAnimationEnd = useCallback(() => {
        setSplashState('exiting');
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('hasSeenSplash', 'true');
        }
        // Unmount after the fade-out animation completes (must match CSS)
        setTimeout(() => {
            setSplashState('hidden');
        }, 500);
    }, []);

    const renderView = (currentUser: User) => {
        const permissions = getEffectivePermissions(currentUser);
        switch (activeView) {
            case 'dashboard':
                 return permissions.dashboard?.view ? (
                    <Dashboard 
                        onNavigate={handleNavigate} 
                        currentUser={currentUser} 
                        featuredProjects={featuredProjects} 
                        employeeVisits={employeeVisits} 
                        salesPersonVisits={salesPersonVisits} 
                        itAssignedIssues={itAssignedIssues} 
                        materialReceipts={materialReceipts} 
                        erpCorrectionRecords={erpCorrectionRecords}
                        salesTeams={salesTeams}
                        archiveRecords={archiveRecords}
                    />
                 ) : <AccessDenied />;
            case 'profile':
                 return permissions.profile?.view ? <Profile currentUser={currentUser} onUpdateUser={handleUserUpdate} initialState={viewState} /> : <AccessDenied />;
            case 'lastVisitedProjects':
                 return permissions.lastVisitedProjects?.view ? <LastVisitedProjects currentUser={currentUser} /> : <AccessDenied />;
            case 'projectCase':
                 return permissions.projectCase?.view ? <ProjectCaseForm currentUser={currentUser} projects={projects} /> : <AccessDenied />;
            case 'projectCasesList':
                 return permissions.projectCasesList?.view ? <ProjectCasesList projects={projects} currentUser={currentUser} /> : <AccessDenied />;
             case 'materialReceiveList':
                 return permissions.materialReceiveList?.view ? <MaterialReceiveList currentUser={currentUser} projects={projects} /> : <AccessDenied />;
            case 'systemManagement':
                const canViewSystemManagement = permissions.systemManagement_addProject?.view || permissions.systemManagement_projectList?.view || permissions.systemManagement_dashboardSettings?.view;
                return canViewSystemManagement 
                    ? <SystemManagement currentUser={currentUser} projects={projects} onAddProject={handleAddProject} onUpdateProject={handleUpdateProject} onDeleteProject={handleDeleteProject} featuredProject={featuredProjects[0]} onUpdateFeaturedProject={handleUpdateFeaturedProject} onAddSystemEntry={handleAddSystemEntry} allEmployees={allEmployees} setAllEmployees={setAllEmployees} /> 
                    : <AccessDenied />;
            case 'adminPanel':
                return permissions.adminPanel?.view ? <AdminPanel allUsers={users} onPermissionsChange={handlePermissionsChange} currentUser={currentUser} onInviteUser={handleInviteUser} onDeleteUser={handleDeleteUser} onPasswordChange={handlePasswordChangeByAdmin} onUpdateUser={handleUpdateUser} originalAdminUser={originalAdminUser} onSwitchAccount={handleSwitchAccount} onSwitchBack={handleSwitchBackToAdmin} /> : <AccessDenied />;
            case 'employeeProjectVisit':
                return permissions.employeeProjectVisit?.view ? <EmployeeProjectVisit currentUser={currentUser} projects={projects} visits={employeeVisits} onUpdateVisits={setEmployeeVisits} activeTab={tabNav.state.epv} onTabChange={tabNav.actions.setEpv} allEmployees={allEmployees} isVisitsLoading={isVisitsLoading} attendanceData={attendanceData} onUpdateAttendanceData={setAttendanceData} initialSearchQuery={epvGlobalSearchQuery} /> : <AccessDenied />;
            case 'salesPersonProjectVisit':
                return permissions.salesPersonProjectVisit?.view ? <SalesPersonProjectVisit currentUser={currentUser} projects={projects} visits={salesPersonVisits} onUpdateVisits={setSalesPersonVisits} activeTab={tabNav.state.sppv} onTabChange={tabNav.actions.setSppv} salesTeams={salesTeams} onUpdateTeams={setSalesTeams} /> : <AccessDenied />;
            case 'itResponseTimeline':
                return permissions.itResponseTimeline?.view ? <ITResponseTimeline currentUser={currentUser} assignedIssues={itAssignedIssues} onUpdateAssignedIssues={setItAssignedIssues} activeTab={tabNav.state.itrt} onTabChange={tabNav.actions.setItrt} /> : <AccessDenied />;
            case 'erpCorrectionReport':
                return permissions.erpCorrectionReport?.view ? <ERPCorrectionReport currentUser={currentUser} reports={erpCorrectionRecords} onUpdateReports={setErpCorrectionRecords} activeTab={tabNav.state.erp} onTabChange={tabNav.actions.setErp} /> : <AccessDenied />;
            case 'constructionDutyAnalysis':
                return permissions.constructionDutyAnalysis?.view ? <ConstructionDutyAnalysis currentUser={currentUser} activeTab={tabNav.state.cda} onTabChange={tabNav.actions.setCda} allEmployeeVisits={employeeVisits} /> : <AccessDenied />;
            case 'monthlyComparisonPrecision':
                return permissions.monthlyComparisonPrecision?.view ? <MonthlyComparisonPrecision currentUser={currentUser} projects={projects} visits={employeeVisits} onUpdateVisits={setEmployeeVisits} activeTab={tabNav.state.mcp} onTabChange={tabNav.actions.setMcp} allEmployees={allEmployees} /> : <AccessDenied />;
            case 'ssvDutyAnalysis':
                return permissions.ssvDutyAnalysis?.view ? <SSVDutyAnalysis currentUser={currentUser} activeTab={tabNav.state.ssvDa} onTabChange={tabNav.actions.setSsvDa} allEmployeeVisits={employeeVisits} /> : <AccessDenied />;
            case 'reportMailer':
                return permissions.reportMailer?.view ? <ReportMailer currentUser={currentUser} allVisits={employeeVisits} salesVisits={salesPersonVisits} itIssues={itAssignedIssues} projects={projects} allEmployees={allEmployees} /> : <AccessDenied />;
            case 'archiveDataVerification':
                return permissions.archiveDataVerification?.view ? <ArchiveDataVerification allEmployees={allEmployees} allUsers={users} currentUser={currentUser} initialState={viewState} /> : <AccessDenied />;
            case 'cctvFootageCheckReports':
                return permissions.cctvFootageCheckReports?.view ? <CCTVFootageCheckReports currentUser={currentUser} allEmployees={allEmployees} /> : <AccessDenied />;
            case 'fixedAssetGPVerification':
                return permissions.fixedAssetGPVerification?.view ? <FixedAssetGPVerification currentUser={currentUser} /> : <AccessDenied />;
            case 'rubbishVerification':
                return permissions.rubbishVerification?.view ? <RubbishVerification currentUser={currentUser} allEmployees={allEmployees} allProjects={projects} /> : <AccessDenied />;
            case 'employeeCasualActivities':
                return permissions.employeeCasualActivities?.view ? (
                    <EmployeeCasualActivities
                        currentUser={currentUser}
                        allEmployees={allEmployees}
                        allUsers={users}
                    />
                ) : <AccessDenied />;
            case 'remarksManagement':
                return permissions.employeeCasualActivities?.view ? <RemarksManagement currentUser={currentUser} /> : <AccessDenied />;
            case 'myDailyTask':
                return permissions.myDailyTask?.view ? <MyDailyTask currentUser={currentUser} allUsers={users} /> : <AccessDenied />;
            case 'imageRotator':
                return <ImageRotator />;
            default:
                 return permissions.dashboard?.view ? (
                    <Dashboard 
                        onNavigate={handleNavigate} 
                        currentUser={currentUser} 
                        featuredProjects={featuredProjects} 
                        employeeVisits={employeeVisits} 
                        salesPersonVisits={salesPersonVisits} 
                        itAssignedIssues={itAssignedIssues} 
                        materialReceipts={materialReceipts} 
                        erpCorrectionRecords={erpCorrectionRecords}
                        salesTeams={salesTeams}
                        archiveRecords={archiveRecords}
                    />
                 ) : <AccessDenied />;
        }
    };
    
    if (!authenticatedUser) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <>
            {splashState !== 'hidden' && (
                <SplashScreen 
                    user={authenticatedUser}
                    featuredProjects={featuredProjects}
                    onAnimationEnd={handleSplashAnimationEnd}
                    isExiting={splashState === 'exiting'}
                />
            )}

            {/* Blocking modal for admin-sent custom notifications */}
            <MandatoryNotificationModal
                notification={mandatoryNotification}
                onAcknowledge={handleAcknowledgeNotification}
                onOpen={handleOpenMandatoryNotification}
            />

            {/* Global task reminder popup — fires from any page once a task's
                reminder time arrives, not just while on My Daily Task */}
            {getEffectivePermissions(authenticatedUser).myDailyTask?.view && (
                <TaskReminderPopup currentUser={authenticatedUser} />
            )}

            <div 
                className={`relative z-50 text-slate-800 min-h-screen font-sans ${splashState !== 'hidden' ? 'transition-all duration-700 ease-out' : ''} ${splashState === 'visible' ? 'opacity-0 translate-y-12 pointer-events-none' : 'opacity-100 translate-y-0'}`}
                style={{'--sidebar-width': `${sidebarWidth}px`} as React.CSSProperties}
            >
                <Sidebar 
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                    isCollapsed={isSidebarCollapsed}
                    activeView={activeView} 
                    onNavigate={handleNavigate}
                    currentUser={authenticatedUser}
                    onResize={handleSidebarResize}
                    onToggleCollapse={handleToggleSidebarCollapse}
                />
                <div className={`relative z-10 flex flex-col h-screen overflow-y-auto transition-[margin] duration-300 ease-in-out ${isSidebarCollapsed ? 'lg:ml-24' : 'lg:ml-[var(--sidebar-width)]'}`}>
                    <Header 
                        onMenuClick={() => setIsSidebarOpen(prev => !prev)}
                        isSidebarOpen={isSidebarOpen}
                        isSidebarCollapsed={isSidebarCollapsed}
                        title={viewTitles[activeView]}
                        activeView={activeView}
                        onNavigate={handleNavigate}
                        currentUser={authenticatedUser}
                        onLogout={handleLogout}
                        allUsers={users}
                        originalAdminUser={originalAdminUser}
                        onSwitchAccount={handleSwitchAccount}
                        onSwitchBack={handleSwitchBackToAdmin}
                        tabNav={tabNav}
                        theme={theme}
                        onThemeChange={setTheme}
                        onThemeToggle={toggle}
                        isDark={isDark}
                        serverNotifications={serverNotifications}
                        onNotificationClick={handleNotificationClick}
                        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                        allEmployees={allEmployees}
                        projects={projects}
                        onGlobalSearchSelect={handleGlobalSearchSelect}
                    />
                    <main className={`flex-1 ${activeView === 'dashboard' ? '' : 'pt-18'}`}>
                        <ErrorBoundary>
                            <Suspense fallback={<GlobalSpinner />}>
                                {renderView(authenticatedUser)}
                            </Suspense>
                        </ErrorBoundary>
                    </main>
                    <Footer />
                </div>
            </div>
        </>
    );
}

export default function App() {
    return (
        <LoadingProvider>
            {/* FIX: Removed the invalid 'variant' prop from GlobalSpinner. The component does not accept any props. */}
            <GlobalSpinner />
            <AppInner />
        </LoadingProvider>
    );
}