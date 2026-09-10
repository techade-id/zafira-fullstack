#!/usr/bin/env python3
"""Mengubah siteplan raster menjadi geometri vektor per kavling.

    python3 tools/siteplan_ke_vektor.py

Butuh Pillow, numpy, dan scipy:

    python3 -m venv .venv && .venv/bin/pip install pillow numpy scipy
    .venv/bin/python tools/siteplan_ke_vektor.py

Keluaran:
    public/siteplan-kaligangsa.svg   — SVG mandiri, untuk cetak dan rujukan
    src/data/siteplanKaligangsa.js   — geometri untuk peta interaktif React

KENAPA TIDAK DITELUSURI SEBAGAI KURVA (potrace dsb.)
----------------------------------------------------
Penelusuran vektor biasa mengubah garis gambar menjadi ribuan kurva tanpa
identitas: hasilnya gambar yang tampak sama tetapi tetap tidak bisa diklik,
karena tidak ada yang tahu kurva mana milik kavling mana.

Gambar sumbernya adalah gambar CAD — garis hitam bersih di atas putih, satu
grid yang diputar pada satu sudut. Sifat itu dimanfaatkan: tiap kavling adalah
DAERAH PUTIH TERTUTUP, dan setelah sumbunya diluruskan, tiap daerah menjadi
segi empat sejajar sumbu yang dapat diukur presisi lalu diberi kode unit.

Penomoran diverifikasi terhadap assets/siteplan-with-number.jpeg:
A32, B21, C16, D28, E16, F16, G16, H13 = 158 kavling.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

AKAR = Path(__file__).resolve().parent.parent
SUMBER = AKAR / "assets" / "siteplan.jpeg"

# Struktur denah, dibaca dari gambar bernomor. Dipakai sebagai pemeriksaan:
# bila deteksi meleset, jumlah kolomnya tidak akan cocok dan skrip berhenti —
# lebih baik gagal terang-terangan daripada menghasilkan kode unit yang salah.
KOLOM_TENGAH = [("B", 7), ("B", 7), ("B", 7), ("C", 8), ("C", 8),
                ("D", 8), ("D", 8), ("D", 6), ("D", 6), ("E", 8), ("E", 8),
                ("F", 8), ("F", 8), ("G", 8), ("G", 8), ("H", 8)]
HARAP_BLOK = {"A": 32, "B": 21, "C": 16, "D": 28, "E": 16, "F": 16, "G": 16, "H": 13}

LUAS_SEL = (700, 1200)      # luas daerah putih satu kavling, piksel
LUAS_MASJID = (3000, 4500)  # 240 m² = empat kali kavling
LUAS_FASILITAS = (1400, 2600)  # kotak fasilitas, sekitar dua kali kavling

# Kotak fasilitas yang berdiri sendiri pada gambar bersih. Labelnya diambil apa
# adanya dari gambar bernomor — apa persisnya "T" tidak diasumsikan di sini.
# T.7 duduk di dalam baris blok A; T.3 tepat di atas kolom B8/B15.
# Luas terukurnya (~115 dan ~127 m²) cocok dengan dimensi pada gambar.
FASILITAS_LAIN = [("T.7", "di baris A"), ("T.3", "di atas kolom B")]


def sudut_grid(gelap):
    """Sudut putar denah, dari ketajaman proyeksi piksel gelap.

    Pada sudut yang benar, garis-garis sejajar menumpuk menjadi puncak yang
    tinggi dan sempit; jumlah kuadrat histogramnya memuncak di sana.
    """
    ys, xs = np.nonzero(gelap)
    px, py = xs - xs.mean(), ys - ys.mean()

    def tajam(deg):
        r = np.deg2rad(deg)
        u = px * np.cos(r) - py * np.sin(r)
        hist, _ = np.histogram(u, bins=900)
        return (hist.astype(float) ** 2).sum()

    kasar = max(np.arange(-60, 60, 0.5), key=tajam)
    return float(max(np.arange(kasar - 0.5, kasar + 0.5, 0.02), key=tajam))


def main():
    if not SUMBER.exists():
        sys.exit(f"Gambar sumber tidak ditemukan: {SUMBER}")

    abu = np.array(Image.open(SUMBER).convert("L"))
    gelap = abu < 140
    sudut = sudut_grid(gelap)
    r = np.deg2rad(sudut)
    C, S = np.cos(r), np.sin(r)

    def ke_lurus(x, y):
        return x * C - y * S, x * S + y * C

    def ke_citra(u, v):
        return u * C + v * S, -u * S + v * C

    lab, n = ndimage.label(~gelap)
    luas = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)).astype(int)
    objs = ndimage.find_objects(lab)

    def kotak(L):
        sl = objs[L - 1]
        ys, xs = np.nonzero(lab[sl] == L)
        u, v = ke_lurus((xs + sl[1].start).astype(float), (ys + sl[0].start).astype(float))
        return u.min(), u.max(), v.min(), v.max()

    sel = []
    for L in range(1, n + 1):
        if not (LUAS_SEL[0] <= luas[L - 1] < LUAS_SEL[1]):
            continue
        u0, u1, v0, v1 = kotak(L)
        if (u1 - u0) >= 100 or (v1 - v0) <= 10:   # strip tipis di tepi, bukan kavling
            continue
        sel.append(dict(u0=u0, u1=u1, v0=v0, v1=v1, uc=(u0 + u1) / 2, vc=(v0 + v1) / 2))

    total = sum(HARAP_BLOK.values())
    if len(sel) != total:
        sys.exit(f"Terdeteksi {len(sel)} kavling, seharusnya {total}. Periksa ambang LUAS_SEL.")

    # Blok A satu baris di tepi atas; H9-H13 satu baris di tepi bawah; sisanya kolom.
    baris_a = sorted([s for s in sel if s["vc"] < 100], key=lambda s: s["uc"])
    baris_h = sorted([s for s in sel if s["vc"] > 330], key=lambda s: s["uc"])
    tengah = sorted([s for s in sel if 100 <= s["vc"] <= 330], key=lambda s: s["uc"])

    kolom, kini = [], [tengah[0]]
    for a, b in zip(tengah, tengah[1:]):
        if b["uc"] - a["uc"] > 15:               # lebar kavling ~37 px
            kolom.append(kini)
            kini = [b]
        else:
            kini.append(b)
    kolom.append(kini)
    kolom = [sorted(k, key=lambda s: s["vc"]) for k in kolom]

    bentuk = [len(k) for k in kolom]
    if bentuk != [j for _, j in KOLOM_TENGAH]:
        sys.exit(f"Susunan kolom {bentuk} tidak cocok dengan denah {[j for _, j in KOLOM_TENGAH]}.")

    hasil, hitung = [], {}

    def tambah(blok, s):
        hitung[blok] = hitung.get(blok, 0) + 1
        hasil.append((f"{blok}{hitung[blok]}", blok, s))

    for k, (blok, _) in zip(kolom, KOLOM_TENGAH):
        for s in k:
            tambah(blok, s)
    for s in baris_a:
        tambah("A", s)
    for s in baris_h:
        tambah("H", s)

    if hitung != HARAP_BLOK:
        sys.exit(f"Jumlah per blok {hitung} tidak cocok dengan {HARAP_BLOK}.")

    def sudut4(s):
        return [ke_citra(u, v) for u, v in
                [(s["u0"], s["v0"]), (s["u1"], s["v0"]), (s["u1"], s["v1"]), (s["u0"], s["v1"])]]

    # Kotak fasilitas dikenali dari bentuknya: segi empat yang terisi penuh
    # (rasio isi > 0,95), berbeda dari jalan dan area berarsir yang selalu
    # berlekuk sehingga rasio isinya rendah.
    def persegi_penuh(L, batas):
        if not (batas[0] <= luas[L - 1] < batas[1]):
            return None
        u0, u1, v0, v1 = kotak(L)
        if luas[L - 1] / ((u1 - u0) * (v1 - v0)) <= 0.95:
            return None
        return u0, u1, v0, v1

    masjid = None
    kotak_lain = []
    for L in range(1, n + 1):
        b = persegi_penuh(L, LUAS_MASJID)
        if b and masjid is None:
            masjid = b
            continue
        b = persegi_penuh(L, LUAS_FASILITAS)
        if b:
            kotak_lain.append(b)

    if masjid is None:
        sys.exit("Kotak masjid tidak ditemukan.")
    if len(kotak_lain) != len(FASILITAS_LAIN):
        sys.exit(f"Ditemukan {len(kotak_lain)} kotak fasilitas, seharusnya {len(FASILITAS_LAIN)}.")

    # T.7 berada di dalam baris blok A (v kecil); T.3 di bawahnya.
    kotak_lain.sort(key=lambda b: b[2])
    masjid = [ke_citra(u, v) for u, v in
              [(masjid[0], masjid[2]), (masjid[1], masjid[2]), (masjid[1], masjid[3]), (masjid[0], masjid[3])]]

    semua = [p for _, _, s in hasil for p in sudut4(s)] + masjid
    xs = [p[0] for p in semua]
    ys = [p[1] for p in semua]
    M = 14
    ox, oy = min(xs) - M, min(ys) - M
    W = round(max(xs) - min(xs) + 2 * M, 1)
    H = round(max(ys) - min(ys) + 2 * M, 1)

    def titik(pts):
        return " ".join(f"{round(x - ox, 1)},{round(y - oy, 1)}" for x, y in pts)

    def pusat(pts):
        return (round(sum(x for x, _ in pts) / 4 - ox, 1), round(sum(y for _, y in pts) / 4 - oy, 1))

    unit = sorted(({"kode": k, "blok": b, "titik": titik(sudut4(s)), "pusat": pusat(sudut4(s))}
                   for k, b, s in hasil), key=lambda d: (d["blok"], int(d["kode"][1:])))
    fasilitas = [{"kode": "MASJID", "label": "Masjid", "luas": "240 m²",
                  "titik": titik(masjid), "pusat": pusat(masjid)}]
    for (kode, _), (u0, u1, v0, v1) in zip(FASILITAS_LAIN, kotak_lain):
        p = [ke_citra(u, v) for u, v in [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]]
        fasilitas.append({"kode": kode, "label": kode, "luas": "", "titik": titik(p), "pusat": pusat(p)})

    tulis_svg(W, H, unit, fasilitas)
    tulis_js(W, H, unit, fasilitas, sudut)
    print(f"{len(unit)} kavling · sudut {sudut:.2f}° · viewBox 0 0 {W} {H}")
    for b, j in sorted(HARAP_BLOK.items()):
        print(f"  blok {b}: {j}")


def tulis_svg(W, H, unit, fasilitas):
    baris = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
        "  <title>Siteplan Perumahan Zafira Permai Kaligangsa</title>",
        '  <desc>158 kavling blok A-H. Tiap kavling satu polygon ber-id "kav-&lt;kode&gt;".</desc>',
        "  <style>",
        "    .kavling { fill: #fff; stroke: #0F2A5C; stroke-width: .8; }",
        "    .fasilitas { fill: #E8EDF7; stroke: #0F2A5C; stroke-width: .8; }",
        "    text { font: 600 6px system-ui, sans-serif; fill: #64748B; }",
        "  </style>",
        '  <g id="kavling">',
    ]
    for u in unit:
        baris.append(f'    <polygon id="kav-{u["kode"]}" class="kavling" data-unit="{u["kode"]}" '
                     f'data-blok="{u["blok"]}" points="{u["titik"]}"><title>{u["kode"]}</title></polygon>')
        baris.append(f'    <text x="{u["pusat"][0]}" y="{u["pusat"][1]}" text-anchor="middle" '
                     f'dominant-baseline="central">{u["kode"]}</text>')
    baris.append("  </g>")
    baris.append('  <g id="fasilitas">')
    for f in fasilitas:
        baris.append(f'    <polygon id="fas-{f["kode"]}" class="fasilitas" points="{f["titik"]}">'
                     f'<title>{f["label"]} — {f["luas"]}</title></polygon>')
        baris.append(f'    <text x="{f["pusat"][0]}" y="{f["pusat"][1]}" text-anchor="middle" '
                     f'dominant-baseline="central">{f["label"]}</text>')
    baris.append("  </g>")
    baris.append("</svg>")
    (AKAR / "public" / "siteplan-kaligangsa.svg").write_text("\n".join(baris))


def tulis_js(W, H, unit, fasilitas, sudut):
    kav = "\n".join(
        f'  {{ kode: "{u["kode"]}", blok: "{u["blok"]}", titik: "{u["titik"]}", '
        f'pusat: [{u["pusat"][0]}, {u["pusat"][1]}] }},' for u in unit)
    fas = "\n".join(
        f'  {{ kode: "{f["kode"]}", label: "{f["label"]}", luas: "{f["luas"]}", '
        f'titik: "{f["titik"]}", pusat: [{f["pusat"][0]}, {f["pusat"][1]}] }},' for f in fasilitas)
    (AKAR / "src" / "data" / "siteplanKaligangsa.js").write_text(f'''/**
 * Geometri siteplan Perumahan Zafira Permai Kaligangsa — 158 kavling, blok A–H.
 *
 * DIHASILKAN OTOMATIS oleh tools/siteplan_ke_vektor.py dari assets/siteplan.jpeg.
 * Jangan disunting tangan; jalankan ulang skripnya bila gambar sumber berubah.
 *
 * Denahnya adalah gambar CAD dengan grid yang diputar {abs(sudut):.2f}°. Tiap kavling
 * dikenali sebagai daerah putih tertutup lalu diukur pada sumbu yang sudah
 * diluruskan, sehingga keluar sebagai segi empat presisi — bukan hasil
 * penelusuran kurva yang bergerigi dan tanpa identitas.
 *
 * `titik` berformat atribut `points` milik <polygon>, siap dipakai apa adanya.
 * `kode` cocok dengan units.unit_code di database.
 */

export const SITEPLAN_VIEWBOX = "0 0 {W} {H}";

export const SITEPLAN_KAVLING = [
{kav}
];

export const SITEPLAN_FASILITAS = [
{fas}
];

export const SITEPLAN_BLOK = ["A", "B", "C", "D", "E", "F", "G", "H"];
''')


if __name__ == "__main__":
    main()
