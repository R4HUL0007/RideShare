import React, { useCallback, useEffect, useState } from "react";

/* ---------------- Stat card ---------------- */
// `sub` is an optional muted caption rendered under the label (e.g. "vs last 30 days").
export const StatCard = ({ icon, value, label, sub }) => (
    <div className="adm-stat">
        <span className="adm-stat-icon">{icon}</span>
        <div className="adm-stat-body">
            <div className="adm-stat-value">{value}</div>
            <div className="adm-stat-label">{label}</div>
            {sub && <div className="adm-stat-sub">{sub}</div>}
        </div>
    </div>
);

/* ---------------- Donut chart (monochrome, no deps) ---------------- */
// segments: [{ label, value, color }]
export const Donut = ({ segments = [], size = 128, thickness = 16 }) => {
    const total = segments.reduce((s, x) => s + (x.value || 0), 0);
    const r = (size - thickness) / 2;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    return (
        <svg className="adm-donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={thickness} />
            {total > 0 && segments.map((seg, i) => {
                const frac = (seg.value || 0) / total;
                const dash = frac * circ;
                const node = (
                    <circle
                        key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                        stroke={seg.color} strokeWidth={thickness}
                        strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-offset}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                );
                offset += dash;
                return node;
            })}
        </svg>
    );
};

/* ---------------- Badge ---------------- */
const TONE = {
    active: "green", Successful: "green", released: "green", Processed: "green", approve: "green", Approved: "green", approved: "green",
    suspended: "red", Failed: "red", disputed: "red", Rejected: "red", rejected: "red", open: "red", flagged: "amber", frozen: "blue",
    Pending: "amber", pending: "amber", awaiting_completion: "amber", held: "amber", under_review: "amber", Requested: "amber", Booked: "blue",
    Completed: "blue", refunded: "blue", Refunded: "blue", Available: "grey", Cancelled: "grey", not_submitted: "grey", resolved: "green",
};
export const Badge = ({ value, tone }) => {
    const cls = tone || TONE[value] || "grey";
    const label = String(value || "—").replace(/_/g, " ");
    return <span className={`adm-badge ${cls}`}>{label}</span>;
};

/* ---------------- Pagination ---------------- */
export const Pager = ({ meta, onPage }) => {
    if (!meta) return null;
    return (
        <div className="adm-pager">
            <button className="adm-btn" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>← Prev</button>
            <span>Page {meta.page} of {meta.pages} · {meta.total} total</span>
            <button className="adm-btn" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next →</button>
        </div>
    );
};

/* ---------------- Modal ---------------- */
export const Modal = ({ title, children, onClose, actions, size }) => (
    <div className="adm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
        <div className={`adm-modal ${size === "lg" ? "adm-modal--lg" : ""} ${size === "xl" ? "adm-modal--xl" : ""}`} role="dialog" aria-modal="true">
            {title && <div className="adm-modal-title">{title}</div>}
            {children}
            {actions && <div className="adm-modal-actions">{actions}</div>}
        </div>
    </div>
);

/* ---------------- DataTable ---------------- */
// columns: [{ key, label, render?(row) }]
export const DataTable = ({ columns, rows, loading, empty = "No records found." }) => {
    if (loading) {
        return <div><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>;
    }
    if (!rows || rows.length === 0) {
        return <div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>📭</span><span>{empty}</span></div>;
    }
    return (
        <div className="adm-table-wrap">
            <table className="adm-table">
                <thead>
                    <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={row._id || row.rideId || i}>
                            {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

/* ---------------- Lightweight charts (no deps) ---------------- */
export const BarChart = ({ data, xKey = "_id", yKey = "count", height = 180 }) => {
    if (!data || data.length === 0) return <div className="adm-chart-empty">No data yet</div>;
    const w = Math.max(data.length * 22, 200);
    const max = Math.max(...data.map((d) => d[yKey] || 0), 1);
    const bw = w / data.length * 0.62;
    const gap = w / data.length;
    return (
        <svg className="adm-chart" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
            {data.map((d, i) => {
                const h = ((d[yKey] || 0) / max) * (height - 24);
                return (
                    <g key={i}>
                        <rect className="adm-bar" x={i * gap + (gap - bw) / 2} y={height - h - 4} width={bw} height={h} rx="2">
                            <title>{`${d[xKey]}: ${d[yKey]}`}</title>
                        </rect>
                    </g>
                );
            })}
        </svg>
    );
};

export const LineChart = ({ data, xKey = "_id", yKey = "count", height = 180 }) => {
    if (!data || data.length === 0) return <div className="adm-chart-empty">No data yet</div>;
    const w = Math.max(data.length * 20, 200);
    const max = Math.max(...data.map((d) => d[yKey] || 0), 1);
    const pts = data.map((d, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * w;
        const y = height - 6 - ((d[yKey] || 0) / max) * (height - 18);
        return [x, y];
    });
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${path} L${w},${height} L0,${height} Z`;
    return (
        <svg className="adm-chart" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
            <path className="adm-area" d={area} />
            <path className="adm-line" d={path} />
        </svg>
    );
};

/* ---------------- useAdminList hook (server pagination + filters) ---------------- */
export function useAdminList(fetcher, initialParams = {}) {
    const [items, setItems] = useState([]);
    const [meta, setMeta] = useState(null);
    const [stats, setStats] = useState(null);
    const [filters, setFilters] = useState(null);
    const [loading, setLoading] = useState(true);
    const [params, setParams] = useState({ page: 1, ...initialParams });

    const load = useCallback(async (p) => {
        setLoading(true);
        try {
            const { data } = await fetcher(p);
            setItems(data.items || []);
            setMeta(data.meta || null);
            setStats(data.stats || null);
            setFilters(data.filters || null);
        } catch {
            setItems([]); setMeta(null); setStats(null); setFilters(null);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { load(params); }, [params, load]);

    const setParam = (patch) => setParams((prev) => ({ ...prev, page: 1, ...patch }));
    const setPage = (page) => setParams((prev) => ({ ...prev, page }));
    const reload = () => load(params);

    return { items, meta, stats, filters, loading, params, setParam, setPage, reload };
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
