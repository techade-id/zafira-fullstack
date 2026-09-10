import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Home, User, Wallet, FolderOpen, ClipboardList, History, FileText, Upload } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadFile, getSignedUrl } from "../lib/storage";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canEditBerkas, isLocked, lockReason, roleOf } from "../lib/permissions";
import { rupiah, tanggal, tanggalWaktu, durasiHari, labelTahap, labelJenisBayar } from "../lib/format";
import FollowUpTimeline from "../components/FollowUpTimeline";
import KprStepper from "../components/KprStepper";
import KontakAksi from "../components/KontakAksi";
import {
  Card,
  DataTable,
  Badge,
  PrimaryButton,
  DeleteButton,
  EmptyState,
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  ReadOnlyBanner,
  LockBanner,
  inputStyle,
} from "../components/ui";

const DOC_TYPES = ["KTP", "KK", "NPWP", "Slip Gaji", "Akad"];
const DOC_STATUS = ["menunggu", "terverifikasi", "ditolak"];

const TAB = [
  { kunci: "ringkasan", label: "Ringkasan", ikon: User },
  { kunci: "kpr", label: "Progres KPR", ikon: ClipboardList },
  { kunci: "dokumen", label: "Dokumen", ikon: FolderOpen },
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
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState("ringkasan");
  const [konsumen, setKonsumen] = useState(null);
  const [kpr, setKpr] = useState(null);
  const [dokumen, setDokumen] = useState([]);
  const [pembayaran, setPembayaran] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

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

  if (memuat) {
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
              {t.kunci === "dokumen" && dokumen.length > 0 && <Hitung n={dokumen.length} aktif={aktif} />}
              {t.kunci === "pembayaran" && pembayaran.length > 0 && <Hitung n={pembayaran.length} aktif={aktif} />}
            </button>
          );
        })}
      </div>

      {tab === "ringkasan" && <TabRingkasan konsumen={konsumen} kpr={kpr} pembayaran={pembayaran} dokumen={dokumen} onBuka={setTab} />}

      {tab === "kpr" && (
        <Card>
          <KprStepper kpr={kpr} customerId={konsumen.id} editable={bolehBerkas} onChange={setKpr} />
        </Card>
      )}

      {tab === "dokumen" && (
        <TabDokumen
          dokumen={dokumen}
          customerId={konsumen.id}
          editable={bolehBerkas}
          onUbah={muat}
          toast={toast}
        />
      )}

      {tab === "pembayaran" && <TabPembayaran pembayaran={pembayaran} />}

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

function TabRingkasan({ konsumen, kpr, pembayaran, dokumen, onBuka }) {
  const terverifikasi = pembayaran.filter((p) => p.status === "terverifikasi").reduce((s, p) => s + Number(p.amount || 0), 0);
  const menunggu = pembayaran.filter((p) => p.status === "menunggu").reduce((s, p) => s + Number(p.amount || 0), 0);
  const lengkap = DOC_TYPES.filter((t) => dokumen.some((d) => d.doc_type === t && d.status === "terverifikasi"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rg-3">
        <Ringkas label="Sudah Terverifikasi" nilai={rupiah(terverifikasi)} />
        <Ringkas label="Menunggu Verifikasi" nilai={rupiah(menunggu)} sorot={menunggu > 0} />
        <Ringkas label="Dokumen Lengkap" nilai={`${lengkap.length} / ${DOC_TYPES.length}`} />
      </div>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Data Diri</div>
        <div className="rg-3" style={{ rowGap: 14 }}>
          <Baris label="Nama" nilai={konsumen.name} />
          <Baris label="Telepon" nilai={konsumen.phone} />
          <Baris label="Email" nilai={konsumen.email} />
          <Baris label="Username Sosial Media" nilai={konsumen.username_sosmed} />
          <Baris label="No. KTP" nilai={konsumen.ktp_number} />
          <Baris label="Alamat" nilai={konsumen.address} />
          <Baris label="Alamat KTP" nilai={kpr?.alamat_ktp} />
          <Baris label="Unit" nilai={konsumen.units?.unit_code} />
          <Baris label="Harga Unit" nilai={konsumen.units?.price ? rupiah(konsumen.units.price) : null} />
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Ringkasan KPR</div>
          <button onClick={() => onBuka("kpr")} style={{ border: "none", background: "none", color: PRIMARY, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Buka progres →
          </button>
        </div>
        <div className="rg-3" style={{ rowGap: 14 }}>
          <Baris label="Tanggal Booking" nilai={kpr?.tanggal_booking ? tanggal(kpr.tanggal_booking) : null} />
          <Baris label="Nominal Booking" nilai={kpr?.nominal_booking ? rupiah(kpr.nominal_booking) : null} />
          <Baris label="Bank" nilai={kpr?.nama_bank} />
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
   Dokumen
   ============================================================ */

function TabDokumen({ dokumen, customerId, editable, onUbah, toast }) {
  const [jenis, setJenis] = useState(DOC_TYPES[0]);
  const [berkas, setBerkas] = useState(null);
  const [unggah, setUnggah] = useState(false);

  async function kirim() {
    if (!berkas) return;
    setUnggah(true);
    const { path, error: upErr } = await uploadFile("customer-documents", customerId, berkas);
    if (upErr) {
      setUnggah(false);
      toast.gagal(`Gagal mengunggah: ${upErr.message}`);
      return;
    }
    const { error } = await supabase
      .from("customer_documents")
      .insert({ customer_id: customerId, doc_type: jenis, file_url: path, status: "menunggu" });
    setUnggah(false);
    if (error) {
      toast.gagal(`Gagal menyimpan dokumen: ${error.message}`);
      return;
    }
    setBerkas(null);
    toast.sukses(`${jenis} terunggah dan menunggu verifikasi.`);
    onUbah();
  }

  async function ubahStatus(docId, status) {
    // Hasilnya diperiksa: sebelum ini penolakan RLS lewat tanpa jejak, dan
    // pengguna hanya melihat nilai lama kembali tanpa sebab.
    const { error } = await supabase.from("customer_documents").update({ status }).eq("id", docId);
    if (error) {
      toast.gagal(`Status dokumen gagal diubah: ${error.message}`);
      return;
    }
    onUbah();
  }

  async function lihat(path) {
    const url = await getSignedUrl("customer-documents", path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.gagal("Tautan dokumen tidak dapat dibuka.");
  }

  const kurang = DOC_TYPES.filter((t) => !dokumen.some((d) => d.doc_type === t));

  return (
    <Card>
      {/* Kelengkapan berkas: yang dicari Admin Marketing adalah yang BELUM ada,
          dan itu justru tidak terlihat pada daftar dokumen yang sudah masuk. */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
        {DOC_TYPES.map((t) => {
          const doc = dokumen.find((d) => d.doc_type === t);
          const warna = !doc ? { bg: "#EEF1F6", fg: "#516079" } : doc.status === "terverifikasi" ? { bg: "#E4F2E8", fg: "#166534" } : doc.status === "ditolak" ? { bg: "#FBE9E8", fg: "#A6332C" } : { bg: "#FDECE4", fg: ACCENT_DARK };
          return (
            <span key={t} style={{ fontSize: 11.5, fontWeight: 600, background: warna.bg, color: warna.fg, padding: "5px 11px", borderRadius: 999 }}>
              {t}
              {doc ? ` · ${doc.status === "terverifikasi" ? "✓" : doc.status === "ditolak" ? "✕" : "…"}` : " · belum ada"}
            </span>
          );
        })}
      </div>

      {editable && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ minWidth: 150 }}>
            <label htmlFor="dok-jenis" style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
              Jenis Dokumen
            </label>
            <select id="dok-jenis" value={jenis} onChange={(e) => setJenis(e.target.value)} style={inputStyle}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <label htmlFor="dok-berkas" style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
              Berkas
            </label>
            <input id="dok-berkas" type="file" onChange={(e) => setBerkas(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
          </div>
          <PrimaryButton subject="document" onClick={kirim} disabled={unggah || !berkas}>
            {unggah ? "Mengunggah…" : "Unggah"}
          </PrimaryButton>
        </div>
      )}

      <DataTable
        sortable
        emptyIcon={Upload}
        emptyLabel="Belum ada dokumen diunggah"
        emptyHint={
          kurang.length > 0
            ? `Yang masih dibutuhkan: ${kurang.join(", ")}.`
            : "Unggah berkas KPR di sini agar Admin Marketing dapat memverifikasinya."
        }
        columns={[
          { key: "doc_type", label: "Jenis" },
          {
            key: "file_url",
            label: "Berkas",
            sortable: false,
            render: (row) =>
              row.file_url ? (
                <button onClick={() => lihat(row.file_url)} style={gayaTautan}>
                  <FileText size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Lihat
                </button>
              ) : (
                "-"
              ),
          },
          { key: "uploaded_at", label: "Diunggah", render: (row) => tanggal(row.uploaded_at) },
          {
            key: "status",
            label: "Status",
            render: (row) =>
              editable ? (
                <select
                  value={row.status}
                  onChange={(e) => ubahStatus(row.id, e.target.value)}
                  aria-label={`Status dokumen ${row.doc_type}`}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: "5px 9px", fontSize: 12 }}
                >
                  {DOC_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge value={row.status} />
              ),
          },
          {
            key: "aksi",
            label: "",
            sortable: false,
            render: (row) => (
              <DeleteButton
                subject="document_delete"
                itemName={row.doc_type}
                onDelete={() => supabase.from("customer_documents").delete().eq("id", row.id)}
                onDone={onUbah}
              />
            ),
          },
        ]}
        rows={dokumen}
      />
    </Card>
  );
}

/* ============================================================
   Pembayaran
   ============================================================ */

function TabPembayaran({ pembayaran }) {
  const total = pembayaran.filter((p) => p.status === "terverifikasi").reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <Card>
      <DataTable
        sortable
        defaultSort={{ key: "payment_date", arah: "desc" }}
        emptyIcon={Wallet}
        emptyLabel="Belum ada pembayaran"
        emptyHint="Pembayaran yang dicatat di modul Pembayaran akan muncul di sini."
        columns={[
          { key: "payment_type", label: "Jenis", render: (row) => labelJenisBayar(row.payment_type) },
          { key: "amount", label: "Nominal", align: "right", sortValue: (row) => Number(row.amount), render: (row) => rupiah(row.amount) },
          { key: "payment_date", label: "Tanggal", render: (row) => tanggal(row.payment_date) },
          { key: "status", label: "Status", render: (row) => <Badge value={row.status} /> },
          { key: "created_at", label: "Dicatat", render: (row) => tanggalWaktu(row.created_at) },
        ]}
        rows={pembayaran}
      />
      {pembayaran.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: TEXT_MID }}>Total terverifikasi</span>
          <b>{rupiah(total)}</b>
        </div>
      )}
    </Card>
  );
}

const gayaTautan = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  color: TEXT_DARK,
};
