import { ITAssignedIssue } from "../types";

/**
 * IT Response Timeline analytics.
 *
 * The source data is a daily log: one row per issue per day it was observed.
 * Rows are first de-duplicated, then consecutive days are merged into
 * *incidents* (an issue at a project from first sighting until it stops being
 * logged). All KPIs are incident based, so one long-running issue no longer
 * counts once per day. Explicit `resolvedAt` / `acknowledgedAt` values win over
 * the inferred ones whenever the CSV supplies them.
 */

export const DAY_MS = 86_400_000;
/** Missing working days (Sun–Thu) tolerated inside a single incident (skipped log). */
export const MISSED_LOG_TOLERANCE_DAYS = 1;
/** Weekend days as UTC day-of-week (0 = Sun): Friday and Saturday. */
const WEEKEND_DAYS = new Set([5, 6]);
/** An incident re-appearing within this many days of the previous one counts as a repeat. */
export const REPEAT_WINDOW_DAYS = 30;

export const normalizeText = (s?: string | null): string =>
  (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "")
    .trim();

/** UTC-midnight timestamp of a date. */
export const dayStart = (d: Date | number): number => {
  const date = typeof d === "number" ? new Date(d) : d;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

export const monthKeyOf = (d: Date | number): string => {
  const date = typeof d === "number" ? new Date(d) : d;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthBounds = (month: string): { start: number; end: number } => {
  const [y, m] = month.split("-").map(Number);
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 0) };
};

const previousMonthKey = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return monthKeyOf(Date.UTC(y, m - 2, 1));
};

/** Re-creates Date fields after the issue crossed JSON. */
export const hydrateITIssue = (raw: any): ITAssignedIssue => ({
  ...raw,
  reportedAt: new Date(raw.reportedAt),
  acknowledgedAt: raw.acknowledgedAt ? new Date(raw.acknowledgedAt) : null,
  resolvedAt: raw.resolvedAt ? new Date(raw.resolvedAt) : null,
  deviceCount:
    raw.deviceCount === null || raw.deviceCount === undefined ? null : Number(raw.deviceCount),
});

/** Identity of a log row: same day + project + issue text. */
export const rowKey = (i: ITAssignedIssue): string =>
  `${dayStart(i.reportedAt)}|${normalizeText(i.projectName)}|${normalizeText(i.issue)}`;

/** Removes duplicate log rows (e.g. the same CSV uploaded twice), keeping the richest data. */
export const dedupeIssues = (
  issues: ITAssignedIssue[],
): { rows: ITAssignedIssue[]; duplicatesRemoved: number } => {
  const byKey = new Map<string, ITAssignedIssue>();
  let duplicatesRemoved = 0;
  for (const issue of issues) {
    const key = rowKey(issue);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, issue);
      continue;
    }
    duplicatesRemoved++;
    const merged: any = { ...existing };
    for (const field of [
      "reportedTime",
      "acknowledgedAt",
      "resolvedAt",
      "category",
      "priority",
      "rootCause",
      "resolvedBy",
      "deviceCount",
    ] as const) {
      if (merged[field] == null || merged[field] === "") merged[field] = (issue as any)[field];
    }
    byKey.set(key, merged);
  }
  return { rows: Array.from(byKey.values()), duplicatesRemoved };
};

export interface ITIncident {
  id: string;
  issue: string;
  projectName: string;
  zone: string;
  status: "Issue" | "Offline";
  assignedTo: string;
  category: string | null;
  priority: string | null;
  rootCause: string | null;
  resolvedBy: string | null;
  deviceCount: number | null;
  start: Date;
  /** Last day the incident was logged */
  end: Date;
  /** Distinct days with a log row */
  loggedDays: number;
  /** Calendar days from first to last log (inclusive) */
  spanDays: number;
  isOpen: boolean;
  resolvedOn: Date | null;
  resolutionSource: "recorded" | "inferred" | null;
  /** Inclusive days from start to resolution; null while open */
  resolutionDays: number | null;
  ackHours: number | null;
  isRepeat: boolean;
  rows: ITAssignedIssue[];
}

const workingDaysBetween = (fromExclusive: number, toExclusive: number): number => {
  let missing = 0;
  for (let t = fromExclusive + DAY_MS; t < toExclusive; t += DAY_MS) {
    if (!WEEKEND_DAYS.has(new Date(t).getUTCDay())) missing++;
  }
  return missing;
};

const latestNonEmpty = <T,>(rows: ITAssignedIssue[], pick: (r: ITAssignedIssue) => T | null | undefined): T | null => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = pick(rows[i]);
    if (v !== null && v !== undefined && (v as any) !== "") return v;
  }
  return null;
};

const parseClock = (t?: string | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? (h * 60 + min) * 60_000 : null;
};

/** Merges de-duplicated daily rows into incidents. `refDay` = last day with any log. */
export const buildIncidents = (rows: ITAssignedIssue[], refDay: number): ITIncident[] => {
  const groups = new Map<string, ITAssignedIssue[]>();
  for (const r of rows) {
    const key = `${normalizeText(r.projectName)}\u0001${normalizeText(r.issue)}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const incidents: ITIncident[] = [];

  groups.forEach((groupRows, groupKey) => {
    const sorted = [...groupRows].sort((a, b) => dayStart(a.reportedAt) - dayStart(b.reportedAt));

    const runs: ITAssignedIssue[][] = [];
    let current: ITAssignedIssue[] = [];
    let prevDay: number | null = null;
    for (const r of sorted) {
      const d = dayStart(r.reportedAt);
      if (prevDay !== null && workingDaysBetween(prevDay, d) > MISSED_LOG_TOLERANCE_DAYS) {
        runs.push(current);
        current = [];
      }
      current.push(r);
      prevDay = d;
    }
    if (current.length) runs.push(current);

    let previousEnd: number | null = null;
    for (const run of runs) {
      const startMs = dayStart(run[0].reportedAt);
      const endMs = dayStart(run[run.length - 1].reportedAt);
      const loggedDays = new Set(run.map((r) => dayStart(r.reportedAt))).size;
      const spanDays = (endMs - startMs) / DAY_MS + 1;

      // Resolution: recorded resolvedAt wins, unless the issue kept being logged after it.
      let resolvedMs: number | null = null;
      for (const r of run) {
        if (r.resolvedAt) {
          const d = dayStart(r.resolvedAt);
          if (d >= endMs && d >= startMs && (resolvedMs === null || d > resolvedMs)) resolvedMs = d;
        }
      }
      let isOpen = false;
      let resolvedOn: Date | null = null;
      let resolutionSource: ITIncident["resolutionSource"] = null;
      let resolutionDays: number | null = null;

      if (resolvedMs !== null) {
        resolvedOn = new Date(resolvedMs);
        resolutionSource = "recorded";
        resolutionDays = (resolvedMs - startMs) / DAY_MS + 1;
      } else if (workingDaysBetween(endMs, refDay + DAY_MS) === 0) {
        // still being logged as of the latest day in the dataset
        isOpen = true;
      } else {
        resolvedOn = new Date(endMs + DAY_MS);
        resolutionSource = "inferred";
        resolutionDays = spanDays;
      }

      // First response: earliest acknowledgement on/after the reported clock time.
      let ackHours: number | null = null;
      const first = run.find((r) => parseClock(r.reportedTime) !== null);
      if (first) {
        const reportedMs = dayStart(first.reportedAt) + (parseClock(first.reportedTime) as number);
        const acks = run
          .map((r) => (r.acknowledgedAt ? r.acknowledgedAt.getTime() : null))
          .filter((t): t is number => t !== null && t >= reportedMs);
        if (acks.length) ackHours = (Math.min(...acks) - reportedMs) / 3_600_000;
      }

      const latest = run[run.length - 1];
      incidents.push({
        id: `${groupKey.replace("\u0001", "|")}|${startMs}`,
        issue: latest.issue,
        projectName: latest.projectName,
        zone: latest.zone,
        status: latest.status,
        assignedTo: latest.assignedTo,
        category: latestNonEmpty(run, (r) => r.category),
        priority: latestNonEmpty(run, (r) => r.priority),
        rootCause: latestNonEmpty(run, (r) => r.rootCause),
        resolvedBy: latestNonEmpty(run, (r) => r.resolvedBy),
        deviceCount: latestNonEmpty(run, (r) => r.deviceCount),
        start: new Date(startMs),
        end: new Date(endMs),
        loggedDays,
        spanDays,
        isOpen,
        resolvedOn,
        resolutionSource,
        resolutionDays,
        ackHours,
        isRepeat: previousEnd !== null && (startMs - previousEnd) / DAY_MS <= REPEAT_WINDOW_DAYS,
        rows: run,
      });
      previousEnd = endMs;
    }
  });

  return incidents;
};

// ───────────────────────────── statistics ─────────────────────────────

export interface DistStats {
  n: number;
  mean: number;
  median: number;
  p90: number;
}

const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
};

export const distStats = (values: number[]): DistStats => {
  if (values.length === 0) return { n: 0, mean: 0, median: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n: sorted.length, mean, median, p90: percentile(sorted, 0.9) };
};

// ───────────────────────────── analysis ─────────────────────────────

export interface AnalysisData {
  /** Incidents active in the period (new + carried in) */
  totalAssignedIssues: number;
  /** Incidents by current status */
  issueCount: number;
  offlineCount: number;
  zoneSummary: {
    zone: string;
    count: number;
    projects: string[];
    devices: number | null;
    per100: number | null;
  }[];
  projectSummary: [string, number][];
  top5CommonProblems: {
    issue: string;
    count: number;
    issueDays: number;
    latestProject: string;
    latestDate: Date | null;
    projectSpecificCount: number;
  }[];
  issueTimeline: {
    id: string;
    issue: string;
    projectName: string;
    zone: string;
    status: "Issue" | "Offline";
    assignedTo: string;
    category: string | null;
    priority: string | null;
    /** Logged days (rows) of this incident */
    count: number;
    timelines: { start: Date; end: Date }[];
    totalActiveDays: number;
    firstReported: Date | null;
    lastReported: Date | null;
    solutionDate: Date | string | null;
    resolutionTimeInDays: number | null;
    resolutionSource: "recorded" | "inferred" | null;
    ageDays: number | null;
    /** Started before the period and/or still unresolved when the period ended */
    isCarryOver: boolean;
    carriedIn: boolean;
    /** Resolution date falls inside the period (counts towards the resolution stats) */
    closedInPeriod: boolean;
    isRepeat: boolean;
  }[];
  averageResolutionTime: number;
  longestOpenIssue:
    | { issue: string; projectName: string; resolutionTimeInDays: number | null }
    | undefined;
  mostFrequentIssue: { issue: string; projectName: string; count: number } | null;

  // ── additions ──
  period: { start: Date; end: Date };
  /** Latest day with any log in the whole dataset ("data as of") */
  asOf: Date;
  issueDays: number;
  newCount: number;
  carriedInCount: number;
  closedCount: number;
  backlogCount: number;
  repeatCount: number;
  resolution: DistStats & { recordedN: number };
  firstResponse: DistStats;
  backlog: {
    id: string;
    issue: string;
    projectName: string;
    zone: string;
    priority: string | null;
    assignedTo: string;
    start: Date;
    ageDays: number;
  }[];
  byCategory: { category: string; count: number }[];
  byAssignee: { assignedTo: string; incidents: number; closed: number; medianDays: number | null }[];
  dataQuality: {
    duplicatesRemoved: number;
    /** Share (0–1) of closed incidents whose resolution date was recorded, not inferred */
    recordedResolutionShare: number;
    incidentsWithoutCategory: number;
  };
}

export interface AnalyzeOptions {
  /** 'YYYY-MM' or 'all' */
  month: string;
  /** Only keep incidents with at least one in-period log row matching this */
  rowMatches?: (row: ITAssignedIssue) => boolean;
  /** Restrict the period to its first N days (like-for-like comparison with a partial month) */
  dayLimit?: number;
}

/** Latest log day in the dataset (after de-duplication). */
export const latestLogDay = (issues: ITAssignedIssue[]): number | null =>
  issues.length ? Math.max(...issues.map((i) => dayStart(i.reportedAt))) : null;

export const analyzeIncidents = (
  allIssues: ITAssignedIssue[],
  opts: AnalyzeOptions,
): AnalysisData | null => {
  const { rows, duplicatesRemoved } = dedupeIssues(allIssues);
  if (rows.length === 0) return null;

  const days = rows.map((r) => dayStart(r.reportedAt));
  const refDay = Math.max(...days);

  let winStart: number;
  let winEnd: number;
  if (opts.month === "all") {
    winStart = Math.min(...days);
    winEnd = refDay;
  } else {
    const b = monthBounds(opts.month);
    winStart = b.start;
    winEnd = b.end;
  }
  if (opts.dayLimit) winEnd = Math.min(winEnd, winStart + (opts.dayLimit - 1) * DAY_MS);
  winEnd = Math.min(winEnd, refDay);
  if (winEnd < winStart) return null;

  const inWindow = (r: ITAssignedIssue) => {
    const d = dayStart(r.reportedAt);
    return d >= winStart && d <= winEnd;
  };

  const all = buildIncidents(rows, refDay);
  const incidents = all.filter((inc) =>
    inc.rows.some((r) => inWindow(r) && (!opts.rowMatches || opts.rowMatches(r))),
  );
  if (incidents.length === 0) return null;

  const startMs = (i: ITIncident) => i.start.getTime();
  const isClosedInWindow = (i: ITIncident) =>
    i.resolvedOn !== null && i.resolvedOn.getTime() >= winStart && i.resolvedOn.getTime() <= winEnd + DAY_MS;
  const isBacklogAtEnd = (i: ITIncident) =>
    startMs(i) <= winEnd && (i.isOpen || (i.resolvedOn !== null && i.resolvedOn.getTime() > winEnd + DAY_MS));

  const newIncidents = incidents.filter((i) => startMs(i) >= winStart);
  const carriedIn = incidents.filter((i) => startMs(i) < winStart);
  const closed = incidents.filter(isClosedInWindow);
  const backlogInc = incidents.filter(isBacklogAtEnd);

  const issueDays = incidents.reduce(
    (sum, i) => sum + new Set(i.rows.filter(inWindow).map((r) => dayStart(r.reportedAt))).size,
    0,
  );

  // zone / project
  const projectDevices = new Map<string, number>();
  incidents.forEach((i) => {
    if (i.deviceCount && i.deviceCount > (projectDevices.get(i.projectName) ?? 0)) {
      projectDevices.set(i.projectName, i.deviceCount);
    }
  });
  const zoneMap = new Map<string, ITIncident[]>();
  incidents.forEach((i) => zoneMap.set(i.zone, [...(zoneMap.get(i.zone) ?? []), i]));
  const zoneSummary = Array.from(zoneMap.entries())
    .map(([zone, list]) => {
      const projects = Array.from(new Set(list.map((i) => i.projectName))).sort();
      const known = projects.filter((p) => projectDevices.has(p));
      // Rate only when every project in the zone has a device count — otherwise it would understate.
      const devices =
        known.length === projects.length && projects.length > 0
          ? known.reduce((s, p) => s + (projectDevices.get(p) as number), 0)
          : null;
      return {
        zone,
        count: list.length,
        projects,
        devices,
        per100: devices ? (list.length / devices) * 100 : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const projectCounts = new Map<string, number>();
  incidents.forEach((i) => projectCounts.set(i.projectName, (projectCounts.get(i.projectName) ?? 0) + 1));
  const projectSummary = Array.from(projectCounts.entries()).sort((a, b) => b[1] - a[1]) as [string, number][];

  // common problems: frequency = distinct incidents (not logged days)
  const byIssue = new Map<string, ITIncident[]>();
  incidents.forEach((i) => {
    const k = normalizeText(i.issue);
    byIssue.set(k, [...(byIssue.get(k) ?? []), i]);
  });
  const top5CommonProblems = Array.from(byIssue.values())
    .map((list) => {
      const latest = list.reduce((a, b) => (b.end.getTime() >= a.end.getTime() ? b : a));
      return {
        issue: latest.issue,
        count: list.length,
        issueDays: list.reduce((s, i) => s + i.loggedDays, 0),
        latestProject: latest.projectName,
        latestDate: latest.end,
        projectSpecificCount: list.filter((i) => i.projectName === latest.projectName).length,
      };
    })
    .sort((a, b) => b.count - a.count || b.issueDays - a.issueDays)
    .slice(0, 5);

  const asOfAge = (i: ITIncident) => Math.max(1, (Math.min(winEnd, refDay) - startMs(i)) / DAY_MS + 1);

  const issueTimeline = incidents
    .map((i) => {
      const open = isBacklogAtEnd(i);
      const carriedInFlag = startMs(i) < winStart;
      return {
        id: i.id,
        issue: i.issue,
        projectName: i.projectName,
        zone: i.zone,
        status: i.status,
        assignedTo: i.assignedTo,
        category: i.category,
        priority: i.priority,
        count: i.loggedDays,
        timelines: [{ start: i.start, end: i.end }],
        totalActiveDays: i.spanDays,
        firstReported: i.start,
        lastReported: i.end,
        solutionDate: i.isOpen ? ("Ongoing" as const) : i.resolvedOn,
        resolutionTimeInDays: i.isOpen ? asOfAge(i) : i.resolutionDays,
        resolutionSource: i.isOpen ? null : i.resolutionSource,
        ageDays: open ? asOfAge(i) : null,
        // unresolved at the end of a period that is already over = carried into a later period
        isCarryOver: open && winEnd < refDay,
        carriedIn: carriedInFlag,
        closedInPeriod: isClosedInWindow(i),
        isRepeat: i.isRepeat,
      };
    })
    .sort((a, b) => b.count - a.count || (b.resolutionTimeInDays ?? 0) - (a.resolutionTimeInDays ?? 0));

  const resolutionValues = closed.map((i) => i.resolutionDays as number).filter((v) => typeof v === "number");
  const resolution = {
    ...distStats(resolutionValues),
    recordedN: closed.filter((i) => i.resolutionSource === "recorded").length,
  };
  const firstResponse = distStats(
    incidents.map((i) => i.ackHours).filter((v): v is number => v !== null),
  );

  const backlog = backlogInc
    .map((i) => ({
      id: i.id,
      issue: i.issue,
      projectName: i.projectName,
      zone: i.zone,
      priority: i.priority,
      assignedTo: i.assignedTo,
      start: i.start,
      ageDays: asOfAge(i),
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const categoryCounts = new Map<string, number>();
  incidents.forEach((i) => {
    if (i.category) categoryCounts.set(i.category, (categoryCounts.get(i.category) ?? 0) + 1);
  });

  const assigneeMap = new Map<string, ITIncident[]>();
  incidents.forEach((i) => assigneeMap.set(i.assignedTo || "Unassigned", [...(assigneeMap.get(i.assignedTo || "Unassigned") ?? []), i]));
  const byAssignee = Array.from(assigneeMap.entries())
    .map(([assignedTo, list]) => {
      const done = list.filter(isClosedInWindow);
      const stats = distStats(done.map((i) => i.resolutionDays as number));
      return {
        assignedTo,
        incidents: list.length,
        closed: done.length,
        medianDays: done.length ? stats.median : null,
      };
    })
    .sort((a, b) => b.incidents - a.incidents);

  const longestOpen = backlog[0];
  const topProblem = top5CommonProblems[0];

  return {
    totalAssignedIssues: incidents.length,
    issueCount: incidents.filter((i) => i.status === "Issue").length,
    offlineCount: incidents.filter((i) => i.status === "Offline").length,
    zoneSummary,
    projectSummary,
    top5CommonProblems,
    issueTimeline,
    averageResolutionTime: resolution.mean,
    longestOpenIssue: longestOpen
      ? { issue: longestOpen.issue, projectName: longestOpen.projectName, resolutionTimeInDays: longestOpen.ageDays }
      : undefined,
    mostFrequentIssue: topProblem
      ? { issue: topProblem.issue, projectName: topProblem.latestProject, count: topProblem.count }
      : null,
    period: { start: new Date(winStart), end: new Date(winEnd) },
    asOf: new Date(refDay),
    issueDays,
    newCount: newIncidents.length,
    carriedInCount: carriedIn.length,
    closedCount: closed.length,
    backlogCount: backlogInc.length,
    repeatCount: incidents.filter((i) => i.isRepeat).length,
    resolution,
    firstResponse,
    backlog,
    byCategory: Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    byAssignee,
    dataQuality: {
      duplicatesRemoved,
      recordedResolutionShare: closed.length ? resolution.recordedN / closed.length : 0,
      incidentsWithoutCategory: incidents.filter((i) => !i.category).length,
    },
  };
};

export interface PrevMonthSummary {
  month: string;
  total: number;
  issueCount: number;
  offlineCount: number;
  projectCount: number;
  closedCount: number;
  /** Set when the previous month was cut to the same first N days as the selected, still-running month */
  sameDayLimit: number | null;
}

/**
 * Previous *calendar* month, like-for-like: if the selected month is the one still
 * being logged (partial), the previous month is cut to the same number of days.
 */
export const summarizePreviousMonth = (
  allIssues: ITAssignedIssue[],
  month: string,
  rowMatches?: (row: ITAssignedIssue) => boolean,
): PrevMonthSummary | null => {
  if (month === "all" || allIssues.length === 0) return null;
  const refDay = latestLogDay(allIssues) as number;
  const firstDay = Math.min(...allIssues.map((i) => dayStart(i.reportedAt)));
  const prev = previousMonthKey(month);
  if (monthBounds(prev).end < firstDay) return null;

  const { end } = monthBounds(month);
  const partial = monthKeyOf(refDay) === month && refDay < end;
  const dayLimit = partial ? new Date(refDay).getUTCDate() : undefined;

  const result = analyzeIncidents(allIssues, { month: prev, rowMatches, dayLimit });
  return {
    month: prev,
    total: result?.totalAssignedIssues ?? 0,
    issueCount: result?.issueCount ?? 0,
    offlineCount: result?.offlineCount ?? 0,
    projectCount: result?.projectSummary.length ?? 0,
    closedCount: result?.closedCount ?? 0,
    sameDayLimit: dayLimit ?? null,
  };
};
