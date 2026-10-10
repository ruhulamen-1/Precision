// --- Basic & Auth Types ---
export type Role = 'super_admin' | 'admin' | 'user';

declare global {
    interface Window {
        Papa: any;
    }
}

export interface User {
  id: number;
  name: string;
  email: string;
  employeeId: string;
  designation: string;
  department: string;
  password?: string;
  role: Role;
  permissions: Permissions;
  avatar?: string;
  bio?: string;
  division?: string;
  dateOfBirth?: string;
  nationality?: string;
  religion?: string;
  gender?: string;
  mobileNumber?: string;
}

export interface Permissions {
  dashboard: { view: boolean };
  lastVisitedProjects: { view: boolean };
  projectCase: { view: boolean; edit: boolean };
  projectCasesList: { view: boolean };
  profile: { view: boolean; edit: boolean };
  adminPanel: { view: boolean };
  materialReceive: { view: boolean; edit: boolean };
  materialReceiveList: { view: boolean };
  systemManagement_addProject: { view: boolean; edit: boolean };
  systemManagement_projectList: { view: boolean; edit: boolean };
  systemManagement_dashboardSettings: { view: boolean; edit: boolean };
  employeeProjectVisit: { view: boolean; edit: boolean };
  employeeProjectVisit_import: { view: boolean };
  employeeProjectVisit_template: { view: boolean };
  employeeProjectVisit_clear: { view: boolean };
  allDepartmentSummary_exportPdfFull: { view: boolean };
  allDepartmentSummary_exportIndividualZip: { view: boolean };
  allDepartmentSummary_mailReport: { view: boolean };
  allDepartmentSummary_exportExcel: { view: boolean };
  allDepartmentSummary_saveSummary: { view: boolean };
  salesPersonProjectVisit: { view: boolean; edit: boolean };
  itResponseTimeline: { view: boolean; edit: boolean };
  erpCorrectionReport: { view: boolean; edit: boolean };
  constructionDutyAnalysis: { view: boolean; edit: boolean };
  monthlyComparisonPrecision: { view: boolean; edit: boolean };
  ssvDutyAnalysis: { view: boolean; edit: boolean };
  projectVisit: { view: boolean; edit: boolean };
  reportMailer: { view: boolean };
  archiveDataVerification: { view: boolean; edit: boolean; audit: boolean };
  cctvFootageCheckReports: { view: boolean; edit: boolean };
  fixedAssetGPVerification: { view: boolean; edit: boolean; audit: boolean };
  rubbishVerification: { view: boolean; edit: boolean; audit: boolean };
  employeeCasualActivities?: { view: boolean; edit: boolean };
  myDailyTask?: { view: boolean; edit: boolean };
}

// --- View & Navigation Types ---
export type TaskPriority = 'Low' | 'Medium' | 'High';
export type TaskStatus = 'Pending' | 'In Progress' | 'Done';

export interface DailyTask {
  id: number;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  category?: string;
  due_date?: string;
  reminder_at?: string;
  assigned_to_id?: number;
  assigned_to_name?: string;
  created_by_id: number;
  created_by_name: string;
  created_at: string;
  updated_at?: string;
}

export type View =
  | 'dashboard'
  | 'profile'
  | 'lastVisitedProjects'
  | 'projectCase'
  | 'projectCasesList'
  | 'adminPanel'
  | 'materialReceive'
  | 'materialReceiveList'
  | 'systemManagement'
  | 'employeeProjectVisit'
  | 'salesPersonProjectVisit'
  | 'itResponseTimeline'
  | 'erpCorrectionReport'
  | 'constructionDutyAnalysis'
  | 'monthlyComparisonPrecision'
  | 'ssvDutyAnalysis'
  | 'reportMailer'
  | 'archiveDataVerification'
  | 'cctvFootageCheckReports'
  | 'fixedAssetGPVerification'
  | 'rubbishVerification'
  | 'employeeCasualActivities'
  | 'remarksManagement'
  | 'myDailyTask'
  | 'imageRotator';

export type EmployeeVisitTab = 'records' | 'departmentSummary' | 'dutyAnalysis' | 'summary' | 'entry' | 'projectCompliance';

// --- Project Visit Compliance Types ---
export type VisitFrequency = 'daily' | 'weekly' | 'monthly';

export interface ProjectDeptRule {
  department: string;
  frequency: VisitFrequency; // daily = every working day, weekly = once/week, monthly = once/month
}

export interface ProjectVisitConfig {
  id: string;           // uuid
  projectName: string;
  isUnderConstruction: boolean;
  rules: ProjectDeptRule[];
  createdAt: string;    // ISO date
}

export interface DeptComplianceResult {
  department: string;
  frequency: VisitFrequency;
  expectedVisits: number;
  actualVisits: number;
  compliancePct: number;           // actualVisits / expectedVisits * 100
  lastVisitDate: string | null;
  status: 'compliant' | 'partial' | 'missing';
}

export interface ProjectComplianceResult {
  projectName: string;
  overallPct: number;
  deptResults: DeptComplianceResult[];
}
export type MonthlyComparisonPrecisionTab = 'records' | 'departmentSummary' | 'dutyAnalysis' | 'summary';
export type SalesPersonVisitTab = 'records' | 'analysis' | 'teams' | 'employees' | 'system';
export type ITResponseTimelineTab = 'records' | 'analysis' | 'credentials' | 'camera-status';
export type ERPCorrectionTab = 'records' | 'analysis';
export type ConstructionDutyAnalysisTab = 'visit' | 'material' | 'analysis';
export type SSVDutyAnalysisTab = 'records' | 'analysis' | 'rosterAnalysis';
export type RubbishVerificationTab = 'records' | 'analysis' | 'summary';

// --- Project & Site Related Types ---
export interface Project {
  id: number;
  name: string;
  zone: string;
  address: string;
}

export interface FeaturedProject {
  image: string;
  title: string;
  location: string;
  status: string;
  completion: number;
}

export interface VisitedProject {
  id: number;
  projectName: string;
  date: string;
  zone: string;
}

// export interface IssueItem {
//   id: string;
//   description: string;
//   photos: string[];
//   comments: string;
//   category?: string;
//   priority?: 'Low' | 'Medium' | 'High' | 'Critical';
//   summary?: string;
// }

// --- Data Record Types ---
export interface EmployeeVisit {
  id: number;
  date: string; // YYYY-MM-DD
  visitorName: string;
  employeeId?: string; // Derived from AllEmployee list by matching visitorName
  department: string;
  designation: string;
  projectName: string;
  entryTime: string; // HH:MM
  outTime: string; // HH:MM
  duration: string; // H:M:S
  remarks?: string;
  images?: string[]; // Array of image URLs or base64 (now coming from visit_book)
}

export interface VisitBook {
  id?: number;
  date: string;
  projectName: string;
  images: string[];
}

export interface SalesPersonVisit {
  id: number;
  slNo: string;
  employeeId?: string;
  date: string;
  salesPersonName: string;
  designation: string;
  customerName: string;
  customerId: string;
  projectName: string;
  projectLocation?: string;
  inTime: string;
  outTime: string;
}

export interface MaterialReceiveItem {
    id: number;
    mrf: string;
    projectName: string;
    supplierName: string;
    materialName: string;
    quantity: number;
    unit: string;
    vehicle: string;
    vehicleNumber?: string;
    receivedBy: string;
    receivingDate: string;
    receivingTime: string;
    entryDate: string;
    presenceMeApa?: string;
    sgPresence?: string;
    cameraLocation?: string;
    auditRemarks?: string;
    auditBy?: string;
}

export interface ERPCorrectionRecord {
  id: string | number;
  officers: string;
  department: string;
  designation: string;
  projectName: string;
  documentType: string;
  trackingNumber: string;
  correctionType: string;
  entryDate: string;
  entryTime: string;
  status: string;
  completedDate?: string;
  completedTime?: string;
  oldData: string;
  newData: string;
  remarks?: string;
}

export interface ITAssignedIssue {
  id: string;
  issue: string;
  reportedAt: Date;
  assignedTo: string;
  status: 'Issue' | 'Offline';
  projectName: string;
  zone: string;
}

export interface CameraStatusEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  projectName: string;
  zone: string;
  onlineStatus: 'Online' | 'Offline' | 'Issue';
  issueType?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface DeviceCredential {
  id: number;
  zone: string;
  projectName: string;
  deviceSlNo: string;
  username: string;
  password: string;
  createdAt?: string;
  updatedAt?: string;
}

// --- Analysis & Reporting Types ---
export interface ReportData {
  perDay: { date: string; visitCount: number; totalDuration: number }[];
  summary: { totalVisitDays: number; totalProjectsVisited: number; grandTotalDuration: number };
  perProject: { projectName: string; visitCount: number; totalDuration: number }[];
  durationCounts: { category: string; count: number }[];
  improperVisitCount: number;
  improperVisits: EmployeeVisit[];
  dailyProjects: { date: string; projectName: string }[];
  noVisitDays: { date: string; day: string; remark: string }[];
}

export interface SaleableProject {
  id: number;
  project_name: string;
}

export interface AllEmployee {
  id: number;
  employee_id: string;
  name: string;
  designation: string;
  department: string;
  email: string;
  phone: string;
  is_active: boolean;
}

export interface DepartmentEmail {
    id?: number;
    department_name: string;
    to_emails: string;
    cc_emails: string;
    updated_at?: string;
}

export interface MonthlyLink {
    id?: number;
    department_name: string;
    report_month: string;
    link: string;
    updated_at?: string;
}

export interface KpiData {
  id: string | number;
  sl: string;
  empId: string;
  associate: string;
  date: string;
  projectInfo: string;
  leadInfo: string;
}


// Gemini Analysis Result
export interface AnalysisResult {
    category: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    summary: string;
}

// Project Case Report
export interface AnnotationPoint {
  x: number; // 0-100, percent of photo width
  y: number; // 0-100, percent of photo height
}

export interface PhotoAnnotation {
  id: string;
  // defaults to 'point' when absent, for backward compatibility
  type?: 'point' | 'box' | 'highlight' | 'ruler' | 'arrow' | 'freehand';
  xPct: number; // 0-100, horizontal position (top-left corner for 'box'/'highlight')
  yPct: number; // 0-100, vertical position (top-left corner for 'box'/'highlight')
  wPct?: number; // 0-100, box width - only used when type is 'box' or 'highlight'
  hPct?: number; // 0-100, box height - only used when type is 'box' or 'highlight'
  points?: AnnotationPoint[]; // used when type is 'ruler', 'arrow' (2 points) or 'freehand' (many points)
  text: string; // the mark's label text
}

export interface ProjectCase {
  id: number | string;
  projectName: string;
  projectZone?: string;
  caseName: string;
  liableDept: string;
  comments?: string;
  photo?: string | null;
  annotations?: PhotoAnnotation[];
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  summary?: string;
  reporter: string;
  reporterId?: string | number;
  date: string; // YYYY-MM-DD
  createdAt?: string;
  is_deleted?: boolean;
}



export interface SalesTeam {
  id?: number;
  teamName: string;
  leader: string;
  members: string[];
}

export interface SalesEmployee {
  id?: number;
  empId: string;
  name: string;
  designation: string;
  position: string;
  teamLeader: string;
  departmentHod: string;
}

export type ArchiveDataVerificationTab = 'records' | 'summary' | 'auditorInsights' | 'todayActivity' | 'accountsTransfer';

export interface ArchiveDataVerification {
    id: number;
    upload_date: string;
    upload_time: string;
    data_type: string;
    file_name: string;
    submitted_by: string;
    files_count: number;
    errors_count: number;
    remarks_on_errors: string;
    user_remarks?: string;
    check_status: 'Pending' | 'Checked' | 'On Hold' | 'Returned' | 'Re-Audit';
    check_date: string | null;
    check_time: string | null;
    checked_by: string | null;
    created_at?: string;
    status: 'Old Upload' | 'New Upload';
    // Department Transfer (Accounts & Finance or any other department)
    af_transfer_status?: 'Pending' | 'Transferred' | null;
    af_transferred_to?: string | null;
    af_transferred_by?: string | null;
    af_transfer_date?: string | null;
    af_transfer_time?: string | null;
    af_transfer_notes?: string | null;
    af_transfer_department?: string | null;
}

export interface AttendanceRecord {
    "Emp. Name": string;
    "Emp. Code": string;
    Designation?: string;
    "Total Working Day"?: string;
    [key: string]: string | undefined;
}

export interface ArchiveVerificationHistory {
    id: number;
    record_id: number;
    changed_by: string;
    old_status: string;
    new_status: string;
    old_remarks: string;
    new_remarks: string;
    change_date: string;
    change_time: string;
    created_at: string;
}

export interface CCTVFootageCheckReport {
    id: number;
    requisition_date: string;
    requested_by: string;
    designation: string;
    department: string;
    checking_code: string;
    checking_date: string;
    project_name: string;
    from_time: string;
    to_time: string;
    checking_purpose: string;
    report_link: string;
    camera_check_comments: string;
    checked_by: string;
    created_at?: string;
    updated_at?: string;
}

export interface GPDetail {
    gp_date: string;
    reference: string;
    updated_by?: string;
    issues_count?: number | null;
    remarks?: string;
    checked_by?: string;
    check_status?: 'Pending' | 'Checked' | 'Returned';
}

export interface FixedAssetGPVerification {
    id?: number;
    gp_details?: string | GPDetail[];
    gp_date: string;
    reference: string;
    updated_by: string;
    issues_count: number | null;
    remarks: string;
    checked_by: string;
    check_status?: string;
    created_at?: string;
    updated_at?: string;
}

export type RubbishStatus = 'Fine' | 'Offline' | 'Failed' | 'Hand Over' | 'GP Missing' | 'No Recorded' | 'Pending' | 'Camera Missing';

export interface RubbishVerification {
    id?: number;
    project_name: string;
    officers: string;
    designation: string;
    bill_no: string;
    bill: string;
    gp_no: string;
    truck_no: string;
    date: string;
    in_time: string;
    out_time: string;
    status: RubbishStatus;
    sg_presence: string;
    remarks: string;
    checked_by: string;
    check_date?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface AppNotification {
    id: number;
    recipient_id: number;
    sender_id: number | null;
    sender_name: string | null;
    type: 'adv_new_entry' | 'adv_completed' | 'adv_returned' | 'adv_re_audit' | string;
    title: string;
    message: string;
    link_view: string | null;
    link_state: string | null; // JSON string, e.g. {"checkStatus":"Pending","recordId":12}
    is_read: 0 | 1 | boolean;
    created_at: string;
}