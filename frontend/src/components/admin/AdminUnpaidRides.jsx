import React, { useEffect, useState, useCallback } from "react";
import { adminUnpaidRides } from "../../services/adminService";
import { Badge, StatCard, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

// Admin oversight for the pay-after-completion model: every completed ride a
// passenger still owes money on (shared) or hasn't paid (personalized).
const AdminUnpaidRides = () => {
    const [data, setData] = useState({ items: [], count: 0, totalOwed: 0 });
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminUnpaidRides();
            setData(res.data || { items: [], count: 0, totalOwed: 0 });
        } catch (e) {
            toast.error(e.response?.data?.message || "Failed to load unpaid rides");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div>
            <div className="adm-stats">
                <StatCard icon="💸" value={loading ? "—" : data.count} label="Unpaid Rides" sub="completed, awaiting payment" />
                <StatCard icon="💰" value={loading ? "—" : `₹${data.totalOwed}`} label="Total Owed" sub="across all unpaid rides" />
            </div>

            <div className="adm-toolbar">
                <div style={{ fontWeight: 700 }}>Completed rides awaiting payment</div>
                <button className="adm-select" onClick={load} disabled={loading} style={{ cursor: "pointer" }}>
                    {loading ? "Refreshing…" : "↻ Refresh"}
                </button>
            </div>

            <div className="adm-table-wrap">
                {loading ? (
                    <div className="adm-empty">Loading…</div>
                ) : data.items.length === 0 ? (
                    <div className="adm-empty">No unpaid completed rides. 🎉</div>
                ) : (
                    <table className="adm-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Passenger</th>
                                <th>Route</th>
                                <th>Amount owed</th>
                                <th>Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.map((it, i) => (
                                <tr key={`${it.type}-${it.rideId}-${i}`}>
                                    <td><Badge value={it.type === "shared" ? "Shared" : "Personal"} tone={it.type === "shared" ? "blue" : "grey"} /></td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{it.passenger?.name || "—"}</div>
                                        {it.passenger?.email && <div style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{it.passenger.email}</div>}
                                    </td>
                                    <td>{it.route}</td>
                                    <td style={{ fontWeight: 800 }}>₹{it.amount}</td>
                                    <td>{fmtDateTime(it.completedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default AdminUnpaidRides;
