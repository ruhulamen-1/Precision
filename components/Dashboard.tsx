import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View, User, FeaturedProject, EmployeeVisit, SalesPersonVisit,
  ITAssignedIssue, MaterialReceiveItem, ERPCorrectionRecord,
  SalesTeam, ArchiveDataVerification,
} from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import ScrollingActivityImages from "./ScrollingActivityImages";
import {
  HardHat, Database, Users, Server, BarChart3, Video,
  TrendingUp, Clock, ClipboardList, Briefcase, AlertCircle,
  Camera, ChevronDown, CheckCircle2, FileWarning,
} from "lucide-react";

// icon map for quick access menu
const ICON_MAP: Record<string, React.ReactNode> = {
  "ti-hard-hat":      <HardHat className="w-3.5 h-3.5" />,
  "ti-database":      <Database className="w-3.5 h-3.5" />,
  "ti-users":         <Users className="w-3.5 h-3.5" />,
  "ti-server":        <Server className="w-3.5 h-3.5" />,
  "ti-chart-bar":     <BarChart3 className="w-3.5 h-3.5" />,
  "ti-video":         <Video className="w-3.5 h-3.5" />,
  "ti-trending-up":   <TrendingUp className="w-3.5 h-3.5" />,
  "ti-clock":         <Clock className="w-3.5 h-3.5" />,
  "ti-clipboard-list":<ClipboardList className="w-3.5 h-3.5" />,
  "ti-briefcase":     <Briefcase className="w-3.5 h-3.5" />,
  "ti-alert-circle":  <AlertCircle className="w-3.5 h-3.5" />,
};

interface DashboardProps {
  onNavigate: (view: View, state?: any) => void;
  currentUser: User;
  featuredProjects: FeaturedProject[];
  employeeVisits: EmployeeVisit[];
  salesPersonVisits: SalesPersonVisit[];
  itAssignedIssues: ITAssignedIssue[];
  materialReceipts: MaterialReceiveItem[];
  erpCorrectionRecords: ERPCorrectionRecord[];
  salesTeams: SalesTeam[];
  archiveRecords: ArchiveDataVerification[];
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// Local (browser timezone) YYYY-MM-DD, NOT UTC — using toISOString() here would
// shift the date back a day during BD's UTC+6 early-morning hours.
const getLocalDateStr = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ─── Reveal on scroll ────────────────────────────────────────────────────────
const useReveal = () => {
  useEffect(() => {
    const revealAll = () => {
      document.querySelectorAll(".db-reveal").forEach((el) => {
        (el as HTMLElement).classList.add("db-reveal-in");
      });
    };

    const tid = setTimeout(() => {
      const els = document.querySelectorAll(".db-reveal");
      if (!els.length) return;

      // Try multiple scroll container selectors
      const scrollRoot: HTMLElement | null = (
        document.querySelector(".overflow-y-auto") ||
        document.querySelector('[class*="overflow-y"]') ||
        document.querySelector("main") ||
        null
      ) as HTMLElement | null;

      let fired = 0;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              fired++;
              (e.target as HTMLElement).classList.add("db-reveal-in");
              io.unobserve(e.target);
            }
          });
        },
        { root: scrollRoot, threshold: 0.04, rootMargin: "20px 0px 0px 0px" }
      );
      els.forEach((el) => io.observe(el));

      // If after 600ms nothing fired, reveal everything (observer failed)
      setTimeout(() => { if (fired === 0) revealAll(); }, 600);

      (window as any).__dbRevealIo = io;
    }, 80);

    return () => {
      clearTimeout(tid);
      (window as any).__dbRevealIo?.disconnect();
    };
  }, []);
};

// ─── Activity Images Strip ────────────────────────────────────────────────────
const CasualActivityImagesStrip: React.FC = () => {
  const [images, setImages] = React.useState<{ key: string; remark: string; date: string }[]>([]);
  // Cache fetched image data by key so duplicated marquee items (the strip repeats
  // the same images several times for a seamless scroll loop) reuse one in-flight
  // request instead of each firing its own /api/media/:key call.
  const imageCache = React.useRef<Map<string, Promise<any>>>(new Map());

  React.useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    fetch("/api/activity_entries")
      .then((r) => r.json())
      .then((entries: any[]) => {
        const imgs: { key: string; remark: string; date: string }[] = [];
        (entries || []).forEach((e) => {
          if (!e.date) return;
          if (new Date(`${String(e.date).split("T")[0]}T00:00:00`) < since) return;
          (e.screenshots || []).forEach((key: string) =>
            imgs.push({ key, remark: e.remarks ?? "", date: e.date })
          );
        });
        setImages(imgs);
      })
      .catch(() => {});
  }, []);

  const getImage = React.useCallback(async (key: string) => {
    const cached = imageCache.current.get(key);
    if (cached) return cached;
    const request = (async () => {
      try {
        const res = await fetch(`/api/media/${key}`);
        if (!res.ok) return null;
        return (await res.json()).data || null;
      } catch { return null; }
    })();
    imageCache.current.set(key, request);
    return request;
  }, []);

  if (images.length === 0) return null;

  return (
    <div className="db-strip-wrap db-glass">
      <div className="db-strip-head">
        <span className="db-strip-lbl">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Recent activity photos
        </span>
        <span className="db-strip-meta">Last 7 days</span>
      </div>
      <ScrollingActivityImages images={images} getImage={getImage} />
    </div>
  );
};

// ─── Sparkline ────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Catmull-Rom → cubic-Bezier smoothing so the line reads as a continuous
// trend rather than a jagged connect-the-dots polyline.
const smoothPath = (pts: { x: number; y: number }[]) => {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
};

const VisitSparkline: React.FC<{
  employeeVisits: EmployeeVisit[];
  salesPersonVisits: SalesPersonVisit[];
  showEmployee: boolean;
  showSales: boolean;
}> = ({
  employeeVisits, salesPersonVisits, showEmployee, showSales,
}) => {
  const year = new Date().getFullYear().toString();
  const currentMonthIdx = new Date().getMonth();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const emp = useMemo(() => {
    const c = Array(12).fill(0);
    if (!showEmployee) return c;
    employeeVisits.forEach((v) => { if (v.date?.startsWith(year)) { const m = parseInt(v.date.split("-")[1],10)-1; if(m>=0&&m<12)c[m]++; } });
    return c;
  }, [employeeVisits, year, showEmployee]);
  const sal = useMemo(() => {
    const c = Array(12).fill(0);
    if (!showSales) return c;
    salesPersonVisits.forEach((v) => { if (v.date?.startsWith(year)) { const m = parseInt(v.date.split("-")[1],10)-1; if(m>=0&&m<12)c[m]++; } });
    return c;
  }, [salesPersonVisits, year, showSales]);

  // Average employee-visit duration per month (in minutes), parsed from "H:MM:SS"
  const durMinutes = useMemo(() => {
    const sums = Array(12).fill(0);
    const counts = Array(12).fill(0);
    if (!showEmployee) return sums;
    employeeVisits.forEach((v) => {
      if (!v.date?.startsWith(year) || !v.duration) return;
      const m = parseInt(v.date.split("-")[1], 10) - 1;
      if (m < 0 || m >= 12) return;
      const parts = v.duration.split(":").map(Number);
      const mins = (parts[0] || 0) * 60 + (parts[1] || 0);
      if (Number.isFinite(mins)) { sums[m] += mins; counts[m] += 1; }
    });
    return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
  }, [employeeVisits, year, showEmployee]);

  const hasData = emp.some((v) => v > 0) || sal.some((v) => v > 0);

  const [chartW, setChartW] = useState(360);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setChartW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxV = Math.max(...emp, ...sal, 1);
  const maxDur = Math.max(...durMinutes, 1);
  const W=chartW, H=176, pL=4, pR=4, pT=10, pB=22;
  const cW=W-pL-pR, cH=H-pT-pB;
  const xAt = (i:number) => pL+(i/11)*cW;
  const yAt = (v:number) => pT+cH-(v/maxV)*cH;
  const linePts = (d: number[]) => d.map((v,i)=>({x:xAt(i), y:yAt(v)}));
  const areaPath = (d: number[]) => {
    const pts = linePts(d);
    return `${smoothPath(pts)} L ${pts[pts.length-1].x},${pT+cH} L ${pts[0].x},${pT+cH} Z`;
  };
  const barW = (cW/12)*0.46;

  const handlePointer = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(rel * 11));
  };

  return (
    <div
      ref={wrapRef}
      className="db-vchart-wrap"
      onMouseMove={(e)=>hasData && handlePointer(e.clientX)}
      onMouseLeave={()=>setHoverIdx(null)}
      onClick={(e)=>hasData && handlePointer(e.clientX)}
    >
      {!hasData ? (
        <div className="db-vchart-empty">
          <TrendingUp className="w-5 h-5" style={{opacity:.35}} aria-hidden="true"/>
          <div>No visits logged yet in {year}</div>
        </div>
      ) : (
      <>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
        <defs>
          <linearGradient id="vc-emp-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7F77DD" stopOpacity="0.32"/>
            <stop offset="100%" stopColor="#7F77DD" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="vc-sal-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.24"/>
            <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="vc-dur-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F5A623" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#F5A623" stopOpacity="0.12"/>
          </linearGradient>
          <filter id="vc-glow-emp" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#7F77DD" floodOpacity="0.45"/>
          </filter>
          <filter id="vc-glow-sal" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#1D9E75" floodOpacity="0.4"/>
          </filter>
        </defs>

        {/* Current-month column, so "this year" has a visible anchor point */}
        <rect x={xAt(currentMonthIdx)-cW/24} y={pT} width={cW/12} height={cH}
          fill="#4F46E5" opacity={0.05} rx="3"/>

        {[0,0.33,0.66,1].map((r,i)=>(
          <line key={i} x1={0} y1={pT+cH*(1-r)} x2={W} y2={pT+cH*(1-r)}
            stroke="rgba(79,70,229,0.09)" strokeWidth="0.6" strokeDasharray="2 3"/>
        ))}

        {/* Avg. visit duration — bars, scaled independently against the right-hand axis */}
        {showEmployee && durMinutes.map((v,i)=>{
          const bh = (v/maxDur)*(cH*0.62);
          const x = xAt(i)-barW/2;
          return (
            <rect key={i} x={x} y={pT+cH-bh} width={barW} height={Math.max(bh,0)}
              rx="2" fill="url(#vc-dur-bar)"/>
          );
        })}

        {showSales && <path d={areaPath(sal)} fill="url(#vc-sal-area)"/>}
        {showEmployee && <path d={areaPath(emp)} fill="url(#vc-emp-area)"/>}
        {showSales && <path d={smoothPath(linePts(sal))} fill="none" stroke="#1D9E75" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="4.5 3" filter="url(#vc-glow-sal)"/>}
        {showEmployee && <path d={smoothPath(linePts(emp))} fill="none" stroke="#7F77DD" strokeWidth="1.75" strokeLinecap="round" filter="url(#vc-glow-emp)"/>}

        {/* Hover guide + dots */}
        {hoverIdx !== null && (
          <>
            <line x1={xAt(hoverIdx)} y1={pT} x2={xAt(hoverIdx)} y2={pT+cH}
              stroke="#4F46E5" strokeWidth="1" strokeDasharray="2 2" opacity="0.35"/>
            {showEmployee && <circle cx={xAt(hoverIdx)} cy={yAt(emp[hoverIdx])} r="3.2" fill="#fff" stroke="#7F77DD" strokeWidth="2"/>}
            {showSales && <circle cx={xAt(hoverIdx)} cy={yAt(sal[hoverIdx])} r="3.2" fill="#fff" stroke="#1D9E75" strokeWidth="2"/>}
          </>
        )}

        {MONTHS_SHORT.map((m,i)=>(
          <text key={m} x={xAt(i)} y={H-6} fontSize="8"
            fontWeight={i===hoverIdx || (hoverIdx===null && i===currentMonthIdx) ? 800 : 500}
            fill={i===hoverIdx || (hoverIdx===null && i===currentMonthIdx) ? "#4F46E5" : "#94a3b8"}
            textAnchor="middle">{m[0]}</text>
        ))}
      </svg>

      {hoverIdx !== null && (
        <div className="db-vtip" style={{left:`${(hoverIdx/11)*100}%`}}>
          <div className="db-vtip-month">{MONTHS_FULL[hoverIdx]}</div>
          {showEmployee && (
            <div className="db-vtip-row"><span className="db-vtip-dot" style={{background:"#7F77DD"}}/>Employee<b>{emp[hoverIdx]}</b></div>
          )}
          {showSales && (
            <div className="db-vtip-row"><span className="db-vtip-dot" style={{background:"#1D9E75"}}/>Sales<b>{sal[hoverIdx]}</b></div>
          )}
          {showEmployee && durMinutes[hoverIdx] > 0 && (
            <div className="db-vtip-row db-vtip-dur"><span className="db-vtip-dot" style={{background:"#F5A623"}}/>Avg. duration<b>{Math.round(durMinutes[hoverIdx])}m</b></div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
};

// ─── Insight cards (weather-widget style KPI grid) ─────────────────────────────
// Small self-contained "at a glance" cards: title, mini visual (trend line or
// radial gauge), a status badge, and a one-line explanation — modeled after
// the Google weather-app metric grid.
const InsightCard: React.FC<{
  title: string;
  statusColor: string;
  statusLabel: string;
  desc: string;
  children: React.ReactNode;
}> = ({ title, statusColor, statusLabel, desc, children }) => (
  <div className="db-insight-card db-glass">
    <div className="db-insight-title">{title}</div>
    <div className="db-insight-visual">{children}</div>
    <div className="db-insight-status">
      <span className="db-insight-dot" style={{ background: statusColor }} />
      {statusLabel}
    </div>
    <div className="db-insight-desc">{desc}</div>
  </div>
);

const InsightTrend: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const W = 200, H = 60, pad = 4;
  const safe = data.length ? data : [0, 0];
  const max = Math.max(...safe, 1);
  const pts = safe.map((v, i) => ({
    x: pad + (safe.length > 1 ? (i / (safe.length - 1)) * (W - pad * 2) : 0),
    y: H - pad - (v / max) * (H - pad * 2),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x},${H} L ${pts[0].x},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.5" fill={color} />
    </svg>
  );
};

const InsightRadial: React.FC<{ pct: number; color: string; value: React.ReactNode; sub?: string }> = ({
  pct, color, value, sub,
}) => {
  const r = 28, c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, pct)) * c;
  return (
    <div style={{ position: "relative", width: 68, height: 68 }}>
      <svg width="68" height="68" viewBox="0 0 68 68" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="7" />
        <circle
          cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#1A1A2E" }}>{value}</span>
        {sub && <span style={{ fontSize: 8, color: "#94A3B8", fontWeight: 600 }}>{sub}</span>}
      </div>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard: React.FC<DashboardProps> = ({
  onNavigate, currentUser, featuredProjects,
  employeeVisits, salesPersonVisits, itAssignedIssues,
  materialReceipts, erpCorrectionRecords, salesTeams, archiveRecords,
}) => {
  const donutRowRef = React.useRef<HTMLDivElement>(null);
  useReveal();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const x = (e.clientX - left) / width - 0.5;   // -0.5 to 0.5
    const y = (e.clientY - top)  / height - 0.5;
    const bg = document.getElementById("hero-bg");
    if (bg) bg.style.transform = `scale(1.15) rotateY(${x*4}deg) rotateX(${-y*3}deg)`;
  };
  const handleHeroMouseLeave = () => {
    const bg = document.getElementById("hero-bg");
    if (bg) bg.style.transform = "scale(1.15)";
  };

  // Parallax hero scroll effect
  useEffect(() => {
    const findScrollContainer = (): HTMLElement => {
      const candidates = [
        document.querySelector(".overflow-y-auto") as HTMLElement,
        document.querySelector('[class*="overflow-y-auto"]') as HTMLElement,
      ];
      for (const el of candidates) { if (el) return el; }
      return document.documentElement;
    };
    const container = findScrollContainer();
    scrollContainerRef.current = container;
    const handleScroll = () => {
      const scrollY = container.scrollTop ?? window.scrollY;
      const ratio = Math.min(scrollY / 300, 1);
      const scale = 1.15 - ratio * 0.12;
      const el = document.getElementById("hero-bg");
      if (el) el.style.transform = `scale(${scale}) translateY(${(scale - 1) * -20}px)`;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Slideshow auto-rotate
  useEffect(() => {
    if (featuredProjects.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredProjects.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [featuredProjects.length]);

  const currentProject = featuredProjects[currentIndex];

  // Let a normal vertical mouse-wheel scroll the donut strip horizontally.
  // Done via a native listener (not React's onWheel) because React attaches
  // wheel handlers as passive by default, which silently ignores preventDefault().
  useEffect(() => {
    const el = donutRowRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already a horizontal gesture
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const firstName = currentUser.name.split(" ")[0];
  const permissions = getEffectivePermissions(currentUser);

  const today = useMemo(()=>getLocalDateStr(),[]);
  const month = useMemo(()=>today.slice(0,7),[today]);

  const todayEmp  = useMemo(()=>employeeVisits.filter(v=>v.date===today).length,[employeeVisits,today]);
  const monthEmp  = useMemo(()=>employeeVisits.filter(v=>v.date.startsWith(month)).length,[employeeVisits,month]);
  const todaySal  = useMemo(()=>salesPersonVisits.filter(v=>v.date===today).length,[salesPersonVisits,today]);
  const monthSal  = useMemo(()=>salesPersonVisits.filter(v=>v.date.startsWith(month)).length,[salesPersonVisits,month]);
  const openIT    = useMemo(()=>itAssignedIssues.filter(i=>i.status==="Issue").length,[itAssignedIssues]);
  const inProgIT  = useMemo(()=>itAssignedIssues.filter(i=>i.status==="Offline").length,[itAssignedIssues]);
  const totalIT   = useMemo(()=>itAssignedIssues.length,[itAssignedIssues]);
  const pendingERP= useMemo(()=>erpCorrectionRecords.filter(r=>r.status==="Pending").length,[erpCorrectionRecords]);

  // Archive Data Verification summary (only meaningful if the user can view this module)
  const archiveStats = useMemo(() => {
    const totalRecords = archiveRecords.length;
    const totalFiles = archiveRecords.reduce((sum, r) => sum + (r.files_count || 0), 0);
    const totalErrors = archiveRecords.reduce((sum, r) => sum + (r.errors_count || 0), 0);
    const checked = archiveRecords.filter(r => r.check_status === "Checked").length;
    const pending = archiveRecords.filter(r => r.check_status === "Pending").length;
    const needsAttention = archiveRecords.filter(
      r => r.check_status === "On Hold" || r.check_status === "Returned" || r.check_status === "Re-Audit",
    ).length;
    return { totalRecords, totalFiles, totalErrors, checked, pending, needsAttention };
  }, [archiveRecords]);

  // Year totals for right panel bars
  const yearEmp  = useMemo(()=>employeeVisits.filter(v=>v.date?.startsWith(new Date().getFullYear().toString())).length,[employeeVisits]);
  const yearSal  = useMemo(()=>salesPersonVisits.filter(v=>v.date?.startsWith(new Date().getFullYear().toString())).length,[salesPersonVisits]);

  // Monthly bars (last 5 months) for mini bar sparklines
  const last5EmpBars = useMemo(()=>{
    const now = new Date(); const bars:number[]=[];
    for(let i=4;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      bars.push(employeeVisits.filter(v=>v.date?.startsWith(ym)).length);
    }
    return bars;
  },[employeeVisits]);

  const last5SalBars = useMemo(()=>{
    const now = new Date(); const bars:number[]=[];
    for(let i=4;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      bars.push(salesPersonVisits.filter(v=>v.date?.startsWith(ym)).length);
    }
    return bars;
  },[salesPersonVisits]);

  const maxEmpBar = Math.max(...last5EmpBars,1);
  const maxSalBar = Math.max(...last5SalBars,1);

  const recentActivity = useMemo(()=>{
    const acts:{time:string;text:string;color:string}[]=[];
    if (permissions.employeeProjectVisit?.view) {
      [...employeeVisits].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3).forEach(v=>{
        const t=v.entryTime?.slice(0,5)||"--:--";
        const isToday=v.date===today;
        acts.push({time:isToday?t:"Yest.",text:`${v.visitorName} checked in — ${v.projectName}`,color:"#7F77DD"});
      });
    }
    if (permissions.itResponseTimeline?.view) {
      itAssignedIssues.filter(i=>i.status==="Issue").slice(0,2).forEach(i=>{
        const d=new Date(i.reportedAt);
        const isToday=getLocalDateStr(d)===today;
        acts.push({time:isToday?`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`:"Yest.",
          text:`New IT issue at ${i.projectName}`,color:"#E24B4A"});
      });
    }
    if (permissions.erpCorrectionReport?.view) {
      erpCorrectionRecords.filter(r=>r.status==="Pending").slice(0,2).forEach(r=>{
        acts.push({time:"—",text:`ERP correction pending`,color:"#EF9F27"});
      });
    }
    return acts.slice(0,6);
  },[employeeVisits,itAssignedIssues,erpCorrectionRecords,today,permissions]);

  const recentVisits = useMemo(()=>{
    if (!permissions.employeeProjectVisit?.view) return [];
    return [...employeeVisits]
      .sort((a,b)=>b.date.localeCompare(a.date))
      .slice(0,5)
      .map(v=>{
        const isToday=v.date===today;
        const wasYest=new Date(v.date).getTime()===new Date(today).getTime()-86400000;
        const dateLabel=isToday?`Today, ${v.entryTime?.slice(0,5)||"—"}`:(wasYest?"Yesterday":v.date);
        const dur = v.entryTime&&v.outTime
          ? (()=>{const [eh,em]=v.outTime.split(":").map(Number);const[sh,sm]=v.entryTime.split(":").map(Number);
              const diff=(eh*60+em)-(sh*60+sm);return diff>0?`${Math.floor(diff/60)}h ${diff%60}m`:"—";})()
          : "—";
        const status=v.outTime?"Done":isToday?"Active":"Pending";
        return {name:v.visitorName,site:v.projectName,dateLabel,dur,status};
      });
  },[employeeVisits,today,permissions]);

  
  const menuItems=[
    permissions.constructionDutyAnalysis?.view&&{view:"constructionDutyAnalysis",icon:"ti-hard-hat",bg:"#EEEDFE",col:"#534AB7",label:"Construction duty",desc:"Cross-reference reports"},
    permissions.erpCorrectionReport?.view&&{view:"erpCorrectionReport",icon:"ti-database",bg:"#FAEEDA",col:"#854F0B",label:"ERP corrections",desc:"Manage data fixes",badge:{txt:`${pendingERP} pending`,bg:"#FAEEDA",col:"#854F0B"}},
    permissions.employeeProjectVisit?.view&&{view:"employeeProjectVisit",icon:"ti-users",bg:"#E6F1FB",col:"#185FA5",label:"Employee visits",desc:"Log and review",badge:{txt:`${monthEmp} this month`,bg:"#E6F1FB",col:"#185FA5"}},
    permissions.itResponseTimeline?.view&&{view:"itResponseTimeline",icon:"ti-server",bg:"#FCEBEB",col:"#A32D2D",label:"IT response time",desc:"Ticket analysis",badge:{txt:`${openIT} open`,bg:"#FCEBEB",col:"#A32D2D"}},
    permissions.salesPersonProjectVisit?.view&&{view:"salesPersonProjectVisit",icon:"ti-chart-bar",bg:"#E1F5EE",col:"#0F6E56",label:"Sales visits",desc:"Track interactions"},
    permissions.cctvFootageCheckReports?.view&&{view:"cctvFootageCheckReports",icon:"ti-video",bg:"#FCEBEB",col:"#A32D2D",label:"CCTV reports",desc:"Footage check"},
    permissions.monthlyComparisonPrecision?.view&&{view:"monthlyComparisonPrecision",icon:"ti-trending-up",bg:"#E1F5EE",col:"#0F6E56",label:"Monthly comparison",desc:"Month-over-month"},
    permissions.ssvDutyAnalysis?.view&&{view:"ssvDutyAnalysis",icon:"ti-clock",bg:"#FBEAF0",col:"#993556",label:"SSV duty analysis",desc:"Security records"},
    permissions.archiveDataVerification?.view&&{view:"archiveDataVerification",icon:"ti-clipboard-list",bg:"#E6F1FB",col:"#185FA5",label:"Archive verification",desc:"Audit records"},
    permissions.projectCase?.view&&{view:"projectCase",icon:"ti-briefcase",bg:"#FAEEDA",col:"#854F0B",label:"Create a case file",desc:"Raise a project case"},
    permissions.fixedAssetGPVerification?.view&&{view:"fixedAssetGPVerification",icon:"ti-trending-up",bg:"#FAEEDA",col:"#854F0B",label:"Fixed asset GP",desc:"Gate pass verify"},
    permissions.rubbishVerification?.view&&{view:"rubbishVerification",icon:"ti-clipboard-list",bg:"#F1EFE8",col:"#5F5E5A",label:"Rubbish verification",desc:"Disposal records"},
  ].filter(Boolean) as any[];


  // Ring-chart helper: returns a strokeDasharray/strokeDashoffset pair so a
  // donut ring's filled arc actually matches the percentage it represents,
  // starting from the top (12 o'clock) of the circle.
  const ringArc = (pct: number, r: number) => {
    const c = 2 * Math.PI * r;
    const filled = Math.max(0, Math.min(1, pct)) * c;
    return { dasharray: `${filled} ${c - filled}`, offset: c / 4, circumference: c };
  };

  const empSalTotal = yearEmp + yearSal;
  const empPct = empSalTotal > 0 ? yearEmp / empSalTotal : 0;
  const salPct = empSalTotal > 0 ? yearSal / empSalTotal : 0;
  const itOpenPct = totalIT > 0 ? openIT / totalIT : 0;

  const empRing = ringArc(empPct, 14);
  const salRing = ringArc(salPct, 14);
  const itOpenRing = ringArc(itOpenPct, 14);

  // Big IT donut only has two real states (per ITAssignedIssue.status: 'Issue' | 'Offline').
  const itOfflineRing = ringArc(totalIT > 0 ? inProgIT / totalIT : 0, 32);
  const itIssueRing = ringArc(totalIT > 0 ? openIT / totalIT : 0, 32);
  const itIssueOffset = itOfflineRing.offset - (totalIT > 0 ? (inProgIT/totalIT)*itOfflineRing.circumference : 0);

  return (
    <>
      <style>{`
        /* ═══════════════════════════════════════════════════
           PRECISION DASHBOARD — Bold Palette v3
           Primary:  #1A1A2E  (deep navy)
           Accent:   #F5A623  (warm amber)
           Action:   #4F46E5  (electric indigo)
           Success:  #059669
           Danger:   #DC2626
        ═══════════════════════════════════════════════════ */

        /* ── DB shell ── */
        .db-shell{display:grid;grid-template-columns:1fr 260px;position:relative;}

        /* ── Main col ── */
        .db-main{padding:0 1rem 1rem 1rem;display:flex;flex-direction:column;gap:.875rem;min-width:0;position:relative;z-index:1;}

        /* ── Hero ── */
        .db-hero{position:relative;height:280px;border-radius:0;overflow:hidden;margin:-1rem -1rem 0 -1rem;}
        .db-hero-body{position:absolute;inset:0;padding:1.5rem 1.5rem 1.25rem;display:flex;flex-direction:column;justify-content:flex-end;}
        .db-hero-eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:6px;font-weight:600;}
        .db-hero-title{font-size:28px;font-weight:800;color:#fff;line-height:1.15;letter-spacing:-.02em;text-shadow:0 2px 12px rgba(0,0,0,0.35);}
        .db-hero-sub{font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:500;letter-spacing:.01em;}

        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}

        /* ── Reveal on scroll ── */
        .db-reveal{opacity:0;transform:translateY(22px);transition:opacity .55s cubic-bezier(.22,.68,0,1),transform .55s cubic-bezier(.22,.68,0,1);will-change:opacity,transform;}
        :not(.dark) .db-reveal{animation:reveal-fallback 0s 1s forwards;}
        @keyframes reveal-fallback{to{opacity:1;transform:translateY(0);}}
        .db-reveal-in{opacity:1 !important;transform:translateY(0) !important;animation:none !important;}
        .db-reveal-stagger > *{opacity:0;transform:translateY(16px);transition:opacity .45s cubic-bezier(.22,.68,0,1),transform .45s cubic-bezier(.22,.68,0,1);}
        .db-reveal-in.db-reveal-stagger > *:nth-child(1){transition-delay:.05s;opacity:1;transform:translateY(0);}
        .db-reveal-in.db-reveal-stagger > *:nth-child(2){transition-delay:.13s;opacity:1;transform:translateY(0);}
        .db-reveal-in.db-reveal-stagger > *:nth-child(3){transition-delay:.21s;opacity:1;transform:translateY(0);}
        .db-reveal-in.db-reveal-stagger > *:nth-child(4){transition-delay:.29s;opacity:1;transform:translateY(0);}
        .db-reveal-in.db-reveal-stagger > *:nth-child(n+5){transition-delay:.35s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *{opacity:0;transform:translateY(16px);transition:opacity .4s cubic-bezier(.22,.68,0,1),transform .4s cubic-bezier(.22,.68,0,1);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(1){transition-delay:.10s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(2){transition-delay:.17s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(3){transition-delay:.24s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(4){transition-delay:.31s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(5){transition-delay:.38s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(6){transition-delay:.45s;opacity:1;transform:translateY(0);}
        .db-reveal-in .db-reveal-stagger > *:nth-child(n+7){transition-delay:.50s;opacity:1;transform:translateY(0);}

        /* ── Glass card base ── */
        .db-glass{
          background:rgba(255,255,255,0.82);
          backdrop-filter:blur(20px) saturate(180%);
          -webkit-backdrop-filter:blur(20px) saturate(180%);
          border:1.5px solid rgba(79,70,229,0.10);
          box-shadow:0 2px 16px rgba(26,26,46,0.08), inset 0 1px 0 rgba(255,255,255,0.95);
        }
        .dark .db-glass{
          background:rgba(15,17,30,0.80);
          border-color:rgba(255,255,255,0.08);
          box-shadow:0 4px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.05);
        }

        /* ── Stat row ── */
        .db-stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
        .db-stat{
          border-radius:12px;padding:12px 13px;position:relative;overflow:hidden;
          transform-style:preserve-3d;
          transition:transform .25s cubic-bezier(.22,.68,0,1.2),box-shadow .25s ease;
          cursor:default;will-change:transform;
        }
        /* Accent top-border stripe per card */
        .db-stat::before{content:"";position:absolute;top:0;left:16px;right:16px;height:2.5px;border-radius:0 0 3px 3px;opacity:.7;}
        .db-stat:nth-child(1)::before{background:linear-gradient(90deg,#4F46E5,#818CF8);}
        .db-stat:nth-child(2)::before{background:linear-gradient(90deg,#059669,#34D399);}
        .db-stat:nth-child(3)::before{background:linear-gradient(90deg,#F5A623,#FCD34D);}
        .db-stat:hover{
          transform:perspective(600px) rotateX(-6deg) rotateY(4deg) translateY(-4px) scale(1.03);
          box-shadow:0 20px 48px rgba(26,26,46,0.16),0 4px 12px rgba(26,26,46,0.08),inset 0 1px 0 rgba(255,255,255,0.98) !important;
        }
        .db-stat::after{content:"";position:absolute;inset:0;border-radius:12px;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0) 60%);opacity:0;transition:opacity .25s;}
        .db-stat:hover::after{opacity:1;}
        .db-stat-label{font-size:10px;color:#6366F1;margin-bottom:5px;display:flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}
        .dark .db-stat-label{color:#818CF8;}
        .db-stat-val{font-size:28px;font-weight:800;color:#1A1A2E;line-height:1;letter-spacing:-.02em;}
        .dark .db-stat-val{color:#F1F0FF;}
        .db-stat-sub{font-size:10px;color:#94A3B8;margin-top:4px;font-weight:500;}
        .dark .db-stat-sub{color:#6B7280;}
        .db-delta-up{color:#059669;font-weight:700;}
        .db-delta-dn{color:#DC2626;font-weight:700;}

        /* ── Archive verification summary tiles ── */
        .db-astat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
        .db-astat{
          border-radius:12px;padding:12px 13px;position:relative;overflow:hidden;
          border-left:3px solid var(--astat-color,#4F46E5);
          transition:transform .2s ease,box-shadow .2s ease;cursor:pointer;
        }
        .db-astat:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(26,26,46,0.12);}
        .db-astat-label{font-size:10px;margin-bottom:5px;display:flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--astat-color,#6366F1);}
        .dark .db-astat-label{filter:brightness(1.3);}
        .db-astat-val{font-size:22px;font-weight:800;color:#1A1A2E;line-height:1;letter-spacing:-.02em;}
        .dark .db-astat-val{color:#F1F0FF;}
        .db-astat-sub{font-size:9px;color:#94A3B8;margin-top:3px;font-weight:500;}
        .dark .db-astat-sub{color:#6B7280;}
        @media(max-width:480px){
          .db-astat-row{grid-template-columns:repeat(2,1fr);}
        }


        /* ── Image strip ── */
        .db-strip-wrap{border-radius:12px;overflow:hidden;}
        .db-strip-head{padding:8px 12px 7px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(79,70,229,0.08);}
        .dark .db-strip-head{border-bottom-color:rgba(255,255,255,0.06);}
        .db-strip-lbl{font-size:10px;font-weight:700;color:#1A1A2E;display:flex;align-items:center;gap:5px;letter-spacing:.05em;text-transform:uppercase;}
        .dark .db-strip-lbl{color:#E2E8F0;}
        .db-strip-meta{font-size:10px;color:#94A3B8;font-weight:500;}
        .dark .db-strip-meta{color:#6B7280;}

        /* ── Card ── */
        .db-card{border-radius:12px;}
        .db-card-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(79,70,229,0.08);}
        .dark .db-card-head{border-bottom-color:rgba(255,255,255,0.06);}
        .db-card-title{font-size:11px;font-weight:700;color:#1A1A2E;letter-spacing:.04em;text-transform:uppercase;}
        .dark .db-card-title{color:#E2E8F0;}
        .db-card-sub{font-size:10px;color:#94A3B8;font-weight:500;}
        .db-card-total{display:block;font-size:15px;font-weight:800;color:#1A1A2E;letter-spacing:-.01em;margin-top:2px;}
        .dark .db-card-total{color:#F1F0FF;}
        .db-legend{display:flex;gap:10px;}
        .db-leg{display:flex;align-items:center;gap:4px;font-size:10px;color:#94A3B8;font-weight:500;}
        .db-leg-line{width:14px;height:2.5px;border-radius:2px;}

        /* ── Insight cards (weather-widget style) ── */
        .db-insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}
        .db-insight-card{border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;}
        .db-insight-title{font-size:10px;font-weight:700;color:#1A1A2E;letter-spacing:.03em;text-transform:uppercase;}
        .dark .db-insight-title{color:#E2E8F0;}
        .db-insight-visual{flex:1;display:flex;align-items:center;justify-content:center;min-height:64px;}
        .db-insight-status{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#334155;}
        .dark .db-insight-status{color:#CBD5E1;}
        .db-insight-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
        .db-insight-desc{font-size:9.5px;color:#94A3B8;font-weight:500;line-height:1.4;}
        .dark .db-insight-desc{color:#6B7280;}

        /* ── Visits chart ── */
        .db-vchart-wrap{position:relative;width:100%;cursor:crosshair;}
        .db-vchart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:140px;color:#94A3B8;font-size:11px;font-weight:600;}
        .db-vtip{
          position:absolute;top:4px;transform:translateX(-50%);
          background:#1A1A2E;color:#fff;border-radius:10px;padding:8px 10px;
          font-size:10px;min-width:118px;pointer-events:none;z-index:5;
          box-shadow:0 10px 24px rgba(26,26,46,0.28);
        }
        .db-vtip-month{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#A5B4FC;margin-bottom:5px;}
        .db-vtip-row{display:flex;align-items:center;gap:5px;font-weight:500;color:#CBD5E1;padding:1.5px 0;}
        .db-vtip-row b{margin-left:auto;color:#fff;font-weight:800;}
        .db-vtip-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
        .db-vtip-dur{border-top:1px solid rgba(255,255,255,0.12);margin-top:3px;padding-top:4px;}

        /* ── Quick access ── */
        .db-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}
        .db-qbtn{
          border-radius:12px;padding:9px 11px;display:flex;align-items:flex-start;gap:9px;
          cursor:pointer;text-align:left;width:100%;position:relative;
          transform-style:preserve-3d;
          transition:transform .2s cubic-bezier(.22,.68,0,1.2),box-shadow .2s ease,background .15s;
          will-change:transform;
          border:1.5px solid transparent;
        }
        .db-qbtn::before{content:"";position:absolute;inset:0;border-radius:12px;background:linear-gradient(135deg,rgba(255,255,255,0.35) 0%,rgba(255,255,255,0) 55%);opacity:0;transition:opacity .2s;pointer-events:none;z-index:1;}
        .db-qbtn:hover{
          background:rgba(255,255,255,0.96) !important;
          border-color:rgba(79,70,229,0.18);
          transform:perspective(500px) rotateX(-5deg) rotateY(3deg) translateY(-3px) scale(1.02);
          box-shadow:0 14px 32px rgba(26,26,46,0.13),0 3px 8px rgba(26,26,46,0.07);
        }
        .db-qbtn:hover::before{opacity:1;}
        .db-qbtn:active{transform:perspective(500px) rotateX(2deg) rotateY(-1deg) translateY(1px) scale(0.98);box-shadow:0 2px 6px rgba(0,0,0,0.1);transition:transform .08s,box-shadow .08s;}
        .dark .db-qbtn:hover{background:rgba(30,33,52,0.92) !important;border-color:rgba(99,102,241,0.25);}
        .db-qicon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .db-qt{font-size:11px;font-weight:700;color:#1A1A2E;line-height:1.3;letter-spacing:.01em;}
        .dark .db-qt{color:#E2E8F0;}
        .db-qd{font-size:10px;color:#94A3B8;margin-top:2px;font-weight:500;}
        .db-qb{display:inline-block;font-size:9px;padding:2px 6px;border-radius:10px;margin-top:4px;font-weight:700;letter-spacing:.03em;}

        /* ── Table ── */
        .db-tbl{width:100%;border-collapse:collapse;table-layout:fixed;}
        .db-tbl th{font-size:9px;color:#6366F1;text-align:left;padding:6px 10px;border-bottom:1.5px solid rgba(79,70,229,0.1);font-weight:700;letter-spacing:.07em;text-transform:uppercase;}
        .dark .db-tbl th{color:#818CF8;border-bottom-color:rgba(99,102,241,0.2);}
        .db-tbl td{font-size:10px;color:#475569;padding:7px 10px;border-bottom:1px solid rgba(0,0,0,0.05);font-weight:500;}
        .dark .db-tbl td{color:#94A3B8;border-bottom-color:rgba(255,255,255,0.05);}
        .db-tbl tr:last-child td{border-bottom:none;}
        .db-tbl tr:hover td{background:rgba(79,70,229,0.04);}
        .dark .db-tbl tr:hover td{background:rgba(99,102,241,0.08);}
        .db-tbl td.nm{color:#1A1A2E;font-weight:700;}
        .dark .db-tbl td.nm{color:#E2E8F0;}
        .db-bdg{display:inline-block;font-size:9px;padding:2px 7px;border-radius:20px;font-weight:700;letter-spacing:.03em;}
        .db-bdg-g{background:#D1FAE5;color:#065F46;}
        .db-bdg-a{background:#FEF3C7;color:#92400E;}
        .db-bdg-r{background:#FEE2E2;color:#991B1B;}
        .db-bdg-b{background:#EEF2FF;color:#3730A3;}

        /* ── Right panel ── */
        .db-right{
          border-left:1.5px solid rgba(79,70,229,0.1);
          padding:1rem 1.125rem;
          display:flex;flex-direction:column;gap:1rem;
          min-width:0;position:sticky;top:0;max-height:100vh;overflow-y:auto;z-index:1;
          background:rgba(250,250,255,0.92);
          backdrop-filter:blur(24px) saturate(200%);
          -webkit-backdrop-filter:blur(24px) saturate(200%);
          box-shadow:-2px 0 24px rgba(79,70,229,0.06);
        }
        .dark .db-right{
          background:rgba(12,14,28,0.88);
          border-left-color:rgba(99,102,241,0.15);
          box-shadow:-4px 0 32px rgba(0,0,0,0.4);
        }
        .db-right-lbl{font-size:10px;font-weight:800;color:#4F46E5;margin-bottom:10px;letter-spacing:.08em;text-transform:uppercase;}
        .dark .db-right-lbl{color:#818CF8;}
        .db-rstat{padding-bottom:10px;border-bottom:1px solid rgba(79,70,229,0.08);}
        .dark .db-rstat{border-bottom-color:rgba(99,102,241,0.12);}
        .db-rstat:last-of-type{border-bottom:none;}
        .db-rstat-label{font-size:10px;color:#6366F1;margin-bottom:5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
        .dark .db-rstat-label{color:#818CF8;}
        .db-rstat-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;}
        .db-rstat-val{font-size:26px;font-weight:800;color:#1A1A2E;line-height:1;letter-spacing:-.02em;}
        .dark .db-rstat-val{color:#F1F0FF;}
        .db-mbars{display:flex;align-items:flex-end;gap:3px;height:36px;}
        .db-mbar{width:12px;border-radius:3px 3px 0 0;}
        .db-rstat-foot{font-size:9px;color:#94A3B8;margin-top:4px;font-weight:500;}
        .db-donut-row{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;}
        .db-donut-row::-webkit-scrollbar{height:4px;}
        .db-donut-row::-webkit-scrollbar-thumb{background:rgba(79,70,229,0.2);border-radius:4px;}
        .db-donut-row::-webkit-scrollbar-track{background:transparent;}
        .dark .db-donut-row::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.3);}
        .db-dcard{
          background:rgba(255,255,255,0.75);
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
          border:1.5px solid rgba(79,70,229,0.12);
          box-shadow:0 2px 12px rgba(79,70,229,0.08);
          border-radius:10px;padding:10px;display:flex;align-items:center;gap:9px;
          flex:0 0 auto;width:128px;
          transition:transform .22s cubic-bezier(.22,.68,0,1.2),box-shadow .22s ease;
          cursor:default;
        }
        .db-dcard:hover{
          transform:perspective(400px) rotateY(-8deg) rotateX(4deg) translateY(-3px) scale(1.04);
          box-shadow:0 14px 32px rgba(79,70,229,0.18),0 3px 8px rgba(79,70,229,0.09);
        }
        .dark .db-dcard{background:rgba(20,23,40,0.75);border-color:rgba(99,102,241,0.18);box-shadow:0 2px 12px rgba(0,0,0,0.3);}
        .db-dl{font-size:10px;color:#6366F1;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
        .dark .db-dl{color:#818CF8;}
        .db-dv{font-size:17px;font-weight:800;color:#1A1A2E;letter-spacing:-.01em;}
        .dark .db-dv{color:#F1F0FF;}
        .db-ds{font-size:9px;color:#94A3B8;font-weight:500;}
        .db-act-item{display:flex;gap:8px;padding:7px 0;border-bottom:1px solid rgba(79,70,229,0.07);}
        .dark .db-act-item{border-bottom-color:rgba(99,102,241,0.1);}
        .db-act-item:last-child{border-bottom:none;}
        .db-act-time{font-size:10px;color:#94A3B8;min-width:34px;padding-top:1px;flex-shrink:0;font-weight:600;}
        .db-act-dot{width:6px;height:6px;border-radius:50%;margin-top:5px;flex-shrink:0;}
        .db-act-text{font-size:11px;color:#334155;line-height:1.4;font-weight:500;}
        .dark .db-act-text{color:#94A3B8;}
        .db-right-divider{border-top:1px solid rgba(79,70,229,0.08);padding-top:.875rem;}
        .dark .db-right-divider{border-top-color:rgba(99,102,241,0.12);}

        /* ── Responsive ── */
        @media(max-width:900px){
          .db-shell{grid-template-columns:1fr;}
          .db-right{position:static;max-height:none;border-left:none;border-top:1.5px solid rgba(79,70,229,0.1);}
          .dark .db-right{border-top-color:rgba(99,102,241,0.15);}
        }
        @media(max-width:480px){
          .db-stat-row{grid-template-columns:1fr;}
          .db-quick-grid{grid-template-columns:1fr;}
          .db-insight-grid{grid-template-columns:1fr 1fr;}
          .db-hero{height:220px;}
          .db-hero-title{font-size:22px;}
        }
`}</style>

      <div className="db-shell">

        {/* ── MAIN ── */}
        <main className="db-main">

          {/* Hero — parallax slideshow */}
          <div className="db-hero" ref={heroRef}
            onMouseMove={handleHeroMouseMove}
            onMouseLeave={handleHeroMouseLeave}
            style={{perspective:"800px",transformStyle:"preserve-3d"}}>
            <div id="hero-bg" style={{position:"absolute",inset:0,width:"100%",height:"100%",transformOrigin:"center",transform:"scale(1.15)",transition:"transform 0.2s ease-out"}}>
              {featuredProjects.map((project, index) => (
                <img key={index} src={project.image} alt={project.title} loading="lazy"
                  style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",
                    opacity:index===currentIndex?1:0,transition:"opacity 700ms"}}/>
              ))}
              {/* Fallback gradient when no projects */}
              {featuredProjects.length===0&&(
                <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#534AB7 0%,#1D9E75 100%)"}}/>
              )}
            </div>

            {/* Gradient overlay */}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 50%,transparent 100%)",zIndex:10}}/>

            {/* Centered greeting */}
            <div style={{position:"absolute",inset:0,zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"1rem"}}>
              <div className="db-hero-eyebrow" style={{color:"rgba(255,255,255,0.8)",letterSpacing:".1em",fontSize:"12px",marginBottom:"8px"}}>{getGreeting()}, {firstName}</div>
              <div className="db-hero-title">Your eyes on every site.</div>
              <div style={{width:"80px",height:"1px",background:"rgba(255,255,255,0.4)",margin:"12px auto"}}/>
              <div className="db-hero-sub">Ensuring progress and precision across all projects.</div>
            </div>

            {/* Bottom project info */}
            {currentProject&&(
              <div style={{position:"absolute",bottom:0,left:0,padding:"1.25rem 1.5rem",zIndex:20}}>
                <span style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(8px)",color:"#fff",padding:"3px 10px",borderRadius:"20px",fontSize:"10px",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>
                  {currentProject.status}
                </span>
                <div style={{fontSize:"16px",fontWeight:600,color:"#fff",marginTop:"6px",textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>
                  {currentProject.title}
                </div>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.75)",marginTop:"2px"}}>
                  {currentProject.location}
                </div>
              </div>
            )}

            {/* Navigation dots */}
            {featuredProjects.length>1&&(
              <div style={{position:"absolute",bottom:"1.25rem",right:"1.25rem",zIndex:20,display:"flex",gap:"6px"}}>
                {featuredProjects.map((_,index)=>(
                  <button key={index} onClick={()=>setCurrentIndex(index)}
                    style={{width:"8px",height:"8px",borderRadius:"50%",border:"none",cursor:"pointer",transition:"all .3s",
                      background:index===currentIndex?"#fff":"rgba(255,255,255,0.45)",
                      transform:index===currentIndex?"scale(1.3)":"scale(1)"}}
                    aria-label={`Slide ${index+1}`}/>
                ))}
              </div>
            )}

            {/* Scroll indicator */}
            <div style={{position:"absolute",bottom:"6px",left:"50%",transform:"translateX(-50%)",zIndex:20}}>
              <ChevronDown style={{width:"14px",height:"14px",color:"rgba(255,255,255,0.45)",animation:"bounce 2s infinite"}}/>
            </div>
          </div>

          {/* Stat row */}
          <div className="db-stat-row db-reveal db-reveal-stagger">
            {permissions.employeeProjectVisit?.view&&(
              <div className="db-stat db-glass">
                <div className="db-stat-label">
                  <Users className="w-3 h-3" style={{color:"#7F77DD"}} aria-hidden="true"/>
                  Employee visits
                </div>
                <div className="db-stat-val">{todayEmp}</div>
                <div className="db-stat-sub">
                  <span className="db-delta-up">↑ today</span> · {monthEmp} this month
                </div>
              </div>
            )}
            {permissions.salesPersonProjectVisit?.view&&(
              <div className="db-stat db-glass">
                <div className="db-stat-label">
                  <TrendingUp className="w-3 h-3" style={{color:"#1D9E75"}} aria-hidden="true"/>
                  Sales visits
                </div>
                <div className="db-stat-val">{todaySal}</div>
                <div className="db-stat-sub">{monthSal} this month</div>
              </div>
            )}
            {permissions.erpCorrectionReport?.view&&(
              <div className="db-stat db-glass">
                <div className="db-stat-label">
                  <AlertCircle className="w-3 h-3" style={{color:"#A32D2D"}} aria-hidden="true"/>
                  Pending ERP
                </div>
                <div className="db-stat-val">{pendingERP}</div>
                <div className="db-stat-sub">
                  <span className="db-delta-dn">{openIT} open IT issues</span>
                </div>
              </div>
            )}
          </div>

          {/* Activity image strip */}
          {permissions.employeeCasualActivities?.view && (
            <div className="db-reveal"><CasualActivityImagesStrip/></div>
          )}

          {/* Sparkline card */}
          {(permissions.employeeProjectVisit?.view || permissions.salesPersonProjectVisit?.view) && (
            <div className="db-card db-glass db-reveal">
              <div className="db-card-head">
                <div>
                  <span className="db-card-title">Visits this year</span>
                  <span className="db-card-total">{(yearEmp + yearSal).toLocaleString()} total</span>
                </div>
                <div className="db-legend">
                  {permissions.employeeProjectVisit?.view && (
                    <div className="db-leg"><div className="db-leg-line" style={{background:"#7F77DD"}}/>Employee</div>
                  )}
                  {permissions.salesPersonProjectVisit?.view && (
                    <div className="db-leg"><div className="db-leg-line" style={{background:"#1D9E75",borderTop:"2px dashed #1D9E75",height:0}}/>Sales</div>
                  )}
                  {permissions.employeeProjectVisit?.view && (
                    <div className="db-leg"><div style={{width:"7px",height:"7px",borderRadius:"2px",background:"#F5A623",opacity:0.6,flexShrink:0}}/>Avg. duration</div>
                  )}
                </div>
              </div>
              <div style={{padding:"12px 10px 8px"}}>
                <VisitSparkline
                  employeeVisits={employeeVisits}
                  salesPersonVisits={salesPersonVisits}
                  showEmployee={!!permissions.employeeProjectVisit?.view}
                  showSales={!!permissions.salesPersonProjectVisit?.view}
                />
              </div>
            </div>
          )}

          {/* Insights — weather-widget style KPI cards */}
          {(permissions.employeeProjectVisit?.view || permissions.salesPersonProjectVisit?.view ||
            permissions.itResponseTimeline?.view || permissions.erpCorrectionReport?.view ||
            permissions.archiveDataVerification?.view) && (
            <div className="db-reveal">
              <div style={{fontSize:"10px",fontWeight:500,color:"#475569",marginBottom:"6px"}}>
                Insights
              </div>
              <div className="db-insight-grid db-reveal-stagger">
                {permissions.employeeProjectVisit?.view && (
                  <InsightCard
                    title="Employee visits"
                    statusColor={todayEmp >= (last5EmpBars[3] || 0) ? "#059669" : "#F5A623"}
                    statusLabel={todayEmp >= (last5EmpBars[3] || 0) ? "On track" : "Below usual pace"}
                    desc={`${monthEmp} visits logged this month, ${todayEmp} so far today.`}
                  >
                    <InsightTrend data={last5EmpBars} color="#7F77DD" />
                  </InsightCard>
                )}

                {permissions.salesPersonProjectVisit?.view && (
                  <InsightCard
                    title="Sales visits"
                    statusColor={todaySal >= (last5SalBars[3] || 0) ? "#059669" : "#F5A623"}
                    statusLabel={todaySal >= (last5SalBars[3] || 0) ? "On track" : "Below usual pace"}
                    desc={`${monthSal} visits logged this month, ${todaySal} so far today.`}
                  >
                    <InsightTrend data={last5SalBars} color="#1D9E75" />
                  </InsightCard>
                )}

                {permissions.itResponseTimeline?.view && totalIT > 0 && (
                  <InsightCard
                    title="IT response health"
                    statusColor={itOpenPct > 0.5 ? "#DC2626" : itOpenPct > 0.2 ? "#F5A623" : "#059669"}
                    statusLabel={itOpenPct > 0.5 ? "Needs attention" : itOpenPct > 0.2 ? "Moderate" : "Good"}
                    desc={`${openIT} of ${totalIT} tickets currently open.`}
                  >
                    <InsightRadial
                      pct={1 - itOpenPct}
                      color={itOpenPct > 0.5 ? "#DC2626" : itOpenPct > 0.2 ? "#F5A623" : "#059669"}
                      value={`${Math.round((1 - itOpenPct) * 100)}%`}
                      sub="Resolved"
                    />
                  </InsightCard>
                )}

                {permissions.erpCorrectionReport?.view && (
                  <InsightCard
                    title="ERP corrections"
                    statusColor={pendingERP > 10 ? "#DC2626" : pendingERP > 0 ? "#F5A623" : "#059669"}
                    statusLabel={pendingERP > 10 ? "High backlog" : pendingERP > 0 ? "Pending review" : "All clear"}
                    desc={pendingERP > 0 ? `${pendingERP} records awaiting correction.` : "No pending corrections right now."}
                  >
                    <InsightRadial
                      pct={pendingERP > 0 ? Math.min(1, pendingERP / 20) : 0}
                      color={pendingERP > 10 ? "#DC2626" : pendingERP > 0 ? "#F5A623" : "#059669"}
                      value={pendingERP}
                      sub="Pending"
                    />
                  </InsightCard>
                )}

                {permissions.archiveDataVerification?.view && archiveStats.totalRecords > 0 && (
                  <InsightCard
                    title="Archive verification"
                    statusColor={archiveStats.needsAttention > 0 ? "#F5A623" : "#059669"}
                    statusLabel={archiveStats.needsAttention > 0 ? "Needs review" : "On schedule"}
                    desc={`${archiveStats.checked} of ${archiveStats.totalRecords} records checked.`}
                  >
                    <InsightRadial
                      pct={archiveStats.checked / archiveStats.totalRecords}
                      color="#4F46E5"
                      value={`${Math.round((archiveStats.checked / archiveStats.totalRecords) * 100)}%`}
                      sub="Checked"
                    />
                  </InsightCard>
                )}
              </div>
            </div>
          )}

          {/* Quick access */}
          <div className="db-reveal">
            <div style={{fontSize:"10px",fontWeight:500,color:"#475569",marginBottom:"6px"}}>
              Quick access
            </div>
            <div className="db-quick-grid db-reveal-stagger">
              {menuItems.map((item:any)=>(
                <button key={item.view} className="db-qbtn db-glass" onClick={()=>onNavigate(item.view)}>
                  <div className="db-qicon" style={{background:item.bg,color:item.col}}>
                    {ICON_MAP[item.icon] ?? <span/>}
                  </div>
                  <div>
                    <div className="db-qt">{item.label}</div>
                    <div className="db-qd">{item.desc}</div>
                    {item.badge&&(
                      <span className="db-qb" style={{background:item.badge.bg,color:item.badge.col}}>
                        {item.badge.txt}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Archive Data Verification summary — only for users with access to this module */}
          {permissions.archiveDataVerification?.view && (
            <div className="db-card db-glass db-reveal" style={{overflow:"hidden"}}>
              <div className="db-card-head">
                <span className="db-card-title">Archive data verification</span>
                <button
                  onClick={()=>onNavigate("archiveDataVerification")}
                  className="db-card-sub"
                  style={{background:"none",border:"none",cursor:"pointer",fontWeight:700,color:"#4F46E5"}}
                >
                  View all →
                </button>
              </div>
              <div style={{padding:"12px"}}>
                <div className="db-astat-row db-reveal-stagger">
                  <div className="db-astat db-glass" style={{"--astat-color":"#4F46E5"} as React.CSSProperties}
                    onClick={()=>onNavigate("archiveDataVerification")}>
                    <div className="db-astat-label"><ClipboardList className="w-3 h-3"/>Total records</div>
                    <div className="db-astat-val">{archiveStats.totalRecords.toLocaleString()}</div>
                    <div className="db-astat-sub">{archiveStats.totalFiles.toLocaleString()} files</div>
                  </div>
                  <div className="db-astat db-glass" style={{"--astat-color":"#F5A623"} as React.CSSProperties}
                    onClick={()=>onNavigate("archiveDataVerification")}>
                    <div className="db-astat-label"><Clock className="w-3 h-3"/>Pending</div>
                    <div className="db-astat-val">{archiveStats.pending.toLocaleString()}</div>
                    <div className="db-astat-sub">Awaiting audit</div>
                  </div>
                  <div className="db-astat db-glass" style={{"--astat-color":"#059669"} as React.CSSProperties}
                    onClick={()=>onNavigate("archiveDataVerification")}>
                    <div className="db-astat-label"><CheckCircle2 className="w-3 h-3"/>Checked</div>
                    <div className="db-astat-val">{archiveStats.checked.toLocaleString()}</div>
                    <div className="db-astat-sub">Audit complete</div>
                  </div>
                  <div className="db-astat db-glass" style={{"--astat-color":"#DC2626"} as React.CSSProperties}
                    onClick={()=>onNavigate("archiveDataVerification")}>
                    <div className="db-astat-label"><AlertCircle className="w-3 h-3"/>Needs attention</div>
                    <div className="db-astat-val">{archiveStats.needsAttention.toLocaleString()}</div>
                    <div className="db-astat-sub">On hold / returned</div>
                  </div>
                  <div className="db-astat db-glass" style={{"--astat-color":"#A32D2D"} as React.CSSProperties}
                    onClick={()=>onNavigate("archiveDataVerification")}>
                    <div className="db-astat-label"><FileWarning className="w-3 h-3"/>Errors</div>
                    <div className="db-astat-val">{archiveStats.totalErrors.toLocaleString()}</div>
                    <div className="db-astat-sub">Reported total</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent visits table */}
          {permissions.employeeProjectVisit?.view && (
            <div className="db-card db-glass db-reveal" style={{overflow:"hidden"}}>
              <div className="db-card-head">
                <span className="db-card-title">Recent site visits</span>
                <span className="db-card-sub">Today + yesterday</span>
              </div>
              <table className="db-tbl">
                <thead>
                  <tr>
                    <th style={{width:"26%"}}>Employee</th>
                    <th style={{width:"24%"}}>Site</th>
                    <th style={{width:"22%"}}>Date</th>
                    <th style={{width:"15%"}}>Duration</th>
                    <th style={{width:"13%"}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVisits.length>0 ? recentVisits.map((v,i)=>(
                    <tr key={i}>
                      <td className="nm">{v.name}</td>
                      <td>{v.site}</td>
                      <td>{v.dateLabel}</td>
                      <td>{v.dur}</td>
                      <td>
                        <span className={`db-bdg ${v.status==="Done"?"db-bdg-g":v.status==="Active"?"db-bdg-b":"db-bdg-a"}`}>
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} style={{textAlign:"center",padding:"12px",fontStyle:"italic"}}>No visits recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

        </main>

        {/* ── RIGHT PANEL ── */}
        <aside className="db-right">

          {/* Site summary */}
          {(permissions.employeeProjectVisit?.view || permissions.salesPersonProjectVisit?.view) && (
            <div className="db-reveal">
              <div className="db-right-lbl">Site summary</div>
              {permissions.employeeProjectVisit?.view && (
                <div className="db-rstat">
                  <div className="db-rstat-label">Employee visits</div>
                  <div className="db-rstat-row">
                    <div className="db-rstat-val">{yearEmp.toLocaleString()}</div>
                    <div className="db-mbars">
                      {last5EmpBars.map((v,i)=>(
                        <div key={i} className="db-mbar"
                          style={{height:`${Math.max(4,Math.round((v/maxEmpBar)*28))}px`,
                            background:i===4?"#7F77DD":"#CECBF6"}}/>
                      ))}
                    </div>
                  </div>
                  <div className="db-rstat-foot">This year</div>
                </div>
              )}
              {permissions.salesPersonProjectVisit?.view && (
                <div className="db-rstat" style={{marginTop:"10px"}}>
                  <div className="db-rstat-label">Sales visits</div>
                  <div className="db-rstat-row">
                    <div className="db-rstat-val">{yearSal.toLocaleString()}</div>
                    <div className="db-mbars">
                      {last5SalBars.map((v,i)=>(
                        <div key={i} className="db-mbar"
                          style={{height:`${Math.max(4,Math.round((v/maxSalBar)*28))}px`,
                            background:i===4?"#1D9E75":"#9FE1CB"}}/>
                      ))}
                    </div>
                  </div>
                  <div className="db-rstat-foot">This year</div>
                </div>
              )}
            </div>
          )}

          {/* Donut breakdown */}
          {(permissions.employeeProjectVisit?.view || permissions.salesPersonProjectVisit?.view || permissions.itResponseTimeline?.view) && (
          <div className="db-right-divider db-reveal">
            <div className="db-right-lbl">Donut breakdown</div>
            <div className="db-donut-row" ref={donutRowRef}>
              {permissions.employeeProjectVisit?.view && (
              <div className="db-dcard">
                <svg width="48" height="48" viewBox="0 0 40 40" style={{flexShrink:0,filter:"drop-shadow(0 3px 6px rgba(127,119,221,0.35))"}}>
                  <defs>
                    <linearGradient id="emp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#9F9AE8"/>
                      <stop offset="100%" stopColor="#534AB7"/>
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6"/>
                  <circle cx="20" cy="20" r="14" fill="none" stroke="url(#emp-grad)" strokeWidth="6"
                    strokeDasharray={empRing.dasharray} strokeDashoffset={empRing.offset} strokeLinecap="round"/>
                  <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="600" fill="#0f172a">
                    {Math.round(empPct*100)}%
                  </text>
                </svg>
                <div><div className="db-dl">Emp.</div><div className="db-dv">{yearEmp.toLocaleString()}</div><div className="db-ds">this year</div></div>
              </div>
              )}
              {permissions.salesPersonProjectVisit?.view && (
              <div className="db-dcard">
                <svg width="48" height="48" viewBox="0 0 40 40" style={{flexShrink:0,filter:"drop-shadow(0 3px 6px rgba(29,158,117,0.35))"}}>
                  <defs>
                    <linearGradient id="sal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4EC99A"/>
                      <stop offset="100%" stopColor="#0F6E56"/>
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6"/>
                  <circle cx="20" cy="20" r="14" fill="none" stroke="url(#sal-grad)" strokeWidth="6"
                    strokeDasharray={salRing.dasharray} strokeDashoffset={salRing.offset} strokeLinecap="round"/>
                  <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="600" fill="#0f172a">
                    {Math.round(salPct*100)}%
                  </text>
                </svg>
                <div><div className="db-dl">Sales</div><div className="db-dv">{yearSal.toLocaleString()}</div><div className="db-ds">this year</div></div>
              </div>
              )}
              {permissions.itResponseTimeline?.view && (
              <div className="db-dcard">
                <svg width="48" height="48" viewBox="0 0 40 40" style={{flexShrink:0,filter:"drop-shadow(0 3px 6px rgba(226,75,74,0.35))"}}>
                  <defs>
                    <linearGradient id="it-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#F07C7B"/>
                      <stop offset="100%" stopColor="#B02020"/>
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6"/>
                  <circle cx="20" cy="20" r="14" fill="none" stroke="url(#it-grad)" strokeWidth="6"
                    strokeDasharray={itOpenRing.dasharray} strokeDashoffset={itOpenRing.offset} strokeLinecap="round"/>
                  <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="600" fill="#0f172a">
                    {openIT}
                  </text>
                </svg>
                <div><div className="db-dl">IT open</div><div className="db-dv">{openIT}</div><div className="db-ds">{inProgIT} offline</div></div>
              </div>
              )}
            </div>
          </div>
          )}

          {/* Recent activity */}
          <div className="db-right-divider db-reveal">
            <div className="db-right-lbl">সাম্প্রতিক কার্যক্রম</div>
            {recentActivity.map((a,i)=>(
              <div key={i} className="db-act-item">
                <div className="db-act-time">{a.time}</div>
                <div className="db-act-dot" style={{background:a.color}}/>
                <div className="db-act-text">{a.text}</div>
              </div>
            ))}
            {recentActivity.length===0&&(
              <div className="db-act-text" style={{fontStyle:"italic"}}>No recent activity.</div>
            )}
          </div>

          {/* IT issues donut */}
          {permissions.itResponseTimeline?.view && (
          <div className="db-right-divider db-reveal">
            <div className="db-right-lbl">IT issues breakdown</div>
            <svg width="100%" height="100" viewBox="0 0 160 100" style={{filter:"drop-shadow(0 6px 12px rgba(0,0,0,0.12))"}}>
              <defs>
                <linearGradient id="it-offline-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F5C260"/>
                  <stop offset="100%" stopColor="#C07010"/>
                </linearGradient>
                <linearGradient id="it-issue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F07C7B"/>
                  <stop offset="100%" stopColor="#B02020"/>
                </linearGradient>
              </defs>
              {/* 3D bottom shadow ring */}
              <ellipse cx="80" cy="60" rx="32" ry="6" fill="rgba(0,0,0,0.12)"/>
              {/* Track ring */}
              <circle cx="80" cy="52" r="32" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="16"/>
              {totalIT>0&&<>
                <circle cx="80" cy="52" r="32" fill="none" stroke="url(#it-offline-grad)" strokeWidth="16"
                  strokeDasharray={itOfflineRing.dasharray} strokeDashoffset={itOfflineRing.offset} strokeLinecap="round"/>
                <circle cx="80" cy="52" r="32" fill="none" stroke="url(#it-issue-grad)" strokeWidth="16"
                  strokeDasharray={itIssueRing.dasharray} strokeDashoffset={itIssueOffset} strokeLinecap="round"/>
              </>}
              {/* Inner highlight */}
              <circle cx="80" cy="52" r="22" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
              <text x="80" y="49" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">{totalIT}</text>
              <text x="80" y="61" textAnchor="middle" fontSize="8" fill="#94a3b8">total</text>
            </svg>
            <div style={{display:"flex",flexDirection:"column",gap:"4px",marginTop:"4px"}}>
              {[{c:"#EF9F27",l:`Offline — ${inProgIT}`},{c:"#E24B4A",l:`Open — ${openIT}`}].map(x=>(
                <div key={x.l} style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"10px",color:"#475569"}}>
                  <span style={{width:"7px",height:"7px",borderRadius:"50%",background:x.c,flexShrink:0,display:"inline-block"}}/>
                  {x.l}
                </div>
              ))}
            </div>
          </div>
          )}

        </aside>

      </div>
    </>
  );
};

export default Dashboard;