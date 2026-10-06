import React, { useEffect, useState } from "react";
import { FolderCheck, Lock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { roleOf } from "../lib/permissions";
import FilterPeriode, { rangeToDates } from "./FilterPeriode";
import { Card, SectionTitle, DataTable, TEXT_MID, TEXT_DARK, PRIMARY, PRIMARY_SOFT, ACCENT_SOFT, ACCENT_DARK, NEGATIVE, BORDER } from "./ui";

/**
 * Laporan penjualan yang dulu menumpuk di bawah Dashboard.
 *
 * Dashboard kini hanya menjawab "bulan ini sudah sampai mana"; yang dibaca
 * sesekali — funnel, durasi tahap, rekap berkas, sumber leads, tabel per agen —
 * tinggal di sini dengan filter periodenya sendiri. Angkanya tetap dari
 * dashboard_stats(), jadi keduanya tidak mungkin berbeda.
 */

function roundDays(v) {
  return v == null ? null : Math.round(Number(v));
}

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString("id-ID")}`;
}

/**
 * Funnel PRD §4.2 — tujuh tahap dalam urutan tetap.
 *
 * Sengaja memakai batang berurutan, bukan donat: yang ingin dilihat adalah di
 * tahap mana prospek berhenti, dan itu hilang begitu tahapnya diurut ulang
 * menurut besaran. Cancel dipisah karena bukan bagian dari alur maju.
 */
function FunnelStrip({ stages, total }) {
  const flow = stages.filter((s) => s.stage !== "cancel");
  const cancel = stages.find((s) => s.stage === "cancel");
  const max = Math.max(1, ...flow.map((s) => s.value));

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {flow.map((s, i) => {
          const prev = i > 0 ? flow[i - 1].value : null;
          const conv = prev ? (s.value / prev) * 100 : null;
          return (
            <div key={s.stage}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, marginBottom: 5, gap: 10 }}>
                <span style={{ fontWeight: 600, color: TEXT_DARK }}>{s.label}</span>
                <span style={{ color: TEXT_MID, whiteSpace: "nowrap" }}>
                  <b style={{ color: TEXT_DARK, fontSize: 13.5 }}>{s.value}</b>
                  {total > 0 && <> · {((s.value / total) * 100).toFixed(0)}% dari total</>}
                  {conv != null && (
                    <> · <span style={{ color: conv < 40 ? ACCENT_DARK : TEXT_MID }}>{conv.toFixed(0)}% lanjut</span></>
                  )}
                </span>
              </div>
              <div style={{ background: PRIMARY_SOFT, borderRadius: 999, height: 10, overflow: "hidden" }}>
                <div
                  style={{
                    background: PRIMARY,
                    height: "100%",
                    width: `${Math.max(s.value > 0 ? 2 : 0, (s.value / max) * 100)}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {cancel && cancel.value > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, fontSize: 12.5, color: TEXT_MID }}>
          <b style={{ color: NEGATIVE }}>{cancel.value}</b> prospek dibatalkan
          {total > 0 && <> · {((cancel.value / total) * 100).toFixed(0)}% dari total</>}
        </div>
      )}
    </div>
  );
}

/**
 * Kartu laporan yang relevan per peran.
 *
 * Sales tidak mengurus antrean Finance, dan Finance tidak mengurus durasi
 * tahap KPR — menampilkan keduanya kepada semua orang membuat halaman jadi
 * panjang tanpa menambah satu pun keputusan yang bisa diambil.
 */
const KARTU_PERAN = {
  sales: { finance: false, kprDurasi: false, berkas: false, agen: true },
  admin_marketing: { finance: true, kprDurasi: true, berkas: true, agen: true },
  finance: { finance: true, kprDurasi: false, berkas: false, agen: false },
  tim_lapangan: { finance: false, kprDurasi: false, berkas: false, agen: false },
};

const SEMUA_KARTU = { finance: true, kprDurasi: true, berkas: true, agen: true };

export default function AnalitikPenjualan() {
  const { profile } = useAuth();
  const kartu = KARTU_PERAN[roleOf(profile)] || SEMUA_KARTU;

  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("month");
  const [custom, setCustom] = useState({ from: "", to: "" });

  useEffect(() => {
    let batal = false;
    const { from, to } = rangeToDates(range, custom);
    supabase.rpc("dashboard_stats", { p_from: from, p_to: to }).then(({ data, error: statsError }) => {
      if (batal) return;
      setError(statsError ? statsError.message : "");
      setStats(data || null);
    });
    // Respons periode lama yang tiba belakangan tidak boleh menimpa yang baru.
    return () => {
      batal = true;
    };
  }, [range, custom.from, custom.to]);

  const s = stats || {};
  const totalLeads = s.total_leads || 0;
  const funnel = (s.funnel || []).map((f) => ({ ...f, value: Number(f.value) }));
  const handover = s.handover || null;
  const finance = s.finance || null;

  const d = s.kpr_durations || {};
  const stageDurations = [
    { label: "Pengumpulan Berkas", value: roundDays(d.berkas) },
    { label: "SP3K → Akad", value: roundDays(d.sp3k_akad) },
    { label: "Persiapan Akad", value: roundDays(d.akad) },
    { label: "Persiapan Serah Terima", value: roundDays(d.serah) },
  ];

  const perAgent = (s.by_agent || []).map((a) => ({ name: a.name, leads: Number(a.leads), deals: Number(a.deals) }));
  const berkasRecap = (s.berkas_recap || []).map((b) => ({ ...b, lama_hari: b.lama_hari == null ? null : Number(b.lama_hari) }));
  const berkasSummary = (s.berkas_summary || []).map((b) => ({ label: b.label, value: Number(b.value) }));

  // Satu daftar, bukan dua: batang sumber leads dan tabel konversinya dulu
  // memuat angka yang persis sama.
  const sourceRows = (s.by_source || []).map((x) => ({
    source: x.source,
    leads: Number(x.leads),
    deals: Number(x.deals),
    rate: Number(x.leads) ? ((Number(x.deals) / Number(x.leads)) * 100).toFixed(1) + "%" : "-",
  }));
  const maxSource = Math.max(1, ...sourceRows.map((x) => x.leads));

  const siapVerifikasi = finance ? Number(finance.siap_verifikasi ?? finance.menunggu_jumlah) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>Analitik Penjualan</div>
          <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 2 }}>Funnel, sumber leads, berkas, dan performa agen</div>
        </div>
        <FilterPeriode range={range} onRange={setRange} custom={custom} onCustom={setCustom} />
      </div>

      {error && (
        <Card style={{ borderColor: "#F2D3D1" }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>
            Gagal memuat analitik: {error}. Pastikan migrasi Supabase sudah dijalankan sampai{" "}
            <code>migration_010_dashboard_and_ads.sql</code>.
          </div>
        </Card>
      )}

      <div className="chart-row" style={{ alignItems: "start" }}>
        {/* Ditambahkan migration_010; sebelum migrasi itu jalan, kartunya tidak dirender. */}
        {funnel.length > 0 && (
          <Card>
            <SectionTitle title="Funnel Penjualan" action={<span style={{ fontSize: 12, color: TEXT_MID }}>{totalLeads} prospek</span>} />
            <FunnelStrip stages={funnel} total={totalLeads} />

            {handover && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  marginTop: 16,
                  padding: "11px 14px",
                  background: ACCENT_SOFT,
                  borderRadius: 12,
                  fontSize: 12.5,
                  color: ACCENT_DARK,
                  lineHeight: 1.5,
                }}
              >
                <Lock size={15} style={{ flexShrink: 0 }} />
                <span>
                  <b>{handover.terkunci}</b> konsumen sudah diserahkan ke Admin Marketing (kuitansi Booking Fee tervalidasi) ·{" "}
                  <b>{handover.sales}</b> masih dipegang Sales
                </span>
              </div>
            )}
          </Card>
        )}

        <Card>
          <SectionTitle title="Sumber Leads" action={<span style={{ fontSize: 12, color: TEXT_MID }}>leads · deal · konversi</span>} />
          {sourceRows.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data sumber leads.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {sourceRows.map((x) => (
              <div key={x.source}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5, gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>{x.source}</span>
                  <span style={{ color: TEXT_MID, whiteSpace: "nowrap" }}>
                    <b style={{ color: TEXT_DARK }}>{x.leads}</b> · {x.deals} · {x.rate}
                  </span>
                </div>
                <div style={{ background: PRIMARY_SOFT, borderRadius: 999, height: 9, overflow: "hidden" }}>
                  <div style={{ background: PRIMARY, height: "100%", width: `${(x.leads / maxSource) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {kartu.finance && (
        <Card>
          <SectionTitle title="Antrean Finance" />
          {!finance ? (
            <div style={{ fontSize: 13, color: TEXT_MID }}>
              Jalankan <code>migration_010_dashboard_and_ads.sql</code> untuk menampilkan ringkasan ini.
            </div>
          ) : (
            <>
              {/* Dua lapis sejak migrasi 017: yang buktinya sudah lengkap
                  adalah pekerjaan Finance hari ini; yang belum berbukti masih
                  pekerjaan Admin Marketing, dan menggabungkan keduanya membuat
                  angka di kartu ini tidak bisa ditindaklanjuti siapa pun. */}
              <div className="rg-2">
                <div style={{ padding: "14px 16px", background: siapVerifikasi > 0 ? ACCENT_SOFT : PRIMARY_SOFT, borderRadius: 14 }}>
                  <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>Siap diverifikasi — bukti transfer lengkap</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: siapVerifikasi > 0 ? ACCENT_DARK : TEXT_DARK }}>
                    {siapVerifikasi}
                    <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_MID }}> pembayaran</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: TEXT_MID, marginTop: 3 }}>
                    {rupiah(finance.menunggu_nominal)} total belum tervalidasi
                    {finance.tanpa_bukti != null && ` · ${finance.tanpa_bukti} belum ada bukti transfer`}
                  </div>
                </div>

                <div style={{ padding: "14px 16px", background: PRIMARY_SOFT, borderRadius: 14 }}>
                  <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>Tervalidasi pada periode ini</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{rupiah(finance.terverifikasi_nominal)}</div>
                </div>
              </div>

              {/* Setelah migration_008 ini seharusnya selalu nol; kalau tidak,
                  itu baris lama yang lolos sebelum aturan kuitansi berlaku. */}
              {Number(finance.tanpa_kuitansi) > 0 && (
                <div style={{ fontSize: 12, color: NEGATIVE, lineHeight: 1.5, marginTop: 12 }}>
                  {finance.tanpa_kuitansi} pembayaran berstatus tervalidasi tetapi tidak punya kuitansi — perlu dirapikan.
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {kartu.kprDurasi && (
        <Card>
          <SectionTitle title="Rata-rata Durasi per Tahap KPR" action={<span style={{ fontSize: 12, color: TEXT_MID }}>dalam hari</span>} />
          <div className="rg-4">
            {stageDurations.map((x) => (
              <div key={x.label} style={{ padding: "14px 16px", background: PRIMARY_SOFT, borderRadius: 14 }}>
                <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>{x.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {x.value != null ? `${x.value.toFixed(0)}` : "-"}
                  {x.value != null && <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_MID }}> hari</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {kartu.berkas && (
        <div className="chart-row">
          <Card>
            <SectionTitle
              title="Konsumen Sedang Mengumpulkan Berkas"
              action={<span style={{ fontSize: 12, color: TEXT_MID }}>{berkasRecap.length} konsumen</span>}
            />
            <DataTable
              emptyLabel="Tidak ada konsumen yang sedang dalam proses berkas."
              columns={[
                { key: "name", label: "Konsumen" },
                { key: "progres", label: "Progres Berkas", render: (r) => r.progres || "-" },
                { key: "bank", label: "Bank", render: (r) => r.bank || "-" },
                {
                  key: "masuk_bank",
                  label: "Masuk Bank",
                  render: (r) => (r.masuk_bank ? new Date(`${r.masuk_bank}T00:00:00`).toLocaleDateString("id-ID") : "-"),
                },
                {
                  key: "lama_hari",
                  label: "Lama",
                  render: (r) =>
                    r.lama_hari == null ? (
                      "-"
                    ) : (
                      // Anything sitting past 60 days at the bank is the thing a
                      // supervisor actually wants to spot on this screen.
                      <span style={{ fontWeight: 600, color: r.lama_hari > 60 ? "#C2413B" : r.lama_hari > 30 ? "#B45309" : PRIMARY }}>
                        {r.lama_hari} hari
                      </span>
                    ),
                },
              ]}
              rows={berkasRecap}
            />
          </Card>

          <Card>
            <SectionTitle title="Progres Berkas" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {berkasSummary.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data berkas.</div>}
              {berkasSummary.map((b) => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <FolderCheck size={15} color={PRIMARY} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, color: TEXT_MID }}>{b.label}</span>
                  <span style={{ fontWeight: 700 }}>{b.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {kartu.agen && (
        <Card>
          <SectionTitle title="Performa per Agen" action={<span style={{ fontSize: 12, color: TEXT_MID }}>{perAgent.length} agen</span>} />
          <DataTable
            emptyLabel="Belum ada data agen."
            columns={[
              { key: "name", label: "Agen" },
              { key: "leads", label: "Prospek" },
              { key: "deals", label: "Deal" },
              {
                key: "rate",
                label: "Closing Rate",
                render: (row) => (row.leads ? `${((row.deals / row.leads) * 100).toFixed(0)}%` : "-"),
              },
            ]}
            rows={perAgent}
          />
        </Card>
      )}
    </div>
  );
}
