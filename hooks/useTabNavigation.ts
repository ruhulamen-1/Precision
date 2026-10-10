import { useState, useEffect, useCallback } from 'react';
import {
    EmployeeVisitTab,
    SalesPersonVisitTab,
    ITResponseTimelineTab,
    ERPCorrectionTab,
    ConstructionDutyAnalysisTab,
    MonthlyComparisonPrecisionTab,
    SSVDutyAnalysisTab,
} from '../types';

export interface TabNavigationState {
    epv: EmployeeVisitTab;
    sppv: SalesPersonVisitTab;
    itrt: ITResponseTimelineTab;
    erp: ERPCorrectionTab;
    cda: ConstructionDutyAnalysisTab;
    mcp: MonthlyComparisonPrecisionTab;
    ssvDa: SSVDutyAnalysisTab;
}

export interface TabNavigationActions {
    setEpv: (tab: EmployeeVisitTab) => void;
    setSppv: (tab: SalesPersonVisitTab) => void;
    setItrt: (tab: ITResponseTimelineTab) => void;
    setErp: (tab: ERPCorrectionTab) => void;
    setCda: (tab: ConstructionDutyAnalysisTab) => void;
    setMcp: (tab: MonthlyComparisonPrecisionTab) => void;
    setSsvDa: (tab: SSVDutyAnalysisTab) => void;
    clearAll: () => void;
}

export interface TabNavigation {
    state: TabNavigationState;
    actions: TabNavigationActions;
}

function readLS<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    const saved = localStorage.getItem(key);
    return saved ? (saved as unknown as T) : fallback;
}

export function useTabNavigation(): TabNavigation {
    const [epv, setEpvRaw] = useState<EmployeeVisitTab>(() => readLS('epvActiveTab', 'records'));
    const [sppv, setSppvRaw] = useState<SalesPersonVisitTab>(() => readLS('sppvActiveTab', 'records'));
    const [itrt, setItrtRaw] = useState<ITResponseTimelineTab>(() => readLS('itrtActiveTab', 'records'));
    const [erp, setErpRaw] = useState<ERPCorrectionTab>(() => readLS('erpActiveTab', 'records'));
    const [cda, setCdaRaw] = useState<ConstructionDutyAnalysisTab>(() => readLS('cdaActiveTab', 'visit'));
    const [mcp, setMcpRaw] = useState<MonthlyComparisonPrecisionTab>(() => readLS('mcpActiveTab', 'records'));
    const [ssvDa, setSsvDaRaw] = useState<SSVDutyAnalysisTab>(() => readLS('ssvDaActiveTab', 'records'));

    // Persist all tabs to localStorage whenever any changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('epvActiveTab', epv);
        localStorage.setItem('sppvActiveTab', sppv);
        localStorage.setItem('itrtActiveTab', itrt);
        localStorage.setItem('erpActiveTab', erp);
        localStorage.setItem('cdaActiveTab', cda);
        localStorage.setItem('mcpActiveTab', mcp);
        localStorage.setItem('ssvDaActiveTab', ssvDa);
    }, [epv, sppv, itrt, erp, cda, mcp, ssvDa]);

    const clearAll = useCallback(() => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem('epvActiveTab');
        localStorage.removeItem('sppvActiveTab');
        localStorage.removeItem('itrtActiveTab');
        localStorage.removeItem('erpActiveTab');
        localStorage.removeItem('cdaActiveTab');
        localStorage.removeItem('mcpActiveTab');
        localStorage.removeItem('ssvDaActiveTab');
        // Reset to defaults
        setEpvRaw('records');
        setSppvRaw('records');
        setItrtRaw('records');
        setErpRaw('records');
        setCdaRaw('visit');
        setMcpRaw('records');
        setSsvDaRaw('records');
    }, []);

    return {
        state: { epv, sppv, itrt, erp, cda, mcp, ssvDa },
        actions: {
            setEpv: setEpvRaw,
            setSppv: setSppvRaw,
            setItrt: setItrtRaw,
            setErp: setErpRaw,
            setCda: setCdaRaw,
            setMcp: setMcpRaw,
            setSsvDa: setSsvDaRaw,
            clearAll,
        },
    };
}
