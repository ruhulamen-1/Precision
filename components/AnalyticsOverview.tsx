import React, { useMemo } from "react";
import {
  View,
  User,
  EmployeeVisit,
  SalesPersonVisit,
  ITAssignedIssue,
  MaterialReceiveItem,
  ERPCorrectionRecord,
  SalesTeam,
  ArchiveDataVerification,
} from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import _ from "lodash";
import {
  Users,
  Clock,
  TrendingUp,
  BarChart3,
  AlertCircle,
  HardHat,
  Database,
  Server,
  RotateCcw,
} from "lucide-react";

// --- Helper Functions ---
const parseDurationToSeconds = (durationStr: string): number => {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
};

const formatSecondsToHHMM = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const totalMinutes = Math.round(Math.abs(totalSeconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (
    !dateStr ||
    !timeStr ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
    !/^\d{1,2}:\d{2}/.test(timeStr)
  )
    return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(d.getTime())) return null;
  return d;
};

// --- Child Components for the new design ---
const RadialProgress = ({
  percentage,
  colorClass,
}: {
  percentage: number;
  colorClass: string;
}) => {
  const radius = 33;
  const circumference = 2 * Math.PI * radius;
  const clampedPercentage = Math.max(0, Math.min(percentage, 100));
  const offset = circumference - (clampedPercentage / 100) * circumference;

  return (
    <div className="relative h-20 w-20">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle
          className="text-black/10"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="40"
          cy="40"
        />
        <circle
          className={`${colorClass} animate-progress-draw`}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          style={{ "--progress-offset": offset } as React.CSSProperties}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="40"
          cy="40"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-lg font-bold ${colorClass}`}>
          {Math.round(clampedPercentage)}%
        </span>
      </div>
    </div>
  );
};

const MiniBarChart = ({ visits }: { visits: EmployeeVisit[] }) => {
  const chartData = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7)); // YYYY-MM
    }

    const counts = months.map(
      (m) => visits.filter((v) => v.date.startsWith(m)).length,
    );
    const max = Math.max(...counts, 1);
    return { counts, max, currentMonth: months[5] };
  }, [visits]);

  const width = 80;
  const height = 60;
  const barGap = 4;
  const barWidth = (width - barGap * 5) / 6;

  return (
    <div className="h-[60px] w-[80px] flex items-end">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {chartData.counts.map((count, i) => {
          const barHeight = (count / chartData.max) * height;
          const isCurrent = i === 5;
          return (
            <rect
              key={i}
              x={i * (barWidth + barGap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx="2"
              className={isCurrent ? "fill-orange-500" : "fill-slate-300"}
            />
          );
        })}
      </svg>
    </div>
  );
};

interface AnalyticsCardProps {
  title: string;
  icon: React.ReactNode;
  mainStat: React.ReactNode;
  description: string;
  details: { label: string; value: React.ReactNode }[];
  colorScheme: string;
  onNavigate: () => void;
  permission: boolean;
  customVisual?: React.ReactNode;
  isLoading?: boolean;
}

const SkeletonCard = () => (
  <div className="relative bg-white/40 dark:bg-white/5 backdrop-blur-md p-5 rounded-2xl shadow-lg border border-black/5 overflow-hidden flex flex-col justify-between h-[300px] animate-pulse">
    <div className="flex items-start justify-between">
      <div className="h-6 w-1/2 bg-slate-200 rounded"></div>
      <div className="h-10 w-10 bg-slate-200 rounded"></div>
    </div>
    <div className="my-4">
      <div className="h-12 w-3/4 bg-slate-200 rounded"></div>
      <div className="h-4 w-1/2 bg-slate-200 rounded mt-2"></div>
    </div>
    <div className="mt-auto space-y-2">
      <div className="h-8 w-full bg-slate-100 rounded"></div>
      <div className="h-8 w-full bg-slate-100 rounded"></div>
    </div>
  </div>
);

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  icon,
  mainStat,
  description,
  details,
  colorScheme,
  onNavigate,
  permission,
  customVisual,
  isLoading,
}) => {
  if (isLoading) return <SkeletonCard />;

  const schemes: Record<
    string,
    {
      gradient: string;
      text: string;
      iconBg: string;
      iconText: string;
      mainStatText: string;
      descriptionText: string;
      detailBg: string;
      detailLabelText: string;
      detailValueText: string;
      buttonBg: string;
      buttonText: string;
      buttonHoverBg: string;
    }
  > = {
    blue: {
      gradient:
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white",
      text: "text-slate-800 dark:text-slate-100",
      iconBg: "bg-blue-50",
      iconText: "text-blue-600",
      mainStatText: "text-slate-900 font-bold",
      descriptionText: "text-slate-500 dark:text-slate-400",
      detailBg: "bg-blue-50/50",
      detailLabelText:
        "text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px]",
      detailValueText: "text-slate-700 dark:text-slate-200 font-medium",
      buttonBg: "bg-blue-500",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-blue-600",
    },
    green: {
      gradient:
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white",
      text: "text-slate-800 dark:text-slate-100",
      iconBg: "bg-green-50",
      iconText: "text-green-600",
      mainStatText: "text-slate-900 font-bold",
      descriptionText: "text-slate-500 dark:text-slate-400",
      detailBg: "bg-green-50/50",
      detailLabelText:
        "text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px]",
      detailValueText: "text-slate-700 dark:text-slate-200 font-medium",
      buttonBg: "bg-green-500",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-green-600",
    },
    purple: {
      gradient:
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white",
      text: "text-slate-800 dark:text-slate-100",
      iconBg: "bg-purple-50",
      iconText: "text-purple-600",
      mainStatText: "text-slate-900 font-bold",
      descriptionText: "text-slate-500 dark:text-slate-400",
      detailBg: "bg-purple-50/50",
      detailLabelText:
        "text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px]",
      detailValueText: "text-slate-700 dark:text-slate-200 font-medium",
      buttonBg: "bg-purple-500",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-purple-600",
    },
    amber: {
      gradient:
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white",
      text: "text-slate-800 dark:text-slate-100",
      iconBg: "bg-amber-50 dark:bg-amber-900/20",
      iconText: "text-amber-600",
      mainStatText: "text-slate-900 font-bold",
      descriptionText: "text-slate-500 dark:text-slate-400",
      detailBg: "bg-amber-50/50",
      detailLabelText:
        "text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px]",
      detailValueText: "text-slate-700 dark:text-slate-200 font-medium",
      buttonBg: "bg-amber-50 dark:bg-amber-900/200",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-amber-600",
    },
    rose: {
      gradient:
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white",
      text: "text-slate-800 dark:text-slate-100",
      iconBg: "bg-rose-50 dark:bg-rose-900/20",
      iconText: "text-rose-600",
      mainStatText: "text-slate-900 font-bold",
      descriptionText: "text-slate-500 dark:text-slate-400",
      detailBg: "bg-rose-50/50",
      detailLabelText:
        "text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px]",
      detailValueText: "text-slate-700 dark:text-slate-200 font-medium",
      buttonBg: "bg-rose-50 dark:bg-rose-900/200",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-rose-600",
    },
    teal: {
      gradient:
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white",
      text: "text-slate-800 dark:text-slate-100",
      iconBg: "bg-teal-50",
      iconText: "text-teal-600",
      mainStatText: "text-slate-900 font-bold",
      descriptionText: "text-slate-500 dark:text-slate-400",
      detailBg: "bg-teal-50/50",
      detailLabelText:
        "text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px]",
      detailValueText: "text-slate-700 dark:text-slate-200 font-medium",
      buttonBg: "bg-teal-500",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-teal-600",
    },
    slate: {
      gradient: "from-slate-50 to-gray-100",
      text: "text-slate-900",
      iconBg: "bg-slate-200/80",
      iconText: "text-slate-600 dark:text-slate-300",
      mainStatText: "text-slate-900",
      descriptionText: "text-slate-800 dark:text-slate-100/90",
      detailBg: "bg-slate-100/50",
      detailLabelText: "text-slate-700 dark:text-slate-200",
      detailValueText: "text-slate-900",
      buttonBg: "bg-slate-50 dark:bg-slate-800/500",
      buttonText: "text-white",
      buttonHoverBg: "hover:bg-slate-600",
    },
  };

  const currentScheme = schemes[colorScheme];

  return (
    <div
      className={`relative bg-gradient-to-br ${currentScheme.gradient} p-5 rounded-2xl shadow-lg border border-black/5 overflow-hidden flex flex-col justify-between transition-all duration-300 transform hover:scale-[1.03] hover:shadow-2xl h-full`}
    >
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between">
          <h3
            className={`text-lg font-bold tracking-wide ${currentScheme.text}`}
          >
            {title}
          </h3>
          <div
            className={`flex-shrink-0 h-10 w-10 rounded-lg ${currentScheme.iconBg} ${currentScheme.iconText} flex items-center justify-center shadow-inner`}
          >
            {icon}
          </div>
        </div>

        {/* Main Content */}
        <div className="relative flex-grow my-4 flex items-center justify-between">
          <div className="flex-1">
            <div
              className={`text-5xl font-extrabold drop-shadow-sm dark:shadow-slate-900/50 ${currentScheme.mainStatText}`}
            >
              {mainStat}
            </div>
            <p
              className={`text-sm font-medium ${currentScheme.descriptionText} mt-1`}
            >
              {description}
            </p>
          </div>
          {customVisual && (
            <div className="flex-shrink-0 -mr-3">{customVisual}</div>
          )}
        </div>

        {/* Details Footer */}
        <div className="mt-auto space-y-2">
          {details.map((stat) => (
            <div
              key={stat.label}
              className={`flex justify-between items-baseline text-sm ${currentScheme.detailBg} px-3 py-1.5 rounded-md`}
            >
              <dt className={`font-medium ${currentScheme.detailLabelText}`}>
                {stat.label}
              </dt>
              <dd
                className={`font-semibold truncate ${currentScheme.detailValueText}`}
                title={
                  React.isValidElement(stat.value)
                    ? undefined
                    : String(stat.value ?? "")
                }
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </div>
      </div>
      {permission && (
        <button
          onClick={onNavigate}
          className={`relative z-10 mt-5 w-full text-center py-2.5 ${currentScheme.buttonBg} ${currentScheme.buttonText} font-bold rounded-lg text-sm ${currentScheme.buttonHoverBg} transition-all duration-200 shadow-md hover:shadow-lg`}
        >
          View Details &rarr;
        </button>
      )}
    </div>
  );
};

interface AnalyticsOverviewProps {
  onNavigate: (view: View, state?: any) => void;
  currentUser: User;
  employeeVisits: EmployeeVisit[];
  salesPersonVisits: SalesPersonVisit[];
  itAssignedIssues: ITAssignedIssue[];
  materialReceipts: MaterialReceiveItem[];
  erpCorrectionRecords: ERPCorrectionRecord[];
  salesTeams: SalesTeam[];
  archiveRecords: ArchiveDataVerification[];
  isLoading?: boolean;
}

const invalidCustomerNames = new Set(["self", "n/a", "-", ""]);

const calculateDurationInMinutes = (
  inTime: string,
  outTime: string,
): number | null => {
  if (
    !inTime ||
    !outTime ||
    inTime.toLowerCase() === "n/a" ||
    outTime.toLowerCase() === "n/a"
  ) {
    return null;
  }
  const timeRegex = /^(\d{1,2}):(\d{2})/;
  const inMatch = String(inTime).match(timeRegex);
  const outMatch = String(outTime).match(timeRegex);
  if (!inMatch || !outMatch) return null;
  const inDate = new Date(0);
  inDate.setHours(parseInt(inMatch[1], 10), parseInt(inMatch[2], 10), 0, 0);
  const outDate = new Date(0);
  outDate.setHours(parseInt(outMatch[1], 10), parseInt(outMatch[2], 10), 0, 0);
  if (outDate < inDate) return null;
  const diffMs = outDate.getTime() - inDate.getTime();
  return Math.round(diffMs / 60000);
};

// --- Main Component ---
const AnalyticsOverview: React.FC<AnalyticsOverviewProps> = ({
  currentUser,
  onNavigate,
  employeeVisits,
  salesPersonVisits,
  itAssignedIssues,
  materialReceipts,
  erpCorrectionRecords,
  salesTeams,
  archiveRecords,
  isLoading = false,
}) => {
  const permissions = getEffectivePermissions(currentUser);

  // --- Summarization Logic ---
  const archiveReturnSummary = useMemo(() => {
    // filter for records belonging to the current user that are returned
    const myReturned = archiveRecords.filter(
      (r) =>
        r.submitted_by === currentUser.name && r.check_status === "Returned",
    );
    const myPending = archiveRecords.filter(
      (r) =>
        r.submitted_by === currentUser.name && r.check_status === "Pending",
    );
    return {
      myReturnedCount: myReturned.length,
      myPendingCount: myPending.length,
      totalMyRecords: archiveRecords.filter(
        (r) => r.submitted_by === currentUser.name,
      ).length,
    };
  }, [archiveRecords, currentUser.name]);

  const auditTasksSummary = useMemo(() => {
    const reAudit = archiveRecords.filter((r) => r.check_status === "Re-Audit");
    const pending = archiveRecords.filter((r) => r.check_status === "Pending");
    return {
      reAuditCount: reAudit.length,
      pendingCount: pending.length,
    };
  }, [archiveRecords]);

  const employeeVisitSummary = useMemo(() => {
    const totalVisits = employeeVisits.length;
    const durationCounts = {
      "Under 5m": employeeVisits.filter(
        (v) => parseDurationToSeconds(v.duration) < 300,
      ).length,
      "5-19m": employeeVisits.filter((v) => {
        const s = parseDurationToSeconds(v.duration);
        return s >= 300 && s < 1200;
      }).length,
      "Over 20m": employeeVisits.filter(
        (v) => parseDurationToSeconds(v.duration) >= 1200,
      ).length,
    };
    const topCategory = (Object.entries(durationCounts).sort(
      (a, b) => b[1] - a[1],
    )[0] || ["N/A"])[0];
    const totalDurationSec = _.sumBy(employeeVisits, (v) =>
      parseDurationToSeconds(v.duration),
    );

    return {
      totalVisits,
      uniqueEmployees: _.uniq(employeeVisits.map((v) => v.visitorName)).length,
      uniqueProjects: _.uniq(employeeVisits.map((v) => v.projectName)).length,
      totalDuration: formatSecondsToHHMM(totalDurationSec),
      avgDuration: formatSecondsToHHMM(
        totalVisits > 0 ? totalDurationSec / totalVisits : 0,
      ),
      busiestDay: (_.chain(employeeVisits)
        .countBy("date")
        .toPairs()
        .maxBy(1)
        .value() || ["N/A"])[0],
      durationCounts,
      topCategory,
    };
  }, [employeeVisits]);

  const monthlyComparisonSummary = useMemo(() => {
    const [year, month] = new Date()
      .toISOString()
      .slice(0, 7)
      .split("-")
      .map(Number);
    const currentMonthStr = `${year}-${String(month).padStart(2, "0")}`;
    const lastMonthDate = new Date(year, month - 2, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const currentVisits = employeeVisits.filter((v) =>
      v.date.startsWith(currentMonthStr),
    );
    const lastMonthVisits = employeeVisits.filter((v) =>
      v.date.startsWith(lastMonthStr),
    );
    const currentDuration = _.sumBy(currentVisits, (v) =>
      parseDurationToSeconds(v.duration),
    );
    const lastMonthDuration = _.sumBy(lastMonthVisits, (v) =>
      parseDurationToSeconds(v.duration),
    );
    const stability =
      lastMonthDuration > 0
        ? ((currentDuration - lastMonthDuration) / lastMonthDuration) * 100
        : currentDuration > 0
          ? 100
          : 0;

    return {
      stability,
      currentDuration: formatSecondsToHHMM(currentDuration),
      lastMonthDuration: formatSecondsToHHMM(lastMonthDuration),
    };
  }, [employeeVisits]);

  const salesPersonVisitSummary = useMemo(() => {
    // Engagement Metrics
    const visitsWithDuration = salesPersonVisits
      .map((v) => ({
        ...v,
        duration: calculateDurationInMinutes(v.inTime, v.outTime),
      }))
      .filter((v) => v.duration !== null && v.duration >= 0);

    const totalDurationMinutes = _.sumBy(visitsWithDuration, "duration");
    const avgDurationMinutes =
      visitsWithDuration.length > 0
        ? totalDurationMinutes / visitsWithDuration.length
        : 0;

    const busiestProjectEntry = _.chain(salesPersonVisits)
      .countBy("projectName")
      .toPairs()
      .maxBy(1)
      .value();

    // Team Metrics
    const memberToTeamMap: { [key: string]: string } = {};
    salesTeams.forEach((team) => {
      team.members.forEach((member) => {
        memberToTeamMap[member] = team.teamName;
      });
    });

    const visitsWithTeam = salesPersonVisits.map((v) => ({
      ...v,
      teamName: memberToTeamMap[v.salesPersonName] || "Unassigned",
    }));

    const teamVisitCounts = _.countBy(visitsWithTeam, "teamName");
    const topTeamEntry = _.chain(teamVisitCounts)
      .toPairs()
      .omit(["Unassigned"])
      .maxBy(1)
      .value();

    let topMemberInTopTeam = "N/A";
    if (topTeamEntry) {
      const topTeamVisits = visitsWithTeam.filter(
        (v) => v.teamName === topTeamEntry[0],
      );
      const topMemberEntry = _.chain(topTeamVisits)
        .countBy("salesPersonName")
        .toPairs()
        .maxBy(1)
        .value() as [string, number] | undefined;
      if (topMemberEntry) {
        topMemberInTopTeam = topMemberEntry[0];
      }
    }

    // General Summary
    const uniqueCustomers = _.uniqBy(
      salesPersonVisits.filter(
        (v) =>
          v.customerName &&
          !invalidCustomerNames.has(v.customerName.toLowerCase().trim()),
      ),
      "customerId",
    ).length;

    return {
      totalVisits: salesPersonVisits.length,
      uniqueCustomers: uniqueCustomers,
      uniqueProjects: _.uniq(salesPersonVisits.map((v) => v.projectName))
        .length,
      topTeamName: topTeamEntry ? topTeamEntry[0] : "N/A",
      topTeamVisits: topTeamEntry ? (topTeamEntry[1] as number) : 0,
      topMemberInTopTeam,
      totalDuration: formatSecondsToHHMM(totalDurationMinutes * 60),
      avgDuration: `${Math.round(avgDurationMinutes)} min`,
      busiestProject: busiestProjectEntry ? busiestProjectEntry[0] : "N/A",
    };
  }, [salesPersonVisits]);

  const itSummary = useMemo(() => {
    const totalIssues = itAssignedIssues.length;
    if (totalIssues === 0) {
      return {
        openIssues: 0,
        totalIssues: 0,
        resolutionRate: 0,
        topZone: { name: "N/A", count: 0, projects: 0 },
        mostFrequent: { name: "N/A", count: 0, topProject: "N/A" },
      };
    }

    const openIssues = itAssignedIssues.filter(
      (i) => i.status === "Issue",
    ).length;
    const resolvedIssues = totalIssues - openIssues;
    const resolutionRate = (resolvedIssues / totalIssues) * 100;

    const topZoneEntry = _.chain(itAssignedIssues)
      .groupBy("zone")
      .map((issuesInZone, zoneName) => ({
        name: zoneName,
        count: issuesInZone.length,
        projects: _.uniq(issuesInZone.map((i) => i.projectName)).length,
      }))
      .orderBy(["count"], ["desc"])
      .first()
      .value();

    const mostFrequentEntry = _.chain(itAssignedIssues)
      .groupBy("issue")
      .map((issues, issueName) => ({
        name: issueName,
        count: issues.length,
        topProject: (_.chain(issues)
          .countBy("projectName")
          .toPairs()
          .maxBy(1)
          .value() || ["N/A"])[0],
      }))
      .orderBy(["count"], ["desc"])
      .first()
      .value();

    return {
      openIssues,
      totalIssues,
      resolutionRate,
      topZone: topZoneEntry || { name: "N/A", count: 0, projects: 0 },
      mostFrequent: mostFrequentEntry || {
        name: "N/A",
        count: 0,
        topProject: "N/A",
      },
    };
  }, [itAssignedIssues]);

  const constructionAnalysisSummary = useMemo(() => {
    const rmcData = materialReceipts.filter((m) =>
      m.materialName?.toLowerCase().includes("rmc"),
    );
    if (rmcData.length === 0 || employeeVisits.length === 0)
      return { totalRMC: rmcData.length, matches: 0, matchRate: 0 };

    let matches = 0;
    rmcData.forEach((material) => {
      const materialDateTime = parseDateTime(
        material.receivingDate,
        material.receivingTime,
      );
      if (!materialDateTime) return;
      const windowStart = new Date(materialDateTime.getTime() - 30 * 60 * 1000);
      const windowEnd = new Date(materialDateTime.getTime() + 30 * 60 * 1000);
      if (
        employeeVisits.some(
          (v) =>
            v.projectName === material.projectName &&
            v.date === material.receivingDate &&
            parseDateTime(v.date, v.entryTime)! <= windowEnd &&
            parseDateTime(v.date, v.outTime)! >= windowStart,
        )
      ) {
        matches++;
      }
    });

    return {
      totalRMC: rmcData.length,
      matches,
      matchRate: rmcData.length > 0 ? (matches / rmcData.length) * 100 : 0,
    };
  }, [materialReceipts, employeeVisits]);

  const erpCorrectionSummary = useMemo(() => {
    const totalReports = erpCorrectionRecords.length;
    const pendingReports = erpCorrectionRecords.filter(
      (r) => r.status === "Pending",
    ).length;

    let topDepartment = "N/A";
    if (totalReports > 0) {
      const countsByDept = _.countBy(erpCorrectionRecords, "department");
      const pairs = _.toPairs(countsByDept);
      const topPair = _.maxBy(pairs, (pair) => pair[1]);
      if (topPair) {
        topDepartment = topPair[0];
      }
    }

    const completedThisMonth = erpCorrectionRecords.filter((r) => {
      if (r.status !== "Completed" || !r.completedDate) return false;
      const completedDate = new Date(r.completedDate);
      const today = new Date();
      return (
        completedDate.getFullYear() === today.getFullYear() &&
        completedDate.getMonth() === today.getMonth()
      );
    }).length;

    return {
      totalReports,
      pendingReports,
      topDepartment,
      completedThisMonth,
    };
  }, [erpCorrectionRecords]);

  // --- Card Definitions ---
  const stabilityValue = monthlyComparisonSummary.stability;
  const stabilityText = `${Math.abs(stabilityValue).toFixed(1)}%`;
  const StabilityIcon =
    stabilityValue > 0
      ? () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )
      : stabilityValue < 0
        ? () => (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )
        : () => (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          );
  const stabilityColor =
    stabilityValue > 0
      ? "text-green-600"
      : stabilityValue < 0
        ? "text-red-600"
        : "text-amber-600";

  const surveillanceCards = [
    permissions.employeeProjectVisit?.view && {
      title: "Total Visits",
      icon: <Users className="h-6 w-6" />,
      colorScheme: "blue",
      mainStat: employeeVisitSummary.totalVisits,
      description: "Recorded Visits",
      details: [
        {
          label: "Unique Employees",
          value: employeeVisitSummary.uniqueEmployees,
        },
        {
          label: "Unique Projects",
          value: employeeVisitSummary.uniqueProjects,
        },
      ],
      permission: true,
      onNavigate: () => onNavigate("employeeProjectVisit"),
    },
    permissions.employeeProjectVisit?.view && {
      title: "Visit Duration",
      icon: <Clock className="h-6 w-6" />,
      colorScheme: "purple",
      mainStat: employeeVisitSummary.totalDuration,
      description: "Total Hours On-Site",
      details: [
        {
          label: "Avg. Duration",
          value: `${employeeVisitSummary.avgDuration} hrs`,
        },
        { label: "Busiest Day", value: employeeVisitSummary.busiestDay },
      ],
      permission: true,
      onNavigate: () => onNavigate("employeeProjectVisit"),
    },
    permissions.monthlyComparisonPrecision?.view && {
      title: "Performance Stability",
      icon: <TrendingUp className="h-6 w-6" />,
      colorScheme: "green",
      mainStat: (
        <div className={`flex items-center gap-2 ${stabilityColor}`}>
          <StabilityIcon />
          {stabilityText}
        </div>
      ),
      description: "vs. Last Month",
      details: [
        {
          label: "Current Month Duration",
          value: `${monthlyComparisonSummary.currentDuration} hrs`,
        },
        {
          label: "Last Month Duration",
          value: `${monthlyComparisonSummary.lastMonthDuration} hrs`,
        },
      ],
      permission: true,
      onNavigate: () => onNavigate("monthlyComparisonPrecision"),
      customVisual: <MiniBarChart visits={employeeVisits} />,
    },
    permissions.salesPersonProjectVisit?.view && {
      title: "Sales Visit Summary",
      icon: <BarChart3 className="h-6 w-6" />,
      colorScheme: "purple",
      mainStat: salesPersonVisitSummary.totalVisits,
      description: "Total Recorded Visits",
      details: [
        {
          label: "Unique Customers",
          value: salesPersonVisitSummary.uniqueCustomers,
        },
        {
          label: "Unique Projects",
          value: salesPersonVisitSummary.uniqueProjects,
        },
      ],
      permission: true,
      onNavigate: () => onNavigate("salesPersonProjectVisit"),
    },
    permissions.itResponseTimeline?.view && {
      title: "IT Issue Summary",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path
            fillRule="evenodd"
            d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
            clipRule="evenodd"
          />
        </svg>
      ),
      colorScheme: "amber",
      mainStat: itSummary.openIssues,
      description: "Currently Open Issues",
      details: [
        { label: "Total Recorded", value: itSummary.totalIssues },
        {
          label: "Resolution Rate",
          value: `${itSummary.resolutionRate.toFixed(1)}%`,
        },
      ],
      permission: true,
      onNavigate: () => onNavigate("itResponseTimeline"),
    },
    permissions.constructionDutyAnalysis?.view && {
      title: "RMC Duty Analysis",
      icon: <HardHat className="h-6 w-6" />,
      colorScheme: "rose",
      mainStat: `${constructionAnalysisSummary.matchRate.toFixed(1)}%`,
      description: "RMC Visit Match Rate",
      details: [
        {
          label: "RMC Deliveries",
          value: constructionAnalysisSummary.totalRMC,
        },
        {
          label: "Matching Visits",
          value: constructionAnalysisSummary.matches,
        },
      ],
      permission: permissions.constructionDutyAnalysis?.view,
      onNavigate: () => onNavigate("constructionDutyAnalysis"),
      customVisual: (
        <RadialProgress
          percentage={constructionAnalysisSummary.matchRate}
          colorClass="text-rose-500"
        />
      ),
    },
  ].filter(Boolean);

  const erpCard = permissions.erpCorrectionReport?.view
    ? {
        // FIX: The error "Type 'string | number' is not assignable to type 'string'" occurs because the `details` array has values of mixed types (number and string). Explicitly converting all values to strings resolves this TypeScript inference issue.
        title: "ERP Corrections",
        icon: <Database className="h-6 w-6" />,
        colorScheme: "teal",
        mainStat: erpCorrectionSummary.pendingReports,
        description: "Pending Reports",
        details: [
          {
            label: "Total Recorded",
            value: String(erpCorrectionSummary.totalReports),
          },
          {
            label: "Completed (This Month)",
            value: String(erpCorrectionSummary.completedThisMonth),
          },
          {
            label: "Top Dept. with Issues",
            value: _.truncate(String(erpCorrectionSummary.topDepartment), {
              length: 24,
            }),
          },
        ],
        permission: permissions.erpCorrectionReport?.view,
        onNavigate: () => onNavigate("erpCorrectionReport"),
      }
    : null;

  const actionItemsCard =
    archiveReturnSummary.myReturnedCount > 0
      ? {
          title: "Action Required",
          icon: <RotateCcw className="h-6 w-6" />,
          colorScheme: "rose",
          mainStat: archiveReturnSummary.myReturnedCount,
          description: "Returned Records",
          details: [
            {
              label: "My Pending",
              value: String(archiveReturnSummary.myPendingCount),
            },
            {
              label: "My Total Submissions",
              value: String(archiveReturnSummary.totalMyRecords),
            },
          ],
          permission: permissions.archiveDataVerification?.view,
          onNavigate: () =>
            onNavigate("archiveDataVerification", { status: "Returned" }),
        }
      : null;

  const auditAlertCard =
    permissions.archiveDataVerification?.audit &&
    auditTasksSummary.reAuditCount > 0
      ? {
          title: "Audit Required",
          icon: <RotateCcw className="h-6 w-6" />,
          colorScheme: "blue",
          mainStat: auditTasksSummary.reAuditCount,
          description: "Re-Audit Files",
          details: [
            {
              label: "New Pending",
              value: String(auditTasksSummary.pendingCount),
            },
            {
              label: "Total Tasks",
              value: String(
                auditTasksSummary.reAuditCount + auditTasksSummary.pendingCount,
              ),
            },
          ],
          permission: permissions.archiveDataVerification?.view,
          onNavigate: () =>
            onNavigate("archiveDataVerification", { status: "Re-Audit" }),
        }
      : null;

  const hasAlerts = !!actionItemsCard || !!auditAlertCard;

  const hasSurveillancePermission = surveillanceCards.length > 0;
  const hasErpPermission = !!erpCard;

  return (
    <div className="space-y-12">
      {hasAlerts && (
        <div>
          <h4
            className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-4 pb-2 border-b border-rose-200 animate-card-fade-in-up"
            style={{ animationDelay: "0.1s" }}
          >
            Alerts & Tasks
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {actionItemsCard && (
              <div
                className="animate-card-fade-in-up"
                style={{ animationDelay: "0.2s" }}
              >
                <AnalyticsCard {...actionItemsCard} isLoading={isLoading} />
              </div>
            )}
            {auditAlertCard && (
              <div
                className="animate-card-fade-in-up"
                style={{ animationDelay: "0.25s" }}
              >
                <AnalyticsCard {...auditAlertCard} isLoading={isLoading} />
              </div>
            )}
          </div>
        </div>
      )}

      {hasSurveillancePermission && (
        <div>
          <h4
            className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 animate-card-fade-in-up"
            style={{ animationDelay: "0.2s" }}
          >
            Surveillance Report Summary
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {surveillanceCards.map((card: any, index) => (
              <div
                key={card.title}
                className="animate-card-fade-in-up"
                style={{ animationDelay: `${0.3 + index * 0.05}s` }}
              >
                <AnalyticsCard {...card} isLoading={isLoading} />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasErpPermission && erpCard && (
        <div>
          <h4
            className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 animate-card-fade-in-up"
            style={{ animationDelay: "0.4s" }}
          >
            ERP Correction Summary
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div
              className="animate-card-fade-in-up"
              style={{ animationDelay: "0.5s" }}
            >
              <AnalyticsCard {...erpCard} isLoading={isLoading} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsOverview;
