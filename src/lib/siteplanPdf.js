import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { rupiah } from "./format";
import { titikDari, pusatDari, ukuranDari, STATUS_PUBLIK, GAYA_FASILITAS, statusPublikDari, labelPosisi, labelHadap, urutKode } from "./siteplan";

/**
 * Price list siteplan sebagai PDF — yang dicetak untuk pameran dan dikirim
 * ke calon pembeli. Isinya sengaja versi publik: status disederhanakan,
 * tanpa nama konsumen atau sales, sehingga aman berpindah tangan.
 */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Gambar latar sebagai data URL — SVG yang dirender lewat <img> tidak boleh memuat sumber luar. */
async function keDataUrl(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** SVG siteplan mandiri berwarna status publik, dengan kode di setiap kavling. */
export async function svgSiteplan({ siteplan, kavling, fasilitas, sekarang, denganGambar = true }) {
  const W = Number(siteplan.lebar) || 1000;
  const H = Number(siteplan.tinggi) || 700;
  const latar = denganGambar && siteplan.gambar_url ? await keDataUrl(siteplan.gambar_url) : null;
  const bagian = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  if (latar) bagian.push(`<image href="${latar}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" opacity="0.5"/>`);
  for (const f of fasilitas || []) {
    const t = titikDari(f.bentuk);
    if (t.length < 3) continue;
    const g = GAYA_FASILITAS[f.jenis] || GAYA_FASILITAS.fasum;
    const [cx, cy] = pusatDari(t);
    const { a, b } = ukuranDari(t);
    bagian.push(`<polygon points="${f.bentuk}" fill="${g.isi}" stroke="${g.garis}" stroke-width="0.8"/>`);
    bagian.push(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="${Math.max(4, Math.min(a, b) * 0.32)}" fill="${g.teks}">${esc(f.label)}</text>`);
  }
  for (const k of kavling) {
    if (!k.bentuk) continue;
    const t = titikDari(k.bentuk);
    const s = STATUS_PUBLIK.find((x) => x.key === (k.status_publik || statusPublikDari(k, sekarang)))?.gaya || STATUS_PUBLIK[3].gaya;
    const [cx, cy] = pusatDari(t);
    const { a, b } = ukuranDari(t);
    bagian.push(`<polygon points="${k.bentuk}" fill="${s.isi}" stroke="${s.garis}" stroke-width="0.8"/>`);
    bagian.push(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="${Math.max(3, Math.min(a, b) * 0.34)}" fill="${s.teks}">${esc(k.unit_code || k.kode)}</text>`);
  }
  bagian.push("</svg>");
  return { svg: bagian.join(""), W, H };
}

async function svgKeGambar(svg, lebarPx, format = "image/png") {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const skala = lebarPx / img.width;
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * skala);
    c.height = Math.round(img.height * skala);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // JPEG untuk PDF: PNG sebesar ini disematkan jsPDF hampir tanpa kompresi
    // dan membuat berkasnya belasan MB — terlalu berat untuk dikirim lewat WA.
    return format === "image/jpeg" ? c.toDataURL("image/jpeg", 0.86) : c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Unduh gambar siteplan (PNG) — untuk status WhatsApp dan unggahan media sosial. */
export async function unduhGambarSiteplan(opsi) {
  const { svg } = await svgSiteplan(opsi);
  const png = await svgKeGambar(svg, 2400);
  const a = document.createElement("a");
  a.href = png;
  a.download = `siteplan-${slug(opsi.proyek)}-${slug(opsi.siteplan.nama)}.png`;
  a.click();
}

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "siteplan";
}

export async function unduhPriceList({ siteplan, proyek, lokasi, kavling, fasilitas, sekarang, hanyaTersedia = true, tampilHarga = true }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const lebarHal = doc.internal.pageSize.getWidth();
  const tinggiHal = doc.internal.pageSize.getHeight();
  const tepi = 12;
  const tgl = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 27, 46);
  doc.text(`${proyek || "Siteplan"} — ${siteplan.nama}`, tepi, tepi + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text([lokasi, `Ketersediaan per ${tgl}`].filter(Boolean).join(" · "), tepi, tepi + 10);

  // Halaman 1: peta.
  const { svg, W, H } = await svgSiteplan({ siteplan, kavling, fasilitas, sekarang });
  try {
    const jpg = await svgKeGambar(svg, 2200, "image/jpeg");
    const maksW = lebarHal - tepi * 2;
    const maksH = tinggiHal - tepi * 2 - 26;
    const s = Math.min(maksW / W, maksH / H);
    doc.addImage(jpg, "JPEG", tepi + (maksW - W * s) / 2, tepi + 15, W * s, H * s, undefined, "FAST");
  } catch {
    doc.text("Peta tidak dapat dirender di peramban ini.", tepi, tepi + 22);
  }

  // Legenda.
  let x = tepi;
  const y = tinggiHal - tepi - 2;
  doc.setFontSize(9);
  for (const st of STATUS_PUBLIK.slice(0, 3)) {
    const n = kavling.filter((k) => statusPublikDari(k, sekarang) === st.key).length;
    doc.setFillColor(st.gaya.isi);
    doc.setDrawColor(st.gaya.garis);
    doc.rect(x, y - 3, 4, 4, "FD");
    doc.setTextColor(17, 27, 46);
    const teks = `${st.label} (${n})`;
    doc.text(teks, x + 6, y);
    x += 10 + doc.getTextWidth(teks);
  }

  // Halaman 2: tabel.
  const daftar = kavling
    .filter((k) => !hanyaTersedia || statusPublikDari(k, sekarang) === "tersedia")
    .sort((a, b) => urutKode(a.unit_code, b.unit_code));
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 27, 46);
  doc.text(hanyaTersedia ? `Unit tersedia (${daftar.length})` : `Daftar kavling (${daftar.length})`, tepi, tepi + 4);

  const label = { tersedia: "Tersedia", dipesan: "Dipesan", terjual: "Terjual", tidak_tersedia: "Tidak tersedia" };
  autoTable(doc, {
    startY: tepi + 9,
    margin: { left: tepi, right: tepi },
    head: [["Kode", "Blok", "Tipe", "LT (m²)", "LB (m²)", "Posisi", "Hadap", ...(tampilHarga ? ["Harga"] : []), ...(hanyaTersedia ? [] : ["Status"])]],
    body: daftar.map((k) => {
      const st = statusPublikDari(k, sekarang);
      return [
        k.unit_code,
        k.block || "-",
        k.type || "-",
        k.luas_tanah ? Number(k.luas_tanah).toLocaleString("id-ID") : "-",
        k.luas_bangunan ? Number(k.luas_bangunan).toLocaleString("id-ID") : "-",
        labelPosisi(k.posisi) || "-",
        labelHadap(k.hadap) || "-",
        ...(tampilHarga ? [st === "tersedia" && k.price ? rupiah(k.price) : "-"] : []),
        ...(hanyaTersedia ? [] : [label[st]]),
      ];
    }),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, textColor: [17, 27, 46] },
    headStyles: { fillColor: [15, 42, 92], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 246, 250] },
    columnStyles: tampilHarga ? { 7: { halign: "right" } } : {},
  });

  const akhir = doc.lastAutoTable?.finalY || tepi + 20;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Harga dan ketersediaan dapat berubah sewaktu-waktu. Hubungi tim marketing Zafira Property untuk konfirmasi.", tepi, Math.min(tinggiHal - tepi, akhir + 8));

  doc.save(`price-list-${slug(proyek)}-${slug(siteplan.nama)}.pdf`);
}
