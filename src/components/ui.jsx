import React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search as SearchIcon, Inbox } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isReadOnly, canWrite } from "../lib/permissions";
import { labelUmum } from "../lib/format";

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

/* ============================================================
   Formulir
   ============================================================ */

export const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  background: SURFACE,
  color: TEXT_DARK,
};

let nomorField = 0;

/**
 * Label sungguhan di atas kontrolnya.
 *
 * Placeholder yang dipakai sebagai label akan hilang begitu pengguna mulai
 * mengetik — dan formulir Prospek punya tujuh belas bidang seperti itu, jadi
 * di tengah pengisian tidak ada lagi keterangan bidang mana yang sedang diisi.
 *
 * Anak elemen menerima `id` dan `aria-describedby` lewat cloning, sehingga
 * pemanggil cukup menulis `<Field label="…"><input …/></Field>`.
 */
export function Field({ label, wajib, hint, error, children, style }) {
  const id = React.useMemo(() => `f${++nomorField}`, []);
  const idHint = hint || error ? `${id}-ket` : undefined;

  const kontrol = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: children.props.id || id,
        "aria-describedby": children.props["aria-describedby"] || idHint,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-required": wajib || undefined,
        style: { ...inputStyle, ...(error ? { borderColor: NEGATIVE } : null), ...children.props.style },
      })
    : children;

  return (
    <div style={{ minWidth: 0, ...style }}>
      {label && (
        <label htmlFor={React.isValidElement(children) ? children.props.id || id : undefined} style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
          {label}
          {wajib && <span style={{ color: ACCENT_DARK }} aria-hidden="true"> *</span>}
        </label>
      )}
      {kontrol}
      {(hint || error) && (
        <div id={idHint} style={{ fontSize: 11.5, color: error ? NEGATIVE : TEXT_MID, marginTop: 4, lineHeight: 1.45 }}>
          {error || hint}
        </div>
      )}
    </div>
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

/**
 * `value` adalah nilai enum apa adanya dari database; yang ditampilkan adalah
 * terjemahannya. Sebelumnya nilai mentah lolos ke layar — pengguna membaca
 * "dana_talangan" dan "aftersales" begitu saja.
 */
export function Badge({ value, label }) {
  const key = String(value || "").toLowerCase().replace(/\s/g, "_");
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
      }}
    >
      {label ?? labelUmum(value)}
    </span>
  );
}

/** Keadaan kosong yang mengarahkan, bukan sekadar satu baris abu-abu. */
export function EmptyState({ icon: Icon = Inbox, label = "Belum ada data.", hint, action }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center" }}>
      <div
        aria-hidden="true"
        style={{
          width: 46,
          height: 46,
          borderRadius: 15,
          background: PRIMARY_SOFT,
          color: PRIMARY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 12px",
        }}
      >
        <Icon size={21} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_DARK, marginBottom: hint ? 5 : 0 }}>{label}</div>
      {hint && <div style={{ fontSize: 12.5, color: TEXT_MID, lineHeight: 1.55, maxWidth: 380, margin: "0 auto" }}>{hint}</div>}
      {action && <div style={{ marginTop: 15 }}>{action}</div>}
    </div>
  );
}

/** Nilai yang dipakai untuk mengurutkan dan mencari — bukan hasil render-nya. */
function nilaiKolom(col, row) {
  if (col.sortValue) return col.sortValue(row);
  return row[col.key];
}

function bandingkan(a, b) {
  if (a === null || a === undefined || a === "") return 1; // kosong selalu di bawah
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return String(a).localeCompare(String(b), "id-ID", { numeric: true, sensitivity: "base" });
}

/**
 * Tabel data untuk seluruh aplikasi.
 *
 * Semua kemampuan tambahan bersifat opsional agar keempat belas pemanggil lama
 * tidak berubah perilaku: tanpa `sortable`, `searchable`, `filters`, atau
 * `pageSize`, komponen ini berperilaku persis seperti versi sebelumnya.
 *
 * Kolom: `{ key, label, render?, sortValue?, sortable?, align?, utama? }`.
 * `utama` menandai kolom yang menjadi judul kartu pada tampilan ponsel.
 */
export function DataTable({
  columns,
  rows,
  loading,
  emptyLabel = "Belum ada data.",
  emptyHint,
  emptyIcon,
  emptyAction,
  sortable = false,
  defaultSort,
  searchable = false,
  searchPlaceholder = "Cari di daftar ini…",
  searchExtra,
  initialSearch = "",
  filters,
  pageSize,
  onRowClick,
  highlightId,
}) {
  const [urut, setUrut] = React.useState(defaultSort || null);
  const [cari, setCari] = React.useState(initialSearch);
  const [pilihFilter, setPilihFilter] = React.useState({});
  const [halaman, setHalaman] = React.useState(0);
  const barisTersorot = React.useRef(null);

  // Baris yang dituju digulir ke tengah pandangan. Tanpa ini, sorotan pada
  // baris ke-40 tidak berarti apa-apa: pengguna tetap harus mencarinya.
  React.useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => barisTersorot.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    return () => clearTimeout(t);
  }, [highlightId, rows]);

  const semua = React.useMemo(() => rows || [], [rows]);

  const tersaring = React.useMemo(() => {
    let hasil = semua;

    for (const f of filters || []) {
      const dipilih = pilihFilter[f.key];
      if (!dipilih) continue;
      hasil = hasil.filter((row) => String(f.get ? f.get(row) : row[f.key]) === dipilih);
    }

    const q = cari.trim().toLowerCase();
    if (q) {
      hasil = hasil.filter((row) => {
        const bagian = columns.map((c) => nilaiKolom(c, row));
        if (searchExtra) bagian.push(searchExtra(row));
        return bagian.filter((v) => v !== null && v !== undefined).some((v) => String(v).toLowerCase().includes(q));
      });
    }

    if (urut) {
      const col = columns.find((c) => c.key === urut.key);
      if (col) {
        hasil = [...hasil].sort((a, b) => {
          const hasilBanding = bandingkan(nilaiKolom(col, a), nilaiKolom(col, b));
          return urut.arah === "desc" ? -hasilBanding : hasilBanding;
        });
      }
    }

    return hasil;
  }, [semua, columns, cari, urut, pilihFilter, filters, searchExtra]);

  // Menyaring sampai halaman aktif kosong akan menampilkan tabel hampa tanpa
  // sebab yang terlihat; halaman mundur sendiri agar hasilnya selalu tampak.
  const totalHalaman = pageSize ? Math.max(1, Math.ceil(tersaring.length / pageSize)) : 1;
  const halamanAman = Math.min(halaman, totalHalaman - 1);
  React.useEffect(() => {
    setHalaman(0);
  }, [cari, urut, pilihFilter]);

  const tampil = pageSize ? tersaring.slice(halamanAman * pageSize, (halamanAman + 1) * pageSize) : tersaring;

  const adaKendali = searchable || (filters && filters.length > 0);

  function klikJudul(col) {
    if (!sortable || col.sortable === false || col.key === "aksi") return;
    setUrut((v) =>
      v && v.key === col.key ? (v.arah === "asc" ? { key: col.key, arah: "desc" } : null) : { key: col.key, arah: "asc" }
    );
  }

  const kendali = adaKendali && (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      {searchable && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 12px", flex: "1 1 260px", maxWidth: 380 }}>
          <SearchIcon size={15} color={TEXT_MID} aria-hidden="true" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", padding: "9px 0", fontSize: 13, color: TEXT_DARK, background: "transparent" }}
          />
          {cari && (
            <button onClick={() => setCari("")} aria-label="Bersihkan pencarian" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", fontSize: 13 }}>
              ✕
            </button>
          )}
        </div>
      )}
      {(filters || []).map((f) => (
        <select
          key={f.key}
          value={pilihFilter[f.key] || ""}
          onChange={(e) => setPilihFilter((v) => ({ ...v, [f.key]: e.target.value }))}
          aria-label={f.label}
          style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "9px 12px", fontSize: 13, color: TEXT_DARK, background: SURFACE }}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );

  if (loading) {
    return (
      <>
        {kendali}
        <div style={{ padding: 20, color: TEXT_MID, fontSize: 13 }}>Memuat data...</div>
      </>
    );
  }

  if (tersaring.length === 0) {
    const menyaring = cari.trim() || Object.values(pilihFilter).some(Boolean);
    return (
      <>
        {kendali}
        {menyaring ? (
          <EmptyState icon={SearchIcon} label="Tidak ada yang cocok" hint="Coba kata kunci lain, atau kosongkan saringan di atas." />
        ) : (
          <EmptyState icon={emptyIcon} label={emptyLabel} hint={emptyHint} action={emptyAction} />
        )}
      </>
    );
  }

  return (
    <>
      {kendali}

      <div className="dt-scroll" style={{ overflowX: "auto" }}>
        <table className="dt-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {columns.map((col) => {
                const bisaUrut = sortable && col.sortable !== false && col.key !== "aksi";
                const aktif = urut && urut.key === col.key;
                const Panah = !aktif ? ChevronsUpDown : urut.arah === "asc" ? ChevronUp : ChevronDown;
                return (
                  <th
                    key={col.key}
                    // aria-sort memberi tahu pembaca layar arah urutan aktif;
                    // panah kecil saja hanya berarti bagi yang melihatnya.
                    aria-sort={aktif ? (urut.arah === "asc" ? "ascending" : "descending") : bisaUrut ? "none" : undefined}
                    style={{
                      textAlign: col.align || "left",
                      color: aktif ? TEXT_DARK : TEXT_MID,
                      fontWeight: aktif ? 600 : 500,
                      fontSize: 12,
                      padding: 0,
                      borderBottom: `1px solid ${BORDER}`,
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                      background: SURFACE,
                      zIndex: 1,
                    }}
                  >
                    {bisaUrut ? (
                      <button
                        onClick={() => klikJudul(col)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          width: "100%",
                          padding: "10px 12px",
                          border: "none",
                          background: "none",
                          font: "inherit",
                          color: "inherit",
                          cursor: "pointer",
                          justifyContent: col.align === "right" ? "flex-end" : "flex-start",
                        }}
                      >
                        {col.label}
                        <Panah size={13} style={{ opacity: aktif ? 1 : 0.45, flexShrink: 0 }} aria-hidden="true" />
                      </button>
                    ) : (
                      <div style={{ padding: "10px 12px" }}>{col.label}</div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tampil.map((row, i) => (
              <tr
                key={row.id || i}
                // Datang dari pencarian global atau lonceng: baris yang dituju
                // harus menonjol. Menyaring daftar saja belum menjawab "yang
                // mana" ketika hasilnya masih puluhan baris.
                ref={highlightId && row.id === highlightId ? barisTersorot : undefined}
                className={[onRowClick ? "dt-row-klik" : null, highlightId && row.id === highlightId ? "dt-row-sorot" : null]
                  .filter(Boolean)
                  .join(" ") || undefined}
                onClick={onRowClick ? (e) => {
                  // Tombol dan kontrol di dalam baris tetap milik dirinya
                  // sendiri — mengklik "Hapus" tidak boleh ikut membuka detail.
                  if (e.target.closest("button, a, select, input, label")) return;
                  onRowClick(row);
                } : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    data-label={col.label}
                    style={{
                      padding: "12px 12px",
                      textAlign: col.align || "left",
                      borderBottom: i === tampil.length - 1 ? "none" : `1px solid ${BORDER}`,
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

      {pageSize && tersaring.length > pageSize && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID }}>
            {halamanAman * pageSize + 1}–{Math.min((halamanAman + 1) * pageSize, tersaring.length)} dari {tersaring.length}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setHalaman((h) => Math.max(0, h - 1))}
              disabled={halamanAman === 0}
              style={gayaHalaman(halamanAman === 0)}
            >
              Sebelumnya
            </button>
            <span style={{ fontSize: 12, color: TEXT_MID, alignSelf: "center", padding: "0 4px" }}>
              {halamanAman + 1} / {totalHalaman}
            </span>
            <button
              onClick={() => setHalaman((h) => Math.min(totalHalaman - 1, h + 1))}
              disabled={halamanAman >= totalHalaman - 1}
              style={gayaHalaman(halamanAman >= totalHalaman - 1)}
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function gayaHalaman(mati) {
  return {
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: mati ? PRIMARY_MUTED : TEXT_DARK,
    borderRadius: 9,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: mati ? "default" : "pointer",
  };
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

/**
 * Dialog modal dengan perangkap fokus.
 *
 * Tanpa perangkap, Tab membawa fokus keluar ke halaman di belakang dialog:
 * pengguna keyboard bisa menekan tombol yang tertutup lapisan gelap tanpa
 * melihatnya. Escape ditambahkan karena itu yang dicoba orang lebih dulu
 * sebelum mencari tombol Batal.
 */
/** Perangkap fokus + Escape, dipakai bersama oleh Modal dan Drawer. */
function usePerangkapFokus(open, kotak, onClose) {
  React.useEffect(() => {
    if (!open) return undefined;

    const fokusSebelumnya = document.activeElement;
    // Fokus awal ke dalam dialog, kalau tidak pembaca layar tetap membacakan
    // halaman di belakangnya.
    const pertama = kotak.current?.querySelector(FOKUSABLE);
    (pertama || kotak.current)?.focus();

    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;

      const bisa = Array.from(kotak.current?.querySelectorAll(FOKUSABLE) || []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (bisa.length === 0) return;
      const awal = bisa[0];
      const akhir = bisa[bisa.length - 1];
      if (e.shiftKey && document.activeElement === awal) {
        e.preventDefault();
        akhir.focus();
      } else if (!e.shiftKey && document.activeElement === akhir) {
        e.preventDefault();
        awal.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (fokusSebelumnya instanceof HTMLElement) fokusSebelumnya.focus();
    };
  }, [open, kotak, onClose]);
}

export function Modal({ open, labelledBy, onClose, children, width = 420 }) {
  const kotak = React.useRef(null);
  usePerangkapFokus(open, kotak, onClose);

  if (!open) return null;

  // Di-portal ke <body>: dialog ini kerap dipanggil dari dalam sel tabel yang
  // punya overflow:auto sendiri, dan di sana ia akan terpotong. Portal juga
  // melepaskannya dari <span> pemanggilnya, sehingga <div> tidak bersarang di
  // dalam elemen inline.
  return createPortal(
    <div
      onClick={onClose}
      // whiteSpace is reset because the dialog is rendered inside a table cell
      // that sets nowrap, which would otherwise stop the text wrapping.
      style={{ position: "fixed", inset: 0, background: "rgba(10,29,66,0.48)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16, whiteSpace: "normal" }}
    >
      <div
        ref={kotak}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: SURFACE,
          borderRadius: RADIUS,
          padding: 24,
          width,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
          textAlign: "left",
          outline: "none",
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/**
 * Panel geser dari kanan.
 *
 * Dipakai ketika pekerjaannya adalah rentetan cepat lintas banyak baris —
 * membuka, bertindak, menutup, lanjut ke baris berikutnya. Daftarnya tetap
 * terlihat di belakang, sehingga posisi gulir dan saringan tidak hilang.
 *
 * Untuk pekerjaan yang mendalam pada satu catatan, halaman penuh tetap lebih
 * tepat: ia bisa ditautkan, dibagikan, dan di-bookmark. Beda sifat pekerjaan,
 * beda pola — itulah kenapa konsumen memakai /konsumen/:id sedangkan prospek
 * memakai panel ini.
 */
export function Drawer({ open, labelledBy, onClose, children, width = 460 }) {
  const kotak = React.useRef(null);
  usePerangkapFokus(open, kotak, onClose);

  if (!open) return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 65, whiteSpace: "normal" }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(10,29,66,0.38)" }}
        aria-hidden="true"
      />
      <div
        ref={kotak}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="drawer-panel"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: "100%",
          background: SURFACE,
          borderLeft: `1px solid ${BORDER}`,
          boxShadow: "-18px 0 44px rgba(15,42,92,0.14)",
          overflowY: "auto",
          outline: "none",
          textAlign: "left",
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/**
 * Menu aksi tambahan.
 *
 * Empat tombol pada setiap baris tabel berarti enam puluh tombol pada satu
 * layar, dan mata berhenti bisa menemukan mana yang utama. Satu aksi utama
 * ditinggalkan di baris; sisanya turun ke sini — termasuk yang merusak, yang
 * memang tidak pantas berdiri sebobot "Ubah".
 */
export function MenuAksi({ items, label = "Aksi lain" }) {
  const [buka, setBuka] = React.useState(false);
  const [keAtas, setKeAtas] = React.useState(false);
  const kotak = React.useRef(null);
  const tombol = React.useRef(null);

  React.useEffect(() => {
    if (!buka) return undefined;
    function onDoc(e) {
      if (kotak.current && !kotak.current.contains(e.target)) setBuka(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setBuka(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [buka]);

  const tampil = (items || []).filter(Boolean);
  if (tampil.length === 0) return null;

  return (
    <span ref={kotak} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={tombol}
        onClick={() => {
          // Baris di bagian bawah tabel akan menampilkan menunya ke atas,
          // supaya tidak terpotong tepi layar.
          const r = tombol.current?.getBoundingClientRect();
          setKeAtas(Boolean(r) && window.innerHeight - r.bottom < 40 + tampil.length * 36);
          setBuka((v) => !v);
        }}
        aria-label={label}
        aria-expanded={buka}
        aria-haspopup="menu"
        title={label}
        style={{
          border: `1px solid ${BORDER}`,
          background: SURFACE,
          color: TEXT_MID,
          borderRadius: 9,
          padding: "5px 9px",
          fontSize: 13,
          lineHeight: 1,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.06em",
        }}
      >
        ⋯
      </button>

      {buka && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            [keAtas ? "bottom" : "top"]: "calc(100% + 5px)",
            minWidth: 196,
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            boxShadow: "0 14px 34px rgba(15,42,92,0.16)",
            padding: 5,
            zIndex: 30,
          }}
        >
          {tampil.map((it, i) => (
            <React.Fragment key={it.label}>
              {it.pisah && i > 0 && <div style={{ height: 1, background: BORDER, margin: "5px 4px" }} />}
              <button
                role="menuitem"
                onClick={() => {
                  setBuka(false);
                  it.onClick?.();
                }}
                disabled={it.disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "none",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: it.disabled ? PRIMARY_MUTED : it.rusak ? NEGATIVE : TEXT_DARK,
                  cursor: it.disabled ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  font: "inherit",
                }}
                onMouseEnter={(e) => !it.disabled && (e.currentTarget.style.background = "#F4F6FA")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {it.ikon && <it.ikon size={14} style={{ flexShrink: 0 }} aria-hidden="true" />}
                {it.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </span>
  );
}

const FOKUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({ open, title, message, warning, confirmLabel = "Hapus", busy, error, onConfirm, onCancel }) {
  const idJudul = React.useMemo(() => `d${++nomorField}`, []);
  if (!open) return null;
  return (
    <Modal open={open} labelledBy={idJudul} onClose={() => !busy && onCancel?.()}>
      <>
        <div id={idJudul} style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
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
      </>
    </Modal>
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
