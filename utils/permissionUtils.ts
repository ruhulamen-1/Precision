import { User, Permissions } from '../types';

export const getEffectivePermissions = (user: User): Permissions => {
    const { role, permissions } = user;
    
    // Super Admin and Admin have all permissions
    if (role === 'super_admin' || role === 'admin') {
        const fullPermissions: any = {};
        
        // Define all valid permission keys from the Permissions interface
        const allKeys = [
            'dashboard', 'lastVisitedProjects', 'projectCase', 'projectCasesList',
            'profile', 'adminPanel', 'materialReceive', 'materialReceiveList',
            'systemManagement_addProject', 'systemManagement_projectList', 'systemManagement_dashboardSettings',
            'employeeProjectVisit', 'employeeProjectVisit_import', 'employeeProjectVisit_template',
            'employeeProjectVisit_clear', 'allDepartmentSummary_exportPdfFull',
            'allDepartmentSummary_exportIndividualZip', 'allDepartmentSummary_mailReport',
            'allDepartmentSummary_exportExcel', 'allDepartmentSummary_saveSummary',
            'salesPersonProjectVisit', 'itResponseTimeline', 'erpCorrectionReport',
            'constructionDutyAnalysis', 'monthlyComparisonPrecision', 'ssvDutyAnalysis',
            'projectVisit', 'reportMailer', 'archiveDataVerification', 'cctvFootageCheckReports',
            'fixedAssetGPVerification', 'rubbishVerification', 'employeeCasualActivities', 'myDailyTask'
        ];
        
        allKeys.forEach(key => {
            // For special keys that need audit
            if (key === 'archiveDataVerification') {
                // editAll is a per-user toggle; only super admin gets it implicitly
                fullPermissions[key] = {
                    view: true,
                    edit: true,
                    audit: true,
                    editAll: role === 'super_admin' || !!permissions?.archiveDataVerification?.editAll,
                };
            } else if (['fixedAssetGPVerification', 'rubbishVerification'].includes(key)) {
                fullPermissions[key] = { view: true, edit: true, audit: true };
            } else if (['dashboard', 'lastVisitedProjects', 'projectCasesList', 'adminPanel', 'materialReceiveList', 
                         'reportMailer', 'employeeProjectVisit_import', 'employeeProjectVisit_template', 
                         'employeeProjectVisit_clear', 'allDepartmentSummary_exportPdfFull', 
                         'allDepartmentSummary_exportIndividualZip', 'allDepartmentSummary_mailReport', 
                         'allDepartmentSummary_exportExcel', 'allDepartmentSummary_saveSummary'].includes(key)) {
                fullPermissions[key] = { view: true };
            } else {
                fullPermissions[key] = { view: true, edit: true };
            }
        });
        
        return fullPermissions as Permissions;
    }
    
    // Regular users use their assigned permissions
    return permissions;
};

export const canEditUser = (currentUser: User, targetUser: User): boolean => {
    if (currentUser.role === 'super_admin') {
        // Super admin can edit anyone except other super admins (per requirement: no one can change their roles/perms)
        // Actually, "tar roles permissions kew poriborton korte parbe na" might mean NO ONE, including self/other super admins.
        return targetUser.role !== 'super_admin';
    }
    
    if (currentUser.role === 'admin') {
        // Admin can edit users, but not admins or super admins
        return targetUser.role === 'user';
    }
    
    return false;
};

export const canDeleteUser = (currentUser: User, targetUser: User): boolean => {
    // Same logic as edit
    if (targetUser.role === 'super_admin') return false;
    
    if (currentUser.role === 'super_admin') return true;
    
    if (currentUser.role === 'admin') {
        return targetUser.role === 'user';
    }
    
    return false;
};