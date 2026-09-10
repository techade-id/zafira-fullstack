import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useNotesSearch, groupByModule, MIN_QUERY } from "../lib/useNotesSearch";
import { SURFACE, BORDER, TEXT_DARK, TEXT_MID, PRIMARY, ACCENT, RADIUS_SM, NEGATIVE } from "./ui";

/**
 * Highlights every occurrence of `q` inside `text`.
 *
 * Uses indexOf on the lowercased pair rather than a RegExp so a query
 * containing regex metacharacters (or an emoji) can never throw.
 */
export function Highlight({ text, q }) {
  if (!text) return null;
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return <>{text}</>;

  const parts = [];
  const hay = text.toLowerCase();
  let from = 0;

  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} style={{ background: "#FDECE4", color: ACCENT, padding: "0 1px", borderRadius: 3 }}>
        {text.slice(at, at + needle.length)}
      </mark>
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

export function ResultRow({ row, q, onPick, aktif }) {
  const ref = React.useRef(null);

  // Hasil yang ditandai panah harus ikut tergulir ke dalam pandangan, kalau
  // tidak navigasi keyboard berhenti terasa di baris kelima.
  React.useEffect(() => {
    if (aktif) ref.current?.scrollIntoView({ block: "nearest" });
  }, [aktif]);

  return (
    <button
      ref={ref}
      role="option"
      aria-selected={Boolean(aktif)}
      onClick={() => onPick(row)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: aktif ? "#F4F6FA" : "none",
        border: "none",
        borderRadius: 10,
        padding: "9px 10px",
        cursor: "pointer",
        font: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F4F6FA")}
      onMouseLeave={(e) => (e.currentTarget.style.background = aktif ? "#F4F6FA" : "none")}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>
          <Highlight text={row.judul} q={q} />
        </span>
        <span style={{ fontSize: 10.5, color: TEXT_MID }}>{row.field_cocok}</span>
      </div>
      {row.cuplikan && (
        <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 2, lineHeight: 1.45 }}>
          <Highlight text={row.cuplikan} q={q} />
        </div>
      )}
      <div style={{ fontSize: 10.5, color: TEXT_MID, marginTop: 3 }}>
        {row.aktor ? `${row.aktor} · ` : ""}
        {row.tanggal ? new Date(row.tanggal).toLocaleDateString("id-ID") : ""}
      </div>
    </button>
  );
}

/**
 * Alamat tujuan sebuah hasil pencarian.
 *
 * `search_notes` mengembalikan rute per modul, dan sebelumnya semuanya dibuka
 * dengan pola `?cari=&sorot=` — padahal hanya ProspekPage yang pernah membaca
 * parameter itu. Hasil Konsumen dan Progres KPR mendarat di daftar polos: tidak
 * tersaring, tidak tersorot, tidak terbuka. Konsumen kini punya halaman
 * sendiri, jadi tautannya langsung ke sana.
 */
export function targetUrl(row, q) {
  if (row.rute === "/konsumen") return `/konsumen/${row.record_id}`;
  return `${row.rute}?cari=${encodeURIComponent(q)}&sorot=${row.record_id}`;
}

export default function GlobalSearch({ onNavigate }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sorot, setSorot] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { results, loading, error } = useNotesSearch(q, { limit: 20, enabled: open });

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ⌘K / Ctrl+K — pintasan yang sudah jadi kebiasaan di mana-mana, dan
  // pencarian adalah kontrol yang paling sering dipakai di aplikasi ini.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Daftar rata untuk navigasi panah; tampilannya tetap berkelompok per modul.
  const groups = groupByModule(results);
  const rata = groups.flatMap((g) => g.rows);

  useEffect(() => {
    setSorot(-1);
  }, [q]);

  function pick(row) {
    setOpen(false);
    onNavigate && onNavigate();
    navigate(targetUrl(row, q));
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSorot((v) => Math.min(rata.length - 1, v + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((v) => Math.max(-1, v - 1));
      return;
    }
    if (e.key === "Enter") {
      // Panah menandai satu hasil → buka hasil itu. Tanpa itu, Enter berarti
      // "lihat semua", yang lebih berguna daripada menebak hasil pertama.
      if (sorot >= 0 && rata[sorot]) {
        pick(rata[sorot]);
        return;
      }
      if (q.trim().length >= MIN_QUERY) {
        setOpen(false);
        onNavigate && onNavigate();
        navigate(`/cari?q=${encodeURIComponent(q.trim())}`);
      }
    }
  }

  const tooShort = q.trim().length > 0 && q.trim().length < MIN_QUERY;
  let indeks = -1;

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "5px 5px 5px 16px",
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Cari catatan, prospek, komplain…"
          aria-label="Cari catatan"
          role="combobox"
          aria-expanded={open}
          aria-controls="hasil-cari"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 13, background: "transparent", color: TEXT_DARK }}
        />
        {!q && (
          <kbd
            aria-hidden="true"
            style={{ fontSize: 10.5, color: TEXT_MID, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "2px 6px", fontFamily: "inherit", flexShrink: 0 }}
          >
            ⌘K
          </kbd>
        )}
        {q && (
          <button
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
            title="Bersihkan"
            style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", display: "flex", padding: 2 }}
          >
            <X size={14} />
          </button>
        )}
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: PRIMARY,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Search size={15} />
        </span>
      </div>

      {open && q.trim().length > 0 && (
        <div
          id="hasil-cari"
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "min(460px, 92vw)",
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: RADIUS_SM + 4,
            boxShadow: "0 18px 40px rgba(15,42,92,0.14)",
            padding: 8,
            maxHeight: "70vh",
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {tooShort && <div style={{ padding: 12, fontSize: 12.5, color: TEXT_MID }}>Ketik minimal {MIN_QUERY} karakter.</div>}
          {!tooShort && loading && <div style={{ padding: 12, fontSize: 12.5, color: TEXT_MID }}>Mencari…</div>}
          {!tooShort && error && <div style={{ padding: 12, fontSize: 12.5, color: NEGATIVE }}>{error}</div>}
          {!tooShort && !loading && !error && results.length === 0 && (
            <div style={{ padding: 12, fontSize: 12.5, color: TEXT_MID }}>Tidak ada catatan yang cocok.</div>
          )}

          {groups.map((g) => (
            <div key={g.modul} style={{ marginBottom: 4 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: TEXT_MID,
                  padding: "8px 10px 4px",
                }}
              >
                {g.modul}
              </div>
              {g.rows.map((row, i) => {
                indeks += 1;
                return (
                  <ResultRow
                    key={`${row.modul}-${row.record_id}-${i}`}
                    row={row}
                    q={q}
                    onPick={pick}
                    aktif={indeks === sorot}
                  />
                );
              })}
            </div>
          ))}

          {results.length > 0 && (
            <button
              onClick={() => {
                setOpen(false);
                onNavigate && onNavigate();
                navigate(`/cari?q=${encodeURIComponent(q.trim())}`);
              }}
              style={{
                width: "100%",
                marginTop: 4,
                border: `1px solid ${BORDER}`,
                background: SURFACE,
                borderRadius: 10,
                padding: "9px 10px",
                fontSize: 12,
                fontWeight: 600,
                color: PRIMARY,
                cursor: "pointer",
              }}
            >
              Lihat semua hasil untuk “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
