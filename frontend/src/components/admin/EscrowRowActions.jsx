import React, { useState } from "react";
import { adminPaymentEscrowAction } from "../../services/adminService";
import { Modal } from "./AdminUI";
import { toast } from "react-toastify";

// Three-dot actions for a payment row: release escrow to the driver, refund the
// passenger, or copy the order id. Action availability depends on escrow state.
// A mandatory note is captured for each money-moving action (audit trail).
export default function EscrowRowActions({ row, onDone }) {
    const [menu, setMenu] = useState(null);
    const [busy, setBusy] = useState(false);
    const [prompt, setPrompt] = useState(null); // { action }
    const [note, setNote] = useState("");
    const esc = row.escrowStatus;
    const canRelease = row.status === "Successful" && ["held", "awaiting_completion"].includes(esc);
    const canRefund = row.status === "Successful" && ["held", "awaiting_completion", "disputed"].includes(esc);

    const openPrompt = (action) => { setMenu(null); setNote(""); setPrompt({ action }); };

    const confirm = async () => {
        if (!prompt) return;
        if (note.trim().length < 5) { toast.info("Please add a note explaining this action (at least 5 characters)."); return; }
        setBusy(true);
        try {
            const { data } = await adminPaymentEscrowAction(row._id, prompt.action, note.trim());
            toast.success(data.message || "Done");
            setPrompt(null); setNote("");
            onDone?.();
        } catch (e) {
            toast.error(e.response?.data?.message || "Action failed");
        } finally { setBusy(false); }
    };

    const copyId = () => {
        setMenu(null);
        try { navigator.clipboard.writeText(row.order_id || String(row._id)); toast.success("Order ID copied"); }
        catch { toast.info(row.order_id || String(row._id)); }
    };

    return (
        <>
            <button className="adm-icon-btn adm-dots" disabled={busy} aria-label="More"
                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom }); }}>⋮</button>
            {menu && (
                <>
                    <div className="adm-menu-backdrop" onClick={() => setMenu(null)} />
                    <div className="adm-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 200) }}>
                        {canRelease && <button onClick={() => openPrompt("release")}>✓ Release to driver…</button>}
                        {canRefund && <button className="danger" onClick={() => openPrompt("refund")}>↩ Refund passenger…</button>}
                        {!canRelease && !canRefund && <button disabled style={{ opacity: 0.55, cursor: "default" }}>No escrow actions</button>}
                        <button onClick={copyId}>⧉ Copy Order ID</button>
                    </div>
                </>
            )}
            {prompt && (
                <Modal
                    title={prompt.action === "release" ? "Release escrow to driver" : "Refund passenger"}
                    onClose={() => { setPrompt(null); setNote(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setPrompt(null); setNote(""); }} disabled={busy}>Cancel</button>
                            <button className={`adm-btn ${prompt.action === "refund" ? "danger" : "success"}`} onClick={confirm} disabled={busy}>
                                {busy ? "Working…" : (prompt.action === "release" ? "Release" : "Refund")}
                            </button>
                        </>
                    }
                >
                    <div className="adm-kv"><span className="k">Amount</span><span>₹{row.amount}</span></div>
                    <div className="adm-kv"><span className="k">Escrow</span><span>{(row.escrowStatus || "—").replace(/_/g, " ")}</span></div>
                    <p style={{ fontSize: "0.82rem", color: "#fca5a5", margin: "0.7rem 0" }}>
                        This moves real funds and can't be undone.
                    </p>
                    <textarea
                        className="adm-textarea"
                        placeholder="Note explaining this action (required, at least 5 characters)…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                </Modal>
            )}
        </>
    );
}
