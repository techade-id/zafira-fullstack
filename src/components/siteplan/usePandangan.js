import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Geser dan perbesar peta lewat viewBox, bukan CSS transform.
 *
 * Versi lama menskalakan <svg> dengan transform: garis ikut menebal saat
 * diperbesar, dan koordinat klik tidak lagi bisa diterjemahkan ke koordinat
 * kanvas — padahal editor justru hidup dari terjemahan itu. Dengan viewBox,
 * getScreenCTM() selalu benar dan garis tetap setipis yang dimaksud.
 */

export const ZOOM_MAKS = 10;

export function keKanvas(svg, clientX, clientY) {
  if (!svg) return null;
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(m.inverse());
  return [p.x, p.y];
}

/** Skala piksel per satuan kanvas pada pandangan sekarang. */
export function skalaLayar(svg) {
  const m = svg?.getScreenCTM();
  return m ? m.a : 1;
}

export function usePandangan(lebar, tinggi) {
  const awal = useCallback(() => ({ x: 0, y: 0, w: lebar, h: tinggi }), [lebar, tinggi]);
  const [vb, setVb] = useState(awal);

  useEffect(() => {
    setVb(awal());
  }, [awal]);

  const batasi = useCallback(
    (v) => {
      const w = Math.min(lebar, Math.max(lebar / ZOOM_MAKS, v.w));
      const h = (w * tinggi) / lebar;
      if (w >= lebar - 0.001) return { x: 0, y: 0, w: lebar, h: tinggi };
      // Sedikit kelonggaran di tepi supaya kavling paling pinggir bisa dibawa
      // ke tengah layar, tanpa membiarkan peta hilang sama sekali.
      const mx = w * 0.2;
      const my = h * 0.2;
      return {
        x: Math.min(Math.max(v.x, -mx), lebar - w + mx),
        y: Math.min(Math.max(v.y, -my), tinggi - h + my),
        w,
        h,
      };
    },
    [lebar, tinggi]
  );

  /** Memperbesar dengan titik kanvas [px, py] tetap di tempatnya di layar. */
  const zoomDi = useCallback(
    (faktor, titik) => {
      setVb((v) => {
        const [px, py] = titik || [v.x + v.w / 2, v.y + v.h / 2];
        const w = Math.min(lebar, Math.max(lebar / ZOOM_MAKS, v.w / faktor));
        const h = (w * tinggi) / lebar;
        const rx = (px - v.x) / v.w;
        const ry = (py - v.y) / v.h;
        return batasi({ x: px - rx * w, y: py - ry * h, w, h });
      });
    },
    [batasi, lebar, tinggi]
  );

  const geser = useCallback((dx, dy) => setVb((v) => batasi({ ...v, x: v.x - dx, y: v.y - dy })), [batasi]);

  const fokusKe = useCallback(
    ([cx, cy], zoom = 3) => {
      const w = lebar / Math.min(ZOOM_MAKS, Math.max(1, zoom));
      const h = (w * tinggi) / lebar;
      setVb(batasi({ x: cx - w / 2, y: cy - h / 2, w, h }));
    },
    [batasi, lebar, tinggi]
  );

  const reset = useCallback(() => setVb(awal()), [awal]);

  return { vb, viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`, zoom: lebar / vb.w, zoomDi, geser, fokusKe, reset };
}

/**
 * Gulir roda untuk memperbesar.
 *
 * Dipasang sebagai pendengar native non-pasif: React mendaftarkan onWheel
 * sebagai pasif, sehingga preventDefault() di sana diabaikan — dan Ctrl+gulir
 * malah memperbesar seluruh halaman browser.
 *
 * `selaluZoom`: di peta biasa roda tanpa Ctrl tetap menggulir halaman (supaya
 * peta tidak menjebak gulir). Di editor yang memenuhi layar, roda menggeser
 * peta dan Ctrl/⌘ (atau cubit trackpad) memperbesar.
 */
export function useRodaPeta(ref, svgRef, pandangan, { layarPenuh = false } = {}) {
  const p = useRef(pandangan);
  p.current = pandangan;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    function onWheel(e) {
      const zoom = e.ctrlKey || e.metaKey;
      if (!zoom && !layarPenuh) return;
      e.preventDefault();
      const svg = svgRef.current;
      if (zoom) {
        const titik = keKanvas(svg, e.clientX, e.clientY);
        p.current.zoomDi(Math.exp(-e.deltaY * 0.0022), titik);
      } else {
        const s = skalaLayar(svg) || 1;
        p.current.geser(-e.deltaX / s, -e.deltaY / s);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, svgRef, layarPenuh]);
}

/**
 * Seret untuk menggeser, cubit dua jari untuk memperbesar.
 *
 * Penangkapan pointer baru dipasang setelah seretan melewati ambang. Bila
 * dipasang sejak pointerdown, klik pada kavling ikut tertangkap pembungkus
 * dan kavlingnya tidak pernah menerima klik.
 */
export function useSeretPeta(svgRef, pandangan, { aktif = true } = {}) {
  const pointer = useRef(new Map());
  const seret = useRef(null);
  const baruSaja = useRef(false);
  const p = useRef(pandangan);
  p.current = pandangan;

  function onPointerDown(e) {
    if (!aktif) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    pointer.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointer.current.size === 1) {
      seret.current = { id: e.pointerId, x: e.clientX, y: e.clientY, jalan: false, el: e.currentTarget };
    }
  }

  function onPointerMove(e) {
    if (!pointer.current.has(e.pointerId)) return;
    const lama = pointer.current.get(e.pointerId);
    pointer.current.set(e.pointerId, [e.clientX, e.clientY]);
    const svg = svgRef.current;

    if (pointer.current.size === 2) {
      const [a, b] = [...pointer.current.values()];
      const lainId = [...pointer.current.keys()].find((k) => k !== e.pointerId);
      const lain = pointer.current.get(lainId);
      const jarakLama = Math.hypot(lama[0] - lain[0], lama[1] - lain[1]);
      const jarakBaru = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (jarakLama > 0) {
        const tengah = keKanvas(svg, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        p.current.zoomDi(jarakBaru / jarakLama, tengah);
      }
      if (seret.current) seret.current.jalan = true;
      return;
    }

    const s = seret.current;
    if (!s || s.id !== e.pointerId) return;
    if (!s.jalan && Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 4) {
      s.jalan = true;
      try {
        s.el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer sudah dilepas */
      }
    }
    if (s.jalan) {
      const skala = skalaLayar(svg) || 1;
      p.current.geser((e.clientX - lama[0]) / skala, (e.clientY - lama[1]) / skala);
    }
  }

  function onPointerUp(e) {
    pointer.current.delete(e.pointerId);
    if (seret.current?.jalan) {
      // Klik yang menyusul seretan bukan klik — jangan buka panel kavling.
      baruSaja.current = true;
      setTimeout(() => {
        baruSaja.current = false;
      }, 0);
    }
    if (pointer.current.size === 0) seret.current = null;
  }

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    /** true sesaat setelah seretan berakhir — pemanggil mengabaikan klik. */
    baruDiseret: () => baruSaja.current,
    sedangSeret: () => Boolean(seret.current?.jalan),
  };
}

/**
 * Piksel per satuan kanvas, dibaca ulang setiap viewBox atau ukuran wadah
 * berubah. Dipakai untuk memutuskan kapan label kavling cukup besar untuk
 * dibaca — 158 label sekaligus pada tampilan penuh justru menutupi petanya.
 */
export function useSkalaLayar(svgRef, viewBox) {
  const [skala, setSkala] = useState(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const baca = () => {
      const m = svg.getScreenCTM();
      if (m) setSkala(m.a);
    };
    baca();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(baca) : null;
    ro?.observe(svg);
    return () => ro?.disconnect();
  }, [svgRef, viewBox]);
  return skala;
}
