import React, { useState } from "react";
import { rupiahInput, angkaDariRupiah, angkaDariSingkatan, terbilang } from "../lib/format";
import { TEXT_MID, POSITIVE, BORDER, PRIMARY, inputStyle } from "./ui";

/**
 * Kotak isian nominal.
 *
 * BRIEF §Leads: "Booking Fee masih menginput satu persatu — ingin menginput
 * Rp 7.000.000 tetapi harus satu per satu, 7 > 70 > 700 > 7.000.000."
 *
 * Yang dikeluhkan bukan pemisah ribuannya; itu sudah ada. Yang dikeluhkan
 * adalah tujuh ketukan untuk sebuah angka yang di kepala orang berbunyi
 * "tujuh juta" — dan setiap ketukan tambahan adalah satu kesempatan lagi
 * untuk kehilangan atau menambah satu nol. Tiga hal menutupnya:
 *
 *   1. Singkatan diterima: "7jt" menjadi 7.000.000 begitu fokus berpindah.
 *   2. Pilihan cepat untuk nominal yang memang berulang setiap hari.
 *   3. Terbilang di bawah kotak. "7.000.000" dan "70.000.000" nyaris sama
 *      dilihat sekilas; "tujuh juta" dan "tujuh puluh juta" tidak mungkin
 *      tertukar. Inilah satu-satunya bagian yang benar-benar menangkap
 *      kesalahan nol, dan karena itu ia selalu tampil, bukan opsional.
 */
export default function InputRupiah({
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = "mis. 7jt atau 7.000.000",
  id,
  pilihanCepat,
  style,
  ...sisa
}) {
  // Teks mentah dipegang terpisah supaya "7jt" masih bisa dibaca saat diketik.
  // Tanpa ini, "j" akan langsung dibuang oleh pemformat dan singkatannya
  // mustahil selesai diketik.
  const [mentah, setMentah] = useState(null);
  const angka = value === "" || value === null || value === undefined ? "" : Number(value);
  const tampil = mentah ?? rupiahInput(value);

  function ketik(teks) {
    setMentah(teks);
    // Angka biasa tetap diteruskan seketika, jadi pemisah ribuan tetap hidup
    // sambil mengetik. Singkatan menunggu sampai selesai — "7j" bukan apa-apa.
    if (!/[a-zA-Z]/.test(teks)) {
      setMentah(null);
      onChange?.(angkaDariRupiah(teks));
    }
  }

  /**
   * `onBlur` selalu menerima nilai akhirnya sebagai argumen kedua.
   *
   * Itu bukan kemewahan. Singkatan baru diurai di sini, jadi `onChange` yang
   * membawanya baru saja dipanggil — dan pemanggil yang membaca state-nya
   * sendiri akan membaca nilai sebelumnya, karena state React belum sempat
   * diperbarui. "7jt" akan tersimpan sebagai kosong. Pemanggil wajib memakai
   * argumen kedua, bukan state-nya.
   */
  function selesai(e) {
    const teks = e.target.value;
    const singkat = angkaDariSingkatan(teks);
    const hasil = singkat !== null ? singkat : angkaDariRupiah(teks);
    setMentah(null);
    if (String(hasil) !== String(angka)) onChange?.(hasil);
    onBlur?.(e, hasil);
  }

  function pilih(n) {
    setMentah(null);
    onChange?.(n);
    onBlur?.(null, n);
  }

  return (
    <div style={{ minWidth: 0 }}>
      <input
        id={id}
        // type="text" + inputMode: angka besar tetap terbaca berpemisah, papan
        // tik ponsel tetap membuka mode angka, dan huruf satuan tetap bisa
        // diketik — yang ketiga mustahil dengan type="number".
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={tampil}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => ketik(e.target.value)}
        onBlur={selesai}
        style={{ ...inputStyle, ...(disabled ? { background: "#F4F6FA", color: TEXT_MID } : null), ...style }}
        {...sisa}
      />

      {!disabled && pilihanCepat?.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
          {pilihanCepat.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => pilih(n)}
              style={{
                border: `1px solid ${Number(angka) === n ? PRIMARY : BORDER}`,
                background: Number(angka) === n ? PRIMARY : "#fff",
                color: Number(angka) === n ? "#fff" : TEXT_MID,
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {ringkas(n)}
            </button>
          ))}
        </div>
      )}

      {angka !== "" && Number.isFinite(Number(angka)) && Number(angka) > 0 && (
        <div style={{ fontSize: 11, color: POSITIVE, marginTop: 5, lineHeight: 1.4, textTransform: "capitalize" }}>
          {terbilang(angka)}
        </div>
      )}
    </div>
  );
}

function ringkas(n) {
  if (n >= 1e9) return `${n / 1e9} M`;
  if (n >= 1e6) return `${n / 1e6} jt`;
  if (n >= 1e3) return `${n / 1e3} rb`;
  return String(n);
}
