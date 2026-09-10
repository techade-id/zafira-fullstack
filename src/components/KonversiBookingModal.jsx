import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { List, Map as MapIcon } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { rupiah, rupiahInput, angkaDariRupiah, telepon } from "../lib/format";
import SiteplanPicker from "./SiteplanPicker";
import {
  Modal,
  PrimaryButton,
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  inputStyle,
} from "./ui";

/**
 * Booking sebagai satu peristiwa.
 *
 * Sebelum ini, mem-booking berarti tiga pekerjaan terpisah: mengetik ulang
 * seluruh data prospek ke formulir konsumen, mengubah status unit, lalu
 * mencatat pembayaran — masing-masing bisa terlupa, dan kaitan ke prospeknya
 * sekadar dropdown opsional yang hanya memuat nama.
 *
 * Seluruhnya kini satu panggilan RPC yang atomik. Modal ini hanya mengumpulkan
 * tiga keputusan dan menjelaskan akibatnya sebelum dijalankan — pola yang sama
 * dengan konfirmasi hapus, karena konversi juga sulit dibatalkan.
 */
export default function KonversiBookingModal({ lead, open, onClose, onSelesai }) {
  const toast = useToast();
  const navigate = useNavigate();

  const [unitId, setUnitId] = useState("");
  const [nominal, setNominal] = useState("");
  const [tanggalBooking, setTanggalBooking] = useState(() => new Date().toISOString().slice(0, 10));
  const [units, setUnits] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [mode, setMode] = useState("peta");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    setGalat("");
    setKirim(false);
    setMode("peta");
    setMemuat(true);
    // Hanya unit tersedia yang ditawarkan. Menawarkan unit terjual lalu
    // menolaknya di server adalah cara paling membingungkan untuk menegakkan
    // aturan yang sudah kita ketahui sejak awal.
    supabase
      .from("units")
      .select("id, unit_code, block, type, price, projects(name)")
      .eq("status", "tersedia")
      .order("unit_code")
      .then(({ data }) => {
        setUnits(data || []);
        setMemuat(false);
      });
  }, [open]);

  const perBlok = useMemo(() => {
    const peta = new Map();
    for (const u of units) {
      const blok = u.block || "Tanpa Blok";
      if (!peta.has(blok)) peta.set(blok, []);
      peta.get(blok).push(u);
    }
    return [...peta.entries()];
  }, [units]);

  const unitTerpilih = units.find((u) => u.id === unitId) || null;

  async function jalankan() {
    setKirim(true);
    setGalat("");

    const { data, error } = await supabase.rpc("convert_lead_to_customer", {
      p_lead_id: lead.id,
      p_unit_id: unitId || null,
      p_nominal_booking: nominal === "" ? null : Number(nominal),
      p_tanggal_booking: tanggalBooking || null,
    });

    setKirim(false);

    if (error) {
      // Pesan dari RPC sudah berbahasa Indonesia dan menyebut sebabnya, jadi
      // ditampilkan apa adanya alih-alih diganti kalimat umum.
      setGalat(error.message);
      return;
    }

    toast.sukses(`${lead.name} kini terdaftar sebagai konsumen.`);
    onSelesai?.();
    onClose?.();
    navigate(`/konsumen/${data}`);
  }

  if (!lead) return null;

  return (
    <Modal open={open} labelledBy="konversi-judul" onClose={() => !kirim && onClose?.()} width={mode === "peta" ? 720 : 520}>
      <>
        <div id="konversi-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Konversi ke Booking
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Data prospek terbawa otomatis — tidak ada yang perlu diketik ulang.
        </div>

        {/* Identitas prospek sengaja hanya dibaca: ini bukan formulir entri,
            melainkan konfirmasi atas data yang sudah ada. */}
        <div style={{ background: PRIMARY_SOFT, borderRadius: 13, padding: "13px 15px", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 3 }}>{lead.name}</div>
          <div style={{ fontSize: 12, color: TEXT_MID }}>
            {telepon(lead.phone)}
            {lead.email ? ` · ${lead.email}` : ""}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
            <span style={{ ...labelGaya, marginBottom: 0 }}>Unit</span>
            {/* Peta lebih dulu: yang ada di kepala pembeli adalah letak unit,
                bukan kodenya. Daftar tetap ada untuk yang hafal kodenya. */}
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { k: "peta", label: "Peta", ikon: MapIcon },
                { k: "daftar", label: "Daftar", ikon: List },
              ].map((m) => {
                const aktif = mode === m.k;
                return (
                  <button
                    key={m.k}
                    type="button"
                    onClick={() => setMode(m.k)}
                    aria-pressed={aktif}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      borderRadius: 999,
                      border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                      background: aktif ? PRIMARY : SURFACE,
                      color: aktif ? "#fff" : TEXT_MID,
                      fontSize: 11.5,
                      fontWeight: aktif ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    <m.ikon size={12} aria-hidden="true" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "peta" ? (
            <SiteplanPicker
              unitTerpilihId={unitId}
              onPilih={(u) => setUnitId((v) => (v === u.id ? "" : u.id))}
            />
          ) : (
            <select id="kv-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} style={inputStyle} disabled={memuat}>
              <option value="">{memuat ? "Memuat unit…" : "Belum ditentukan"}</option>
              {perBlok.map(([blok, daftar]) => (
                <optgroup key={blok} label={`Blok ${blok}`}>
                  {daftar.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code}
                      {u.type ? ` — ${u.type}` : ""}
                      {u.price ? ` — ${rupiah(u.price)}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 7, lineHeight: 1.45 }}>
            {!memuat && units.length === 0
              ? "Tidak ada unit berstatus tersedia. Booking tetap bisa dicatat tanpa unit."
              : unitTerpilih
              ? `Terpilih: ${unitTerpilih.unit_code}${unitTerpilih.price ? ` · ${rupiah(unitTerpilih.price)}` : ""} — klik lagi untuk membatalkan.`
              : "Hanya unit tersedia yang bisa dipilih. Unit boleh ditentukan menyusul."}
          </div>
        </div>

        <div className="rg-2" style={{ marginBottom: 18 }}>
          <div>
            <label htmlFor="kv-nominal" style={labelGaya}>
              Booking Fee
            </label>
            <input
              id="kv-nominal"
              type="text"
              inputMode="numeric"
              placeholder="mis. 5.000.000"
              value={rupiahInput(nominal)}
              onChange={(e) => setNominal(angkaDariRupiah(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="kv-tanggal" style={labelGaya}>
              Tanggal Booking
            </label>
            <input id="kv-tanggal" type="date" value={tanggalBooking} onChange={(e) => setTanggalBooking(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* Akibat dijabarkan sebelum tombol ditekan — konversi menyentuh empat
            tabel sekaligus, dan tak satu pun terlihat dari layar ini. */}
        <div style={{ background: ACCENT_SOFT, border: "1px solid #F6CDB8", borderRadius: 13, padding: "13px 15px", marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT_DARK, marginBottom: 8, letterSpacing: "0.03em" }}>YANG AKAN TERJADI</div>
          <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, color: ACCENT_DARK, lineHeight: 1.75 }}>
            <li>
              Konsumen <b>{lead.name}</b> dibuat dari prospek ini
            </li>
            <li>
              {unitTerpilih ? (
                <>
                  Unit <b>{unitTerpilih.unit_code}</b> ter-<i>reserve</i> dan tidak bisa dibooking orang lain
                </>
              ) : (
                <>Unit belum ditentukan — bisa dipilih nanti dari kartu konsumen</>
              )}
            </li>
            <li>
              {nominal ? (
                <>
                  Booking fee <b>{rupiah(nominal)}</b> masuk antrean verifikasi Finance
                </>
              ) : (
                <>Belum ada booking fee yang dicatat</>
              )}
            </li>
            <li>Tahap prospek naik menjadi Booking</li>
          </ul>
          <div style={{ fontSize: 11.5, color: ACCENT_DARK, marginTop: 9, lineHeight: 1.5, opacity: 0.9 }}>
            Berkas konsumen <b>belum</b> terkunci — penyerahan ke Admin Marketing baru terjadi setelah Finance mengunggah kuitansi.
          </div>
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, background: "#FBE9E8", border: "1px solid #F2D3D1", borderRadius: 12, padding: "10px 13px", marginBottom: 16, lineHeight: 1.5 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={jalankan} disabled={kirim}>
            {kirim ? "Memproses…" : "Konversi ke Booking"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
