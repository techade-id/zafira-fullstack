import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Upload, Plus, Check, Ban } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { useSyaratBerkas, cocokkanBerkas } from "../lib/useSyaratBerkas";
import { unggahBerkasBank, unggahLampiran, unggahBuktiTransfer, unggahKuitansi, dengarBerkas, jenisBerkas } from "../lib/berkas";
import { rupiah, tanggal, labelJenisBayar, labelStatus } from "../lib/format";
import { usePratinjau } from "./PratinjauBerkas";
import { useVerifikasiBerkas } from "./VerifikasiBerkas";
import { LAMPIRAN_TAHAP } from "./KprStepper";
import { Card, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT, ACCENT_DARK, POSITIVE, NEGATIVE } from "./ui";

/**
 * Seluruh berkas seorang konsumen, di satu tempat.
 *
 * Berkasnya tinggal di empat tabel berbeda — syarat bank, lampiran per tahap,
 * bukti dan kuitansi pembayaran, foto komplain — dan sebelumnya hanya bisa
 * dilihat dengan membuka tahap KPR satu per satu. Kartu ini mengumpulkannya
 * untuk dibaca sekaligus; klik sebuah berkas membuka pratinjau, dan ← →
 * berjalan melewati semuanya.
 *
 * Unggah juga bisa dari sini, lewat operasi yang sama dengan tahap KPR
 * (lib/berkas.js): aturan bucket, status awal, dan wewenang verifikasi tidak
 * ditulis dua kali. Kuitansi tetap hanya untuk Finance, karena mengunggahnya
 * berarti memverifikasi pembayaran.
 */

/** KTP dan KK lebih dulu: itulah yang paling sering dicari dari kartu ini. */
const IDENTITAS = /\b(ktp|kk)\b|kartu keluarga|e-?ktp/i;

const PAGAR = "image/*,application/pdf";

const tombolPutus = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  borderRadius: 9,
  padding: "5px 9px",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** Status sebuah berkas, sebagai kata dan warna — bukan kata dasar dari database. */
const STATUS = {
  terverifikasi: { label: "Terverifikasi", warna: POSITIVE },
  menunggu: { label: "Menunggu verifikasi", warna: ACCENT_DARK },
  menunggu_verifikasi: { label: "Menunggu verifikasi", warna: ACCENT_DARK },
  ditolak: { label: "Ditolak — unggah ulang", warna: NEGATIVE },
  belum: { label: "Belum diunggah", warna: TEXT_MID },
};

export default function DokumenKonsumen({ konsumen, bank, editable }) {
  const { profile } = useAuth();
  const toast = useToast();
  const bolehVerifikasi = canWrite(profile, "payment_verify");
  const { syarat } = useSyaratBerkas(bank);
  const [bukaPratinjau, pratinjau] = usePratinjau();
  const v = useVerifikasiBerkas();

  const [dokumen, setDokumen] = useState([]);
  const [lampiran, setLampiran] = useState([]);
  const [bayar, setBayar] = useState([]);
  const [komplain, setKomplain] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState(null);

  const id = konsumen.id;

  const muat = useCallback(async () => {
    // Lampiran prospek dipindahkan ke konsumen saat konversi (migration_017),
    // tetapi lead_id tetap dicocokkan untuk baris yang dilampirkan sesudahnya.
    const pemilikLampiran = [`customer_id.eq.${id}`, konsumen.lead_id ? `lead_id.eq.${konsumen.lead_id}` : null].filter(Boolean).join(",");
    const pemilikKomplain = [`customer_id.eq.${id}`, konsumen.unit_id ? `unit_id.eq.${konsumen.unit_id}` : null].filter(Boolean).join(",");

    const [d, l, p, k] = await Promise.all([
      supabase.from("customer_documents").select("*").eq("customer_id", id).order("uploaded_at", { ascending: false }),
      supabase.from("berkas_lampiran").select("*").or(pemilikLampiran).order("uploaded_at", { ascending: false }),
      supabase.from("payments").select("*").eq("customer_id", id).order("payment_date", { ascending: true }),
      supabase.from("complaints").select("id, category, description, status, photo_url, created_at").or(pemilikKomplain).not("photo_url", "is", null).order("created_at", { ascending: false }),
    ]);
    setMemuat(false);
    setDokumen(d.data || []);
    // Sebelum migration_017 tabel lampiran belum ada — bagian itu kosong saja.
    setLampiran(l.error ? [] : l.data || []);
    setBayar(p.data || []);
    setKomplain(k.error ? [] : k.data || []);
  }, [id, konsumen.lead_id, konsumen.unit_id]);

  useEffect(() => {
    muat();
    return dengarBerkas(id, muat);
  }, [id, muat]);

  const rekap = useMemo(() => cocokkanBerkas(syarat, dokumen), [syarat, dokumen]);

  // ---- Susunan kartu, dan daftar pratinjau yang mengikuti urutan yang sama.
  const susunan = useMemo(() => {
    const bankBaris = [...rekap.baris].sort((a, b) => Number(IDENTITAS.test(b.doc_type)) - Number(IDENTITAS.test(a.doc_type)));

    // Satu daftar periksa: setiap syarat muncul sekali, di urutannya, dengan
    // keadaannya sendiri. Sebelumnya yang sudah ada dan yang belum dipisah
    // menjadi dua tumpukan, sehingga urutan syarat — yang disebut-sebut saat
    // menelepon bank — hilang begitu satu berkas diunggah.
    const bankDaftar = [
      ...bankBaris
        .filter((b) => b.doc || b.wajib)
        .map((b) => ({
          kunci: b.doc ? `d-${b.doc.id}` : `kosong-${b.doc_type}`,
          docType: b.doc_type,
          judul: b.doc_type,
          keadaan: b.keadaan,
          catatan: b.catatan,
          tanggal: b.doc?.uploaded_at,
          path: b.doc?.file_url || null,
          wajib: b.wajib,
          doc: b.doc,
        })),
      ...rekap.ekstra.map((d) => ({
        kunci: `d-${d.id}`,
        docType: d.doc_type,
        judul: d.doc_type,
        keadaan: d.status,
        catatan: "di luar daftar syarat",
        tanggal: d.uploaded_at,
        path: d.file_url || null,
        doc: d,
      })),
    ];
    const bankAda = bankDaftar
      .filter((b) => b.path)
      .map((b) => ({
        kunci: b.kunci,
        bucket: "customer-documents",
        path: b.path,
        judul: b.judul,
        keterangan: [STATUS[b.keadaan]?.label, tanggal(b.tanggal)].filter(Boolean).join(" · "),
        // Yang berwenang memutuskan langsung dari pratinjau, sambil melihat berkasnya.
        verifikasi: v.boleh && b.doc ? { keadaan: b.keadaan, setuju: () => v.verifikasi(b.doc), tolak: () => v.tolak(b.doc) } : undefined,
      }));
    const bankOpsionalKosong = bankBaris.filter((b) => b.keadaan === "belum" && !b.wajib);

    const wajib = bankBaris.filter((b) => b.wajib);
    const kemajuan = {
      terverifikasi: wajib.filter((b) => b.keadaan === "terverifikasi").length,
      menunggu: wajib.filter((b) => b.keadaan === "menunggu").length,
      ditolak: wajib.filter((b) => b.keadaan === "ditolak").length,
      belum: wajib.filter((b) => b.keadaan === "belum").length,
    };

    const lampiranAda = LAMPIRAN_TAHAP.flatMap((s) =>
      lampiran
        .filter((r) => r.slot === s.slot)
        .map((r) => ({
          kunci: `l-${r.id}`,
          bucket: "berkas-lampiran",
          path: r.file_url,
          nama: r.file_name,
          judul: s.label,
          keterangan: `${s.tahap} · ${r.file_name || "lampiran"} · ${tanggal(r.uploaded_at)}`,
        }))
    );
    const slotKosong = LAMPIRAN_TAHAP.filter((s) => !lampiran.some((r) => r.slot === s.slot));

    const bayarAda = bayar.flatMap((r) => {
      const ket = `${rupiah(r.amount)} · ${tanggal(r.payment_date)}`;
      return [
        r.bukti_transfer_url && { kunci: `b-${r.id}`, bucket: "payment-proofs", path: r.bukti_transfer_url, judul: `Bukti transfer ${labelJenisBayar(r.payment_type)}`, keterangan: ket, keadaan: r.status === "terverifikasi" ? "terverifikasi" : "menunggu_verifikasi" },
        r.proof_url && { kunci: `k-${r.id}`, bucket: "payment-receipts", path: r.proof_url, judul: `Kuitansi ${labelJenisBayar(r.payment_type)}`, keterangan: ket, keadaan: "terverifikasi" },
      ].filter(Boolean);
    });
    const belumTerverifikasi = bayar.filter((r) => r.status !== "terverifikasi");

    const komplainAda = komplain.map((c) => ({
      kunci: `c-${c.id}`,
      bucket: "complaint-photos",
      path: c.photo_url,
      judul: `Komplain${c.category ? ` · ${c.category}` : ""}`,
      keterangan: `${labelStatus(c.status)} · ${tanggal(c.created_at)}`,
    }));

    return { bankDaftar, bankAda, bankOpsionalKosong, kemajuan, lampiranAda, slotKosong, bayarAda, belumTerverifikasi, komplainAda };
  }, [rekap, lampiran, bayar, komplain, v.boleh]); // eslint-disable-line react-hooks/exhaustive-deps

  const semua = useMemo(
    () => [...susunan.bankAda, ...susunan.lampiranAda, ...susunan.bayarAda, ...susunan.komplainAda],
    [susunan]
  );

  function buka(kunci) {
    bukaPratinjau(semua, Math.max(0, semua.findIndex((x) => x.kunci === kunci)));
  }

  /** Satu pembungkus untuk keempat jenis unggah: status sibuk, toast, dan galat. */
  async function jalankan(kunci, kerja, pesanSukses) {
    setSibuk(kunci);
    const { error } = await kerja();
    setSibuk(null);
    if (error) {
      toast.gagal(error);
      return;
    }
    toast.sukses(pesanSukses);
  }

  const unggahBank = (docType, file) =>
    jalankan(`bank-${docType}`, () => unggahBerkasBank(id, docType, file), `${docType} terunggah dan menunggu verifikasi.`);
  const unggahSlot = (s, file) =>
    jalankan(`slot-${s.slot}`, () => unggahLampiran({ customerId: id, slot: s.slot, file }), `${s.label} terunggah.`);
  const unggahBukti = (r, file) =>
    jalankan(`bukti-${r.id}`, () => unggahBuktiTransfer(r, file), "Bukti transfer terkirim — menunggu verifikasi pembayaran dari Finance.").then(segarkanNotifikasi);
  const verifikasi = (r, file) =>
    jalankan(`kuitansi-${r.id}`, () => unggahKuitansi(r, file), "Pembayaran terverifikasi dan kuitansi tersimpan.").then(segarkanNotifikasi);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Dokumen Konsumen</div>
        <div style={{ fontSize: 12, color: TEXT_MID }}>{memuat ? "memuat…" : `${semua.length} berkas`}</div>
      </div>
      <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 16 }}>Klik sebuah berkas untuk melihatnya.</div>

      {/* ---------------- Identitas & berkas bank ---------------- */}
      <Kelompok judul="Identitas & Berkas Bank" meta={bank ? `Syarat ${bank}` : null}>
        {rekap.totalWajib > 0 && <Kemajuan {...susunan.kemajuan} total={rekap.totalWajib} />}
        <Grid>
          {susunan.bankDaftar.map((b) => (
            <Ubin
              key={b.kunci}
              kosong={!b.path}
              judul={b.judul}
              status={STATUS[b.keadaan]}
              keterangan={[
                // Alasan penolakan lebih dulu: itulah yang harus diperbaiki.
                b.keadaan === "ditolak" && b.doc?.alasan_ditolak ? `“${b.doc.alasan_ditolak}”` : null,
                b.catatan,
                b.tanggal ? tanggal(b.tanggal) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              jenis={b.path ? jenisBerkas(b.path) : null}
              onBuka={b.path ? () => buka(b.kunci) : null}
              aksi={
                v.boleh && b.doc && b.keadaan === "menunggu" ? (
                  <span style={{ display: "inline-flex", gap: 5, flexShrink: 0 }}>
                    <button onClick={() => v.tolak(b.doc)} disabled={v.sibuk === b.doc.id} style={{ ...tombolPutus, color: NEGATIVE, borderColor: "#F2D3D1" }} aria-label={`Tolak ${b.judul}`} title="Tolak">
                      <Ban size={12} aria-hidden="true" />
                    </button>
                    <button onClick={() => v.verifikasi(b.doc)} disabled={v.sibuk === b.doc.id} style={{ ...tombolPutus, color: "#fff", background: POSITIVE, borderColor: POSITIVE }}>
                      <Check size={12} aria-hidden="true" />
                      {v.sibuk === b.doc.id ? "…" : "Verifikasi"}
                    </button>
                  </span>
                ) : (
                  editable && (
                    <TombolUnggah
                      label={b.path ? (b.keadaan === "ditolak" ? "Unggah ulang" : "Ganti") : "Unggah"}
                      utama={!b.path || b.keadaan === "ditolak"}
                      sibuk={sibuk === `bank-${b.docType}`}
                      onPilih={(f) => unggahBank(b.docType, f)}
                    />
                  )
                )
              }
            />
          ))}
        </Grid>
        {susunan.bankOpsionalKosong.length > 0 && (
          <Kekurangan
            judul="Opsional, belum ada"
            butir={susunan.bankOpsionalKosong.map((b) => ({
              kunci: b.doc_type,
              label: b.doc_type,
              sibuk: sibuk === `bank-${b.doc_type}`,
              onPilih: editable ? (f) => unggahBank(b.doc_type, f) : null,
            }))}
          />
        )}
        {!memuat && rekap.baris.length === 0 && rekap.ekstra.length === 0 && (
          <Kosong>Belum ada syarat berkas tersimpan untuk bank ini.</Kosong>
        )}
      </Kelompok>

      {/* ---------------- Lampiran tahap KPR ---------------- */}
      <Kelompok judul="Lampiran Tahap KPR" meta={susunan.lampiranAda.length ? `${susunan.lampiranAda.length} berkas` : null}>
        {susunan.lampiranAda.length > 0 && (
          <Grid>
            {susunan.lampiranAda.map((r) => (
              <Ubin key={r.kunci} judul={r.judul} keterangan={r.keterangan} jenis={jenisBerkas(r.nama || r.path)} onBuka={() => buka(r.kunci)} />
            ))}
          </Grid>
        )}
        {susunan.slotKosong.length > 0 && (
          <Kekurangan
            judul={susunan.lampiranAda.length ? "Belum ada" : "Belum ada lampiran"}
            butir={susunan.slotKosong.map((s) => ({
              kunci: s.slot,
              label: s.label,
              sibuk: sibuk === `slot-${s.slot}`,
              onPilih: editable ? (f) => unggahSlot(s, f) : null,
            }))}
          />
        )}
      </Kelompok>

      {/* ---------------- Pembayaran ---------------- */}
      <Kelompok judul="Bukti Transfer & Kuitansi" meta={bayar.length ? `${bayar.length} pembayaran` : null}>
        {susunan.bayarAda.length > 0 && (
          <Grid>
            {susunan.bayarAda.map((r) => (
              <Ubin
                key={r.kunci}
                judul={r.judul}
                status={STATUS[r.keadaan]}
                keterangan={r.keterangan}
                jenis={jenisBerkas(r.path)}
                onBuka={() => buka(r.kunci)}
              />
            ))}
          </Grid>
        )}
        {susunan.belumTerverifikasi.length > 0 && (editable || bolehVerifikasi) && (
          <Kekurangan
            judul="Menunggu berkas"
            butir={susunan.belumTerverifikasi.flatMap((r) => {
              const nama = `${labelJenisBayar(r.payment_type)} ${rupiah(r.amount)}`;
              return [
                editable && {
                  kunci: `bukti-${r.id}`,
                  label: `${r.bukti_transfer_url ? "Ganti bukti" : "Bukti transfer"} · ${nama}`,
                  sibuk: sibuk === `bukti-${r.id}`,
                  onPilih: (f) => unggahBukti(r, f),
                },
                // Hanya Finance: mengunggah kuitansi = memverifikasi pembayaran.
                bolehVerifikasi && {
                  kunci: `kuitansi-${r.id}`,
                  label: `Verifikasi + kuitansi · ${nama}`,
                  ikon: Check,
                  sibuk: sibuk === `kuitansi-${r.id}`,
                  onPilih: (f) => verifikasi(r, f),
                },
              ].filter(Boolean);
            })}
          />
        )}
        {!memuat && bayar.length === 0 && <Kosong>Belum ada pembayaran tercatat.</Kosong>}
      </Kelompok>

      {/* ---------------- Komplain ---------------- */}
      {susunan.komplainAda.length > 0 && (
        <Kelompok judul="Foto Komplain" meta="diunggah dari menu Komplain" akhir>
          <Grid>
            {susunan.komplainAda.map((c) => (
              <Ubin key={c.kunci} judul={c.judul} keterangan={c.keterangan} jenis={jenisBerkas(c.path)} onBuka={() => buka(c.kunci)} />
            ))}
          </Grid>
        </Kelompok>
      )}

      {pratinjau}
      {v.elemen}
    </Card>
  );
}

function Kelompok({ judul, meta, akhir, children }) {
  return (
    <div style={{ paddingBottom: akhir ? 0 : 16, marginBottom: akhir ? 0 : 16, borderBottom: akhir ? "none" : `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, letterSpacing: "0.04em", textTransform: "uppercase" }}>{judul}</span>
        {meta && <span style={{ fontSize: 11.5, color: TEXT_MID }}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }) {
  // 300px, bukan 230px: nama syarat bank sering tiga kata ("Surat Keterangan
  // Kerja"), dan di ubin yang lebih sempit nama itu terpotong menjadi
  // "Surat Kete…" — persis bagian yang harus terbaca.
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>{children}</div>;
}

/**
 * Tiga ruas: terverifikasi, menunggu/ditolak, belum. Menjawab "tinggal
 * berapa lagi" tanpa harus menghitung ubin satu per satu.
 */
function Kemajuan({ terverifikasi, menunggu, ditolak, belum, total }) {
  const ruas = [
    { n: terverifikasi, warna: POSITIVE, label: "terverifikasi" },
    { n: menunggu, warna: "#E9A23B", label: "menunggu verifikasi" },
    { n: ditolak, warna: NEGATIVE, label: "ditolak" },
    { n: belum, warna: "#DCE3EE", label: "belum diunggah" },
  ];
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        role="img"
        aria-label={`${terverifikasi} dari ${total} berkas wajib terverifikasi`}
        style={{ display: "flex", gap: 2, height: 6, borderRadius: 999, overflow: "hidden", background: "#DCE3EE" }}
      >
        {ruas.filter((r) => r.n > 0).map((r) => (
          <div key={r.label} style={{ flex: r.n, background: r.warna }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 7, fontSize: 11.5, color: TEXT_MID }}>
        <span style={{ color: TEXT_DARK, fontWeight: 600 }}>
          {terverifikasi}/{total} wajib terverifikasi
        </span>
        {ruas
          .slice(1)
          .filter((r) => r.n > 0)
          .map((r) => (
            <span key={r.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: r.warna }} />
              {r.n} {r.label}
            </span>
          ))}
      </div>
    </div>
  );
}

/**
 * Satu berkas. Seluruh ubin bisa diklik untuk membuka pratinjau; aksinya duduk
 * di kanan. Nama dan keterangannya boleh turun ke baris kedua — tidak pernah
 * dipotong dengan elipsis.
 */
function Ubin({ judul, status, keterangan, jenis, onBuka, aksi, kosong }) {
  const Ikon = jenis === "gambar" ? ImageIcon : FileText;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: `1px ${kosong ? "dashed" : "solid"} ${kosong ? "#C7D3EA" : BORDER}`,
        borderRadius: 12,
        padding: "10px 11px",
        background: kosong ? "#FBFCFE" : SURFACE,
        minWidth: 0,
      }}
    >
      <button
        onClick={onBuka || undefined}
        disabled={!onBuka}
        style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, border: "none", background: "none", padding: 0, textAlign: "left", cursor: onBuka ? "pointer" : "default", font: "inherit", color: "inherit" }}
        aria-label={onBuka ? `Lihat ${judul}` : undefined}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: kosong ? "#fff" : PRIMARY_SOFT,
            color: kosong ? TEXT_MID : PRIMARY,
            border: kosong ? `1px dashed ${BORDER}` : "none",
          }}
        >
          <Ikon size={16} aria-hidden="true" />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: TEXT_DARK, overflowWrap: "anywhere" }}>{judul}</span>
          <span style={{ display: "block", fontSize: 11.5, lineHeight: 1.4, color: TEXT_MID, marginTop: 2, overflowWrap: "anywhere" }}>
            {status && (
              <span style={{ color: status.warna, fontWeight: 600 }}>
                <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: status.warna, marginRight: 5, verticalAlign: 1 }} />
                {status.label}
              </span>
            )}
            {status && keterangan && " · "}
            {keterangan}
          </span>
        </span>
      </button>
      {aksi}
    </div>
  );
}

/**
 * Bergaris, bukan oranye penuh: sembilan tombol oranye berjajar membuat tidak
 * satu pun yang terbaca sebagai tindakan utama. Yang perlu menonjol —
 * berkas yang belum ada — sudah ditandai garis putus-putus ubinnya.
 */
function TombolUnggah({ label, utama, sibuk, onPilih }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        border: `1px solid ${utama ? PRIMARY : BORDER}`,
        background: "#fff",
        color: utama ? PRIMARY : TEXT_MID,
        borderRadius: 9,
        padding: "5px 10px",
        fontSize: 11.5,
        fontWeight: 600,
        cursor: sibuk ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <Upload size={12} aria-hidden="true" />
      {sibuk ? "Mengunggah…" : label}
      <input
        type="file"
        accept={PAGAR}
        disabled={sibuk}
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Memilih berkas yang sama dua kali berturut-turut tidak memicu
          // onChange kalau nilainya tidak dikosongkan dulu.
          e.target.value = "";
          if (f) onPilih(f);
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}

/**
 * Yang belum ada, dalam satu baris keping — bukan delapan ubin kosong.
 * Bila boleh mengunggah, setiap keping adalah tombol unggahnya sendiri.
 */
function Kekurangan({ judul, butir }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
      <span style={{ fontSize: 11.5, color: TEXT_MID, marginRight: 2 }}>{judul}:</span>
      {butir.map((b) => {
        const Ikon = b.ikon || Plus;
        const gaya = {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          border: `1px dashed ${b.ikon ? ACCENT : "#C7D3EA"}`,
          background: "#FBFCFE",
          color: b.ikon ? ACCENT_DARK : b.onPilih ? PRIMARY : TEXT_MID,
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 11.5,
          fontWeight: 600,
          whiteSpace: "nowrap",
        };
        if (!b.onPilih) return <span key={b.kunci} style={gaya}>{b.label}</span>;
        return (
          <label key={b.kunci} style={{ ...gaya, cursor: b.sibuk ? "default" : "pointer" }} title={`Unggah ${b.label}`}>
            <Ikon size={11} aria-hidden="true" />
            {b.sibuk ? "Mengunggah…" : b.label}
            <input
              type="file"
              accept={PAGAR}
              disabled={b.sibuk}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) b.onPilih(f);
              }}
              style={{ display: "none" }}
            />
          </label>
        );
      })}
    </div>
  );
}

function Kosong({ children }) {
  return <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 4 }}>{children}</div>;
}
