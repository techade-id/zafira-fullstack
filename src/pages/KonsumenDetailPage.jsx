import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Home, User, Wallet, ClipboardList, History } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { canEditBerkas, canEditCustomer, isLocked, lockReason, roleOf } from "../lib/permissions";
import { rupiah, tanggal, durasiHari, labelTahap } from "../lib/format";
import { useSyaratBerkas, cocokkanBerkas } from "../lib/useSyaratBerkas";
import FollowUpTimeline from "../components/FollowUpTimeline";
import KprStepper from "../components/KprStepper";
import DokumenKonsumen from "../components/DokumenKonsumen";
import { dengarBerkas } from "../lib/berkas";
import KontakAksi from "../components/KontakAksi";
import DataDiriKonsumen from "../components/DataDiriKonsumen";
import PembayaranKonsumen from "../components/PembayaranKonsumen";
import {
  Card,
  Badge,
  EmptyState,
  BORDER,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  SURFACE,
  ACCENT,
  ACCENT_DARK,
  ReadOnlyBanner,
  LockBanner,
} from "../components/ui";

/**
 * Tab konsumen.
 *
 * "Dokumen" sengaja tidak lagi berdiri sendiri. BRIEF §Bank memintanya masuk
 * ke dalam section Bank — dan itu memang tempatnya: kelengkapan berkas hanya
 * punya arti terhadap syarat bank yang dipilih, dan tab terpisah membuat
 * keduanya harus dibaca bergantian untuk menjawab satu pertanyaan.
 */
const TAB = [
  { kunci: "ringkasan", label: "Ringkasan", ikon: User },
  { kunci: "kpr", label: "Progres KPR", ikon: ClipboardList },
  { kunci: "pembayaran", label: "Pembayaran", ikon: Wallet },
  { kunci: "riwayat", label: "Riwayat", ikon: History },
];

/**
 * Kartu konsumen 360°.
 *
 * Sebelum halaman ini, seluruh data konsumen hanya bisa dilihat sebagai panel
 * yang mengembang di bawah tabel: untuk menyusun satu gambaran utuh seseorang
 * harus menggulir bolak-balik, dan tidak ada satu pun URL yang bisa dikirimkan
 * ke rekan kerja. Sekarang setiap konsumen punya alamatnya sendiri.
 */
export default function KonsumenDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState("ringkasan");
  const [konsumen, setKonsumen] = useState(null);
  const [kpr, setKpr] = useState(null);
  const [dokumen, setDokumen] = useState([]);
  const [pembayaran, setPembayaran] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [kprDibuka, setKprDibuka] = useState(false);
  // Tombol Ubah di daftar Konsumen membuka halaman ini dengan ?ubah=1.
  const [mintaUbah, setMintaUbah] = useState(params.get("ubah") === "1");
  const [kprDraf, setKprDraf] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    const [{ data: c, error: e1 }, { data: k }, { data: d }, { data: p }] = await Promise.all([
      supabase
        .from("customers")
        .select("*, units(unit_code, block, type, price), leads(id, status, name), profiles:sales_agent_id(full_name)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("customer_kpr").select("*").eq("customer_id", id).maybeSingle(),
      supabase.from("customer_documents").select("*").eq("customer_id", id).order("uploaded_at", { ascending: false }),
      supabase.from("payments").select("*").eq("customer_id", id).order("payment_date", { ascending: false }),
    ]);

    setMemuat(false);
    if (e1) {
      setGalat(e1.message);
      return;
    }
    setKonsumen(c || null);
    setKpr(k || { customer_id: id });
    setDokumen(d || []);
    setPembayaran(p || []);
  }, [id]);

  useEffect(() => {
    muat();
  }, [muat]);

  useEffect(() => {
    if (tab === "kpr") setKprDibuka(true);
  }, [tab]);

  useEffect(() => {
    if (params.get("ubah") !== "1") return;
    setMintaUbah(true);
    setTab("ringkasan");
    // Parameternya dilepas, supaya memuat ulang halaman tidak membuka mode ubah lagi.
    const p = new URLSearchParams(params);
    p.delete("ubah");
    setParams(p, { replace: true });
  }, [params, setParams]);

  // Lencana jumlah dokumen dan angka "Berkas Wajib" ikut segar setiap kali
  // berkas berubah — dari tahap KPR maupun dari Dokumen Konsumen.
  useEffect(() => dengarBerkas(id, muat), [id, muat]);

  // Layar memuat hanya untuk konsumen yang belum tampil. Memuat ulang konsumen
  // yang sama — setelah unggah berkas atau mencatat kontak — tidak boleh
  // melepas KprStepper dari halaman, karena draf yang belum disimpan ikut hilang.
  if (memuat && konsumen?.id !== id) {
    return <Card><div style={{ padding: 20, fontSize: 13, color: TEXT_MID }}>Memuat konsumen…</div></Card>;
  }

  if (galat || !konsumen) {
    return (
      <Card>
        <EmptyState
          icon={User}
          label="Konsumen tidak ditemukan"
          hint={galat || "Data ini mungkin sudah dihapus, atau Anda tidak punya akses untuk melihatnya."}
          action={
            <Link to="/konsumen" style={{ fontSize: 13, fontWeight: 600, color: PRIMARY }}>
              ← Kembali ke daftar konsumen
            </Link>
          }
        />
      </Card>
    );
  }

  const terkunci = isLocked(konsumen);
  const bolehBerkas = canEditBerkas(profile, konsumen);
  const terkunciBagiSaya = terkunci && roleOf(profile) === "sales";
  const tahap = konsumen.leads?.status;

  return (
    <div>
      <button
        onClick={() => navigate("/konsumen")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", color: TEXT_MID, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "0 0 12px" }}
      >
        <ArrowLeft size={14} /> Semua Konsumen
      </button>

      <ReadOnlyBanner />
      {terkunciBagiSaya && <LockBanner message={lockReason(konsumen)} />}

      {/* Kepala kartu: identitas, kontak, unit, tahap, dan penanggung jawab
          semuanya terbaca sekaligus — inilah yang dulu tersebar di lima tempat. */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <h2 style={{ fontSize: 21, margin: 0, letterSpacing: "-0.02em" }}>{konsumen.name}</h2>
              {tahap && <Badge value={tahap} label={labelTahap(tahap)} />}
              <Badge value={konsumen.status} />
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: TEXT_MID, alignItems: "center" }}>
              <KontakAksi
                phone={konsumen.phone}
                nama={konsumen.name}
                tahap={tahap || konsumen.status}
                unit={konsumen.units?.unit_code}
                customerId={konsumen.id}
                onCatat={muat}
              />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Home size={13} aria-hidden="true" />
                {konsumen.units?.unit_code ? `${konsumen.units.unit_code}${konsumen.units.type ? ` · ${konsumen.units.type}` : ""}` : "Unit belum dipilih"}
              </span>
              <span>Agen: {konsumen.profiles?.full_name || "-"}</span>
              <span>{durasiHari(konsumen.process_started_at, konsumen.process_completed_at)}</span>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 4 }}>Tanggung Jawab</div>
            {terkunci ? (
              <span style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT_DARK }} title={lockReason(konsumen)}>
                🔒 Admin Marketing
              </span>
            ) : (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_DARK }}>Sales</span>
            )}
          </div>
        </div>
      </Card>

      {/* Tab */}
      <div role="tablist" aria-label="Bagian data konsumen" style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
        {TAB.map((t) => {
          const aktif = tab === t.kunci;
          return (
            <button
              key={t.kunci}
              role="tab"
              aria-selected={aktif}
              onClick={() => setTab(t.kunci)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 15px",
                borderRadius: 999,
                border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                background: aktif ? PRIMARY : SURFACE,
                color: aktif ? "#fff" : TEXT_MID,
                fontSize: 12.5,
                fontWeight: aktif ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <t.ikon size={14} aria-hidden="true" />
              {t.label}
              {t.kunci === "kpr" && dokumen.length > 0 && <Hitung n={dokumen.length} aktif={aktif} />}
              {t.kunci === "kpr" && kprDraf && (
                <span
                  title="Ada perubahan Progres KPR yang belum disimpan"
                  aria-label="belum disimpan"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, flexShrink: 0 }}
                />
              )}
              {t.kunci === "pembayaran" && pembayaran.length > 0 && <Hitung n={pembayaran.length} aktif={aktif} />}
            </button>
          );
        })}
      </div>

      {/* Tetap terpasang saat berpindah tab: perubahan Data Diri yang belum
          disimpan tidak boleh hilang hanya karena melirik tab lain. */}
      <div hidden={tab !== "ringkasan"}>
        <TabRingkasan
          konsumen={konsumen}
          kpr={kpr}
          pembayaran={pembayaran}
          dokumen={dokumen}
          bolehUbah={canEditCustomer(profile, konsumen)}
          bolehBerkas={bolehBerkas}
          onUbah={muat}
          onBuka={setTab}
          awalUbah={mintaUbah}
        />
      </div>

      {/* Tetap terpasang setelah pertama dibuka: draf KPR yang belum disimpan
          tidak boleh hilang hanya karena pengguna melirik tab lain. */}
      {(tab === "kpr" || kprDibuka) && (
        <div hidden={tab !== "kpr"}>
          <Card>
            <KprStepper
              kpr={kpr}
              customerId={konsumen.id}
              editable={bolehBerkas}
              onChange={setKpr}
              onDrafUbah={setKprDraf}
            />
          </Card>
        </div>
      )}

      {tab === "pembayaran" && <PembayaranKonsumen konsumen={konsumen} pembayaran={pembayaran} editable={bolehBerkas} />}

      {tab === "riwayat" && <FollowUpTimeline customerId={konsumen.id} leadId={konsumen.lead_id} title="Riwayat Konsumen" />}
    </div>
  );
}

function Hitung({ n, aktif }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        background: aktif ? "rgba(255,255,255,0.22)" : PRIMARY_SOFT,
        color: aktif ? "#fff" : PRIMARY,
        borderRadius: 999,
        padding: "1px 7px",
      }}
    >
      {n}
    </span>
  );
}

/* ============================================================
   Ringkasan
   ============================================================ */

function TabRingkasan({ konsumen, kpr, pembayaran, dokumen, bolehUbah, bolehBerkas, awalUbah, onUbah, onBuka }) {
  const terverifikasi = pembayaran.filter((p) => p.status === "terverifikasi").reduce((s, p) => s + Number(p.amount || 0), 0);
  // "Menunggu" kini dua status: yang belum berbukti, dan yang buktinya sudah
  // dikirim ke Finance. Keduanya sama-sama belum menjadi uang yang diakui.
  const menunggu = pembayaran.filter((p) => p.status !== "terverifikasi").reduce((s, p) => s + Number(p.amount || 0), 0);
  // Kelengkapan dihitung terhadap syarat bank yang berlaku, bukan daftar tetap.
  const { syarat } = useSyaratBerkas(kpr?.nama_bank);
  const rekap = useMemo(() => cocokkanBerkas(syarat, dokumen), [syarat, dokumen]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rg-3">
        <Ringkas label="Sudah Terverifikasi" nilai={rupiah(terverifikasi)} />
        <Ringkas label="Menunggu Verifikasi" nilai={rupiah(menunggu)} sorot={menunggu > 0} />
        <Ringkas
          label="Berkas Wajib"
          nilai={rekap.totalWajib ? `${rekap.lengkapWajib} / ${rekap.totalWajib}` : "-"}
          sorot={rekap.kurang.length > 0}
        />
      </div>

      {/* Penghasilan kini ikut formulir Data Diri — tersimpan lewat tombol
          Simpan, bukan lagi saat kolomnya ditinggalkan. BRIEF §Saringan Awal
          memindahkannya ke sini dari tahap BI-Checking. */}
      <DataDiriKonsumen konsumen={konsumen} kpr={kpr} bolehUbah={bolehUbah} awalUbah={awalUbah} onTersimpan={onUbah} />

      {/* Seluruh berkas konsumen — KTP, berkas bank, lampiran tahap, bukti
          pembayaran, foto komplain — terbaca dan bisa diunggah dari sini. */}
      <DokumenKonsumen konsumen={konsumen} bank={kpr?.nama_bank} editable={bolehBerkas} />

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Ringkasan KPR</div>
          <button onClick={() => onBuka("kpr")} style={{ border: "none", background: "none", color: PRIMARY, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Buka progres &amp; dokumen →
          </button>
        </div>
        <div className="rg-3" style={{ rowGap: 14 }}>
          <Baris label="Tanggal Booking" nilai={kpr?.tanggal_booking ? tanggal(kpr.tanggal_booking) : null} />
          <Baris label="Nominal Booking" nilai={kpr?.nominal_booking ? rupiah(kpr.nominal_booking) : null} />
          <Baris label="Bank" nilai={kpr?.nama_bank} />
          <Baris
            label="Berkas Bank"
            nilai={rekap.totalWajib ? `${rekap.lengkapWajib}/${rekap.totalWajib} wajib · ${rekap.kurang.length} kurang` : null}
          />
          <Baris label="Masuk Bank" nilai={kpr?.tanggal_masuk_bank ? tanggal(kpr.tanggal_masuk_bank) : null} />
          <Baris label="SP3K Terbit" nilai={kpr?.tanggal_sp3k_terbit ? tanggal(kpr.tanggal_sp3k_terbit) : null} />
          <Baris label="SP3K Expired" nilai={kpr?.tanggal_sp3k_expired ? tanggal(kpr.tanggal_sp3k_expired) : null} />
          <Baris label="Akad" nilai={kpr?.tanggal_akad ? tanggal(kpr.tanggal_akad) : null} />
          <Baris label="Serah Terima Kunci" nilai={kpr?.tanggal_serah_terima_kunci ? tanggal(kpr.tanggal_serah_terima_kunci) : null} />
          <Baris label="SHM" nilai={kpr?.shm} />
        </div>
        {kpr?.kendala && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 4 }}>Kendala</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{kpr.kendala}</div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Ringkas({ label, nilai, sorot }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: sorot ? ACCENT_DARK : TEXT_DARK, letterSpacing: "-0.01em" }}>{nilai}</div>
    </Card>
  );
}

function Baris({ label, nilai }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: nilai ? TEXT_DARK : TEXT_MID, wordBreak: "break-word" }}>{nilai || "-"}</div>
    </div>
  );
}

/* ============================================================
   Pembayaran
   ============================================================ */

