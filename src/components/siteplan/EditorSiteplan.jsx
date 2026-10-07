import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MousePointer2, Rows3, Square, Hand, ZoomIn, ZoomOut, Maximize2, X, Settings2, RotateCcw, RotateCw, FlipVertical2, Unlink, Check, ListPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import { usePandangan, useRodaPeta, useSkalaLayar, keKanvas } from "./usePandangan";
import {
  titikDari,
  keBentuk,
  pusatDari,
  batasDari,
  ukuranDari,
  sudutDari,
  geserTitik,
  putarTitik,
  petakBaris,
  kodeBerurut,
  urutKode,
  POSISI,
  HADAP,
  JENIS_FASILITAS,
  MODE_PETA,
  GAYA_FASILITAS,
} from "../../lib/siteplan";
import InputRupiah from "../InputRupiah";
import { Field, PrimaryButton, ConfirmDialog, Badge, BORDER, BORDER_SOFT, SURFACE, PAGE_BG, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE } from "../ui";

/**
 * Editor kavling di browser.
 *
 * Dulu menambah siteplan berarti developer menjalankan skrip Python atas
 * gambar kerja. Sekarang siapa pun yang berhak mengatur proyek menggambarnya
 * sendiri, dan cara menggambarnya mengikuti cara orang membaca denah: satu
 * baris kavling sekaligus.
 *
 *   Baris — tarik garis SEPANJANG sisi depan baris (bukan kotak sejajar layar),
 *           sehingga denah yang diputar pun tergambar presisi. Jumlah kavling
 *           ditebak dari lebar kavling yang sudah ada; kode diberi berurutan.
 *   Tempel — ujung garis menempel ke sudut kavling terdekat, dan sudutnya ke
 *           sudut baris yang sudah ada. Alt mematikan, Shift mengunci 15°.
 *
 * Setiap tindakan langsung tersimpan. Tidak ada tombol "Simpan semua" yang
 * bisa terlupa sebelum tab ditutup.
 */
export default function EditorSiteplan(props) {
  if (!props.open || !props.siteplan) return null;
  return createPortal(<Isi {...props} />, document.body);
}

const ALAT = [
  { key: "pilih", label: "Pilih", ikon: MousePointer2, pintas: "V" },
  { key: "baris", label: "Baris kavling", ikon: Rows3, pintas: "B" },
  { key: "fasilitas", label: "Fasilitas", ikon: Square, pintas: "F" },
  { key: "geser", label: "Geser peta", ikon: Hand, pintas: "H" },
];

const FORMAT_KODE = [
  { value: "polos", label: "A1" },
  { value: "nol", label: "A01" },
  { value: "strip", label: "A-01" },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

function selisihSudut(a, b) {
  let d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
}

function Isi({ onClose, siteplan, proyek, kavling, fasilitas, onBerubah, onPengaturan, fokusId }) {
  const toast = useToast();
  const lebar = Number(siteplan.lebar) || 1000;
  const tinggi = Number(siteplan.tinggi) || 700;
  const bingkai = useRef(null);
  const svgRef = useRef(null);
  const pandangan = usePandangan(lebar, tinggi);
  useRodaPeta(bingkai, svgRef, pandangan, { layarPenuh: true });
  const skala = useSkalaLayar(svgRef, pandangan.viewBox);

  const [alat, setAlat] = useState("pilih");
  const [terpilih, setTerpilih] = useState(() => new Set(fokusId ? [fokusId] : []));
  const [draf, setDraf] = useState(null);
  const [geser, setGeser] = useState(null);
  const [kotakPilih, setKotakPilih] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [opasitas, setOpasitas] = useState(0.6);
  const [spasi, setSpasi] = useState(false);
  const [lepas, setLepas] = useState(false);
  const [unitProyek, setUnitProyek] = useState([]);
  const [pilihSambung, setPilihSambung] = useState(new Set());
  const [form, setForm] = useState({ awalan: "A", mulai: 1, format: "polos", turun: false, block: "", type: "", price: "", luas_tanah: "", luas_bangunan: "", posisi: "", hadap: "", label: "", jenis: "fasum" });
  const dalamTerakhir = useRef(null);
  const interaksi = useRef(null);
  const nudge = useRef(null);

  /* ---------------- data ---------------- */

  const muatUnit = useCallback(async () => {
    const { data } = await supabase
      .from("units")
      .select("id, unit_code, block, type, price, status, bentuk, siteplan_id")
      .eq("project_id", siteplan.project_id);
    setUnitProyek(data || []);
  }, [siteplan.project_id]);

  useEffect(() => {
    muatUnit();
  }, [muatUnit, kavling]);

  const bentuk = useMemo(() => {
    const kav = kavling.filter((k) => k.bentuk).map((k) => ({ id: k.id, jenis: "kavling", k, titik: titikDari(k.bentuk) }));
    const fas = fasilitas.map((f) => ({ id: `f:${f.id}`, jenis: "fasilitas", f, titik: titikDari(f.bentuk) }));
    return [...fas, ...kav];
  }, [kavling, fasilitas]);
  const peta = useMemo(() => new Map(bentuk.map((b) => [b.id, b])), [bentuk]);

  // Ukuran dan sudut yang lazim — dasar tebakan baris baru dan penempelan sudut.
  const lazim = useMemo(() => {
    const ukuran = bentuk.filter((b) => b.jenis === "kavling").map((b) => ukuranDari(b.titik));
    const sudut = new Map();
    for (const b of bentuk) {
      if (b.jenis !== "kavling") continue;
      const s = Math.round((((sudutDari(b.titik) % 90) + 90) % 90) * 2) / 2;
      sudut.set(s, (sudut.get(s) || 0) + 1);
    }
    return {
      lebarK: median(ukuran.map((u) => Math.min(u.a, u.b))),
      dalam: median(ukuran.map((u) => Math.max(u.a, u.b))),
      sudut: [...sudut.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s),
    };
  }, [bentuk]);

  const simpul = useMemo(() => bentuk.flatMap((b) => b.titik), [bentuk]);

  const kodeProyek = useMemo(() => new Map(unitProyek.map((u) => [String(u.unit_code).trim().toUpperCase(), u])), [unitProyek]);

  // Awalan bawaan: huruf blok pertama yang belum dipakai di proyek ini. "A"
  // pada proyek yang sudah berjalan hampir pasti bentrok dengan kavling lama.
  const awalanDisarankan = useRef(false);
  useEffect(() => {
    if (awalanDisarankan.current || !unitProyek.length) return;
    awalanDisarankan.current = true;
    const dipakai = new Set(unitProyek.map((u) => String(u.unit_code).trim().toUpperCase().match(/^[A-Z]+/)?.[0]).filter(Boolean));
    const bebas = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((h) => !dipakai.has(h));
    if (bebas) setForm((f) => ({ ...f, awalan: bebas }));
  }, [unitProyek]);
  const belumDigambar = useMemo(() => unitProyek.filter((u) => !u.bentuk).sort((a, b) => urutKode(a.unit_code, b.unit_code)), [unitProyek]);

  /* ---------------- geometri bantu ---------------- */

  function tempel(p, mati) {
    if (mati) return { p, nempel: false };
    const r = 9 / (skala || 1);
    let terbaik = null;
    let jarak = r;
    for (const v of simpul) {
      const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
      if (d < jarak) {
        jarak = d;
        terbaik = v;
      }
    }
    return terbaik ? { p: [terbaik[0], terbaik[1]], nempel: true } : { p, nempel: false };
  }

  function kunciSudut(p1, p2, shift, mati) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const L = Math.hypot(dx, dy);
    if (L < 0.001 || mati) return p2;
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    let target = null;
    if (shift) target = Math.round(a / 15) * 15;
    else {
      for (const s of lazim.sudut) {
        for (const k of [-180, -90, 0, 90, 180]) {
          if (selisihSudut(a, s + k) < 2.5) target = s + k;
        }
      }
    }
    if (target === null) return p2;
    const r = (target * Math.PI) / 180;
    return [p1[0] + Math.cos(r) * L, p1[1] + Math.sin(r) * L];
  }

  function titikAkhir(p1, mentah, e) {
    const t = tempel(mentah, e.altKey);
    return t.nempel ? t.p : kunciSudut(p1, mentah, e.shiftKey, e.altKey);
  }

  function jumlahBawaan(L) {
    if (lazim.lebarK) return Math.max(1, Math.round(L / lazim.lebarK));
    return Math.max(1, Math.round(L / 20));
  }

  /** Draf dengan nilai bawaan terisi — untuk pratinjau saat masih ditarik. */
  const efektif = useMemo(() => {
    if (!draf?.p1 || !draf?.p2) return null;
    const L = Math.hypot(draf.p2[0] - draf.p1[0], draf.p2[1] - draf.p1[1]);
    const jumlah = draf.jenis === "fasilitas" ? 1 : draf.jenis === "sambung" ? draf.unitIds.length : draf.jumlah ?? jumlahBawaan(L);
    const kedalaman = draf.kedalaman ?? (draf.jenis === "fasilitas" ? L * 0.6 : dalamTerakhir.current ?? lazim.dalam ?? (L / jumlah) * 2);
    return { ...draf, jumlah, kedalaman, panjang: L };
  }, [draf, lazim]); // eslint-disable-line react-hooks/exhaustive-deps

  const petak = useMemo(() => (efektif ? petakBaris(efektif) : []), [efektif]);

  const kodeDraf = useMemo(() => {
    if (!efektif || efektif.jenis === "fasilitas") return [];
    if (efektif.jenis === "sambung") {
      const kode = efektif.unitIds.map((id) => unitProyek.find((u) => u.id === id)?.unit_code || "?");
      return form.turun ? [...kode].reverse() : kode;
    }
    return kodeBerurut({ awalan: form.awalan, mulai: form.mulai, jumlah: efektif.jumlah, format: form.format, turun: form.turun });
  }, [efektif, form.awalan, form.mulai, form.format, form.turun, unitProyek]);

  const benturan = useMemo(() => {
    if (!efektif || efektif.jenis !== "baris") return { bentrok: [], sambung: [] };
    const bentrok = [];
    const sambung = [];
    for (const kode of kodeDraf) {
      const u = kodeProyek.get(kode.trim().toUpperCase());
      if (!u) continue;
      if (u.bentuk) bentrok.push(kode);
      else sambung.push(kode);
    }
    return { bentrok, sambung };
  }, [efektif, kodeDraf, kodeProyek]);

  /* ---------------- simpan ---------------- */

  const selesaiMuat = async () => {
    await onBerubah?.();
  };

  async function simpanKavling(items, pesan) {
    setSibuk(true);
    const { data, error } = await supabase.rpc("simpan_kavling", { p_siteplan_id: siteplan.id, p_kavling: items });
    if (error) {
      setSibuk(false);
      toast.gagal(error.message);
      return false;
    }
    await selesaiMuat();
    setSibuk(false);
    if (pesan) toast.sukses(typeof pesan === "function" ? pesan(data) : pesan);
    return true;
  }

  async function simpanDraf() {
    if (!efektif || !petak.length || sibuk) return;
    if (efektif.jenis === "fasilitas") {
      setSibuk(true);
      const { error } = await supabase.from("siteplan_fasilitas").insert({
        siteplan_id: siteplan.id,
        label: form.label.trim() || JENIS_FASILITAS.find((j) => j.value === form.jenis)?.label || "Fasilitas",
        jenis: form.jenis,
        bentuk: keBentuk(petak[0]),
      });
      if (error) {
        setSibuk(false);
        return toast.gagal(error.message);
      }
      await selesaiMuat();
      setSibuk(false);
      toast.sukses("Fasilitas ditambahkan.");
      setDraf(null);
      return;
    }

    if (benturan.bentrok.length) return;
    dalamTerakhir.current = Math.abs(efektif.kedalaman) ? efektif.kedalaman : dalamTerakhir.current;

    let items;
    if (efektif.jenis === "sambung") {
      const ids = form.turun ? [...efektif.unitIds].reverse() : efektif.unitIds;
      items = petak.map((t, i) => ({ id: ids[i], bentuk: keBentuk(t) }));
    } else {
      const atribut = {};
      for (const kunci of ["type", "posisi", "hadap"]) if (form[kunci]) atribut[kunci] = form[kunci];
      atribut.block = form.block || form.awalan.trim() || "";
      if (!atribut.block) delete atribut.block;
      for (const kunci of ["price", "luas_tanah", "luas_bangunan"]) if (form[kunci] !== "" && form[kunci] !== null) atribut[kunci] = String(form[kunci]);
      items = petak.map((t, i) => ({ unit_code: kodeDraf[i], bentuk: keBentuk(t), ...atribut }));
    }

    const ok = await simpanKavling(items, (r) =>
      efektif.jenis === "sambung"
        ? `${items.length} unit ditempatkan di peta.`
        : [`${r?.dibuat || 0} kavling dibuat`, r?.disambung ? `${r.disambung} unit lama disambung` : null].filter(Boolean).join(" · ") + "."
    );
    if (!ok) return;
    if (efektif.jenis === "baris" && !form.turun) setForm((f) => ({ ...f, mulai: Number(f.mulai || 1) + efektif.jumlah }));
    if (efektif.jenis === "sambung") {
      setPilihSambung(new Set());
      setAlat("pilih");
    }
    setDraf(null);
  }

  async function simpanGeser(ids, dx, dy) {
    const kav = [...ids].filter((id) => !id.startsWith("f:") && peta.has(id));
    const fas = [...ids].filter((id) => id.startsWith("f:") && peta.has(id));
    setSibuk(true);
    let galat = null;
    if (kav.length) {
      const { error } = await supabase.rpc("simpan_kavling", {
        p_siteplan_id: siteplan.id,
        p_kavling: kav.map((id) => ({ id, bentuk: keBentuk(geserTitik(peta.get(id).titik, dx, dy)) })),
      });
      galat = error;
    }
    for (const id of fas) {
      if (galat) break;
      const { error } = await supabase
        .from("siteplan_fasilitas")
        .update({ bentuk: keBentuk(geserTitik(peta.get(id).titik, dx, dy)) })
        .eq("id", id.slice(2));
      galat = error;
    }
    if (galat) toast.gagal(galat.message);
    await selesaiMuat();
    setGeser(null);
    setSibuk(false);
  }

  async function putarPilihan(derajat) {
    const daftar = [...terpilih].filter((id) => peta.has(id));
    if (!daftar.length) return;
    const pusat = pusatDari(daftar.flatMap((id) => peta.get(id).titik));
    const kav = daftar.filter((id) => !id.startsWith("f:"));
    const fas = daftar.filter((id) => id.startsWith("f:"));
    setSibuk(true);
    let galat = null;
    if (kav.length) {
      const { error } = await supabase.rpc("simpan_kavling", {
        p_siteplan_id: siteplan.id,
        p_kavling: kav.map((id) => ({ id, bentuk: keBentuk(putarTitik(peta.get(id).titik, derajat, pusat)) })),
      });
      galat = error;
    }
    for (const id of fas) {
      if (galat) break;
      const { error } = await supabase.from("siteplan_fasilitas").update({ bentuk: keBentuk(putarTitik(peta.get(id).titik, derajat, pusat)) }).eq("id", id.slice(2));
      galat = error;
    }
    if (galat) toast.gagal(galat.message);
    await selesaiMuat();
    setSibuk(false);
  }

  async function lepasPilihan() {
    const kav = [...terpilih].filter((id) => !id.startsWith("f:"));
    const fas = [...terpilih].filter((id) => id.startsWith("f:")).map((id) => id.slice(2));
    setSibuk(true);
    const hasil = await Promise.all([
      kav.length ? supabase.from("units").update({ bentuk: null, siteplan_id: null }).in("id", kav) : { error: null },
      fas.length ? supabase.from("siteplan_fasilitas").delete().in("id", fas) : { error: null },
    ]);
    const galat = hasil.find((r) => r.error)?.error;
    await selesaiMuat();
    setSibuk(false);
    setLepas(false);
    if (galat) return toast.gagal(galat.message);
    setTerpilih(new Set());
    toast.sukses(`${kav.length ? `${kav.length} kavling dilepas dari peta` : ""}${kav.length && fas.length ? " · " : ""}${fas.length ? `${fas.length} fasilitas dihapus` : ""}.`);
  }

  /* ---------------- pointer ---------------- */

  function mulaiDraf(p1) {
    setDraf((d) => {
      const templat = d && d.jenis === "sambung" ? { jenis: "sambung", unitIds: d.unitIds } : { jenis: alat === "fasilitas" ? "fasilitas" : "baris" };
      return { ...templat, p1, p2: p1, jumlah: null, kedalaman: null, menggambar: true };
    });
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button === 2) return;
    const svg = svgRef.current;
    const p = keKanvas(svg, e.clientX, e.clientY);
    if (!p) return;
    const peran = e.target.closest?.("[data-peran]")?.dataset || {};
    try {
      bingkai.current.setPointerCapture(e.pointerId);
    } catch {
      /* abaikan */
    }

    if (spasi || alat === "geser" || e.button === 1) {
      interaksi.current = { tipe: "pan", x: e.clientX, y: e.clientY };
      return;
    }

    if ((alat === "baris" || alat === "fasilitas") && efektif) {
      if (peran.peran === "pegangan") {
        interaksi.current = { tipe: "pegangan", nama: peran.nama };
        if (draf.jumlah == null || draf.kedalaman == null) setDraf({ ...draf, jumlah: efektif.jumlah, kedalaman: efektif.kedalaman });
        return;
      }
      if (peran.peran === "draf") {
        interaksi.current = { tipe: "geser-draf", awal: p, asal: { p1: draf.p1, p2: draf.p2 } };
        return;
      }
    }

    if (alat === "baris" || alat === "fasilitas") {
      const p1 = tempel(p, e.altKey).p;
      interaksi.current = { tipe: "gambar", p1, x: e.clientX, y: e.clientY };
      mulaiDraf(p1);
      return;
    }

    // Alat pilih.
    if (peran.peran === "bentuk") {
      const id = peran.id;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        setTerpilih((s) => {
          const baru = new Set(s);
          if (baru.has(id)) baru.delete(id);
          else baru.add(id);
          return baru;
        });
        interaksi.current = null;
        return;
      }
      let pilihan = terpilih;
      if (!terpilih.has(id)) {
        pilihan = new Set([id]);
        setTerpilih(pilihan);
      }
      interaksi.current = { tipe: "geser-pilihan", awal: p, ids: pilihan, x: e.clientX, y: e.clientY, jalan: false };
      return;
    }

    interaksi.current = { tipe: "kotak", awal: p, tambah: e.shiftKey, x: e.clientX, y: e.clientY };
    setKotakPilih({ a: p, b: p });
  }

  function onPointerMove(e) {
    const it = interaksi.current;
    if (!it) return;
    const p = keKanvas(svgRef.current, e.clientX, e.clientY);
    if (!p) return;
    const s = skala || 1;

    if (it.tipe === "pan") {
      pandangan.geser((e.clientX - it.x) / s, (e.clientY - it.y) / s);
      it.x = e.clientX;
      it.y = e.clientY;
    } else if (it.tipe === "gambar") {
      setDraf((d) => (d ? { ...d, p2: titikAkhir(it.p1, p, e) } : d));
    } else if (it.tipe === "pegangan") {
      setDraf((d) => {
        if (!d) return d;
        if (it.nama === "p1") return { ...d, p1: titikAkhir(d.p2, p, e) };
        if (it.nama === "p2") return { ...d, p2: titikAkhir(d.p1, p, e) };
        // Kedalaman: jarak bertanda dari garis depan, searah normalnya.
        const dx = d.p2[0] - d.p1[0];
        const dy = d.p2[1] - d.p1[1];
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const k = (p[0] - d.p1[0]) * nx + (p[1] - d.p1[1]) * ny;
        return { ...d, kedalaman: Math.round(k * 10) / 10 || 0.1 };
      });
    } else if (it.tipe === "geser-draf") {
      const dx = p[0] - it.awal[0];
      const dy = p[1] - it.awal[1];
      setDraf((d) => (d ? { ...d, p1: [it.asal.p1[0] + dx, it.asal.p1[1] + dy], p2: [it.asal.p2[0] + dx, it.asal.p2[1] + dy] } : d));
    } else if (it.tipe === "geser-pilihan") {
      if (!it.jalan && Math.abs(e.clientX - it.x) + Math.abs(e.clientY - it.y) > 3) it.jalan = true;
      if (it.jalan) setGeser({ ids: it.ids, dx: p[0] - it.awal[0], dy: p[1] - it.awal[1] });
    } else if (it.tipe === "kotak") {
      setKotakPilih({ a: it.awal, b: p });
    }
  }

  function onPointerUp(e) {
    const it = interaksi.current;
    interaksi.current = null;
    try {
      bingkai.current.releasePointerCapture(e.pointerId);
    } catch {
      /* abaikan */
    }
    if (!it) return;

    if (it.tipe === "gambar") {
      const pendek = Math.abs(e.clientX - it.x) + Math.abs(e.clientY - it.y) < 6;
      setDraf((d) => {
        if (!d) return d;
        if (pendek) return d.jenis === "sambung" ? { jenis: "sambung", unitIds: d.unitIds } : null;
        const L = Math.hypot(d.p2[0] - d.p1[0], d.p2[1] - d.p1[1]);
        const jumlah = d.jenis === "fasilitas" ? 1 : d.jenis === "sambung" ? d.unitIds.length : jumlahBawaan(L);
        const kedalaman = d.jenis === "fasilitas" ? L * 0.6 : dalamTerakhir.current ?? lazim.dalam ?? (L / jumlah) * 2;
        return { ...d, jumlah, kedalaman, menggambar: false };
      });
    } else if (it.tipe === "geser-pilihan") {
      if (it.jalan && geser) simpanGeser(geser.ids, geser.dx, geser.dy);
      else setGeser(null);
    } else if (it.tipe === "kotak") {
      const k = kotakPilih;
      setKotakPilih(null);
      const kecil = Math.abs(e.clientX - it.x) + Math.abs(e.clientY - it.y) < 5;
      if (kecil) {
        if (!it.tambah) setTerpilih(new Set());
        return;
      }
      if (!k) return;
      const x1 = Math.min(k.a[0], k.b[0]);
      const x2 = Math.max(k.a[0], k.b[0]);
      const y1 = Math.min(k.a[1], k.b[1]);
      const y2 = Math.max(k.a[1], k.b[1]);
      const kena = bentuk.filter((b) => {
        const [cx, cy] = pusatDari(b.titik);
        return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
      });
      setTerpilih((s) => new Set([...(it.tambah ? s : []), ...kena.map((b) => b.id)]));
    }
  }

  /* ---------------- keyboard ---------------- */

  const keadaan = useRef({});
  keadaan.current = { draf, efektif, terpilih, simpanDraf, peta, geser };

  useEffect(() => {
    function ketik(e) {
      // keyup hanya berarti bagi spasi (melepas mode geser). Escape yang ikut
      // diproses saat keyup akan membatalkan draf lalu langsung menutup editor.
      if (e.type === "keyup" && e.key !== " ") return;
      const sasaran = e.target;
      const sedangIsi = sasaran && (sasaran.tagName === "INPUT" || sasaran.tagName === "TEXTAREA" || sasaran.tagName === "SELECT" || sasaran.isContentEditable);
      const st = keadaan.current;
      if (e.key === "Escape") {
        if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-editor])')) return;
        if (st.draf) setDraf(st.draf.jenis === "sambung" && st.draf.p1 ? { jenis: "sambung", unitIds: st.draf.unitIds } : null);
        else if (st.terpilih.size) setTerpilih(new Set());
        else onClose();
        return;
      }
      if (sedangIsi) return;
      if (e.key === " ") {
        e.preventDefault();
        setSpasi(e.type === "keydown");
        return;
      }
      if (e.type !== "keydown" || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "v") setAlat("pilih");
      else if (k === "b") setAlat("baris");
      else if (k === "f") setAlat("fasilitas");
      else if (k === "h") setAlat("geser");
      else if (e.key === "Enter" && st.efektif && !st.draf?.menggambar) st.simpanDraf();
      else if ((e.key === "Delete" || e.key === "Backspace") && st.terpilih.size) {
        e.preventDefault();
        setLepas(true);
      } else if (e.key.startsWith("Arrow") && st.terpilih.size) {
        e.preventDefault();
        const langkah = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -langkah : e.key === "ArrowRight" ? langkah : 0;
        const dy = e.key === "ArrowUp" ? -langkah : e.key === "ArrowDown" ? langkah : 0;
        const ids = st.terpilih;
        setGeser((g) => ({ ids, dx: (g?.dx || 0) + dx, dy: (g?.dy || 0) + dy }));
        clearTimeout(nudge.current);
        nudge.current = setTimeout(() => {
          const g = keadaan.current.geser;
          if (g) simpanGeserRef.current(g.ids, g.dx, g.dy);
        }, 600);
      }
    }
    document.addEventListener("keydown", ketik);
    document.addEventListener("keyup", ketik);
    return () => {
      document.removeEventListener("keydown", ketik);
      document.removeEventListener("keyup", ketik);
      clearTimeout(nudge.current);
    };
  }, [onClose]);

  const simpanGeserRef = useRef(simpanGeser);
  simpanGeserRef.current = simpanGeser;

  useEffect(() => {
    if (alat !== "baris" && alat !== "fasilitas" && draf?.jenis !== "sambung") setDraf(null);
    if (alat === "fasilitas" && draf?.jenis === "baris") setDraf(null);
    if (alat === "baris" && draf?.jenis === "fasilitas") setDraf(null);
  }, [alat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, []);

  // Datang dari "Ubah di editor": kavlingnya dibawa ke tengah.
  useEffect(() => {
    if (fokusId && peta.has(fokusId)) pandangan.fokusKe(pusatDari(peta.get(fokusId).titik), 3);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- render ---------------- */

  const titikTampil = (b) => (geser && geser.ids.has(b.id) ? geserTitik(b.titik, geser.dx, geser.dy) : b.titik);
  const r = 6 / (skala || 1);
  const langkahGrid = [10, 25, 50, 100, 250].find((g) => g * (skala || 1) >= 18) || 500;
  const kursor = spasi || alat === "geser" ? (interaksi.current?.tipe === "pan" ? "grabbing" : "grab") : alat === "pilih" ? "default" : "crosshair";
  const daftarTerpilih = [...terpilih].filter((id) => peta.has(id)).map((id) => peta.get(id));

  return (
    <div role="dialog" aria-modal="true" data-editor aria-label={`Editor ${siteplan.nama}`} className="sp-editor" style={{ position: "fixed", inset: 0, zIndex: 66, background: PAGE_BG, display: "flex", flexDirection: "column" }}>
      {/* ---------- Bilah atas ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: SURFACE, borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, marginRight: 6 }}>
          <div style={{ fontSize: 11.5, color: TEXT_MID }}>Editor siteplan · {proyek?.name}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_DARK }}>{siteplan.nama}</div>
        </div>

        <div role="toolbar" aria-label="Alat" style={{ display: "flex", gap: 3, background: "#F1F4F9", borderRadius: 12, padding: 3 }}>
          {ALAT.map((a) => {
            const aktif = alat === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setAlat(a.key)}
                aria-pressed={aktif}
                title={`${a.label} (${a.pintas})`}
                style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "none", background: aktif ? SURFACE : "transparent", boxShadow: aktif ? "0 1px 3px rgba(15,42,92,0.14)" : "none", color: aktif ? TEXT_DARK : TEXT_MID, fontSize: 12.5, fontWeight: aktif ? 600 : 500, cursor: "pointer" }}
              >
                <a.ikon size={15} />
                <span className="sp-label-alat">{a.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <IkonTombol label="Perbesar" onClick={() => pandangan.zoomDi(1.35)} ikon={ZoomIn} />
          <IkonTombol label="Perkecil" onClick={() => pandangan.zoomDi(1 / 1.35)} ikon={ZoomOut} />
          <IkonTombol label="Seluruh kanvas" onClick={pandangan.reset} ikon={Maximize2} />
        </div>

        {siteplan.gambar_url && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: TEXT_MID }}>
            Gambar latar
            <input type="range" min="0" max="1" step="0.05" value={opasitas} onChange={(e) => setOpasitas(Number(e.target.value))} aria-label="Kejelasan gambar latar" style={{ width: 90 }} />
          </label>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {sibuk && <span style={{ fontSize: 12, color: TEXT_MID }}>Menyimpan…</span>}
          {onPengaturan && (
            <button type="button" onClick={onPengaturan} style={gayaTombol}>
              <Settings2 size={14} /> Pengaturan
            </button>
          )}
          <button type="button" onClick={onClose} style={{ ...gayaTombol, background: PRIMARY, color: "#fff", borderColor: PRIMARY }}>
            <Check size={14} /> Selesai
          </button>
        </div>
      </div>

      <div className="sp-editor-isi">
        {/* ---------- Kanvas ---------- */}
        <div
          ref={bingkai}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, background: "#E9EDF4", cursor: kursor, touchAction: "none", userSelect: "none", overflow: "hidden" }}
        >
          <svg ref={svgRef} viewBox={pandangan.viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }} aria-label="Kanvas siteplan">
            <defs>
              <pattern id="sp-grid" width={langkahGrid} height={langkahGrid} patternUnits="userSpaceOnUse">
                <path d={`M ${langkahGrid} 0 L 0 0 0 ${langkahGrid}`} fill="none" stroke="#E6EAF1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={lebar} height={tinggi} fill="#fff" />
            <rect x="0" y="0" width={lebar} height={tinggi} fill="url(#sp-grid)" />
            {siteplan.gambar_url && (
              <image href={siteplan.gambar_url} x="0" y="0" width={lebar} height={tinggi} preserveAspectRatio="none" opacity={opasitas} style={{ pointerEvents: "none" }} />
            )}
            <rect x="0" y="0" width={lebar} height={tinggi} fill="none" stroke="#C7D3EA" strokeWidth="1" vectorEffect="non-scaling-stroke" />

            {bentuk.map((b) => {
              const t = titikTampil(b);
              const poin = keBentuk(t);
              const g =
                b.jenis === "fasilitas"
                  ? GAYA_FASILITAS[b.f.jenis] || GAYA_FASILITAS.fasum
                  : MODE_PETA.status.kategori.find((c) => c.key === b.k.status)?.gaya || MODE_PETA.status.kategori[0].gaya;
              const [cx, cy] = pusatDari(t);
              const { a, b: bb } = ukuranDari(t);
              const font = Math.max(2.5, Math.min(a, bb) * 0.34);
              const label = b.jenis === "fasilitas" ? b.f.label : b.k.unit_code;
              return (
                <g key={b.id}>
                  <polygon
                    data-peran="bentuk"
                    data-id={b.id}
                    points={poin}
                    fill={g.isi}
                    fillOpacity={siteplan.gambar_url ? 0.7 : 0.9}
                    stroke={g.garis}
                    strokeWidth={0.9}
                    strokeDasharray={g.putus ? "4 2.5" : undefined}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: alat === "pilih" && !spasi ? "move" : "inherit" }}
                  />
                  {font * (skala || 1) >= 7 && (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" style={{ font: `600 ${font}px system-ui, sans-serif`, fill: g.teks, pointerEvents: "none" }}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}

            {daftarTerpilih.map((b) => (
              <polygon key={`s-${b.id}`} points={keBentuk(titikTampil(b))} fill="none" stroke={ACCENT} strokeWidth={2.4} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
            ))}

            {/* Draf baris */}
            {efektif && petak.length > 0 && (
              <g>
                {petak.map((t, i) => {
                  const [cx, cy] = pusatDari(t);
                  const { a, b: bb } = ukuranDari(t);
                  const font = Math.max(2.5, Math.min(a, bb) * 0.34);
                  const bentrok = efektif.jenis === "baris" && benturan.bentrok.includes(kodeDraf[i]);
                  return (
                    <g key={i}>
                      <polygon
                        data-peran="draf"
                        points={keBentuk(t)}
                        fill={bentrok ? "#FBE9E8" : efektif.jenis === "fasilitas" ? "#E8EDF7" : ACCENT_SOFT}
                        fillOpacity={0.85}
                        stroke={bentrok ? NEGATIVE : ACCENT}
                        strokeWidth={1.4}
                        strokeDasharray="5 3"
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: "move" }}
                      />
                      {font * (skala || 1) >= 6 && (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" style={{ font: `700 ${font}px system-ui, sans-serif`, fill: bentrok ? NEGATIVE : ACCENT_DARK, pointerEvents: "none" }}>
                          {efektif.jenis === "fasilitas" ? form.label || "Fasilitas" : kodeDraf[i]}
                        </text>
                      )}
                    </g>
                  );
                })}
                <line x1={efektif.p1[0]} y1={efektif.p1[1]} x2={efektif.p2[0]} y2={efektif.p2[1]} stroke={ACCENT_DARK} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                {!efektif.menggambar &&
                  (() => {
                    const dx = efektif.p2[0] - efektif.p1[0];
                    const dy = efektif.p2[1] - efektif.p1[1];
                    const L = Math.hypot(dx, dy) || 1;
                    const tengah = [(efektif.p1[0] + efektif.p2[0]) / 2 + (-dy / L) * efektif.kedalaman, (efektif.p1[1] + efektif.p2[1]) / 2 + (dx / L) * efektif.kedalaman];
                    return [
                      ["p1", efektif.p1, "Ujung awal"],
                      ["p2", efektif.p2, "Ujung akhir"],
                      ["dalam", tengah, "Kedalaman"],
                    ].map(([nama, [x, y], judul]) => (
                      <circle key={nama} data-peran="pegangan" data-nama={nama} cx={x} cy={y} r={r} fill="#fff" stroke={ACCENT_DARK} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: nama === "dalam" ? "ns-resize" : "move" }}>
                        <title>{judul}</title>
                      </circle>
                    ));
                  })()}
              </g>
            )}

            {kotakPilih && (
              <rect
                x={Math.min(kotakPilih.a[0], kotakPilih.b[0])}
                y={Math.min(kotakPilih.a[1], kotakPilih.b[1])}
                width={Math.abs(kotakPilih.b[0] - kotakPilih.a[0])}
                height={Math.abs(kotakPilih.b[1] - kotakPilih.a[1])}
                fill="rgba(15,42,92,0.06)"
                stroke={PRIMARY}
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "none" }}
              />
            )}
          </svg>

          <div style={{ position: "absolute", left: 12, bottom: 10, right: 12, display: "flex", justifyContent: "space-between", gap: 10, pointerEvents: "none", flexWrap: "wrap" }}>
            <span style={gayaPetunjuk}>{petunjuk(alat, efektif, draf)}</span>
            <span style={gayaPetunjuk}>
              {kavling.filter((k) => k.bentuk).length} kavling · zoom {Math.round(pandangan.zoom * 100)}%
            </span>
          </div>
        </div>

        {/* ---------- Inspektor ---------- */}
        <aside className="sp-inspektor" aria-label="Inspektor">
          {efektif && !efektif.menggambar ? (
            <InspektorDraf
              efektif={efektif}
              form={form}
              setForm={setForm}
              setDraf={setDraf}
              kodeDraf={kodeDraf}
              benturan={benturan}
              sibuk={sibuk}
              onSimpan={simpanDraf}
              onBatal={() => setDraf(draf?.jenis === "sambung" ? { jenis: "sambung", unitIds: draf.unitIds } : null)}
            />
          ) : draf?.jenis === "sambung" ? (
            <Kotak judul={`Tempatkan ${draf.unitIds.length} unit`}>
              <p style={teksBantu}>
                Tarik garis sepanjang sisi depan tempat unit-unit ini berada. Urutannya mengikuti kode: {draf.unitIds.map((id) => unitProyek.find((u) => u.id === id)?.unit_code).join(", ")}.
              </p>
              <button type="button" onClick={() => setDraf(null)} style={gayaTombol}>
                Batal
              </button>
            </Kotak>
          ) : daftarTerpilih.length ? (
            <InspektorPilihan
              key={daftarTerpilih.map((b) => b.id).join(",")}
              daftar={daftarTerpilih}
              siteplan={siteplan}
              sibuk={sibuk}
              setSibuk={setSibuk}
              onPutar={putarPilihan}
              onLepas={() => setLepas(true)}
              onSimpanKavling={simpanKavling}
              onBerubah={selesaiMuat}
            />
          ) : (
            <InspektorKosong
              alat={alat}
              setAlat={setAlat}
              belumDigambar={belumDigambar}
              pilihSambung={pilihSambung}
              setPilihSambung={setPilihSambung}
              onSambung={(ids) => {
                setAlat("baris");
                setDraf({ jenis: "sambung", unitIds: ids });
              }}
              jumlahKavling={kavling.filter((k) => k.bentuk).length}
            />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={lepas}
        title={`Lepas ${daftarTerpilih.length} bentuk dari peta?`}
        message="Kavling hanya dilepas dari gambar — unitnya tetap ada di Proyek beserta status, konsumen, dan pembayarannya, dan bisa ditempatkan lagi kapan saja. Fasilitas yang dipilih dihapus."
        warning={daftarTerpilih.some((b) => b.jenis === "kavling" && b.k.status !== "tersedia") ? "Sebagian kavling sudah booking atau terjual — kavling itu akan hilang dari peta penjualan sampai ditempatkan lagi." : undefined}
        confirmLabel="Lepas dari peta"
        busy={sibuk}
        onCancel={() => setLepas(false)}
        onConfirm={lepasPilihan}
      />
    </div>
  );
}

function petunjuk(alat, efektif, draf) {
  if (efektif?.menggambar) return "Lepaskan untuk selesai · Shift: kunci 15° · Alt: tanpa tempel";
  if (efektif) return "Seret titik putih untuk menyesuaikan · seret baris untuk memindah · Enter untuk simpan";
  if (draf?.jenis === "sambung" || alat === "baris") return "Tarik garis sepanjang sisi DEPAN baris kavling · ujung menempel ke sudut kavling terdekat";
  if (alat === "fasilitas") return "Tarik garis sepanjang satu sisi fasilitas, lalu atur kedalamannya";
  if (alat === "geser") return "Seret untuk menggeser · Ctrl/⌘ + gulir untuk memperbesar";
  return "Klik untuk memilih · Shift+klik menambah · seret area kosong untuk memilih banyak · Spasi+seret menggeser";
}

/* ============================================================
   Inspektor
   ============================================================ */

function InspektorDraf({ efektif, form, setForm, setDraf, kodeDraf, benturan, sibuk, onSimpan, onBatal }) {
  const ubah = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fasilitas = efektif.jenis === "fasilitas";
  const sambung = efektif.jenis === "sambung";
  const ringkasKode = kodeDraf.length > 2 ? `${kodeDraf[0]} – ${kodeDraf[kodeDraf.length - 1]}` : kodeDraf.join(", ");

  return (
    <Kotak judul={fasilitas ? "Fasilitas baru" : sambung ? `Tempatkan ${efektif.jumlah} unit` : `Baris ${efektif.jumlah} kavling`}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {!fasilitas && !sambung && (
          <Field label="Jumlah kavling">
            <input type="number" min="1" max="200" value={efektif.jumlah} onChange={(e) => setDraf((d) => ({ ...d, jumlah: Math.max(1, Math.min(200, Number(e.target.value) || 1)) }))} />
          </Field>
        )}
        <Field label="Kedalaman" hint="satuan kanvas" style={fasilitas || sambung ? { gridColumn: "1 / -1" } : undefined}>
          <div style={{ display: "flex", gap: 6, padding: 0, border: "none" }}>
            <input
              type="number"
              step="0.5"
              value={Math.round(Math.abs(efektif.kedalaman) * 10) / 10}
              onChange={(e) => setDraf((d) => ({ ...d, kedalaman: Math.sign(efektif.kedalaman || 1) * Math.max(0.5, Number(e.target.value) || 0.5) }))}
              style={{ ...gayaInputKecil, flex: 1 }}
              aria-label="Kedalaman"
            />
            <button type="button" onClick={() => setDraf((d) => ({ ...d, kedalaman: -efektif.kedalaman }))} title="Balik sisi" aria-label="Balik sisi" style={{ ...gayaTombol, padding: "0 9px" }}>
              <FlipVertical2 size={14} />
            </button>
          </div>
        </Field>
      </div>

      {fasilitas ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <Field label="Nama" style={{ gridColumn: "1 / -1" }}>
            <input value={form.label} onChange={ubah("label")} placeholder="mis. Masjid, Taman Bermain" />
          </Field>
          <Field label="Jenis" style={{ gridColumn: "1 / -1" }}>
            <select value={form.jenis} onChange={ubah("jenis")}>
              {JENIS_FASILITAS.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : sambung ? (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: TEXT_DARK, marginTop: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={form.turun} onChange={(e) => setForm((f) => ({ ...f, turun: e.target.checked }))} />
          Balik urutan ({ringkasKode})
        </label>
      ) : (
        <>
          <div style={subJudul}>Kode</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Awalan">
              <input value={form.awalan} onChange={ubah("awalan")} placeholder="A" />
            </Field>
            <Field label="Mulai dari">
              <input type="number" value={form.mulai} onChange={ubah("mulai")} />
            </Field>
            <Field label="Format">
              <select value={form.format} onChange={ubah("format")}>
                {FORMAT_KODE.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: TEXT_DARK, marginTop: 18, cursor: "pointer" }}>
              <input type="checkbox" checked={form.turun} onChange={(e) => setForm((f) => ({ ...f, turun: e.target.checked }))} />
              Nomor menurun
            </label>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 8 }}>
            Hasil: <b style={{ color: TEXT_DARK }}>{ringkasKode}</b>
          </div>
          {benturan.bentrok.length > 0 && (
            <div style={{ ...kotakPesan, background: "#FBE9E8", color: "#A6332C" }}>Sudah tergambar: {benturan.bentrok.join(", ")}. Ubah awalan atau nomor mulai.</div>
          )}
          {benturan.sambung.length > 0 && (
            <div style={{ ...kotakPesan, background: PRIMARY_SOFT, color: PRIMARY }}>
              {benturan.sambung.length} kode sudah ada sebagai unit dan akan disambung ke peta — riwayat penjualannya tetap utuh.
            </div>
          )}

          <div style={subJudul}>Atribut (opsional, untuk semua kavling di baris ini)</div>
          <AtributForm nilai={form} ubah={(k, v) => setForm((f) => ({ ...f, [k]: v }))} placeholderBlok={form.awalan} />
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <PrimaryButton onClick={onSimpan} disabled={sibuk || benturan.bentrok.length > 0} style={{ flex: 1 }}>
          {sibuk ? "Menyimpan…" : fasilitas ? "Simpan fasilitas" : sambung ? "Tempatkan" : `Simpan ${efektif.jumlah} kavling`}
        </PrimaryButton>
        <button type="button" onClick={onBatal} style={gayaTombol}>
          Batal
        </button>
      </div>
    </Kotak>
  );
}

function AtributForm({ nilai, ubah, placeholderBlok, beragam = {} }) {
  const ph = (k, bawaan) => (beragam[k] ? "(beragam)" : bawaan);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Blok">
        <input value={nilai.block ?? ""} onChange={(e) => ubah("block", e.target.value)} placeholder={ph("block", placeholderBlok || "")} />
      </Field>
      <Field label="Tipe">
        <input value={nilai.type ?? ""} onChange={(e) => ubah("type", e.target.value)} placeholder={ph("type", "mis. 36/72")} />
      </Field>
      <Field label="Harga" style={{ gridColumn: "1 / -1" }}>
        <InputRupiah value={nilai.price ?? ""} onChange={(v) => ubah("price", v)} onBlur={(_, v) => ubah("price", v)} placeholder={ph("price", "mis. 185jt")} />
      </Field>
      <Field label="Luas tanah (m²)">
        <input type="number" value={nilai.luas_tanah ?? ""} onChange={(e) => ubah("luas_tanah", e.target.value)} placeholder={ph("luas_tanah", "")} />
      </Field>
      <Field label="Luas bangunan (m²)">
        <input type="number" value={nilai.luas_bangunan ?? ""} onChange={(e) => ubah("luas_bangunan", e.target.value)} placeholder={ph("luas_bangunan", "")} />
      </Field>
      <Field label="Posisi">
        <select value={nilai.posisi ?? ""} onChange={(e) => ubah("posisi", e.target.value)}>
          <option value="">{beragam.posisi ? "(beragam)" : "—"}</option>
          {POSISI.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Hadap">
        <select value={nilai.hadap ?? ""} onChange={(e) => ubah("hadap", e.target.value)}>
          <option value="">{beragam.hadap ? "(beragam)" : "—"}</option>
          {HADAP.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

const KOLOM = ["block", "type", "price", "luas_tanah", "luas_bangunan", "posisi", "hadap", "catatan"];

function InspektorPilihan({ daftar, siteplan, sibuk, setSibuk, onPutar, onLepas, onSimpanKavling, onBerubah }) {
  const toast = useToast();
  const kav = daftar.filter((b) => b.jenis === "kavling");
  const fas = daftar.filter((b) => b.jenis === "fasilitas");
  const satu = daftar.length === 1 ? daftar[0] : null;
  const [sudut, setSudut] = useState(1);

  // Nilai bersama: sama di semua kavling → tampil; berbeda → "(beragam)".
  const awal = useMemo(() => {
    const nilai = {};
    const beragam = {};
    for (const k of KOLOM) {
      const vs = new Set(kav.map((b) => (b.k[k] === null || b.k[k] === undefined ? "" : String(b.k[k]))));
      if (vs.size === 1) nilai[k] = [...vs][0];
      else {
        nilai[k] = "";
        beragam[k] = true;
      }
    }
    return { nilai, beragam };
  }, [daftar]); // eslint-disable-line react-hooks/exhaustive-deps

  const [nilai, setNilai] = useState(() => ({ ...awal.nilai, unit_code: satu?.jenis === "kavling" ? satu.k.unit_code : "" }));
  const [diubah, setDiubah] = useState(() => new Set());
  const [fasForm, setFasForm] = useState(() => (satu?.jenis === "fasilitas" ? { label: satu.f.label, jenis: satu.f.jenis } : null));

  const ubah = (k, v) => {
    setNilai((n) => ({ ...n, [k]: v }));
    setDiubah((s) => new Set(s).add(k));
  };

  async function simpan() {
    if (!diubah.size) return;
    if (kav.length === 1) {
      const item = { id: kav[0].id };
      for (const k of diubah) item[k] = nilai[k] === "" || nilai[k] === null ? "" : String(nilai[k]);
      await onSimpanKavling([item], "Kavling disimpan.");
      setDiubah(new Set());
      return;
    }
    const patch = {};
    for (const k of diubah) {
      if (k === "unit_code") continue;
      const v = nilai[k];
      if (["price", "luas_tanah", "luas_bangunan"].includes(k)) patch[k] = v === "" || v === null ? null : Number(v);
      else patch[k] = v === "" ? null : v;
    }
    setSibuk(true);
    const { error } = await supabase.from("units").update(patch).in("id", kav.map((b) => b.id));
    await onBerubah();
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    toast.sukses(`${kav.length} kavling diperbarui.`);
    setDiubah(new Set());
  }

  async function simpanFasilitas() {
    setSibuk(true);
    const { error } = await supabase.from("siteplan_fasilitas").update({ label: fasForm.label.trim() || "Fasilitas", jenis: fasForm.jenis }).eq("id", satu.f.id);
    await onBerubah();
    setSibuk(false);
    if (error) return toast.gagal(error.message);
    toast.sukses("Fasilitas disimpan.");
  }

  const judul = satu ? (satu.jenis === "kavling" ? `Kavling ${satu.k.unit_code}` : satu.f.label) : `${daftar.length} dipilih`;

  return (
    <Kotak judul={judul}>
      {satu?.jenis === "kavling" && (
        <div style={{ marginBottom: 10 }}>
          <Badge value={satu.k.status} />
        </div>
      )}
      {!satu && (
        <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 10 }}>
          {kav.length} kavling{fas.length ? ` · ${fas.length} fasilitas` : ""}. Isian yang diubah berlaku untuk semua kavling terpilih.
        </div>
      )}

      {kav.length > 0 && (
        <>
          {satu && (
            <Field label="Kode kavling" style={{ marginBottom: 10 }}>
              <input value={nilai.unit_code} onChange={(e) => ubah("unit_code", e.target.value)} />
            </Field>
          )}
          <AtributForm nilai={nilai} ubah={ubah} beragam={Object.fromEntries(Object.entries(awal.beragam).filter(([k]) => !diubah.has(k)))} />
          <Field label="Catatan" style={{ marginTop: 10 }}>
            <input value={nilai.catatan ?? ""} onChange={(e) => ubah("catatan", e.target.value)} placeholder={awal.beragam.catatan && !diubah.has("catatan") ? "(beragam)" : "mis. dekat taman, sisa tanah 12 m²"} />
          </Field>
          <PrimaryButton onClick={simpan} disabled={sibuk || !diubah.size} style={{ width: "100%", marginTop: 12 }}>
            {diubah.size ? `Simpan perubahan${kav.length > 1 ? ` (${kav.length} kavling)` : ""}` : "Belum ada perubahan"}
          </PrimaryButton>
        </>
      )}

      {fasForm && (
        <>
          <Field label="Nama">
            <input value={fasForm.label} onChange={(e) => setFasForm((f) => ({ ...f, label: e.target.value }))} />
          </Field>
          <Field label="Jenis" style={{ marginTop: 10 }}>
            <select value={fasForm.jenis} onChange={(e) => setFasForm((f) => ({ ...f, jenis: e.target.value }))}>
              {JENIS_FASILITAS.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </select>
          </Field>
          <PrimaryButton onClick={simpanFasilitas} disabled={sibuk} style={{ width: "100%", marginTop: 12 }}>
            Simpan fasilitas
          </PrimaryButton>
        </>
      )}

      <div style={subJudul}>Posisi</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => onPutar(-sudut)} disabled={sibuk} style={gayaTombol} aria-label={`Putar ${sudut}° berlawanan jarum jam`}>
          <RotateCcw size={14} />
        </button>
        <input type="number" value={sudut} step="0.5" onChange={(e) => setSudut(Number(e.target.value) || 0)} aria-label="Sudut putar (derajat)" style={{ ...gayaInputKecil, width: 64 }} />
        <span style={{ fontSize: 12, color: TEXT_MID }}>°</span>
        <button type="button" onClick={() => onPutar(sudut)} disabled={sibuk} style={gayaTombol} aria-label={`Putar ${sudut}° searah jarum jam`}>
          <RotateCw size={14} />
        </button>
      </div>
      <p style={{ ...teksBantu, marginTop: 8 }}>Seret untuk memindah · panah untuk menggeser 1 satuan (Shift: 10).</p>

      <button type="button" onClick={onLepas} disabled={sibuk} style={{ ...gayaTombol, color: NEGATIVE, marginTop: 6 }}>
        <Unlink size={14} /> {kav.length && !fas.length ? "Lepas dari peta" : "Lepas / hapus"}
      </button>
      <div style={{ fontSize: 11, color: TEXT_MID, marginTop: 10 }}>Siteplan: {siteplan.nama}</div>
    </Kotak>
  );
}

function InspektorKosong({ alat, setAlat, belumDigambar, pilihSambung, setPilihSambung, onSambung, jumlahKavling }) {
  const dipilih = belumDigambar.filter((u) => pilihSambung.has(u.id));
  return (
    <>
      <Kotak judul={jumlahKavling ? "Menggambar kavling" : "Mulai menggambar"}>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: TEXT_DARK, lineHeight: 1.65 }}>
          <li>
            Pilih alat{" "}
            <button type="button" onClick={() => setAlat("baris")} style={gayaTautan}>
              Baris kavling (B)
            </button>
            .
          </li>
          <li>Tarik garis sepanjang sisi depan satu baris rumah pada denah.</li>
          <li>Atur jumlah, kode, dan harga di sini, lalu simpan.</li>
        </ol>
        <p style={{ ...teksBantu, marginTop: 10 }}>
          Ujung garis menempel ke sudut kavling yang sudah ada, dan sudutnya ke kemiringan baris lain — baris berikutnya otomatis rapat dan sejajar.
        </p>
        {alat !== "pilih" && (
          <button type="button" onClick={() => setAlat("pilih")} style={{ ...gayaTombol, marginTop: 4 }}>
            <MousePointer2 size={14} /> Kembali ke Pilih
          </button>
        )}
      </Kotak>

      {belumDigambar.length > 0 && (
        <Kotak judul={`Unit belum di peta (${belumDigambar.length})`}>
          <p style={{ ...teksBantu, marginTop: 0 }}>Unit yang sudah ada di Proyek tetapi belum punya bentuk. Centang beberapa lalu gambar sebagai satu baris — urutannya mengikuti kode.</p>
          <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${BORDER_SOFT}`, borderRadius: 10 }}>
            {belumDigambar.map((u, i) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderTop: i ? `1px solid ${BORDER_SOFT}` : "none", fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pilihSambung.has(u.id)}
                  onChange={(e) =>
                    setPilihSambung((s) => {
                      const baru = new Set(s);
                      if (e.target.checked) baru.add(u.id);
                      else baru.delete(u.id);
                      return baru;
                    })
                  }
                />
                <b style={{ color: TEXT_DARK, minWidth: 44 }}>{u.unit_code}</b>
                <span style={{ color: TEXT_MID, flex: 1 }}>{u.type || "-"}</span>
                <Badge value={u.status} />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!dipilih.length}
            onClick={() => onSambung(dipilih.map((u) => u.id))}
            style={{ ...gayaTombol, marginTop: 10, opacity: dipilih.length ? 1 : 0.5, cursor: dipilih.length ? "pointer" : "default" }}
          >
            <ListPlus size={14} /> Gambar {dipilih.length || ""} unit sebagai baris
          </button>
        </Kotak>
      )}
    </>
  );
}

/* ============================================================
   Potongan kecil
   ============================================================ */

function Kotak({ judul, children }) {
  return (
    <section style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>{judul}</h3>
      {children}
    </section>
  );
}

function IkonTombol({ ikon: Ikon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} style={{ ...gayaTombol, width: 34, height: 34, padding: 0, justifyContent: "center" }}>
      <Ikon size={15} />
    </button>
  );
}

const gayaTombol = {
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const gayaTautan = { font: "inherit", border: "none", background: "none", padding: 0, color: PRIMARY, fontWeight: 600, cursor: "pointer", textDecoration: "underline" };
const gayaInputKecil = { font: "inherit", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, color: TEXT_DARK, background: SURFACE, boxSizing: "border-box", minWidth: 0 };
const gayaPetunjuk = { fontSize: 11.5, color: TEXT_DARK, background: "rgba(255,255,255,0.92)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "4px 9px" };
const teksBantu = { fontSize: 12, color: TEXT_MID, lineHeight: 1.55, margin: "0 0 10px" };
const subJudul = { fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT_MID, margin: "16px 0 8px" };
const kotakPesan = { fontSize: 12, borderRadius: 10, padding: "8px 11px", marginTop: 8, lineHeight: 1.5 };
