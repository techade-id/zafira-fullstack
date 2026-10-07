import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Lock, Unlock, TimerReset, Star, CalendarCheck, MessageCircle, Copy, Pencil, ArrowRight, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { canWrite } from "../../lib/permissions";
import { rupiah, tanggal, telepon, nomorWa, selisihHari } from "../../lib/format";
import {
  MODE_PETA,
  TAHAP_KPR,
  statusJual,
  holdAktif,
  sisaWaktu,
  labelPosisi,
  labelHadap,
  pesanWaKavling,
  tautanPublik,
} from "../../lib/siteplan";
import { Swatch } from "../SiteplanVektor";
import ModalPilihProspek from "./ModalPilihProspek";
import {
  Drawer,
  Badge,
  PrimaryButton,
  ConfirmDialog,
  BORDER,
  BORDER_SOFT,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT,
  ACCENT_SOFT,
  ACCENT_DARK,
  POSITIVE,
  NEGATIVE,
} from "../ui";

/**
 * Satu kavling, seluruh ceritanya: harga dan atribut untuk menawarkan, hold
 * dan peminat untuk berebut, konsumen–KPR–pembayaran–progres untuk yang
 * sudah terjual. Aksinya mengikuti keadaan kavling, bukan daftar tombol tetap:
 * kavling tersedia menawarkan Tahan dan Booking, kavling ditahan menawarkan
 * Booking untuk prospek penahannya.
 */
export default function PanelKavling({ kavling: k, siteplan, proyek, open, onClose, onBerubah, onBooking, onUbah, sekarang }) {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [peminat, setPeminat] = useState([]);
  const [pilih, setPilih] = useState(null); // 'tahan' | 'minat' | 'booking'
  const [lepas, setLepas] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const id = k?.id;

  useEffect(() => {
    if (!open || !id) return;
    let aktif = true;
    supabase
      .from("unit_minat")
      .select("id, lead_id, created_at, leads(id, name, phone, status, assigned_to, agen:profiles!leads_assigned_to_fkey(full_name))")
      .eq("unit_id", id)
      .order("created_at")
      .then(({ data }) => {
        if (aktif) setPeminat((data || []).filter((m) => m.leads));
      });
    return () => {
      aktif = false;
    };
  }, [open, id, k?.minat]);

  if (!k) return null;

  const status = statusJual(k, sekarang);
  const gayaStatus = MODE_PETA.status.kategori.find((c) => c.key === status);
  const hold = holdAktif(k, sekarang);
  const saya = profile?.id;
  const bisaTahan = canWrite(profile, "hold");
  const bisaKelola = canWrite(profile, "hold_kelola");
  const bisaMinat = canWrite(profile, "minat");
  const bisaUbah = canWrite(profile, "siteplan");
  const milikSaya = hold && hold.held_by === saya;
  const tersedia = status === "tersedia";
  const peminatAktif = peminat.filter((m) => !["cancel", "booking", "kpr", "akad", "aftersales", "deal", "closing"].includes(m.leads.status));
  const peminatTersembunyi = Math.max(0, Number(k.minat || 0) - peminatAktif.length);
  const tautan = siteplan?.publik ? tautanPublik(siteplan.publik_token) : null;

  async function rpc(nama, args, suksesPesan) {
    setSibuk(true);
    const { error } = await supabase.rpc(nama, args);
    setSibuk(false);
    if (error) {
      toast.gagal(error.message);
      return error.message;
    }
    toast.sukses(suksesPesan);
    onBerubah?.();
    return null;
  }

  async function tahan(lead, catatan) {
    const galat = await rpc("tahan_kavling", { p_unit_id: k.id, p_lead_id: lead.id, p_catatan: catatan || null }, `Kavling ${k.unit_code} ditahan untuk ${lead.name}.`);
    if (!galat) setPilih(null);
    return galat;
  }

  async function catatMinat(lead) {
    const { error } = await supabase.from("unit_minat").insert({ unit_id: k.id, lead_id: lead.id });
    if (error) {
      return error.code === "23505" ? `${lead.name} sudah tercatat berminat pada kavling ini.` : error.message;
    }
    toast.sukses(`Minat ${lead.name} pada ${k.unit_code} dicatat.`);
    setPilih(null);
    onBerubah?.();
    return null;
  }

  async function hapusMinat(m) {
    const { error } = await supabase.from("unit_minat").delete().eq("id", m.id);
    if (error) return toast.gagal(error.message);
    onBerubah?.();
  }

  async function bookingUntuk(leadId) {
    const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (error || !data) {
      toast.gagal("Prospek tidak dapat dibuka — mungkin bukan prospek Anda.");
      return "Prospek tidak dapat dibuka.";
    }
    setPilih(null);
    onBooking?.(data, k);
    return null;
  }

  function kirimWa() {
    const pesan = pesanWaKavling(k, { proyek: proyek?.name, siteplan: siteplan?.nama, tautan, tampilHarga: tersedia });
    window.open(`https://wa.me/?text=${encodeURIComponent(pesan)}`, "_blank", "noopener");
  }

  async function salin() {
    const pesan = pesanWaKavling(k, { proyek: proyek?.name, siteplan: siteplan?.nama, tautan, tampilHarga: tersedia });
    try {
      await navigator.clipboard.writeText(pesan);
      toast.sukses("Info kavling disalin.");
    } catch {
      toast.gagal("Tidak bisa menyalin otomatis di peramban ini.");
    }
  }

  const idx = TAHAP_KPR.findIndex((t) => t.key === k.kpr?.tahap);
  const sp3kHabis = k.kpr?.tanggal_sp3k_expired && !k.kpr?.tanggal_akad ? selisihHari(k.kpr.tanggal_sp3k_expired) : null;

  return (
    <Drawer open={open} labelledBy="panel-kavling-judul" onClose={onClose} width={440}>
      <div style={{ padding: "20px 22px 14px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: SURFACE, zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 3 }}>
              {[proyek?.name, siteplan?.nama].filter(Boolean).join(" · ")}
            </div>
            <div id="panel-kavling-judul" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT_DARK }}>
              Kavling {k.unit_code}
              {gayaStatus && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: TEXT_DARK, border: `1px solid ${BORDER}`, borderRadius: 999, padding: "3px 10px" }}>
                  <Swatch gaya={gayaStatus.gaya} ukuran={10} />
                  {gayaStatus.label}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup panel" style={{ border: "none", background: "none", color: TEXT_MID, cursor: "pointer", padding: 4 }}>
            <X size={19} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: TEXT_DARK, letterSpacing: "-0.02em" }}>{k.price ? rupiah(k.price) : "Harga belum diatur"}</span>
          {k.type && <span style={{ fontSize: 13, color: TEXT_MID }}>Tipe {k.type}</span>}
        </div>
      </div>

      <div style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <Atribut label="Blok" nilai={k.block || "-"} />
          <Atribut label="Tanah" nilai={k.luas_tanah ? `${Number(k.luas_tanah).toLocaleString("id-ID")} m²` : "-"} />
          <Atribut label="Bangunan" nilai={k.luas_bangunan ? `${Number(k.luas_bangunan).toLocaleString("id-ID")} m²` : "-"} />
          <Atribut label="Hadap" nilai={labelHadap(k.hadap) || "-"} />
        </div>
        {(k.posisi && k.posisi !== "standar") || k.catatan ? (
          <div style={{ fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.5 }}>
            {k.posisi && k.posisi !== "standar" && (
              <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 600, color: PRIMARY, background: PRIMARY_SOFT, borderRadius: 999, padding: "3px 10px", marginRight: 8 }}>
                {labelPosisi(k.posisi)}
              </span>
            )}
            {k.catatan}
          </div>
        ) : null}

        {/* ---------- Hold ---------- */}
        {hold && (
          <Bagian judul="Ditahan">
            <div style={{ background: "#F1ECFA", border: "1px dashed #6D45B0", borderRadius: 13, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, color: TEXT_DARK, lineHeight: 1.5 }}>
                Untuk <b>{hold.lead_nama || "prospek tim lain"}</b> oleh {hold.penahan || "—"}
              </div>
              <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 2 }}>
                Berakhir dalam <b style={{ color: TEXT_DARK }}>{sisaWaktu(hold.berakhir, sekarang)}</b> · {new Date(hold.berakhir).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {hold.diperpanjang > 0 && ` · diperpanjang ${hold.diperpanjang}×`}
              </div>
              {hold.catatan && <div style={{ fontSize: 12, color: TEXT_DARK, marginTop: 6, fontStyle: "italic" }}>“{hold.catatan}”</div>}
              <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
                {hold.lead_nama && bisaTahan && (
                  <PrimaryButton onClick={() => bookingUntuk(hold.lead_id)} disabled={sibuk} style={{ padding: "8px 14px", fontSize: 12.5 }}>
                    Booking sekarang
                  </PrimaryButton>
                )}
                {(milikSaya || bisaKelola) && (
                  <button type="button" onClick={() => setLepas(hold)} disabled={sibuk} style={gayaTombol}>
                    <Unlock size={13} /> Lepas
                  </button>
                )}
                {bisaKelola && (
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => rpc("perpanjang_hold", { p_hold_id: hold.id }, `Hold ${k.unit_code} diperpanjang.`)}
                    style={gayaTombol}
                  >
                    <TimerReset size={13} /> Perpanjang
                  </button>
                )}
              </div>
            </div>
          </Bagian>
        )}

        {/* ---------- Aksi penjualan ---------- */}
        {tersedia && (bisaTahan || bisaMinat) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {bisaTahan && (
              <PrimaryButton onClick={() => setPilih("tahan")} disabled={sibuk} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Lock size={14} /> Tahan untuk prospek
              </PrimaryButton>
            )}
            {bisaTahan && (
              <button type="button" onClick={() => setPilih("booking")} disabled={sibuk} style={{ ...gayaTombol, justifyContent: "center", padding: "10px 12px", fontSize: 13 }}>
                <CalendarCheck size={14} /> Booking langsung
              </button>
            )}
            {bisaMinat && (
              <button type="button" onClick={() => setPilih("minat")} disabled={sibuk} style={{ ...gayaTombol, justifyContent: "center", padding: "9px 12px", gridColumn: bisaTahan ? "1 / -1" : undefined }}>
                <Star size={13} /> Tandai prospek berminat
              </button>
            )}
          </div>
        )}

        {/* ---------- Peminat ---------- */}
        {(peminatAktif.length > 0 || peminatTersembunyi > 0) && (
          <Bagian judul={`Peminat (${peminatAktif.length + peminatTersembunyi})`}>
            {peminatAktif.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: `1px solid ${BORDER_SOFT}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>{m.leads.name}</div>
                  <div style={{ fontSize: 11.5, color: TEXT_MID }}>
                    {telepon(m.leads.phone)}
                    {m.leads.agen?.full_name ? ` · ${m.leads.agen.full_name}` : ""} · sejak {tanggal(m.created_at)}
                  </div>
                </div>
                <Badge value={m.leads.status} />
                {tersedia && !hold && bisaTahan && (
                  <button type="button" title={`Tahan untuk ${m.leads.name}`} aria-label={`Tahan untuk ${m.leads.name}`} onClick={() => tahan(m.leads, null)} disabled={sibuk} style={gayaIkon}>
                    <Lock size={14} />
                  </button>
                )}
                {bisaMinat && (
                  <button type="button" title="Hapus minat" aria-label={`Hapus minat ${m.leads.name}`} onClick={() => hapusMinat(m)} className="hapus-ikon" style={gayaIkon}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {peminatTersembunyi > 0 && (
              <div style={{ fontSize: 12, color: TEXT_MID, paddingTop: 8 }}>
                + {peminatTersembunyi} peminat dari prospek tim lain
              </div>
            )}
          </Bagian>
        )}

        {/* ---------- Konsumen ---------- */}
        {k.konsumen ? (
          <Bagian judul="Konsumen">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>{k.konsumen.nama}</div>
                <div style={{ fontSize: 12, color: TEXT_MID }}>
                  {telepon(k.konsumen.telepon)}
                  {k.konsumen.sales_nama ? ` · Sales ${k.konsumen.sales_nama}` : ""}
                </div>
              </div>
              {nomorWa(k.konsumen.telepon) && (
                <a href={`https://wa.me/${nomorWa(k.konsumen.telepon)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp konsumen" style={{ ...gayaIkon, color: POSITIVE, display: "inline-flex" }}>
                  <MessageCircle size={16} />
                </a>
              )}
            </div>
            <button type="button" onClick={() => navigate(`/konsumen/${k.konsumen.id}`)} style={{ ...gayaTombol, marginTop: 10 }}>
              Buka kartu konsumen <ArrowRight size={13} />
            </button>
          </Bagian>
        ) : (status === "booking" || status === "terjual") ? (
          <div style={{ fontSize: 12.5, color: TEXT_MID, background: "#F4F6FA", borderRadius: 12, padding: "10px 13px", lineHeight: 1.5 }}>
            Kavling ini dijual oleh rekan tim lain — data konsumennya hanya terlihat oleh sales pemiliknya dan tim administrasi.
          </div>
        ) : null}

        {/* ---------- KPR ---------- */}
        {k.kpr && (
          <Bagian judul="Tahap KPR" kanan={k.kpr.nama_bank}>
            <ol style={{ display: "flex", gap: 4, listStyle: "none", padding: 0, margin: 0 }} aria-label="Tahap KPR">
              {TAHAP_KPR.map((t, i) => {
                const selesai = i <= idx;
                const kini = i === idx;
                return (
                  <li key={t.key} aria-current={kini ? "step" : undefined} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ height: 6, borderRadius: 3, background: selesai ? (kini ? ACCENT : PRIMARY) : "#E3E8F0" }} />
                    <div style={{ fontSize: 10, marginTop: 5, lineHeight: 1.2, color: kini ? TEXT_DARK : TEXT_MID, fontWeight: kini ? 700 : 500 }}>
                      {t.label}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 9, lineHeight: 1.6 }}>
              Booking {tanggal(k.kpr.tanggal_booking)}
              {k.kpr.tanggal_masuk_bank && ` · masuk bank ${tanggal(k.kpr.tanggal_masuk_bank)}`}
              {k.kpr.tanggal_akad && ` · akad ${tanggal(k.kpr.tanggal_akad)}`}
            </div>
            {sp3kHabis !== null && sp3kHabis <= 14 && (
              <div style={{ fontSize: 12, color: ACCENT_DARK, background: ACCENT_SOFT, borderRadius: 10, padding: "7px 11px", marginTop: 8 }}>
                SP3K {sp3kHabis < 0 ? `kedaluwarsa ${-sp3kHabis} hari lalu` : `kedaluwarsa dalam ${sp3kHabis} hari`} — segera jadwalkan akad.
              </div>
            )}
          </Bagian>
        )}

        {/* ---------- Pembayaran ---------- */}
        {k.bayar && (
          <Bagian judul="Pembayaran">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: TEXT_MID }}>Terverifikasi</span>
              <b style={{ color: TEXT_DARK }}>{rupiah(k.bayar.terverifikasi, { kosong: "Rp0" })}</b>
            </div>
            {Number(k.kpr?.nominal_total_dp) > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: TEXT_MID, marginBottom: 5 }}>
                  <span>DP</span>
                  <span>
                    {rupiah(k.bayar.dp_terverifikasi, { kosong: "Rp0" })} / {rupiah(k.kpr.nominal_total_dp)}
                  </span>
                </div>
                <Batang persen={(Number(k.bayar.dp_terverifikasi) / Number(k.kpr.nominal_total_dp)) * 100} warna={POSITIVE} label="DP terbayar" />
              </>
            )}
            {(Number(k.bayar.menunggu_verifikasi) > 0 || Number(k.bayar.menunggu) > 0) && (
              <div style={{ fontSize: 12, color: ACCENT_DARK, marginTop: 8 }}>
                {Number(k.bayar.menunggu_verifikasi) > 0 && `${k.bayar.menunggu_verifikasi} pembayaran menunggu verifikasi Finance. `}
                {Number(k.bayar.menunggu) > 0 && `${k.bayar.menunggu} belum ada bukti transfer.`}
              </div>
            )}
            {!k.bayar.booking_terverifikasi && (
              <div style={{ fontSize: 12, color: NEGATIVE, marginTop: 6 }}>Booking fee belum terverifikasi.</div>
            )}
          </Bagian>
        )}

        {/* ---------- Progres bangun ---------- */}
        {k.progres && (
          <Bagian judul="Progres pembangunan" kanan={<Badge value={k.progres.status} />}>
            <Batang persen={Number(k.progres.persen) || 0} warna={k.progres.status === "terlambat" ? NEGATIVE : "#22857C"} label="Progres pembangunan" />
            <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 6 }}>
              {Number(k.progres.persen) || 0}% {k.progres.target && `· target ${tanggal(k.progres.target)}`}
            </div>
          </Bagian>
        )}

        {/* ---------- Bagikan & ubah ---------- */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
          <button type="button" onClick={kirimWa} style={{ ...gayaTombol, marginTop: 12 }}>
            <MessageCircle size={13} /> Kirim info via WA
          </button>
          <button type="button" onClick={salin} style={{ ...gayaTombol, marginTop: 12 }}>
            <Copy size={13} /> Salin info
          </button>
          {bisaUbah && onUbah && (
            <button type="button" onClick={() => onUbah(k)} style={{ ...gayaTombol, marginTop: 12 }}>
              <Pencil size={13} /> Ubah di editor
            </button>
          )}
        </div>
      </div>

      <ModalPilihProspek
        open={pilih === "tahan"}
        judul={`Tahan kavling ${k.unit_code}`}
        keterangan="Kavling ditahan untuk satu prospek selama batas waktu di Pengaturan Bisnis, lalu terlepas otomatis. Sales lain tidak bisa menahan atau mem-booking kavling ini selama hold berlaku."
        labelTombol="Tahan kavling"
        unitId={k.id}
        denganCatatan
        onPilih={tahan}
        onClose={() => setPilih(null)}
      />
      <ModalPilihProspek
        open={pilih === "minat"}
        judul={`Prospek berminat pada ${k.unit_code}`}
        keterangan="Minat tidak menahan kavling — hanya mencatat permintaan. Kavling yang diminati banyak prospek tampil menonjol di mode Minat."
        labelTombol="Catat minat"
        unitId={k.id}
        onPilih={catatMinat}
        onClose={() => setPilih(null)}
      />
      <ModalPilihProspek
        open={pilih === "booking"}
        judul={`Booking kavling ${k.unit_code}`}
        keterangan="Pilih prospeknya, lalu lanjutkan ke formulir booking dengan kavling ini sudah terpilih."
        labelTombol="Lanjut ke booking"
        unitId={k.id}
        onPilih={(lead) => bookingUntuk(lead.id)}
        onClose={() => setPilih(null)}
      />

      <ConfirmDialog
        open={Boolean(lepas)}
        title={`Lepas hold ${k.unit_code}?`}
        message={`Kavling kembali tersedia untuk semua sales.${lepas && lepas.held_by !== saya ? ` Hold ini milik ${lepas.penahan}.` : ""}`}
        confirmLabel="Lepas hold"
        busy={sibuk}
        onCancel={() => setLepas(null)}
        onConfirm={async () => {
          const galat = await rpc("lepas_hold", { p_hold_id: lepas.id, p_alasan: null }, `Hold ${k.unit_code} dilepas.`);
          if (!galat) setLepas(null);
        }}
      />
    </Drawer>
  );
}

function Bagian({ judul, kanan, children }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT_MID }}>{judul}</h3>
        {kanan && <span style={{ fontSize: 12, color: TEXT_MID }}>{kanan}</span>}
      </div>
      {children}
    </section>
  );
}

function Atribut({ label, nilai }) {
  return (
    <div style={{ background: "#F7F9FC", borderRadius: 11, padding: "8px 9px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: TEXT_MID, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_DARK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nilai}</div>
    </div>
  );
}

/** Meter: isi membawa nilai, lintasannya satu langkah lebih terang dari ramp yang sama. */
function Batang({ persen, warna, label }) {
  const p = Math.max(0, Math.min(100, persen || 0));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} style={{ height: 8, borderRadius: 4, background: "#E3E8F0", overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: warna, borderRadius: 4, transition: "width 0.3s ease" }} />
    </div>
  );
}

const gayaTombol = {
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const gayaIkon = {
  border: "none",
  background: "none",
  color: TEXT_MID,
  borderRadius: 8,
  padding: 5,
  lineHeight: 0,
  cursor: "pointer",
  flexShrink: 0,
};
