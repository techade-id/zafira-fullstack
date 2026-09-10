import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useNotesSearch, groupByModule, MIN_QUERY } from "../lib/useNotesSearch";
import { Highlight, targetUrl } from "../components/GlobalSearch";
import { Card, PageTitle, PrimaryButton, DataTable, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, NEGATIVE } from "../components/ui";

export default function PencarianPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = params.get("q") || "";

  const [input, setInput] = useState(initial);
  const [modul, setModul] = useState("");

  // Keep the box in step with the URL, so a link shared into the team chat or
  // the browser Back button both land on the query they name.
  useEffect(() => {
    setInput(params.get("q") || "");
  }, [params]);

  const { results, loading, error } = useNotesSearch(initial, { limit: 200 });

  const groups = groupByModule(results);
  const moduls = groups.map((g) => g.modul);
  const shown = modul ? results.filter((r) => r.modul === modul) : results;

  function submit(e) {
    e.preventDefault();
    const q = input.trim();
    setParams(q ? { q } : {});
  }

  return (
    <div>
      <PageTitle
        title="Pencarian Catatan"
        subtitle={
          initial.length >= MIN_QUERY
            ? `${results.length} hasil untuk “${initial}”`
            : `Cari di seluruh catatan, riwayat follow-up, kendala KPR, dan komplain (minimal ${MIN_QUERY} karakter)`
        }
      />

      <Card style={{ marginBottom: 18 }}>
        <form onSubmit={submit} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 12px" }}>
            <Search size={15} color={TEXT_MID} />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Kata kunci — bisa sepotong kata di tengah kalimat"
              autoFocus
              style={{ flex: 1, border: "none", outline: "none", padding: "11px 0", fontSize: 13, color: TEXT_DARK }}
            />
          </div>
          <PrimaryButton type="submit">Cari</PrimaryButton>
        </form>

        {moduls.length > 1 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
            <FilterChip label={`Semua (${results.length})`} active={!modul} onClick={() => setModul("")} />
            {groups.map((g) => (
              <FilterChip key={g.modul} label={`${g.modul} (${g.rows.length})`} active={modul === g.modul} onClick={() => setModul(g.modul)} />
            ))}
          </div>
        )}
      </Card>

      {error && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>{error}</div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 6 }}>
            Jalankan <code>supabase/migration_007_notes_search.sql</code> di SQL Editor bila fungsi pencarian belum terpasang.
          </div>
        </Card>
      )}

      <Card>
        <DataTable
          loading={loading}
          emptyLabel={initial.length < MIN_QUERY ? `Ketik minimal ${MIN_QUERY} karakter untuk mulai mencari.` : "Tidak ada catatan yang cocok."}
          columns={[
            {
              key: "modul",
              label: "Modul",
              render: (row) => (
                <span style={{ fontSize: 11, fontWeight: 600, background: PRIMARY_SOFT, color: PRIMARY, padding: "4px 10px", borderRadius: 999 }}>
                  {row.modul}
                </span>
              ),
            },
            { key: "judul", label: "Data", render: (row) => <Highlight text={row.judul} q={initial} /> },
            { key: "field_cocok", label: "Kolom", render: (row) => <span style={{ color: TEXT_MID }}>{row.field_cocok}</span> },
            {
              key: "cuplikan",
              label: "Cuplikan",
              render: (row) => (
                <div style={{ maxWidth: 460, whiteSpace: "normal", lineHeight: 1.5 }}>
                  <Highlight text={row.cuplikan} q={initial} />
                </div>
              ),
            },
            { key: "aktor", label: "Oleh", render: (row) => row.aktor || "-" },
            { key: "tanggal", label: "Tanggal", render: (row) => (row.tanggal ? new Date(row.tanggal).toLocaleDateString("id-ID") : "-") },
            {
              key: "aksi",
              label: "",
              render: (row) => (
                <button
                  onClick={() => navigate(targetUrl(row, initial))}
                  style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEXT_DARK, borderRadius: 9, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Buka
                </button>
              ),
            },
          ]}
          rows={shown}
        />
      </Card>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? PRIMARY : BORDER}`,
        background: active ? PRIMARY : "#fff",
        color: active ? "#fff" : TEXT_MID,
        borderRadius: 999,
        padding: "6px 13px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
