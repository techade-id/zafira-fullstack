import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { roleOf } from "../lib/permissions";
import FokusHariIni from "../components/FokusHariIni";
import {
  Card,
  SectionTitle,
  DataTable,
  StatCard,
  BarChart,
  ListRow,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  PRIMARY_SOFT,
  ACCENT_SOFT,
  ACCENT_DARK,
  NEGATIVE,
  BORDER,
} from "../components/ui";
import { Users, Handshake, TrendingUp, Home, Wallet, MessageSquareWarning, FolderCheck, Lock, ChevronDown } from "lucide-react";

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * BRIEF §Dashboard: "menginginkan filter yang lebih spesifik berdasarkan bulan
 * berjalan (mis. beberapa prospect bulan ini, berapa booking, berapa akad)".
 *
 * Bulan berjalan didahulukan dan menjadi bawaan. "Semua" tetap ada, tetapi ia
 * bukan pertanyaan yang ditanyakan setiap pagi — yang ditanyakan setiap pagi
 * adalah bulan ini sudah sampai mana.
 */
const RANGES = [
  { key: "month", label: "Bulan ini" },
  { key: "7", label: "7 hari" },
  { key: "30", label: "30 hari" },
  { key: "all", label: "Semua" },
  { key: "custom", label: "Kustom" },
];

/**
 * Hitungan per prosedur — BRIEF §Dashboard: "Untuk bagian filter prosedurnya
 * berapa, lalu bookingnya berapa dll yang berada di dashboard".
 *
 * Dihitung dari tanggal peristiwanya, bukan tanggal prospek dibuat: akad bulan
 * ini nyaris tidak pernah berasal dari prospek bulan ini.
 */
const PROSEDUR = [
  { key: "prospek_baru", label: "Prospek Baru" },
  { key: "follow_up", label: "Follow Up" },
  { key: "survei", label: "Survei" },
  { key: "bi_checking", label: "BI-Checking" },
  { key: "booking", label: "Booking" },
  { key: "masuk_bank", label: "Masuk Bank" },
  { key: "sp3k", label: "SP3K Terbit" },
  { key: "akad", label: "Akad" },
  { key: "serah_terima", label: "Serah Terima" },
  { key: "batal", label: "Batal", negatif: true },
];

function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Turn the selected preset into the {from,to} the RPC expects. */
function rangeToDates(key, custom) {
  const today = new Date();
  if (key === "all") return { from: null, to: null };
  if (key === "custom") return { from: custom.from || null, to: custom.to || null };
  if (key === "month") {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  }
  const back = new Date(today);
  back.setDate(today.getDate() - Number(key));
  return { from: iso(back), to: iso(today) };
}

/** Percent change of `current` vs `previous`, or null when there's no baseline. */
function trendOf(current, previous) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  return { up: pct >= 0, label: `${Math.abs(pct).toFixed(0)}%` };
}

/** "2026-07-27" -> "Sen". Parsed as local time so the label can't slip a day. */
function dayLabel(isoDate) {
  return DAY_LABELS[new Date(`${isoDate}T00:00:00`).getDay()];
}

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
 * Hitungan per prosedur pada periode terpilih.
 *
 * BRIEF §Dashboard meminta dua hal sekaligus: "prosedurnya berapa, bookingnya
 * berapa dll", dan tampilan yang lebih ringkas. Sepuluh kartu statistik penuh
 * akan mengingkari yang kedua demi yang pertama — jadi bentuknya satu deret
 * angka rapat, bukan sepuluh kotak. Semua terbaca dalam satu pandangan, dan
 * tingginya kurang dari satu kartu.
 */
function StripProsedur({ periode, label }) {
  if (!periode) return null;
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_MID, letterSpacing: "0.03em", marginBottom: 11 }}>
        PROSEDUR · {label.toUpperCase()}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
        {PROSEDUR.map((x, i) => (
          <div
            key={x.key}
            style={{
              flex: "1 1 96px",
              minWidth: 96,
              padding: "2px 12px",
              borderLeft: i === 0 ? "none" : `1px solid ${BORDER}`,
            }}
          >
            <div style={{ fontSize: 11, color: TEXT_MID, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {x.label}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: x.negatif && Number(periode[x.key]) > 0 ? NEGATIVE : TEXT_DARK, letterSpacing: "-0.02em" }}>
              {Number(periode[x.key] || 0)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Seksi yang bisa dilipat.
 *
 * BRIEF §Dashboard: "Dibuatkan lebih ringkas lagi untuk tampilan, mis. bagian
 * Item di minimize lagi."
 *
 * Yang dilipat adalah laporan yang dibaca sesekali — funnel, durasi tahap,
 * rekap berkas, tabel per agen. Yang tidak pernah dilipat adalah pekerjaan
 * hari ini dan angka periode: menyembunyikannya di balik satu klik berarti
 * dashboard hanya berguna bagi orang yang sudah tahu harus menekan apa.
 * Ringkasannya tetap terbaca pada judul saat terlipat, sehingga melipat tidak
 * sama dengan kehilangan.
 */
function Seksi({ judul, ringkas, awalTerbuka = false, children }) {
  const [buka, setBuka] = useState(awalTerbuka);
  return (
    <Card style={{ padding: buka ? undefined : "14px 18px" }}>
      <button
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          marginBottom: buka ? 14 : 0,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: TEXT_DARK }}>{judul}</span>
        {!buka && ringkas && (
          <span style={{ fontSize: 12, color: TEXT_MID, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ringkas}
          </span>
        )}
        <ChevronDown
          size={16}
          color={TEXT_MID}
          aria-hidden="true"
          style={{ marginLeft: "auto", flexShrink: 0, transform: buka ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
        />
      </button>
      {buka && children}
    </Card>
  );
}

/**
 * Kartu laporan yang relevan per peran.
 *
 * Sebelumnya ketujuh peran melihat sepuluh kartu yang sama. Sales tidak
 * mengurus antrean Finance, dan Finance tidak mengurus durasi tahap KPR —
 * menampilkan keduanya kepada semua orang membuat layar pertama jadi panjang
 * tanpa menambah satu pun keputusan yang bisa diambil.
 */
const KARTU_PERAN = {
  sales: { finance: false, kprDurasi: false, berkas: false, agen: true },
  admin_marketing: { finance: true, kprDurasi: true, berkas: true, agen: true },
  finance: { finance: true, kprDurasi: false, berkas: false, agen: false },
  tim_lapangan: { finance: false, kprDurasi: false, berkas: false, agen: false },
};

const SEMUA_KARTU = { finance: true, kprDurasi: true, berkas: true, agen: true };

export default function DashboardPage() {
  const { profile } = useAuth();
  const kartu = KARTU_PERAN[roleOf(profile)] || SEMUA_KARTU;

  // Aggregates come from the dashboard_stats() RPC so they're computed in
  // Postgres — counting rows in the browser silently capped at 1000.
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState("month");
  const [custom, setCustom] = useState({ from: "", to: "" });

  useEffect(() => {
    async function load() {
      const { from, to } = rangeToDates(range, custom);
      const [{ data: s, error: statsError }, { data: pm }, { data: cp }] = await Promise.all([
        supabase.rpc("dashboard_stats", { p_from: from, p_to: to }),
        supabase.from("payments").select("id, amount, payment_type, payment_date, status, customers(name)").order("payment_date", { ascending: false }).limit(4),
        supabase.from("complaints").select("id, category, description, priority, status, created_at, customers(name), units(unit_code)").order("created_at", { ascending: false }).limit(4),
      ]);
      if (statsError) setError(statsError.message);
      setStats(s || null);
      setPayments(pm || []);
      setComplaints(cp || []);
    }
    load();
    // Re-fetch whenever the period changes; custom dates only once both are set.
  }, [range, custom.from, custom.to]);

  const s = stats || {};
  const totalLeads = s.total_leads || 0;
  const dealCount = s.deal_count || 0;
  const appointmentCount = s.appointment_count || 0;
  const closingRate = totalLeads ? (dealCount / totalLeads) * 100 : 0;
  const apptToDeal = appointmentCount + dealCount ? (dealCount / (appointmentCount + dealCount)) * 100 : 0;

  const weekData = (s.by_day || []).map((d) => ({ label: dayLabel(d.day), value: Number(d.value) }));

  // Ditambahkan migration_010; sebelum migrasi itu jalan, kartunya tidak dirender.
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

  const periode = s.periode || null;
  const labelPeriode = RANGES.find((r) => r.key === range)?.label || "Periode ini";

  const berkasRecap = (s.berkas_recap || []).map((b) => ({ ...b, lama_hari: b.lama_hari == null ? null : Number(b.lama_hari) }));
  const berkasSummary = (s.berkas_summary || []).map((b) => ({ label: b.label, value: Number(b.value) }));
  const maxSource = Math.max(1, ...(s.by_source || []).map((x) => Number(x.leads)));

  const sourceRows = (s.by_source || []).map((x) => ({
    source: x.source,
    leads: Number(x.leads),
    deals: Number(x.deals),
    rate: Number(x.leads) ? ((Number(x.deals) / Number(x.leads)) * 100).toFixed(1) + "%" : "-",
  }));

  const maxWeek = weekData.length ? Math.max(...weekData.map((d) => d.value)) : 0;
  const highlightIndex = maxWeek > 0 ? weekData.findIndex((d) => d.value === maxWeek) : -1;

  const leadsThisMonth = s.leads_this_month || 0;
  const dealsThisMonth = s.deals_this_month || 0;
  const unitsAvailable = s.units_available || 0;
  const unitsTotal = s.units_total || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <Card style={{ borderColor: "#F2D3D1" }}>
          <div style={{ fontSize: 13, color: "#C2413B" }}>
            Gagal memuat ringkasan: {error}. Pastikan migrasi Supabase sudah dijalankan sampai{" "}
            <code>migration_010_dashboard_and_ads.sql</code>.
          </div>
        </Card>
      )}

      {/* Pekerjaan lebih dulu, laporan menyusul. */}
      <FokusHariIni />

      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEXT_MID, marginRight: 2 }}>Periode</span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${range === r.key ? PRIMARY : BORDER}`,
                background: range === r.key ? PRIMARY : "#fff",
                color: range === r.key ? "#fff" : TEXT_MID,
                fontSize: 12.5,
                fontWeight: range === r.key ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} style={dateStyle} />
              <span style={{ fontSize: 12, color: TEXT_MID }}>s/d</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} style={dateStyle} />
            </>
          )}
        </div>
      </Card>

      <div className="rg-4">
        <StatCard
          icon={Users}
          label="Total Prospek"
          value={totalLeads}
          trend={trendOf(leadsThisMonth, s.leads_prev_month || 0)}
          sub={`${leadsThisMonth} bulan ini`}
        />
        <StatCard
          icon={Handshake}
          label="Booking ke Atas"
          value={dealCount}
          trend={trendOf(dealsThisMonth, s.deals_prev_month || 0)}
          sub={`${dealsThisMonth} bulan ini`}
        />
        <StatCard icon={TrendingUp} label="Closing Rate" value={`${closingRate.toFixed(1)}%`} sub={`${apptToDeal.toFixed(0)}% dari Hot Lead`} />
        <StatCard icon={Home} label="Unit Tersedia" value={unitsAvailable} sub={unitsTotal ? `dari ${unitsTotal} unit` : "belum ada unit"} />
      </div>

      <StripProsedur periode={periode} label={labelPeriode} />

      {funnel.length > 0 && (
        <Seksi
          judul="Funnel Penjualan"
          ringkas={`${totalLeads} prospek · New Lead → Warm → Hot → Booking → KPR → Akad → Aftersales`}
        >
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
        </Seksi>
      )}

      <div className="chart-row">
        <Seksi judul="Prospek Masuk" ringkas="7 hari terakhir" awalTerbuka>
          <BarChart data={weekData} highlightIndex={highlightIndex} />
        </Seksi>

        {kartu.finance && (
        <Seksi
          judul="Antrean Finance"
          ringkas={finance ? `${finance.siap_verifikasi ?? finance.menunggu_jumlah} siap diverifikasi` : ""}
          awalTerbuka
        >
          {!finance ? (
            <div style={{ fontSize: 13, color: TEXT_MID }}>
              Jalankan <code>migration_010_dashboard_and_ads.sql</code> untuk menampilkan ringkasan ini.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Dua lapis sejak migrasi 017: yang buktinya sudah lengkap
                  adalah pekerjaan Finance hari ini; yang belum berbukti masih
                  pekerjaan Admin Marketing, dan menggabungkan keduanya membuat
                  angka di kartu ini tidak bisa ditindaklanjuti siapa pun. */}
              <div style={{ padding: "14px 16px", background: Number(finance.siap_verifikasi ?? finance.menunggu_jumlah) > 0 ? ACCENT_SOFT : PRIMARY_SOFT, borderRadius: 14 }}>
                <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>Siap diverifikasi — bukti transfer lengkap</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: Number(finance.siap_verifikasi ?? finance.menunggu_jumlah) > 0 ? ACCENT_DARK : TEXT_DARK }}>
                  {finance.siap_verifikasi ?? finance.menunggu_jumlah}
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

              {/* Setelah migration_008 ini seharusnya selalu nol; kalau tidak,
                  itu baris lama yang lolos sebelum aturan kuitansi berlaku. */}
              {Number(finance.tanpa_kuitansi) > 0 && (
                <div style={{ fontSize: 12, color: NEGATIVE, lineHeight: 1.5 }}>
                  {finance.tanpa_kuitansi} pembayaran berstatus tervalidasi tetapi tidak punya kuitansi — perlu dirapikan.
                </div>
              )}
            </div>
          )}
        </Seksi>
        )}
      </div>

      {kartu.kprDurasi && (
      <Seksi judul="Rata-rata Durasi per Tahap KPR" ringkas="dalam hari">
        <div className="rg-4">
          {stageDurations.map((s) => (
            <div key={s.label} style={{ padding: "14px 16px", background: PRIMARY_SOFT, borderRadius: 14 }}>
              <div style={{ fontSize: 12, color: TEXT_MID, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {s.value != null ? `${s.value.toFixed(0)}` : "-"}
                {s.value != null && <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_MID }}> hari</span>}
              </div>
            </div>
          ))}
        </div>
      </Seksi>
      )}

      {kartu.berkas && (
      <div className="chart-row">
        <Seksi judul="Konsumen Sedang Mengumpulkan Berkas" ringkas={`${berkasRecap.length} konsumen berjalan`}>
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
        </Seksi>

        <Seksi judul="Progres Berkas" ringkas={`${berkasSummary.length} tahap`}>
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
        </Seksi>
      </div>
      )}

      <Seksi judul="Jumlah Sumber Leads" ringkas={`${totalLeads} prospek pada periode ini`}>
        {sourceRows.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data sumber leads.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {sourceRows.map((x) => (
            <div key={x.source}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{x.source}</span>
                <span style={{ color: TEXT_MID }}>
                  <b style={{ color: "inherit" }}>{x.leads}</b> leads · {x.deals} deal · {x.rate}
                </span>
              </div>
              <div style={{ background: PRIMARY_SOFT, borderRadius: 999, height: 9, overflow: "hidden" }}>
                <div style={{ background: PRIMARY, height: "100%", width: `${(x.leads / maxSource) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Seksi>

      <div className="rg-2">
        <Card>
          <SectionTitle title="Pembayaran Terbaru" />
          {payments.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada pembayaran.</div>}
          {payments.map((p, i) => (
            <ListRow
              key={p.id}
              icon={Wallet}
              title={p.customers?.name || "Konsumen"}
              meta={`${String(p.payment_type).replace("_", " ")} · ${new Date(p.payment_date).toLocaleDateString("id-ID")}`}
              trailing={`Rp${Number(p.amount).toLocaleString("id-ID")}`}
              trailingMuted={p.status !== "terverifikasi"}
              last={i === payments.length - 1}
            />
          ))}
        </Card>

        <Card>
          <SectionTitle title="Komplain Terbaru" />
          {complaints.length === 0 && <div style={{ fontSize: 13, color: TEXT_MID, padding: "8px 0" }}>Belum ada komplain.</div>}
          {complaints.map((c, i) => (
            <ListRow
              key={c.id}
              icon={MessageSquareWarning}
              title={c.category || c.description}
              meta={`${c.customers?.name || c.units?.unit_code || "Umum"} · ${c.status}`}
              trailing={c.priority}
              trailingMuted
              last={i === complaints.length - 1}
            />
          ))}
        </Card>
      </div>

      {kartu.agen && (
      <div className="rg-2">
        <Seksi judul="Performa per Agen" ringkas={`${perAgent.length} agen`}>
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
        </Seksi>
        <Seksi judul="Konversi Sumber Leads → Deal" ringkas={`${sourceRows.length} sumber`}>
          <DataTable
            emptyLabel="Belum ada data sumber leads."
            columns={[
              { key: "source", label: "Sumber" },
              { key: "leads", label: "Leads" },
              { key: "deals", label: "Deal" },
              { key: "rate", label: "Konversi" },
            ]}
            rows={sourceRows}
          />
        </Seksi>
      </div>
      )}
    </div>
  );
}

const dateStyle = {
  padding: "7px 10px",
  border: `1px solid ${BORDER}`,
  borderRadius: 999,
  fontSize: 12,
  outline: "none",
};
