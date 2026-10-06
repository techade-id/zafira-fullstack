import React from "react";
import { PRIMARY, SURFACE, BORDER, TEXT_MID } from "./ui";

/**
 * BRIEF §Dashboard: "menginginkan filter yang lebih spesifik berdasarkan bulan
 * berjalan (mis. beberapa prospect bulan ini, berapa booking, berapa akad)".
 *
 * Bulan berjalan didahulukan dan menjadi bawaan. "Semua" tetap ada, tetapi ia
 * bukan pertanyaan yang ditanyakan setiap pagi — yang ditanyakan setiap pagi
 * adalah bulan ini sudah sampai mana.
 *
 * Dipakai bersama oleh Dashboard dan Laporan: keduanya membaca
 * dashboard_stats() dan harus memaknai "Bulan ini" dengan cara yang sama.
 */
export const RANGES = [
  { key: "month", label: "Bulan ini" },
  { key: "7", label: "7 hari" },
  { key: "30", label: "30 hari" },
  { key: "all", label: "Semua" },
  { key: "custom", label: "Kustom" },
];

function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Turn the selected preset into the {from,to} the RPC expects. */
export function rangeToDates(key, custom) {
  const today = new Date();
  if (key === "all") return { from: null, to: null };
  if (key === "custom") return { from: custom.from || null, to: custom.to || null };
  if (key === "month") {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  }
  const back = new Date(today);
  back.setDate(today.getDate() - Number(key));
  return { from: iso(back), to: iso(today) };
}

export function labelRange(key) {
  return RANGES.find((r) => r.key === key)?.label || "Periode ini";
}

/** Satu kontrol bersegmen, bukan lima pil lepas di dalam kartunya sendiri. */
export default function FilterPeriode({ range, onRange, custom, onCustom }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
      <div
        role="group"
        aria-label="Periode"
        style={{
          display: "flex",
          gap: 2,
          padding: 3,
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        {RANGES.map((r) => {
          const aktif = range === r.key;
          return (
            <button
              key={r.key}
              onClick={() => onRange(r.key)}
              aria-pressed={aktif}
              style={{
                padding: "6px 13px",
                borderRadius: 999,
                border: "none",
                background: aktif ? PRIMARY : "transparent",
                color: aktif ? "#fff" : TEXT_MID,
                fontSize: 12.5,
                fontWeight: aktif ? 600 : 500,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {range === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" aria-label="Dari tanggal" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} style={dateStyle} />
          <span style={{ fontSize: 12, color: TEXT_MID }}>s/d</span>
          <input type="date" aria-label="Sampai tanggal" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} style={dateStyle} />
        </div>
      )}
    </div>
  );
}

const dateStyle = {
  padding: "6px 10px",
  border: `1px solid ${BORDER}`,
  borderRadius: 999,
  fontSize: 12,
  background: SURFACE,
  outline: "none",
};
