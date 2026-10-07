import React, { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { uploadFile, getPublicUrl } from "../../lib/storage";
import { useToast } from "../../context/ToastContext";
import { Modal, Field, PrimaryButton, ConfirmDialog, friendlyDbError, BORDER, TEXT_MID, NEGATIVE, PRIMARY_SOFT, PRIMARY } from "../ui";
import { gayaSekunder } from "./ModalPilihProspek";

const LEBAR_BAKU = 1000;

/** Ukuran asli gambar, supaya kanvas mengikuti rasionya dan gambar tidak gepeng. */
function ukuranGambar(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Membuat atau mengubah satu siteplan.
 *
 * Gambar latar opsional: siteplan bisa digambar di atas denah hasil pindai,
 * atau di atas kanvas kosong. Bila ada gambar, ukuran kanvas mengikuti rasio
 * gambarnya — kavling digambar dalam satuan kanvas, jadi rasio yang salah
 * berarti seluruh kavling bergeser dari gambarnya.
 */
export default function ModalSiteplan({ open, siteplan, proyek, proyekAwal, jumlahKavling = 0, onClose, onSimpan, onHapus }) {
  const toast = useToast();
  const baru = !siteplan;
  const [form, setForm] = useState({});
  const [berkas, setBerkas] = useState(null);
  const [pratinjau, setPratinjau] = useState(null);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");
  const [hapus, setHapus] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      project_id: siteplan?.project_id || proyekAwal || proyek[0]?.id || "",
      nama: siteplan?.nama || (baru ? "Tahap 1" : ""),
      keterangan: siteplan?.keterangan || "",
      lebar: siteplan?.lebar ?? LEBAR_BAKU,
      tinggi: siteplan?.tinggi ?? 700,
      urutan: siteplan?.urutan ?? 0,
      kontak_wa: siteplan?.kontak_wa || "",
      gambar_url: siteplan?.gambar_url || "",
    });
    setBerkas(null);
    setPratinjau(null);
    setGalat("");
  }, [open, siteplan, proyekAwal, proyek, baru]);

  const ubah = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function pilihGambar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ukuran = await ukuranGambar(file);
    if (!ukuran) {
      setGalat("Berkas ini tidak bisa dibaca sebagai gambar.");
      return;
    }
    setBerkas(file);
    setPratinjau(URL.createObjectURL(file));
    // Kavling yang sudah ada digambar pada kanvas lama — mengubah ukurannya
    // akan menggeser semuanya. Hanya siteplan kosong yang ikut rasio gambar.
    if (jumlahKavling === 0) {
      setForm((f) => ({ ...f, lebar: LEBAR_BAKU, tinggi: Math.round((LEBAR_BAKU * ukuran.h) / ukuran.w) }));
    }
  }

  async function simpan() {
    if (!form.nama.trim()) return setGalat("Nama siteplan wajib diisi.");
    if (!form.project_id) return setGalat("Pilih proyeknya.");
    const lebar = Number(form.lebar);
    const tinggi = Number(form.tinggi);
    if (!(lebar > 0) || !(tinggi > 0)) return setGalat("Ukuran kanvas harus lebih dari nol.");

    setKirim(true);
    setGalat("");
    let gambar = form.gambar_url || null;
    if (berkas) {
      const { path, error } = await uploadFile("siteplan-images", form.project_id, berkas);
      if (error) {
        setKirim(false);
        return setGalat(`Gambar gagal diunggah: ${error.message}`);
      }
      gambar = getPublicUrl("siteplan-images", path);
    }

    const payload = {
      nama: form.nama.trim(),
      keterangan: form.keterangan.trim() || null,
      gambar_url: gambar,
      lebar,
      tinggi,
      urutan: Number(form.urutan) || 0,
      kontak_wa: form.kontak_wa.trim() || null,
    };
    const { data, error } = baru
      ? await supabase.from("siteplans").insert({ ...payload, project_id: form.project_id }).select().single()
      : await supabase.from("siteplans").update(payload).eq("id", siteplan.id).select().single();
    setKirim(false);
    if (error) {
      return setGalat(error.code === "23505" ? `Proyek ini sudah punya siteplan bernama “${payload.nama}”.` : error.message);
    }
    toast.sukses(baru ? `Siteplan ${payload.nama} dibuat.` : "Siteplan disimpan.");
    onSimpan?.(data);
  }

  const gambarTampil = pratinjau || form.gambar_url;

  return (
    <Modal open={open} labelledBy="modal-siteplan-judul" onClose={() => !kirim && onClose?.()} width={520}>
      <div id="modal-siteplan-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
        {baru ? "Siteplan baru" : `Pengaturan ${siteplan.nama}`}
      </div>
      <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
        {baru
          ? "Satu proyek bisa punya beberapa siteplan — per tahap, per cluster. Kavling digambar sesudahnya di editor."
          : "Ubah nama, gambar latar, dan kontak untuk halaman publik."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Proyek" wajib style={{ gridColumn: "1 / -1" }}>
          <select value={form.project_id || ""} onChange={ubah("project_id")} disabled={!baru}>
            {proyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nama siteplan" wajib hint="mis. Tahap 1, Cluster Melati">
          <input value={form.nama || ""} onChange={ubah("nama")} />
        </Field>
        <Field label="Urutan tab" hint="Kecil tampil lebih dulu">
          <input type="number" value={form.urutan ?? 0} onChange={ubah("urutan")} />
        </Field>
        <Field label="Keterangan" style={{ gridColumn: "1 / -1" }}>
          <input value={form.keterangan || ""} onChange={ubah("keterangan")} placeholder="mis. 64 unit subsidi, rilis Januari" />
        </Field>
        <Field label="Nomor WhatsApp marketing" hint="Dituju tombol “Tanya unit ini” di halaman publik" style={{ gridColumn: "1 / -1" }}>
          <input value={form.kontak_wa || ""} onChange={ubah("kontak_wa")} placeholder="08…" inputMode="tel" />
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 6 }}>Gambar latar (opsional)</div>
        {gambarTampil ? (
          <div style={{ position: "relative", border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", background: "#FBFCFE" }}>
            <img src={gambarTampil} alt="Pratinjau gambar siteplan" style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "contain" }} />
            <button
              type="button"
              onClick={() => {
                setBerkas(null);
                setPratinjau(null);
                setForm((f) => ({ ...f, gambar_url: "" }));
              }}
              aria-label="Lepas gambar latar"
              style={{ position: "absolute", top: 8, right: 8, border: "none", borderRadius: 999, background: "rgba(17,27,46,0.75)", color: "#fff", padding: 5, lineHeight: 0, cursor: "pointer" }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 12.5, fontWeight: 600, color: PRIMARY, background: PRIMARY_SOFT, borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}>
          <ImagePlus size={14} />
          {gambarTampil ? "Ganti gambar" : "Unggah denah / gambar kerja"}
          <input type="file" accept="image/*" onChange={pilihGambar} style={{ display: "none" }} />
        </label>
        {jumlahKavling > 0 && berkas && (
          <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 6, lineHeight: 1.5 }}>
            Ukuran kanvas dipertahankan karena sudah ada {jumlahKavling} kavling. Pakai gambar dengan rasio yang sama agar kavling tetap pas.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <Field label="Lebar kanvas" hint={jumlahKavling ? "Terkunci: sudah ada kavling" : "satuan bebas, mis. 1000"}>
          <input type="number" value={form.lebar ?? ""} onChange={ubah("lebar")} disabled={jumlahKavling > 0} />
        </Field>
        <Field label="Tinggi kanvas">
          <input type="number" value={form.tinggi ?? ""} onChange={ubah("tinggi")} disabled={jumlahKavling > 0} />
        </Field>
      </div>

      {galat && <div style={{ fontSize: 12.5, color: NEGATIVE, marginTop: 12 }}>{galat}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
        {!baru && onHapus ? (
          <button type="button" onClick={() => setHapus(true)} style={{ border: "none", background: "none", color: NEGATIVE, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            Hapus siteplan
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={simpan} disabled={kirim}>
            {kirim ? "Menyimpan…" : baru ? "Buat siteplan" : "Simpan"}
          </PrimaryButton>
        </div>
      </div>

      {!baru && (
        <ConfirmDialog
          open={hapus}
          title={`Hapus siteplan ${siteplan.nama}?`}
          message="Gambar kavling dan fasilitasnya ikut terhapus."
          warning={jumlahKavling ? `${jumlahKavling} unit TIDAK ikut terhapus — status, konsumen, dan pembayarannya tetap ada di halaman Proyek, hanya tidak lagi tergambar di peta.` : undefined}
          confirmLabel="Hapus siteplan"
          busy={kirim}
          onCancel={() => setHapus(false)}
          onConfirm={async () => {
            setKirim(true);
            const { error } = await supabase.from("siteplans").delete().eq("id", siteplan.id);
            setKirim(false);
            if (error) {
              setGalat(friendlyDbError(error));
              setHapus(false);
              return;
            }
            setHapus(false);
            toast.sukses(`Siteplan ${siteplan.nama} dihapus.`);
            onHapus?.();
          }}
        />
      )}
    </Modal>
  );
}

