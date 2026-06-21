import React from "react";
import { adminPersonalRides } from "../../services/personalRideService";
import { StatCard, Badge, useAdminList, fmtDateTime } from "./AdminUI";

const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const STATUS_TONE = {
    SEARCHING: "amber", DRIVER_ASSIGNED: "blue", RIDE_STARTED: "blue",
    RIDE_COMPLETED: "green", PAYMENT_RECEIVED: "green",
    CANCELLED: "grey", EXPIRED: "red", NO_DRIVERS: "red",
};
const label = (s) => (s || "").replace(/_/g, " ");

const Ico = {
    car: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle></svg>,
    live: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>,
    check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    rupee: <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>₹</span>,
    x: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
};

const AdminPersonalRides = () => {
    const { items, meta, stats, loading, params, setParam, setPage } = useAdminList(adminPersonalRides, {});
    const st = stats || {};

    return (
        <div>
            <div className="adm-stats">
                <StatCard icon={Ico.live} value={loading ? "—" : (st.active ?? 0)} label="Active Requests" sub="searching / assigned / on trip" />
                <StatCard icon={Ico.car} value={loading ? "—" : (st.assigned ?? 0)} label="Assigned" sub="driver en route" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.completed ?? 0)} label="Completed Trips" sub="finished rides" />
                <StatCard icon={Ico.rupee} value={loading ? "—" : (st.paid ?? 0)} label="Paid" sub="payment received" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.cancelled ?? 0)} label="Cancelled" sub="by rider/driver" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.failed ?? 0)} label="Failed" sub="expired / no drivers" />
            </div>

            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input placeholder="Search by passenger, driver, or location…" value={params.q || ""} onChange={(e) => setParam({ q: e.target.value })} />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Statuses</option>
                    {["SEARCHING", "DRIVER_ASSIGNED", "RIDE_STARTED", "RIDE_COMPLETED", "PAYMENT_RECEIVED", "CANCELLED", "EXPIRED", "NO_DRIVERS"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
            </div>

            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>🚗</span><span>No personalized rides match these filters.</span></div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>Passenger</th><th>Driver</th><th>Route</th><th>Type</th><th>Fare</th><th>Status</th><th>Created</th></tr></thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>{r.passenger_id?.name || r.passengerName || "—"}</td>
                                            <td>{r.driver_id?.name || r.driverName || <span className="adm-muted">—</span>}</td>
                                            <td><span className="adm-cell-stack"><span>{r.pickup?.address || "—"}</span><span className="adm-cell-sub">→ {r.destination?.address || "—"}</span></span></td>
                                            <td>{r.vehicleType}</td>
                                            <td>{inr(r.finalFare || r.estimatedFare)}</td>
                                            <td><Badge value={label(r.status)} tone={STATUS_TONE[r.status]} /></td>
                                            <td>{fmtDateTime(r.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="adm-table-foot">
                            <div className="adm-foot-pager">
                                <button className="adm-btn" disabled={!meta || meta.page <= 1} onClick={() => setPage((meta?.page || 1) - 1)}>← Prev</button>
                                <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                                <button className="adm-btn" disabled={!meta || meta.page >= meta.pages} onClick={() => setPage((meta?.page || 1) + 1)}>Next →</button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminPersonalRides;
