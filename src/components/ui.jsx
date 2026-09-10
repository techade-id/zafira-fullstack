import React from "react";
import { useAuth } from "../context/AuthContext";
import { isReadOnly, canWrite } from "../lib/permissions";

/**
 * Read-only roles (Supervisor Marketing, Pengawas) must never be shown a
 * control the database is certain to reject. Reading it from context here
 * means every page inherits the rule without repeating it.
 */
export function useWriteAccess(subject) {
  const auth = useAuth();
  const profile = auth?.profile;
  if (!profile) return true; // still loading — don't flash controls out of existence
  if (isReadOnly(profile)) return false;
  return subject ? canWrite(profile, subject) : true;
}

/* ============================================================
   Design tokens — Zafira Property: Navy (primary) + Deep Orange (accent).
   PRD §2.1: navy carries navigation, header and structure; deep orange
   carries CTAs, active progress, and Urgent / Due Date indicators.
   ============================================================ */

export const PRIMARY = "#0F2A5C";        // navy — nav, headings, structural elements
export const PRIMARY_DARK = "#0A1D42";   // sidebar ground
export const PRIMARY_SOFT = "#E8EDF7";   // navy wash — icon chips, table rules
export const PRIMARY_MUTED = "#C7D3EA";

export const ACCENT = "#E2571F";         // deep orange — CTA, active progress, urgent
export const ACCENT_DARK = "#B93F0F";
export const ACCENT_SOFT = "#FDECE4";

export const PAGE_BG = "#F4F6FA";        // page canvas
export const SURFACE = "#ffffff";        // cards / panels

export const BORDER = "#E3E8F0";
export const TEXT_DARK = "#111B2E";
export const TEXT_MID = "#64748B";
export const ON_PRIMARY = "rgba(255,255,255,0.74)";       // sidebar idle text
export const ON_PRIMARY_FAINT = "rgba(255,255,255,0.45)"; // sidebar section labels

export const RADIUS = 20;
export const RADIUS_SM = 12;

export const POSITIVE = "#15803D";
export const NEGATIVE = "#C2413B";

/* Categorical chart hues, assigned in this fixed order and never cycled.
   Validated with the dataviz palette checker against a white surface:
   lightness band, chroma floor, CVD separation, and 3:1 contrast all pass. */
export const CHART_COLORS = ["#2B5CA8", "#E2571F", "#00968E", "#8256B8", "#A87C10", "#C0417F"];

/* Single-series bar fill. A navy step dark enough to clear 3:1 on white —
   PRIMARY_SOFT was too pale to read as a mark. */
export const CHART_BAR = "#3B5C9F";

/* Legacy aliases. Pages that imported ORANGE* were using it as the highlight
   colour (progress bars, active selection, stat figures), so they now resolve
   to the real accent instead of the primary — which is what PRD §2.1 asks for. */
export const ORANGE = ACCENT;
export const ORANGE_DARK = ACCENT_DARK;
export const ORANGE_LIGHT = ACCENT_SOFT;
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

/**
 * `subject` marks a button as a mutation (see permissions.js for the list).
 * Buttons without it — Cari, Ekspor — stay visible to monitoring roles.
 */
export function PrimaryButton({ children, subject, ...props }) {
  const allowed = useWriteAccess(subject);
  if (subject && !allowed) return null;
  return (
    <button
      {...props}
      style={{
        background: props.disabled ? PRIMARY_MUTED : ACCENT,
        color: "#fff",
        border: "none",
        borderRadius: 999,
        padding: "10px 18px",
        fontSize: 13,
        fontWeight: 600,
        cursor: props.disabled ? "default" : "pointer",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

/* Three families, so a colour always means the same thing:
   navy = neutral / in progress, accent = needs attention (Urgent, Due Date),
   green = settled, red = failed or cancelled. */
const NEUTRAL = { bg: "#EEF1F6", color: "#516079" };
const INFO = { bg: PRIMARY_SOFT, color: PRIMARY };
const URGENT = { bg: ACCENT_SOFT, color: ACCENT_DARK };
const DONE = { bg: "#E4F2E8", color: "#166534" };
const FAILED = { bg: "#FBE9E8", color: "#A6332C" };

const badgeColors = {
  // sales funnel (PRD §4.2: New → Warm → Hot → Booking → KPR → Akad → Aftersales)
  baru: NEUTRAL,
  leads: NEUTRAL,
  cold: NEUTRAL,
  warm: INFO,
  dihubungi: INFO,
  hot: URGENT,
  appointment: URGENT,
  deal: DONE,
  closing: DONE,
  kpr: INFO,
  akad: INFO,
  aftersales: DONE,
  cancel: FAILED,
  batal: FAILED,
  // generic states
  proses: INFO,
  aktif: DONE,
  selesai: DONE,
  menunggu: URGENT,
  terverifikasi: DONE,
  ditolak: FAILED,
  // units
  tersedia: DONE,
  booking: URGENT,
  terjual: INFO,
  // field
  belum_mulai: NEUTRAL,
  berjalan: INFO,
  terlambat: URGENT,
  diproses: INFO,
  // priority
  rendah: NEUTRAL,
  sedang: INFO,
  tinggi: URGENT,
};

export function Badge({ value }) {
  const key = (value || "").toLowerCase().replace(" ", "_");
  const s = badgeColors[key] || NEUTRAL;
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
              background: trend.up ? DONE.bg : FAILED.bg,
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
                      // Accent marks the highlighted bar; the rest stay navy.
                      background: active ? ACCENT : CHART_BAR,
                      // Rounded data-end only — the bar stays anchored to the baseline.
                      borderRadius: "4px 4px 0 0",
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
              // Draw 2px short of the true arc so neighbouring segments are
              // separated by the surface instead of touching.
              const drawn = Math.max(0, len - 2);
              const seg = (
                <circle
                  key={d.label}
                  cx="80"
                  cy="80"
                  r={r}
                  fill="none"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth="26"
                  strokeDasharray={`${drawn} ${circumference - drawn}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                </circle>
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

/* ============================================================
   Deleting
   ============================================================ */

/**
 * Turns a Postgres/PostgREST error into something a sales admin can act on.
 * The raw messages are English and mention constraint names.
 */
export function friendlyDbError(error) {
  if (!error) return "";
  const code = error.code || "";
  if (code === "23503") {
    return "Data ini masih dipakai oleh data lain sehingga tidak bisa dihapus. Lepaskan atau hapus keterkaitannya terlebih dahulu.";
  }
  if (code === "42501" || /row-level security/i.test(error.message || "")) {
    return "Anda tidak punya akses untuk menghapus data ini.";
  }
  return error.message || "Gagal menghapus data.";
}

export function ConfirmDialog({ open, title, message, warning, confirmLabel = "Hapus", busy, error, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      onClick={onCancel}
      // whiteSpace is reset because the dialog is rendered inside a table cell
      // that sets nowrap, which would otherwise stop the text wrapping.
      style={{ position: "fixed", inset: 0, background: "rgba(10,29,66,0.48)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16, whiteSpace: "normal" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: SURFACE, borderRadius: RADIUS, padding: 24, width: 420, maxWidth: "100%", boxSizing: "border-box", textAlign: "left" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: TEXT_MID, marginBottom: warning ? 12 : 18, lineHeight: 1.5 }}>{message}</div>

        {warning && (
          <div style={{ fontSize: 12.5, color: FAILED.color, background: FAILED.bg, border: "1px solid #F2D3D1", borderRadius: 12, padding: "10px 12px", marginBottom: 18, lineHeight: 1.5 }}>
            {warning}
          </div>
        )}

        {error && <div style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ padding: "10px 18px", borderRadius: 999, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_MID, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: NEGATIVE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Menghapus..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Delete control with a built-in confirmation step.
 *
 * `onDelete` should return the Supabase `{ error }` shape; `warning` is for
 * spelling out what else disappears (cascades), which the user cannot see.
 */
export function DeleteButton({ onDelete, onDone, itemName, warning, label = "Hapus", confirmLabel = "Hapus", subject }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const allowed = useWriteAccess(subject);

  async function confirm() {
    setBusy(true);
    setError("");
    const res = (await onDelete()) || {};
    setBusy(false);
    if (res.error) {
      setError(friendlyDbError(res.error));
      return;
    }
    setOpen(false);
    onDone && onDone();
  }

  // Deleting is always a mutation, so monitoring roles never see the control.
  if (!allowed) return null;

  return (
    <>
      <button
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        title={`Hapus ${itemName || ""}`.trim()}
        style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: NEGATIVE, borderRadius: 9, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
      >
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title="Hapus data ini?"
        message={itemName ? `“${itemName}” akan dihapus permanen dan tidak bisa dikembalikan.` : "Data akan dihapus permanen dan tidak bisa dikembalikan."}
        warning={warning}
        confirmLabel={confirmLabel}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={() => !busy && setOpen(false)}
      />
    </>
  );
}

/** Secondary row action, sized to sit next to DeleteButton. */
export function EditButton({ onClick, label = "Ubah", subject }) {
  const allowed = useWriteAccess(subject);
  if (!allowed) return null;
  return (
    <button
      onClick={onClick}
      style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_DARK, borderRadius: 9, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
    >
      {label}
    </button>
  );
}

/* ============================================================
   Access notices
   ============================================================ */

/** Explains why a monitoring role sees no write controls on this page. */
export function ReadOnlyBanner() {
  const auth = useAuth();
  if (!isReadOnly(auth?.profile)) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        background: PRIMARY_SOFT,
        border: `1px solid ${PRIMARY_MUTED}`,
        borderRadius: RADIUS_SM,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 12.5,
        color: PRIMARY,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true">👁</span>
      <span>Mode pantau — Anda dapat melihat dan mengekspor seluruh data, tetapi tidak dapat mengubahnya.</span>
    </div>
  );
}

/** Handover Hard-Lock notice (PRD §3.2). */
export function LockBanner({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        background: ACCENT_SOFT,
        border: `1px solid #F6CDB8`,
        borderRadius: RADIUS_SM,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 12.5,
        color: ACCENT_DARK,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true">🔒</span>
      <span>{message}</span>
    </div>
  );
}

/** Wraps row actions so Ubah/Hapus stay on one line. */
export function RowActions({ children }) {
  return <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{children}</div>;
}
