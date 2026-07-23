import React from "react";

export const ORANGE = "#ff7a1a";
export const ORANGE_DARK = "#e8630a";
export const ORANGE_LIGHT = "#fff1e6";
export const ORANGE_PALE = "#ffe4cc";
export const BORDER = "#f0dfc8";
export const TEXT_DARK = "#2c2013";
export const TEXT_MID = "#6b5c4c";

export function Card({ children, style }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      <div>
        <h2 style={{ fontSize: 18, margin: 0, marginBottom: subtitle ? 4 : 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: TEXT_MID, margin: 0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: ORANGE,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "9px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

const badgeColors = {
  baru: { bg: "#e6f1fb", color: "#185fa5" },
  dihubungi: { bg: "#faeeda", color: "#854f0b" },
  appointment: { bg: "#eeedfe", color: "#3c3489" },
  closing: { bg: "#e2f6e5", color: "#28864a" },
  cancel: { bg: "#fde8e8", color: "#c23b3b" },
  batal: { bg: "#fde8e8", color: "#c23b3b" },
  proses: { bg: ORANGE_PALE, color: ORANGE_DARK },
  aktif: { bg: "#e6f1fb", color: "#185fa5" },
  selesai: { bg: "#e2f6e5", color: "#28864a" },
  menunggu: { bg: "#fde8e8", color: "#c23b3b" },
  terverifikasi: { bg: "#e2f6e5", color: "#28864a" },
  ditolak: { bg: "#fde8e8", color: "#c23b3b" },
  tersedia: { bg: "#e2f6e5", color: "#28864a" },
  booking: { bg: ORANGE_PALE, color: ORANGE_DARK },
  terjual: { bg: "#e6f1fb", color: "#185fa5" },
  belum_mulai: { bg: "#f1efe8", color: "#5f5e5a" },
  berjalan: { bg: ORANGE_PALE, color: ORANGE_DARK },
  terlambat: { bg: "#fde8e8", color: "#c23b3b" },
  diproses: { bg: ORANGE_PALE, color: ORANGE_DARK },
  rendah: { bg: "#f1efe8", color: "#5f5e5a" },
  sedang: { bg: "#faeeda", color: "#854f0b" },
  tinggi: { bg: "#fde8e8", color: "#c23b3b" },
};

export function Badge({ value }) {
  const key = (value || "").toLowerCase().replace(" ", "_");
  const s = badgeColors[key] || { bg: "#f1efe8", color: "#5f5e5a" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap", display: "inline-block", textTransform: "capitalize" }}>
      {value}
    </span>
  );
}

export function DataTable({ columns, rows, loading, emptyLabel = "Belum ada data." }) {
  if (loading) {
    return <div style={{ padding: 20, color: TEXT_MID, fontSize: 13 }}>Memuat data...</div>;
  }
  if (!rows || rows.length === 0) {
    return <div style={{ padding: 20, color: TEXT_MID, fontSize: 13 }}>{emptyLabel}</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: "left", color: TEXT_MID, fontWeight: 600, padding: "8px 10px", borderBottom: `2px solid ${ORANGE_PALE}`, whiteSpace: "nowrap" }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: "10px 10px", borderBottom: i === rows.length - 1 ? "none" : `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
