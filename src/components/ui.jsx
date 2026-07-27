import React from "react";

/* ============================================================
   Design tokens — calm sage/forest palette on a soft neutral page.
   ============================================================ */

export const PRIMARY = "#4b6b4f";        // deep forest green — buttons, active nav
export const PRIMARY_DARK = "#3a553d";
export const PRIMARY_SOFT = "#e9f0e7";   // mint surface — icon chips, table rules
export const PRIMARY_MUTED = "#cfe0cb";

export const PAGE_BG = "#eceee9";        // page canvas
export const SURFACE = "#ffffff";        // cards / panels

export const BORDER = "#e5e8e2";
export const TEXT_DARK = "#1e261f";
export const TEXT_MID = "#79837a";

export const RADIUS = 20;
export const RADIUS_SM = 12;

export const POSITIVE = "#2f7d4f";
export const NEGATIVE = "#c25b5b";

/* Chart accents — muted, readable side by side and against white. */
export const CHART_COLORS = ["#9dbd99", "#e3cfa6", "#bcd3d9", "#b3b6d8", "#4b6b4f", "#d3b8a3"];

/* Legacy aliases: pages written against the previous palette keep working
   and pick up the new colours automatically. */
export const ORANGE = PRIMARY;
export const ORANGE_DARK = PRIMARY_DARK;
export const ORANGE_LIGHT = PRIMARY_SOFT;
export const ORANGE_PALE = PRIMARY_MUTED;

/* ============================================================
   Primitives
   ============================================================ */

export function Card({ children, style }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 22, ...style }}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ fontSize: 20, margin: 0, marginBottom: subtitle ? 4 : 0, letterSpacing: "-0.01em" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: TEXT_MID, margin: 0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ title, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>
      {action}
    </div>
  );
}

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: PRIMARY,
        color: "#fff",
        border: "none",
        borderRadius: 999,
        padding: "10px 18px",
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
  // sales funnel
  baru: { bg: "#e7eef5", color: "#3c6084" },
  leads: { bg: "#e7eef5", color: "#3c6084" },
  cold: { bg: "#eceef0", color: "#5f6a72" },
  warm: { bg: "#f7ecdc", color: "#8a6524" },
  dihubungi: { bg: "#f7ecdc", color: "#8a6524" },
  appointment: { bg: "#ecebf6", color: "#4a4487" },
  deal: { bg: PRIMARY_SOFT, color: PRIMARY_DARK },
  closing: { bg: PRIMARY_SOFT, color: PRIMARY_DARK },
  cancel: { bg: "#f8e9e9", color: "#a94f4f" },
  batal: { bg: "#f8e9e9", color: "#a94f4f" },
  // generic states
  proses: { bg: "#f7ecdc", color: "#8a6524" },
  aktif: { bg: PRIMARY_SOFT, color: PRIMARY_DARK },
  selesai: { bg: PRIMARY_SOFT, color: PRIMARY_DARK },
  menunggu: { bg: "#f7ecdc", color: "#8a6524" },
  terverifikasi: { bg: PRIMARY_SOFT, color: PRIMARY_DARK },
  ditolak: { bg: "#f8e9e9", color: "#a94f4f" },
  // units
  tersedia: { bg: PRIMARY_SOFT, color: PRIMARY_DARK },
  booking: { bg: "#f7ecdc", color: "#8a6524" },
  terjual: { bg: "#e7eef5", color: "#3c6084" },
  // field
  belum_mulai: { bg: "#eceef0", color: "#5f6a72" },
  berjalan: { bg: "#f7ecdc", color: "#8a6524" },
  terlambat: { bg: "#f8e9e9", color: "#a94f4f" },
  diproses: { bg: "#f7ecdc", color: "#8a6524" },
  // priority
  rendah: { bg: "#eceef0", color: "#5f6a72" },
  sedang: { bg: "#f7ecdc", color: "#8a6524" },
  tinggi: { bg: "#f8e9e9", color: "#a94f4f" },
};

export function Badge({ value }) {
  const key = (value || "").toLowerCase().replace(" ", "_");
  const s = badgeColors[key] || { bg: "#eceef0", color: "#5f6a72" };
  return (
    <span
      style={{
        padding: "4px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
        display: "inline-block",
        textTransform: "capitalize",
      }}
    >
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
              <th
                key={col.key}
                style={{
                  textAlign: "left",
                  color: TEXT_MID,
                  fontWeight: 500,
                  fontSize: 12,
                  padding: "10px 12px",
                  borderBottom: `1px solid ${BORDER}`,
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: "12px 12px",
                    borderBottom: i === rows.length - 1 ? "none" : `1px solid ${BORDER}`,
                    whiteSpace: "nowrap",
                  }}
                >
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

/* ============================================================
   Dashboard building blocks
   ============================================================ */

export function StatCard({ icon: Icon, label, value, trend, sub }) {
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
        {Icon && (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 13,
              background: PRIMARY_SOFT,
              color: PRIMARY,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={18} />
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</div>
        {trend && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: trend.up ? POSITIVE : NEGATIVE,
              background: trend.up ? PRIMARY_SOFT : "#f8e9e9",
              padding: "3px 8px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {trend.up ? "↗" : "↘"} {trend.label}
          </span>
        )}
        {sub && <span style={{ fontSize: 12, color: TEXT_MID }}>{sub}</span>}
      </div>
    </Card>
  );
}

/** Simple vertical bar chart. data: [{ label, value }] */
export function BarChart({ data, height = 190, highlightIndex }) {
  // Round the axis up to a value that divides into whole-number ticks, so small
  // counts don't produce repeated labels (1, 1, 1, 0, 0).
  const rawMax = Math.max(0, ...data.map((d) => d.value));
  const max = rawMax <= 0 ? 4 : rawMax <= 4 ? rawMax : Math.ceil(rawMax / 4) * 4;
  const ticks = Math.min(4, max);
  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontSize: 11,
            color: TEXT_MID,
            height,
            paddingBottom: 22,
            flexShrink: 0,
          }}
        >
          {Array.from({ length: ticks + 1 }).map((_, i) => (
            <div key={i}>{Math.round((max / ticks) * (ticks - i))}</div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, borderBottom: `1px solid ${BORDER}` }}>
            {data.map((d, i) => {
              const active = highlightIndex === i;
              return (
                <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  <div
                    title={`${d.label}: ${d.value}`}
                    style={{
                      height: `${Math.max(3, (d.value / max) * 100)}%`,
                      background: active ? PRIMARY : PRIMARY_SOFT,
                      borderRadius: 8,
                      transition: "height 0.3s ease",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {data.map((d) => (
              <div key={d.label} style={{ flex: 1, textAlign: "center", fontSize: 11, color: TEXT_MID }}>
                {d.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Donut chart. data: [{ label, value }] — colours assigned from CHART_COLORS. */
export function DonutChart({ data, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 60;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 160, height: 160, flexShrink: 0 }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} fill="none" stroke={PRIMARY_SOFT} strokeWidth="26" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * circumference;
              const seg = (
                <circle
                  key={d.label}
                  cx="80"
                  cy="80"
                  r={r}
                  fill="none"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth="26"
                  strokeDasharray={`${len} ${circumference - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                />
              );
              offset += len;
              return seg;
            })}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>{centerValue}</div>
          {centerLabel && <div style={{ fontSize: 11, color: TEXT_MID }}>{centerLabel}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {data.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data.</div>}
        {data.map((d, i) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: CHART_COLORS[i % CHART_COLORS.length],
                flexShrink: 0,
              }}
            />
            <span style={{ color: TEXT_MID, textTransform: "capitalize" }}>{d.label}</span>
            <span style={{ fontWeight: 600, marginLeft: "auto", paddingLeft: 10 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A row in a "recent activity" list — thumbnail chip, title/meta, trailing value. */
export function ListRow({ icon: Icon, title, meta, trailing, trailingMuted, last }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "12px 0",
        borderBottom: last ? "none" : `1px solid ${BORDER}`,
      }}
    >
      {Icon && (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            background: PRIMARY_SOFT,
            color: PRIMARY,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={17} />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {meta && <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 2 }}>{meta}</div>}
      </div>
      {trailing != null && (
        <div style={{ fontSize: 13, fontWeight: 700, color: trailingMuted ? TEXT_MID : TEXT_DARK, whiteSpace: "nowrap" }}>{trailing}</div>
      )}
    </div>
  );
}
