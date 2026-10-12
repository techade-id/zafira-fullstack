import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Siren, FolderClock, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../lib/useNotifications";
import { Modal, PrimaryButton, BORDER, SURFACE, TEXT_MID, TEXT_DARK, NEGATIVE, ACCENT_DARK, ACCENT_SOFT, PRIMARY, PRIMARY_SOFT } from "./ui";

/**
 * Pengingat otomatis saat aplikasi dibuka — sekali sehari per pengguna.
 *
 * Klien menemukan jadwal follow-up yang terlewat 49 hari: lonceng sudah
 * menghitungnya, tetapi lonceng hanya terbaca oleh yang membukanya. Konsumen
 * yang sedang menunggu kabar survei atau BI Checking merasa diabaikan justru
 * karena tidak ada yang memaksa jadwal itu terlihat. Jendela ini memaksanya:
 *
 *   · Sales — jadwal follow-up miliknya yang terlewat.
 *   · Supervisor, Pengawas, Admin — eskalasi: jadwal tim yang terlewat lebih
 *     dari batas hari di Pengaturan Bisnis (bawaan 3 hari), lengkap dengan
 *     nama Sales-nya.
 *   · Admin Marketing, Admin — konsumen yang prosesnya ≥ 14 hari tanpa berkas
 *     masuk bank: saatnya menyiapkan berkas.
 *
 * Angkanya sama dengan lonceng (my_notifications), dan RLS menyaring siapa
 * melihat apa. "Nanti saja" menyembunyikannya sampai besok.
 */
export default function PengingatTerlewat() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { terlewat, items, per_kategori, memuat, error } = useNotifications();
  const [buka, setBuka] = useState(false);

  const kunci = profile?.id ? `pengingat-harian:${profile.id}:${hariIniLokal()}` : null;
  const jumlah = new Map((per_kategori || []).map((k) => [k.kategori, Number(k.jumlah)]));
  const nTerlewat = Number(terlewat) || 0;
  const nEskalasi = jumlah.get("eskalasi") || 0;
  const nBerkas = jumlah.get("siapkan_berkas") || 0;
  const ada = nTerlewat + nEskalasi + nBerkas > 0;

  useEffect(() => {
    if (!kunci || memuat || error || !ada) return;
    let sudah = false;
    // Penyimpanan peramban bisa ditolak (mode privat): pengingat tetap
    // muncul, hanya bisa muncul lagi di kunjungan berikutnya.
    try {
      sudah = window.localStorage.getItem(kunci) === "1";
    } catch {
      sudah = false;
    }
    if (!sudah) setBuka(true);
  }, [kunci, memuat, error, ada]);

  function tutup() {
    setBuka(false);
    try {
      if (kunci) window.localStorage.setItem(kunci, "1");
    } catch {
      /* lihat catatan di atas */
    }
  }

  function ke(rute) {
    tutup();
    navigate(rute);
  }

  if (!buka) return null;

  const contoh = (kategori, syarat = () => true) => (items || []).filter((it) => it.kategori === kategori && syarat(it)).slice(0, 4);

  return (
    <Modal open labelledBy="pengingat-judul" onClose={tutup} width={500}>
      <>
        <div id="pengingat-judul" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          <AlertTriangle size={18} color={ACCENT_DARK} aria-hidden="true" />
          Perlu perhatian hari ini
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 16, lineHeight: 1.5 }}>
          Konsumen yang sedang menunggu kabar tidak boleh merasa ditinggal. Tindak lanjuti yang di bawah ini lebih dulu.
        </div>

        {nTerlewat > 0 && (
          <Kelompok
            ikon={AlertTriangle}
            warna={NEGATIVE}
            latar="#FBE9E8"
            judul={`${nTerlewat} jadwal follow-up terlewat`}
            baris={contoh("followup", (it) => it.urgensi === "tinggi")}
            tombol="Buka jadwal terlewat"
            onBuka={() => ke("/follow-up?saringan=terlewat")}
          />
        )}
        {nEskalasi > 0 && (
          <Kelompok
            ikon={Siren}
            warna={ACCENT_DARK}
            latar={ACCENT_SOFT}
            judul={`Eskalasi: ${nEskalasi} jadwal tim terlewat`}
            baris={contoh("eskalasi")}
            tombol="Lihat di Follow Up Leads"
            onBuka={() => ke("/follow-up?saringan=terlewat")}
          />
        )}
        {nBerkas > 0 && (
          <Kelompok
            ikon={FolderClock}
            warna={PRIMARY}
            latar={PRIMARY_SOFT}
            judul={`${nBerkas} konsumen perlu disiapkan berkasnya`}
            baris={contoh("siapkan_berkas")}
            tombol="Buka Konsumen"
            onBuka={() => ke("/konsumen")}
          />
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button onClick={tutup} style={gayaSekunder}>
            Nanti saja
          </button>
        </div>
      </>
    </Modal>
  );
}

function Kelompok({ ikon: Ikon, warna, latar, judul, baris, tombol, onBuka }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 13, padding: "12px 14px", marginBottom: 12, background: SURFACE }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: baris.length ? 8 : 10 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: latar, color: warna, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Ikon size={14} aria-hidden="true" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_DARK }}>{judul}</span>
      </div>
      {baris.map((it, i) => (
        <div key={`${it.record_id}-${i}`} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "3px 0 3px 34px" }}>
          <span style={{ color: TEXT_DARK, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.judul}</span>
          <span style={{ marginLeft: "auto", color: warna, fontSize: 11.5, whiteSpace: "nowrap" }}>{it.detail}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <PrimaryButton onClick={onBuka} style={{ padding: "7px 14px", fontSize: 12.5 }}>
          {tombol} <ArrowRight size={13} style={{ marginLeft: 4, verticalAlign: -2 }} />
        </PrimaryButton>
      </div>
    </div>
  );
}

/** "YYYY-MM-DD" menurut jam perangkat — kunci "sudah ditampilkan hari ini". */
function hariIniLokal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "9px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
