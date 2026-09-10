import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { useBusinessSettings } from "../lib/useBusinessSettings";
import { Card, SectionTitle, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_DARK, POSITIVE, inputStyle } from "./ui";

/**
 * Syarat dokumen KPR per bank (PRD §1.4).
 *
 * Sembilan bank mitra, masing-masing dengan daftar berkasnya sendiri — dan
 * selama ini aplikasi hanya mengenal satu daftar lima dokumen yang ditulis
 * mati di frontend. Yang paling tahu bank meminta apa adalah Admin Marketing,
 * jadi dialah yang boleh mengubahnya di sini, bukan pengembang.
 *
 * "Bawaan" berlaku untuk bank mana pun yang belum punya daftarnya sendiri.
 * Tanpa itu, menambah satu bank berarti mengetik ulang seluruh daftar.
 */

const BAWAAN = "*";

export default function SyaratBerkasPanel() {
  const toast = useToast();
  const daftarBank = useBusinessSettings("bank");
  const jenisDokumen = useBusinessSettings("dokumen_kpr");

  const [semua, setSemua] = useState([]);
  const [bank, setBank] = useState(BAWAAN);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [dokumenBaru, setDokumenBaru] = useState("");

  const muat = useCallback(async () => {
    setMemuat(true);
    const { data, error } = await supabase
      .from("bank_doc_requirements")
      .select("id, bank, doc_type, wajib, catatan, sort_order")
      .order("sort_order");
    setSemua(error ? [] : data || []);
    setMemuat(false);
    if (error) toast.gagal("Syarat berkas belum tersedia. Jalankan migration_015_pemberkasan.sql.");
  }, [toast]);

  useEffect(() => {
    muat();
  }, [muat]);

  const punyaSendiri = useMemo(() => new Set(semua.map((s) => s.bank)), [semua]);
  const barisBank = useMemo(
    () => semua.filter((s) => s.bank === bank).sort((a, b) => a.sort_order - b.sort_order),
    [semua, bank]
  );
  const pakaiBawaan = bank !== BAWAAN && barisBank.length === 0;
  const ditampilkan = pakaiBawaan ? semua.filter((s) => s.bank === BAWAAN) : barisBank;

  async function ubahWajib(row) {
    setSibuk(true);
    const { error } = await supabase.from("bank_doc_requirements").update({ wajib: !row.wajib }).eq("id", row.id);
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    muat();
  }

  async function hapus(row) {
    setSibuk(true);
    const { error } = await supabase.from("bank_doc_requirements").delete().eq("id", row.id);
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    muat();
  }

  async function tambah(docType) {
    const nama = (docType || "").trim();
    if (!nama) return;
    if (ditampilkan.some((s) => s.doc_type.toLowerCase() === nama.toLowerCase())) {
      return toast.info(`${nama} sudah ada di daftar ini.`);
    }
    setSibuk(true);
    const urut = Math.max(0, ...ditampilkan.map((s) => s.sort_order)) + 1;
    const { error } = await supabase
      .from("bank_doc_requirements")
      .insert({ bank, doc_type: nama, wajib: true, sort_order: urut });
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    setDokumenBaru("");
    muat();
  }

  /** Menyalin daftar bawaan menjadi milik bank ini, supaya bisa disesuaikan. */
  async function buatDaftarSendiri() {
    const sumber = semua.filter((s) => s.bank === BAWAAN);
    if (sumber.length === 0) return toast.gagal("Daftar bawaan masih kosong.");
    setSibuk(true);
    const { error } = await supabase.from("bank_doc_requirements").insert(
      sumber.map((s) => ({ bank, doc_type: s.doc_type, wajib: s.wajib, catatan: s.catatan, sort_order: s.sort_order }))
    );
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    toast.sukses(`${bank} kini punya daftar syaratnya sendiri.`);
    muat();
  }

  async function kembalikanKeBawaan() {
    setSibuk(true);
    const { error } = await supabase.from("bank_doc_requirements").delete().eq("bank", bank);
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    toast.info(`${bank} kembali memakai syarat bawaan.`);
    muat();
  }

  const belumDipakai = jenisDokumen.filter((j) => !ditampilkan.some((s) => s.doc_type.toLowerCase() === j.toLowerCase()));

  return (
    <Card style={{ marginBottom: 18 }}>
      <SectionTitle
        title="Syarat Berkas per Bank"
        action={<span style={{ fontSize: 12, color: TEXT_MID }}>PRD §1.4</span>}
      />
      <div style={{ fontSize: 11.5, color: TEXT_MID, marginBottom: 14, lineHeight: 1.6 }}>
        Checklist yang muncul pada kartu konsumen dan Papan Berkas mengikuti daftar di sini, sesuai bank yang dipilih pada
        Progres KPR. <b>Bawaan</b> berlaku untuk bank yang belum punya daftarnya sendiri.
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT_MID, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Landmark size={13} aria-hidden="true" />
        </span>
        <button onClick={() => setBank(BAWAAN)} style={pil(bank === BAWAAN)}>
          Bawaan
        </button>
        {daftarBank.map((b) => (
          <button key={b} onClick={() => setBank(b)} style={pil(bank === b)}>
            {b}
            {punyaSendiri.has(b) && <span style={{ marginLeft: 5, opacity: 0.75 }}>·</span>}
          </button>
        ))}
      </div>

      {pakaiBawaan && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: PRIMARY_SOFT, borderRadius: 12, padding: "11px 14px", marginBottom: 14, fontSize: 12.5, color: PRIMARY, lineHeight: 1.5 }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            <b>{bank}</b> memakai syarat bawaan. Buat daftar sendiri bila bank ini meminta berkas yang berbeda.
          </span>
          <PrimaryButton onClick={buatDaftarSendiri} disabled={sibuk} style={{ padding: "8px 14px" }}>
            Buat daftar khusus
          </PrimaryButton>
        </div>
      )}

      {!pakaiBawaan && bank !== BAWAAN && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14, fontSize: 12.5, color: TEXT_MID }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            <b style={{ color: TEXT_DARK }}>{bank}</b> punya daftar syaratnya sendiri.
          </span>
          <button onClick={kembalikanKeBawaan} disabled={sibuk} style={{ ...pil(false), color: ACCENT_DARK, borderColor: "#F6CDB8" }}>
            Kembalikan ke bawaan
          </button>
        </div>
      )}

      {memuat && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Memuat syarat…</div>}

      {!memuat && ditampilkan.length === 0 && (
        <div style={{ fontSize: 12.5, color: TEXT_MID, padding: "8px 0", lineHeight: 1.5 }}>
          Belum ada syarat tersimpan. Jalankan <code style={{ fontSize: 11 }}>migration_015_pemberkasan.sql</code>, atau tambahkan sendiri di bawah.
        </div>
      )}

      {!memuat &&
        ditampilkan.map((row, i) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 0",
              borderBottom: i === ditampilkan.length - 1 ? "none" : `1px solid ${BORDER}`,
              opacity: pakaiBawaan ? 0.6 : 1,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: TEXT_DARK }}>{row.doc_type}</div>
              {row.catatan && <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 2 }}>{row.catatan}</div>}
            </div>

            <button
              onClick={() => ubahWajib(row)}
              disabled={sibuk || pakaiBawaan}
              title={pakaiBawaan ? "Buat daftar khusus dulu untuk mengubahnya" : "Ubah wajib / tidak wajib"}
              style={{
                border: `1px solid ${row.wajib ? POSITIVE : BORDER}`,
                background: row.wajib ? "#E4F2E8" : SURFACE,
                color: row.wajib ? "#166534" : TEXT_MID,
                borderRadius: 999,
                padding: "3px 11px",
                fontSize: 11,
                fontWeight: 600,
                cursor: pakaiBawaan ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {row.wajib ? "wajib" : "opsional"}
            </button>

            {!pakaiBawaan && (
              <button
                onClick={() => hapus(row)}
                disabled={sibuk}
                aria-label={`Hapus ${row.doc_type} dari daftar`}
                style={{ border: "none", background: "none", color: "#C2413B", cursor: "pointer", fontSize: 12 }}
              >
                Hapus
              </button>
            )}
          </div>
        ))}

      {!pakaiBawaan && (
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 8 }}>Tambah dokumen ke daftar ini</div>

          {belumDipakai.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {belumDipakai.map((j) => (
                <button key={j} onClick={() => tambah(j)} disabled={sibuk} style={{ ...pil(false), display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Plus size={11} />
                  {j}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={dokumenBaru}
              onChange={(e) => setDokumenBaru(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tambah(dokumenBaru)}
              placeholder="Dokumen lain yang diminta bank ini"
              aria-label="Nama dokumen baru"
              style={{ ...inputStyle, flex: 1 }}
            />
            <PrimaryButton onClick={() => tambah(dokumenBaru)} disabled={sibuk || !dokumenBaru.trim()} style={{ padding: "9px 15px" }}>
              Tambah
            </PrimaryButton>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 6, lineHeight: 1.45 }}>
            Daftar induk jenis dokumen diatur pada kartu <b>Jenis Dokumen KPR</b> di bawah.
          </div>
        </div>
      )}
    </Card>
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
