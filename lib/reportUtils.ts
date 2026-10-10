
import _ from 'lodash';
import { EmployeeVisit, ReportData } from '../types';

export const parseDurationToSeconds = (durationStr: any): number => {
    if (durationStr === null || durationStr === undefined) return 0;
    if (typeof durationStr === 'number') return durationStr;
    if (typeof durationStr !== 'string') return 0;
    
    const cleanDuration = durationStr.split('(')[0].trim();
    if (!cleanDuration) return 0;
    
    const parts = cleanDuration.split(':');
    if (parts.length < 2) {
        const val = parseInt(cleanDuration, 10);
        return isNaN(val) ? 0 : val * 60;
    }

    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parts.length > 2 ? (parseInt(parts[2], 10) || 0) : 0;
    
    return hours * 3600 + minutes * 60 + seconds;
};

export const formatSecondsToHHMM = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const absSeconds = Math.abs(totalSeconds);

    const totalMinutes = Math.round(absSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const generateReportForEmployee = (employeeName: string, selectedMonth: string, allVisits: EmployeeVisit[], attendanceData: any[]): ReportData | null => {
    const [year, month] = selectedMonth.split('-').map(Number);
    
    const visitsInMonth = allVisits.filter(visit => {
        if (!visit.date) return false;
        const dateStr = String(visit.date);
        
        const employeeMatch = (visit.visitorName || '').trim() === employeeName.trim();
        if (!employeeMatch) return false;

        const match = dateStr.match(/^(\d{4})-(\d{2})/);
        if (match) {
            return parseInt(match[1]) === year && parseInt(match[2]) === month;
        }
        
        try {
            const d = new Date(dateStr);
            return d.getFullYear() === year && d.getMonth() + 1 === month;
        } catch (e) {
            return false;
        }
    });

    if (visitsInMonth.length === 0) return null;

    const perDayVisits = _.chain(visitsInMonth)
        .groupBy('date')
        .map((dayVisits, date) => ({
            date,
            visitCount: dayVisits.length,
            totalDuration: _.sumBy(dayVisits, v => parseDurationToSeconds(v.duration)),
        }))
        .orderBy('date', 'asc')
        .value();

    const totalVisitDays = perDayVisits.length;
    const totalProjectsVisited = _.uniqBy(visitsInMonth, 'projectName').length;
    const grandTotalDuration = _.sumBy(perDayVisits, 'totalDuration');

    const perProjectVisits = _.chain(visitsInMonth)
        .groupBy('projectName')
        .map((projectVisits, projectName) => ({
            projectName,
            visitCount: projectVisits.length,
            totalDuration: _.sumBy(projectVisits, v => parseDurationToSeconds(v.duration)),
        }))
        .orderBy('visitCount', 'desc')
        .value();

    const durationCounts: { [key: string]: number } = {
        'More than 20 Minutes': 0, '10–19 Minutes': 0, '5–9 Minutes': 0, 'Less than 5 Minutes': 0,
    };
    const improperVisits: EmployeeVisit[] = [];
    visitsInMonth.forEach(visit => {
        const seconds = parseDurationToSeconds(visit.duration);
        if (seconds === 0) {
            improperVisits.push(visit);
            return;
        }
        const minutes = seconds / 60;
        if (minutes > 20) durationCounts['More than 20 Minutes']++;
        else if (minutes >= 10) durationCounts['10–19 Minutes']++;
        else if (minutes >= 5) durationCounts['5–9 Minutes']++;
        else durationCounts['Less than 5 Minutes']++;
    });
    const durationCountsArray = Object.entries(durationCounts).map(([category, count]) => ({ category, count }));

    const dailyProjectsLog = _.chain(visitsInMonth).cloneDeep().orderBy('date', 'asc').map(v => ({ date: v.date, projectName: v.projectName })).value();

    const visitDates = new Set(visitsInMonth.map(v => v.date));
    const noVisitDays: { date: string; day: string; remark: string }[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const employeeAttendanceRecord = attendanceData.find(rec => rec['Emp. Name'] === employeeName);

    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month - 1, day);
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek >= 0 && dayOfWeek <= 4) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (!visitDates.has(dateStr)) {
                 const remark = employeeAttendanceRecord ? (employeeAttendanceRecord[String(day)] || '') : '';
                noVisitDays.push({ date: dateStr, day: dayNames[dayOfWeek], remark });
            }
        }
    }
    
    return {
        perDay: perDayVisits,
        summary: { totalVisitDays, totalProjectsVisited, grandTotalDuration },
        perProject: perProjectVisits,
        durationCounts: durationCountsArray,
        improperVisitCount: improperVisits.length,
        improperVisits,
        dailyProjects: dailyProjectsLog,
        noVisitDays,
    };
};
