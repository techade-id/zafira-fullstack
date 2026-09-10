import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageTitle, DataTable, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE } from "../components/ui";

const ACTION_LABELS = { insert: "Tambah", update: "Ubah", delete: "Hapus", unlock: "Buka Kunci" };

const ENTITY_LABELS = {
  leads: "Prospek",
  customers: "Konsumen",
  customer_kpr: "Progres KPR",
  customer_documents: "Dokumen",
  payments: "Pembayaran",
  cancellations: "Pembatalan",
  profiles: "Pengguna",
  units: "Unit",
};

/** Field names are database columns; these are what the team calls them. */
function fieldLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\bid\b/g, "ID")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

const ACTION_STYLES = {
  insert: { bg: "#E4F2E8", color: "#166534" },
  update: { bg: "#E8EDF7", color: "#0F2A5C" },
  delete: { bg: "#FBE9E8", color: "#A6332C" },
  unlock: { bg: "#FDECE4", color: "#B93F0F" },
};

function ActionChip({ action }) {
  const s = ACTION_STYLES[action] || { bg: "#EEF1F6", color: "#516079" };
  return (
    <span style={{ padding: "4px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {ACTION_LABELS[action] || action}
    </span>
  );
}

/** Renders the per-column diff written by log_activity(). */
function ChangeSummary({ changes, action }) {
  if (!changes) return <span style={{ color: TEXT_MID }}>—</span>;

  if (action === "insert" || action === "delete") {
    const row = changes.after || changes.before || {};
    const name = row.name || row.full_name || row.doc_type || row.unit_code || row.payment_type;
    return <span style={{ color: TEXT_MID }}>{name ? formatValue(name) : "seluruh baris"}</span>;
  }

  const keys = Object.keys(changes).filter((k) => k !== "updated_at");
  if (keys.length === 0) return <span style={{ color: TEXT_MID }}>—</span>;

  return (
    <div style={{ whiteSpace: "normal", maxWidth: 420, lineHeight: 1.55 }}>
      {keys.slice(0, 4).map((k) => (
        <div key={k} style={{ fontSize: 12 }}>
          <span style={{ color: TEXT_MID }}>{fieldLabel(k)}: </span>
          <span style={{ textDecoration: "line-through", color: TEXT_MID }}>{formatValue(changes[k]?.dari)}</span>
          <span style={{ color: TEXT_MID }}> → </span>
          <span style={{ color: TEXT_DARK, fontWeight: 600 }}>{formatValue(changes[k]?.jadi)}</span>
        </div>
      ))}
      {keys.length > 4 && <div style={{ fontSize: 11, color: TEXT_MID }}>+{keys.length - 4} kolom lain</div>}
    </div>
  );
}

export default function LogAktivitasPage() {
  const [logs, setLogs] = useState([]);
  const [actors, setActors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function fetchLogs() {
    setLoading(true);
    setError("");

    let query = supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500);
    if (entity) query = query.eq("entity_type", entity);
    if (from) query = query.gte("created_at", `${from}T00:00:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59`);

    const [{ data, error: logError }, { data: people }] = await Promise.all([
      query,
      supabase.from("profiles").select("id, full_name"),
    ]);

    setLoading(false);
    if (logError) {
      setError(logError.message);
      setLogs([]);
      return;
    }
    setActors(Object.fromEntries((people || []).map((p) => [p.id, p.full_name])));
    setLogs(data || []);
  }

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, from, to]);

  const entities = useMemo(() => Object.keys(ENTITY_LABELS), []);

  return (
    <div>
      <PageTitle
        title="Log Aktivitas"
        subtitle="Jejak audit seluruh perubahan data — siapa mengubah apa, kapan, dari nilai berapa ke berapa"
      />

      <Card style={{ marginBottom: 18 }}>
        <div className="rg-4">
          <select value={entity} onChange={(e) => setEntity(e.target.value)} style={inputStyle}>
            <option value="">Semua modul</option>
            {entities.map((k) => (
              <option key={k} value={k}>
                {ENTITY_LABELS[k]}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} title="Dari tanggal" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} title="Sampai tanggal" />
          <button
            onClick={() => {
              setEntity("");
              setFrom("");
              setTo("");
            }}
            style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_MID, borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Reset filter
          </button>
        </div>
      </Card>

      {error && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>{error}</div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 6 }}>
            Log hanya dapat dibaca oleh Admin dan Pengawas. Jalankan <code>supabase/migration_008_roles_sod.sql</code> bila trigger audit belum terpasang.
          </div>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel="Belum ada aktivitas tercatat pada rentang ini."
          columns={[
            {
              key: "created_at",
              label: "Waktu",
              render: (row) =>
                new Date(row.created_at).toLocaleString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
            },
            {
              key: "entity_type",
              label: "Modul",
              render: (row) => (
                <span style={{ fontSize: 11, fontWeight: 600, background: PRIMARY_SOFT, color: PRIMARY, padding: "4px 10px", borderRadius: 999 }}>
                  {ENTITY_LABELS[row.entity_type] || row.entity_type}
                </span>
              ),
            },
            { key: "action", label: "Aksi", render: (row) => <ActionChip action={row.action} /> },
            { key: "actor", label: "Oleh", render: (row) => actors[row.actor_id] || "Sistem" },
            { key: "changes", label: "Perubahan", render: (row) => <ChangeSummary changes={row.changes} action={row.action} /> },
            { key: "note", label: "Catatan", render: (row) => row.note || "-" },
          ]}
          rows={logs}
        />
        <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 10 }}>
          Menampilkan maksimal 500 entri terbaru. Persempit rentang tanggal untuk melihat yang lebih lama.
        </div>
      </Card>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
};
