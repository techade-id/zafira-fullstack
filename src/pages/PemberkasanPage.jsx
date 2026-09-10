import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, CalendarDays, MessageCircle, AlertTriangle, Landmark, FolderOpen } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { useBusinessSettings } from "../lib/useBusinessSettings";
import { useSyaratBerkas, cocokkanBerkas } from "../lib/useSyaratBerkas";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { tanggal, tanggalRelatif, selisihHari, rupiah, nomorWa } from "../lib/format";
import { isiPenanda } from "../lib/waTemplates";
import {
  Card,
  PageTitle,
  DataTable,
  EmptyState,
  Modal,
  PrimaryButton,
  ReadOnlyBanner,
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
  POSITIVE,
  inputStyle,
} from "../components/ui";

/**
 * Papan Berkas — permukaan kerja Admin Marketing.
 *
 * Enam tahap pemberkasan sudah lama ada di sistem ini sebagai daftar pilihan
 * di Pengaturan Bisnis (Pemberkasan → Menunggu SP3K → SP3K Terbit → Akad →
 * Serah Terima Kunci → Menunggu Bangunan). Tetapi enam tahap itu hanya hidup
 * sebagai satu dropdown di dalam kartu satu konsumen.
 *
 * Akibatnya Admin Marketing tidak pernah bisa melihat pekerjaannya sekaligus.
 * Pertanyaan sehari-harinya — "berapa berkas yang menunggu SP3K di BTN
 * Brebes?", "siapa yang mandek paling lama?" — hanya bisa dijawab dengan
 * membuka konsumen satu per satu.
 *
 * Halaman ini membalik sudut pandangnya: yang menjadi objek bukan konsumen,
 * melainkan berkas.
 */

const TANPA_TAHAP = "— Belum diatur —";

export default function PemberkasanPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tampilan, setTampilan] = useState("papan");
  const [baris, setBaris] = useState([]);
  const [dokumen, setDokumen] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [bank, setBank] = useState("");
  const [terpilih, setTerpilih] = useState(() => new Set());
  const [kejar, setKejar] = useState(false);

  const tahapan = useBusinessSettings("progres_berkas");
  const daftarBank = useBusinessSettings("bank");
  const { semua: semuaSyarat } = useSyaratBerkas(null);
  const bolehUbah = canWrite(profile, "kpr");

  const muat = useCallback(async () => {
    setMemuat(true);
    const [{ data: kpr }, { data: dok }] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("customer_kpr")
          .select("*, customers(id, name, phone, status, units(unit_code))")
          .order("updated_at", { ascending: false })
      ),
      fetchAllRows(() => supabase.from("customer_documents").select("customer_id, doc_type, status")),
    ]);
    setBaris((kpr || []).filter((k) => k.customers));
    setDokumen(dok || []);
    setMemuat(false);
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const dokPerKonsumen = useMemo(() => {
    const m = new Map();
    for (const d of dokumen) {
      if (!m.has(d.customer_id)) m.set(d.customer_id, []);
      m.get(d.customer_id).push(d);
    }
    return m;
  }, [dokumen]);

  /** Syarat yang berlaku untuk sebuah bank, memakai bawaan bila tak ada khusus. */
  const syaratUntuk = useCallback(
    (namaBank) => {
      const khusus = namaBank ? semuaSyarat.filter((s) => s.bank === namaBank) : [];
      return khusus.length > 0 ? khusus : semuaSyarat.filter((s) => s.bank === "*");
    },
    [semuaSyarat]
  );

  const kartu = useMemo(
    () =>
      baris
        .filter((k) => !bank || k.nama_bank === bank)
        .map((k) => {
          const rekap = cocokkanBerkas(syaratUntuk(k.nama_bank), dokPerKonsumen.get(k.customer_id) || []);
          const lamaTahap = k.updated_at ? -selisihHari(k.updated_at) : null;
          const lamaBank = k.tanggal_masuk_bank && !k.tanggal_sp3k_terbit ? -selisihHari(k.tanggal_masuk_bank) : null;
          const masalah = [];
          if (k.bi_checking_status === "tidak_lolos") masalah.push("BI-Checking tidak lolos");
          else if (k.tanggal_masuk_bank && !k.tanggal_sp3k_terbit && k.bi_checking_status !== "lolos")
            masalah.push("BI-Checking belum tercatat");
          if (lamaBank != null && lamaBank > 30) masalah.push(`${lamaBank} hari di bank`);
          if (k.tanggal_sp3k_expired && !k.tanggal_akad) {
            const sisa = selisihHari(k.tanggal_sp3k_expired);
            if (sisa != null && sisa <= 14) masalah.push(sisa < 0 ? "SP3K kedaluwarsa" : `SP3K ${sisa} hari lagi`);
          }
          if (rekap.kurang.length > 0) masalah.push(`kurang ${rekap.kurang.length} berkas`);
          return { ...k, rekap, lamaTahap, masalah, tahap: k.progres_berkas || TANPA_TAHAP };
        }),
    [baris, bank, dokPerKonsumen, syaratUntuk]
  );

  const kolom = useMemo(() => {
    const urut = [...tahapan];
    // Konsumen yang tahapnya belum diatur tidak boleh menghilang dari papan —
    // justru merekalah yang paling mungkin terlupakan.
    const adaTanpa = kartu.some((k) => k.tahap === TANPA_TAHAP);
    const kunci = adaTanpa ? [TANPA_TAHAP, ...urut] : urut;
    return kunci.map((t) => ({ tahap: t, isi: kartu.filter((k) => k.tahap === t) }));
  }, [tahapan, kartu]);

  // Tahap yang tidak dikenal (nilai lama, atau dihapus dari Pengaturan Bisnis)
  // tetap ditampilkan supaya tidak ada berkas yang lenyap dari papan.
  const kolomAsing = useMemo(() => {
    const dikenal = new Set([TANPA_TAHAP, ...tahapan]);
    const asing = [...new Set(kartu.map((k) => k.tahap).filter((t) => !dikenal.has(t)))];
    return asing.map((t) => ({ tahap: t, isi: kartu.filter((k) => k.tahap === t), asing: true }));
  }, [tahapan, kartu]);

  const semuaKolom = [...kolom, ...kolomAsing];

  async function pindahTahap(k, tahapBaru) {
    const nilai = tahapBaru === TANPA_TAHAP ? null : tahapBaru;
    const { error } = await supabase
      .from("customer_kpr")
      .update({ progres_berkas: nilai, updated_at: new Date().toISOString() })
      .eq("customer_id", k.customer_id);
    if (error) {
      toast.gagal(`Gagal memindahkan: ${error.message}`);
      return;
    }
    toast.sukses(`${k.customers.name} → ${tahapBaru}`);
    muat();
    segarkanNotifikasi();
  }

  function togglePilih(id) {
    setTerpilih((v) => {
      const n = new Set(v);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const dipilih = kartu.filter((k) => terpilih.has(k.customer_id));

  return (
    <div>
      <PageTitle
        title="Papan Berkas"
        subtitle={`${kartu.length} berkas dalam proses${bank ? ` · ${bank}` : ""}`}
        action={
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { k: "papan", label: "Papan", ikon: LayoutGrid },
              { k: "jadwal", label: "Jadwal", ikon: CalendarDays },
            ].map((t) => {
              const aktif = tampilan === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => setTampilan(t.k)}
                  aria-pressed={aktif}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${aktif ? PRIMARY : BORDER}`,
                    background: aktif ? PRIMARY : SURFACE,
                    color: aktif ? "#fff" : TEXT_MID,
                    fontSize: 12.5,
                    fontWeight: aktif ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  <t.ikon size={14} aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        }
      />

      <ReadOnlyBanner />

      <Card style={{ padding: 13, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Landmark size={13} aria-hidden="true" /> Bank
          </span>
          <button onClick={() => setBank("")} style={pil(bank === "")}>
            Semua
          </button>
          {daftarBank.map((b) => {
            const n = baris.filter((k) => k.nama_bank === b).length;
            if (n === 0) return null;
            return (
              <button key={b} onClick={() => setBank(b)} style={pil(bank === b)}>
                {b} <span style={{ opacity: 0.7 }}>· {n}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {dipilih.length > 0 && (
        <Card style={{ padding: 13, marginBottom: 16, borderColor: "#F6CDB8", background: ACCENT_SOFT }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: ACCENT_DARK }}>{dipilih.length} berkas dipilih</span>
            <PrimaryButton onClick={() => setKejar(true)}>
              <MessageCircle size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              Kejar lewat WhatsApp
            </PrimaryButton>
            <button onClick={() => setTerpilih(new Set())} style={{ ...pil(false), borderColor: "#F6CDB8" }}>
              Batalkan pilihan
            </button>
          </div>
        </Card>
      )}

      {memuat && <Card><div style={{ padding: 20, fontSize: 13, color: TEXT_MID }}>Memuat berkas…</div></Card>}

      {!memuat && kartu.length === 0 && (
        <Card>
          <EmptyState
            icon={FolderOpen}
            label="Belum ada berkas dalam proses"
            hint="Berkas muncul di sini begitu sebuah konsumen punya progres KPR — yang terbuka sendiri saat prospek dikonversi ke Booking."
          />
        </Card>
      )}

      {!memuat && kartu.length > 0 && tampilan === "papan" && (
        <div className="papan-berkas">
          {semuaKolom.map((kol) => (
            <div key={kol.tahap} className="papan-kolom">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: kol.asing ? NEGATIVE : TEXT_DARK }}>
                  {kol.tahap}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, background: PRIMARY_SOFT, borderRadius: 999, padding: "1px 8px" }}>
                  {kol.isi.length}
                </span>
              </div>

              {kol.isi.length === 0 && (
                <div style={{ fontSize: 11.5, color: TEXT_MID, padding: "14px 0", textAlign: "center" }}>kosong</div>
              )}

              {kol.isi.map((k) => (
                <KartuBerkas
                  key={k.customer_id}
                  k={k}
                  tahapan={[TANPA_TAHAP, ...tahapan]}
                  bolehUbah={bolehUbah}
                  dipilih={terpilih.has(k.customer_id)}
                  onPilih={() => togglePilih(k.customer_id)}
                  onPindah={(t) => pindahTahap(k, t)}
                  onBuka={() => navigate(`/konsumen/${k.customer_id}`)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {!memuat && kartu.length > 0 && tampilan === "jadwal" && <TabJadwal kartu={kartu} onBuka={(id) => navigate(`/konsumen/${id}`)} />}

      <ModalKejar
        open={kejar}
        dipilih={dipilih}
        onClose={() => setKejar(false)}
        onSelesai={() => {
          setTerpilih(new Set());
          muat();
        }}
        profile={profile}
        toast={toast}
      />
    </div>
  );
}

/* ============================================================
   Kartu berkas
   ============================================================ */

function KartuBerkas({ k, tahapan, bolehUbah, dipilih, onPilih, onPindah, onBuka }) {
  const c = k.customers;
  const berat = k.bi_checking_status === "tidak_lolos" || k.masalah.some((m) => m.includes("kedaluwarsa"));

  return (
    <div
      style={{
        border: `1px solid ${dipilih ? PRIMARY : berat ? "#F2D3D1" : BORDER}`,
        borderRadius: 13,
        background: dipilih ? PRIMARY_SOFT : SURFACE,
        padding: "11px 12px",
        marginBottom: 9,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <input
          type="checkbox"
          checked={dipilih}
          onChange={onPilih}
          aria-label={`Pilih berkas ${c.name}`}
          style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }}
        />
        <button
          onClick={onBuka}
          style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit" }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 2 }}>
            {[c.units?.unit_code, k.nama_bank].filter(Boolean).join(" · ") || "unit & bank belum diisi"}
          </div>
        </button>
      </div>

      {/* Kelengkapan berkas sebagai batang: yang dicari adalah yang belum ada. */}
      {k.rekap.totalWajib > 0 && (
        <div style={{ marginTop: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: TEXT_MID, marginBottom: 3 }}>
            <span>Berkas wajib</span>
            <span style={{ fontWeight: 700, color: k.rekap.kurang.length ? ACCENT_DARK : POSITIVE }}>
              {k.rekap.lengkapWajib}/{k.rekap.totalWajib}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: "#EEF1F6", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(k.rekap.lengkapWajib / k.rekap.totalWajib) * 100}%`,
                background: k.rekap.kurang.length ? ACCENT : POSITIVE,
              }}
            />
          </div>
        </div>
      )}

      {k.masalah.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 9 }}>
          {k.masalah.map((m) => (
            <span
              key={m}
              style={{
                fontSize: 10,
                fontWeight: 600,
                background: berat ? "#FBE9E8" : ACCENT_SOFT,
                color: berat ? NEGATIVE : ACCENT_DARK,
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10 }}>
        {bolehUbah ? (
          <select
            value={k.tahap}
            onChange={(e) => onPindah(e.target.value)}
            aria-label={`Pindahkan tahap ${c.name}`}
            style={{ flex: 1, minWidth: 0, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "5px 7px", fontSize: 11.5, background: SURFACE }}
          >
            {[...new Set([k.tahap, ...tahapan])].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ flex: 1, fontSize: 11.5, color: TEXT_MID }}>{k.tahap}</span>
        )}
        {k.lamaTahap != null && k.lamaTahap > 0 && (
          <span style={{ fontSize: 10.5, color: TEXT_MID, whiteSpace: "nowrap" }} title="Sejak terakhir diperbarui">
            {k.lamaTahap}h
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Jadwal akad & serah terima
   ============================================================ */

function TabJadwal({ kartu, onBuka }) {
  const agenda = useMemo(() => {
    const out = [];
    for (const k of kartu) {
      if (k.tanggal_akad) out.push({ jenis: "Akad", tgl: k.tanggal_akad, k });
      if (k.tanggal_serah_terima_kunci) out.push({ jenis: "Serah Terima Kunci", tgl: k.tanggal_serah_terima_kunci, k });
    }
    return out.sort((a, b) => new Date(a.tgl) - new Date(b.tgl));
  }, [kartu]);

  const kelompok = useMemo(() => {
    const g = { lewat: [], pekanIni: [], mendatang: [] };
    for (const a of agenda) {
      const s = selisihHari(a.tgl);
      if (s < 0) g.lewat.push(a);
      else if (s <= 7) g.pekanIni.push(a);
      else g.mendatang.push(a);
    }
    return g;
  }, [agenda]);

  const kolom = [
    { key: "tgl", label: "Tanggal", render: (r) => tanggal(r.tgl) },
    { key: "sisa", label: "Sisa", sortValue: (r) => selisihHari(r.tgl), render: (r) => tanggalRelatif(r.tgl) },
    { key: "jenis", label: "Agenda" },
    { key: "nama", label: "Konsumen", sortValue: (r) => r.k.customers.name, render: (r) => r.k.customers.name },
    { key: "unit", label: "Unit", sortValue: (r) => r.k.customers.units?.unit_code, render: (r) => r.k.customers.units?.unit_code || "-" },
    { key: "bank", label: "Bank", render: (r) => r.k.nama_bank || "-" },
  ];

  if (agenda.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          label="Belum ada agenda akad atau serah terima"
          hint="Tanggal akad dan serah terima kunci yang diisi pada Progres KPR akan berkumpul di sini."
        />
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {kelompok.pekanIni.length > 0 && (
        <Card>
          <Judul teks="Tujuh Hari ke Depan" jumlah={kelompok.pekanIni.length} warna={ACCENT} catatan="Perlu dikoordinasikan dengan notaris dan bank." />
          <DataTable sortable columns={kolom} rows={kelompok.pekanIni} onRowClick={(r) => onBuka(r.k.customer_id)} defaultSort={{ key: "tgl", arah: "asc" }} />
        </Card>
      )}
      {kelompok.lewat.length > 0 && (
        <Card>
          <Judul teks="Tanggal Sudah Lewat" jumlah={kelompok.lewat.length} warna={NEGATIVE} catatan="Sudah terjadi tetapi tahapnya belum dimajukan, atau tanggalnya perlu diperbarui." />
          <DataTable sortable columns={kolom} rows={kelompok.lewat} onRowClick={(r) => onBuka(r.k.customer_id)} defaultSort={{ key: "tgl", arah: "desc" }} />
        </Card>
      )}
      {kelompok.mendatang.length > 0 && (
        <Card>
          <Judul teks="Mendatang" jumlah={kelompok.mendatang.length} warna={PRIMARY} />
          <DataTable sortable searchable pageSize={25} columns={kolom} rows={kelompok.mendatang} onRowClick={(r) => onBuka(r.k.customer_id)} defaultSort={{ key: "tgl", arah: "asc" }} />
        </Card>
      )}
    </div>
  );
}

function Judul({ teks, jumlah, warna, catatan }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: warna }} aria-hidden="true" />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{teks}</span>
        <span style={{ fontSize: 12, color: TEXT_MID }}>{jumlah}</span>
      </div>
      {catatan && <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 5, lineHeight: 1.5 }}>{catatan}</div>}
    </div>
  );
}

/* ============================================================
   Kejar berkas massal
   ============================================================ */

const PESAN_BAWAAN =
  "Halo {nama}, saya {agen} dari Zafira Property. Untuk melanjutkan proses KPR unit {unit}, kami masih menunggu: {kurang}. Mohon dikirimkan bila sudah siap. Terima kasih.";

/**
 * Mengejar beberapa berkas sekaligus.
 *
 * Pekerjaan ini sebelumnya berarti membuka delapan kartu konsumen, menekan
 * tombol WhatsApp delapan kali, lalu mengetik pesan yang sama delapan kali.
 *
 * Percakapan tetap dibuka satu per satu — WhatsApp memang tidak bisa dikirim
 * borongan, dan pesan massal yang identik justru menurunkan tingkat balasan.
 * Yang dihemat di sini adalah menyusun pesannya: daftar dokumen yang kurang
 * diisikan otomatis per konsumen, dan setiap yang sudah dihubungi tercatat
 * sendiri di riwayatnya.
 */
function ModalKejar({ open, dipilih, onClose, onSelesai, profile, toast }) {
  const [pesan, setPesan] = useState(PESAN_BAWAAN);
  const [sudah, setSudah] = useState(() => new Set());
  const [simpan, setSimpan] = useState(false);

  useEffect(() => {
    if (open) setSudah(new Set());
  }, [open]);

  function teksUntuk(k) {
    const kurang = k.rekap.kurang.map((b) => b.doc_type).join(", ") || "kelengkapan berkas";
    return isiPenanda(pesan, {
      nama: k.customers.name,
      agen: profile?.full_name,
      unit: k.customers.units?.unit_code,
    }).replace(/\{kurang\}/g, kurang);
  }

  async function kirim(k) {
    const wa = nomorWa(k.customers.phone);
    if (!wa) {
      toast.gagal(`${k.customers.name} tidak punya nomor yang bisa dihubungi.`);
      return;
    }
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(teksUntuk(k))}`, "_blank", "noopener");

    setSimpan(true);
    const { error } = await supabase.from("lead_activities").insert({
      customer_id: k.customer_id,
      actor_id: profile?.id || null,
      activity: "WhatsApp — kejar berkas",
      hasil: "Terhubung",
      note: k.rekap.kurang.length ? `Diminta melengkapi: ${k.rekap.kurang.map((b) => b.doc_type).join(", ")}` : null,
    });
    setSimpan(false);
    if (error) {
      toast.gagal(`Tercatat gagal: ${error.message}`);
      return;
    }
    setSudah((v) => new Set(v).add(k.customer_id));
  }

  if (!open) return null;

  return (
    <Modal open labelledBy="kejar-judul" onClose={() => !simpan && onClose()} width={560}>
      <>
        <div id="kejar-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Kejar berkas — {dipilih.length} konsumen
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.55 }}>
          Percakapan dibuka satu per satu. Daftar dokumen yang kurang diisikan sendiri per konsumen, dan setiap yang
          dihubungi langsung tercatat di riwayatnya.
        </div>

        <div style={{ marginBottom: 8 }}>
          <label htmlFor="kejar-pesan" style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 }}>
            Pesan
          </label>
          <textarea
            id="kejar-pesan"
            value={pesan}
            onChange={(e) => setPesan(e.target.value)}
            style={{ ...inputStyle, minHeight: 78, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
          <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 5 }}>
            Penanda: {"{nama}"} · {"{agen}"} · {"{unit}"} · {"{kurang}"} (daftar dokumen yang belum ada)
          </div>
        </div>

        <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 16 }}>
          {dipilih.map((k, i) => {
            const selesai = sudah.has(k.customer_id);
            const adaNomor = Boolean(nomorWa(k.customers.phone));
            return (
              <div
                key={k.customer_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: i === dipilih.length - 1 ? "none" : `1px solid ${BORDER}`,
                  background: selesai ? "#F3F9F5" : "transparent",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_DARK }}>{k.customers.name}</div>
                  <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 2 }}>
                    {k.rekap.kurang.length ? `Kurang: ${k.rekap.kurang.map((b) => b.doc_type).join(", ")}` : "Berkas wajib sudah lengkap"}
                  </div>
                </div>
                {selesai ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: POSITIVE, whiteSpace: "nowrap" }}>✓ terkirim</span>
                ) : (
                  <button
                    onClick={() => kirim(k)}
                    disabled={!adaNomor || simpan}
                    title={adaNomor ? "Buka WhatsApp dan catat" : "Nomor telepon tidak ada"}
                    style={{
                      border: `1px solid ${adaNomor ? POSITIVE : BORDER}`,
                      background: SURFACE,
                      color: adaNomor ? POSITIVE : TEXT_MID,
                      borderRadius: 9,
                      padding: "5px 11px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: adaNomor ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <MessageCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Kirim
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 9, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID }}>
            {sudah.size} dari {dipilih.length} sudah dihubungi
          </span>
          <PrimaryButton
            onClick={() => {
              onSelesai();
              onClose();
            }}
          >
            Selesai
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

function pil(aktif) {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${aktif ? PRIMARY : BORDER}`,
    background: aktif ? PRIMARY : SURFACE,
    color: aktif ? "#fff" : TEXT_MID,
    fontSize: 12,
    fontWeight: aktif ? 600 : 500,
    cursor: "pointer",
  };
}
