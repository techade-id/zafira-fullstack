import React, { useEffect, useState } from "react";
import { angsuranBulanan } from "../../lib/siteplan";
import { rupiah } from "../../lib/format";
import { BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT } from "../ui";

const TENOR = [10, 15, 20];

/**
 * Simulasi angsuran di depan calon pembeli.
 *
 * Pertanyaan pertama setelah "yang mana" hampir selalu "cicilannya berapa".
 * Penghasilan minimal dihitung dengan patokan yang sama dengan peringatan RPC
 * di stepper KPR — angsuran tidak lebih dari sepertiga penghasilan — supaya
 * yang dijanjikan di depan sama dengan yang nanti diperiksa bank.
 */
export default function SimulasiKpr({ harga, ringkas = false }) {
  const [dp, setDp] = useState(10);
  const [bunga, setBunga] = useState(5);
  const [tenor, setTenor] = useState(15);

  useEffect(() => {
    setDp(10);
  }, [harga]);

  const h = Number(harga) || 0;
  const uangMuka = (h * (Number(dp) || 0)) / 100;
  const pokok = Math.max(0, h - uangMuka);
  const angsuran = angsuranBulanan(pokok, Number(bunga) || 0, tenor);
  const minimal = angsuran * 3;

  if (!h) return null;

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: ringkas ? 12 : 14, background: SURFACE }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT_MID, marginBottom: 10 }}>Simulasi KPR</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <label style={gayaLabel}>
          Uang muka (%)
          <input type="number" min="0" max="90" step="1" value={dp} onChange={(e) => setDp(e.target.value)} style={gayaInput} />
        </label>
        <label style={gayaLabel}>
          Bunga / tahun (%)
          <input type="number" min="0" max="20" step="0.25" value={bunga} onChange={(e) => setBunga(e.target.value)} style={gayaInput} />
        </label>
      </div>
      <div role="radiogroup" aria-label="Tenor" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {TENOR.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tenor === t}
            onClick={() => setTenor(t)}
            style={{
              font: "inherit",
              flex: 1,
              padding: "6px 0",
              borderRadius: 999,
              border: `1px solid ${tenor === t ? PRIMARY : BORDER}`,
              background: tenor === t ? PRIMARY_SOFT : SURFACE,
              color: tenor === t ? PRIMARY : TEXT_MID,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t} tahun
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12, color: TEXT_MID }}>Angsuran / bulan</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: TEXT_DARK, letterSpacing: "-0.02em" }}>{rupiah(Math.round(angsuran))}</span>
      </div>
      <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 4, lineHeight: 1.55 }}>
        Uang muka {rupiah(Math.round(uangMuka))} · pokok kredit {rupiah(Math.round(pokok))}
        <br />
        Penghasilan minimal ±{rupiah(Math.round(minimal / 1000) * 1000)}/bulan
      </div>
      <div style={{ fontSize: 10.5, color: TEXT_MID, marginTop: 6, fontStyle: "italic" }}>Estimasi bunga tetap — angka resmi mengikuti bank.</div>
    </div>
  );
}

const gayaLabel = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: TEXT_MID, fontWeight: 600 };
const gayaInput = { font: "inherit", padding: "7px 9px", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, color: TEXT_DARK, width: "100%", boxSizing: "border-box" };
