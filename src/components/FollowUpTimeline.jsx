import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useBusinessSettings, withCurrentValue } from "../lib/useBusinessSettings";
import { canWrite } from "../lib/permissions";
import { Card, PrimaryButton, DeleteButton, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT, NEGATIVE } from "./ui";

/**
 * Chronological communication log (PRD §4.2).
 *
 * Every entry records date/time, who did it, the note, and the outcome — and
 * because it writes to `lead_activities`, everything typed here is reachable
 * from the global Notes search (REVISI §1.3).
 *
 * This is also the one channel that stays open to Sales after the Handover
 * Hard-Lock, so the relationship history does not stop at booking.
 */
export default function FollowUpTimeline({ leadId, customerId, title = "Riwayat Follow Up" }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ activity: "", note: "", hasil: "" });

  const hasilOptions = useBusinessSettings("hasil_followup");
  const mayWrite = canWrite(profile, "followup");

  const fetchRows = useCallback(async () => {
    if (!leadId && !customerId) return;
    setLoading(true);

    let query = supabase.from("lead_activities").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(100);
    query = leadId ? query.eq("lead_id", leadId) : query.eq("customer_id", customerId);

    const { data, error: fetchError } = await query;
    setLoading(false);
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setError("");
    setRows(data || []);
  }, [leadId, customerId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function add() {
    if (!form.activity.trim() && !form.note.trim()) {
      setError("Isi aktivitas atau catatan terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("lead_activities").insert({
      lead_id: leadId || null,
      customer_id: customerId || null,
      actor_id: profile?.id || null,
      activity: form.activity.trim() || "Follow up",
      note: form.note.trim() || null,
      hasil: form.hasil || null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setForm({ activity: "", note: "", hasil: "" });
    fetchRows();
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: TEXT_MID }}>{rows.length} aktivitas tercatat</div>
      </div>

      {mayWrite && (
        <div style={{ marginBottom: 18 }}>
          <div className="rg-3" style={{ marginBottom: 10 }}>
            <input
              placeholder="Aktivitas (mis. Telepon, WhatsApp, Survei)"
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value })}
              style={inputStyle}
            />
            <select value={form.hasil} onChange={(e) => setForm({ ...form, hasil: e.target.value })} style={inputStyle}>
              <option value="">Hasil Follow Up</option>
              {withCurrentValue(hasilOptions, form.hasil).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <PrimaryButton subject="followup" onClick={add} disabled={saving} style={{ justifySelf: "start" }}>
              {saving ? "Menyimpan…" : "Tambah Catatan"}
            </PrimaryButton>
          </div>
          <textarea
            placeholder="Catatan komunikasi — isi selengkap mungkin, seluruh teks ini dapat dicari lewat kotak pencarian di atas."
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ ...inputStyle, width: "100%", minHeight: 62, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: NEGATIVE, marginBottom: 10 }}>{error}</div>}

      {loading && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Memuat riwayat…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada riwayat komunikasi.</div>
      )}

      <div>
        {rows.map((row, i) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 0",
              borderBottom: i === rows.length - 1 ? "none" : `1px solid ${BORDER}`,
            }}
          >
            {/* Timeline rail: a dot per entry, newest at the top. */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: i === 0 ? ACCENT : PRIMARY_SOFT, border: `1px solid ${i === 0 ? ACCENT : BORDER}` }} />
              {i !== rows.length - 1 && <span style={{ flex: 1, width: 1, background: BORDER, marginTop: 4 }} />}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>{row.activity}</span>
                {row.hasil && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, background: PRIMARY_SOFT, color: PRIMARY, padding: "3px 9px", borderRadius: 999 }}>
                    {row.hasil}
                  </span>
                )}
              </div>
              {row.note && <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{row.note}</div>}
              <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 4 }}>
                {row.profiles?.full_name || "Sistem"} ·{" "}
                {new Date(row.created_at).toLocaleString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>

            <DeleteButton
              subject="agent_role"
              itemName={row.activity}
              onDelete={() => supabase.from("lead_activities").delete().eq("id", row.id)}
              onDone={fetchRows}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
