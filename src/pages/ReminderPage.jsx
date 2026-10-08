import React, { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { tanggal, tanggalRelatif, selisihHari, labelTahap } from "../lib/format";
import KontakAksi from "../components/KontakAksi";
import CatatFollowUpModal from "../components/CatatFollowUpModal";
import {
  Card,
  PageTitle,
  DataTable,
  Badge,
  Modal,
  PrimaryButton,
  EmptyState,
  DeleteButton,
  RowActions,
  BORDER,
  SURFACE,
  TEXT_MID,
  TEXT_DARK,
  PRIMARY,
  ACCENT,
  ACCENT_DARK,
  NEGATIVE,
  POSITIVE,
  inputStyle,
} from "../components/ui";

/**
 * Antrean pekerjaan follow-up, bukan lagi sekadar daftar tanggal.
 *
 * Versi sebelumnya menampilkan jadwal dengan benar tetapi satu-satunya aksinya
 * adalah "Hapus jadwal" — yang menghilangkan pekerjaan alih-alih
 * menyelesaikannya. Tidak ada cara menandai selesai, menjadwal ulang, atau
 * mencatat hasilnya, sehingga satu-satunya jalan menutup sebuah tugas adalah
 * berpura-pura tugas itu tidak pernah ada.
 *
 * "Selesai" membuka Catat Follow Up yang sama dengan di Follow Up Leads:
 * setiap follow-up prospek wajib bertanggal dan berbukti (migrasi 024), jadi
 * tidak boleh ada pintu kedua yang menutup tugas tanpa bukti.
 */

/** Tanggal lokal perangkat, bukan UTC. */
function tanggalPlus(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function warnaSisa(n) {
  if (n < 0) return NEGATIVE;
  if (n <= 2) return ACCENT_DARK;
  return TEXT_DARK;
}

export default function ReminderPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fuLead, setFuLead] = useState(null);
  const [jadwalLead, setJadwalLead] = useState(null);

  const mayWrite = canWrite(profile, "lead");

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*, profiles(full_name)")
      .not("tanggal_rencana", "is", null)
      .neq("status", "cancel")
      .order("tanggal_rencana");
    setLeads(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const denganSisa = useMemo(
    () => leads.map((l) => ({ ...l, _sisa: selisihHari(l.tanggal_rencana) })),
    [leads]
  );

  const terlewat = denganSisa.filter((l) => l._sisa < 0);
  const hariIni = denganSisa.filter((l) => l._sisa === 0);
  const pekanIni = denganSisa.filter((l) => l._sisa > 0 && l._sisa <= 7);
  const nanti = denganSisa.filter((l) => l._sisa > 7);

  const kolom = [
    { key: "name", label: "Prospek" },
    {
      key: "phone",
      label: "Kontak",
      sortable: false,
      render: (row) => <KontakAksi phone={row.phone} nama={row.name} tahap={row.status} leadId={row.id} onCatat={fetchData} ringkas />,
    },
    { key: "status", label: "Tahap", render: (row) => <Badge value={row.status} label={labelTahap(row.status)} /> },
    { key: "kategori_rencana", label: "Kategori", render: (row) => row.kategori_rencana || "-" },
    {
      key: "rencana_selanjutnya",
      label: "Rencana",
      render: (row) => <span style={{ whiteSpace: "normal" }}>{row.rencana_selanjutnya || "-"}</span>,
    },
    { key: "tanggal_rencana", label: "Tanggal", render: (row) => tanggal(row.tanggal_rencana) },
    {
      key: "sisa",
      label: "Sisa",
      sortValue: (row) => row._sisa,
      render: (row) => (
        <span style={{ color: warnaSisa(row._sisa), fontWeight: 600, whiteSpace: "nowrap" }}>{tanggalRelatif(row.tanggal_rencana)}</span>
      ),
    },
    { key: "agent", label: "Agen", sortValue: (row) => row.profiles?.full_name, render: (row) => row.profiles?.full_name || "-" },
    {
      key: "aksi",
      label: "",
      sortable: false,
      render: (row) =>
        mayWrite ? (
          <RowActions>
            <button onClick={() => setFuLead(row)} style={gayaSelesai} title="Catat hasil dan buktinya, lalu jadwalkan langkah berikutnya">
              ✓ Selesai
            </button>
            <button onClick={() => setJadwalLead(row)} style={gayaKecil} title="Pindahkan ke tanggal lain">
              ↻ Jadwal ulang
            </button>
            <DeleteButton
              subject="lead"
              label="Hapus jadwal"
              confirmLabel="Hapus jadwal"
              itemName={`Jadwal follow-up ${row.name}`}
              warning="Prospeknya tidak dihapus — hanya tanggal rencana yang dikosongkan, sehingga hilang dari daftar ini tanpa tercatat sebagai selesai. Untuk menutup tugas dengan benar, pakai ✓ Selesai."
              onDelete={() => supabase.from("leads").update({ tanggal_rencana: null }).eq("id", row.id)}
              onDone={() => {
                fetchData();
                segarkanNotifikasi();
              }}
            />
          </RowActions>
        ) : null,
    },
  ];

  return (
    <div>
      <PageTitle title="Reminder — Rencana Selanjutnya" subtitle="Antrean follow-up yang sudah terjadwal" />

      <div className="rg-4" style={{ marginBottom: 18 }}>
        <Angka label="Terlewat" nilai={terlewat.length} warna={NEGATIVE} />
        <Angka label="Hari Ini" nilai={hariIni.length} warna={ACCENT} />
        <Angka label="7 Hari ke Depan" nilai={pekanIni.length} warna={PRIMARY} />
        <Angka label="Total Terjadwal" nilai={leads.length} />
      </div>

      {!loading && leads.length === 0 && (
        <Card>
          <EmptyState
            icon={Bell}
            label="Belum ada follow-up terjadwal"
            hint="Jadwal terisi setiap kali follow-up dicatat — di situ sistem meminta kapan prospek itu dihubungi lagi."
          />
        </Card>
      )}

      {/* Dikelompokkan menurut mendesaknya, bukan satu daftar panjang: yang
          terlewat menuntut perlakuan berbeda dari yang masih pekan depan. */}
      {terlewat.length > 0 && (
        <Bagian judul="Terlewat" jumlah={terlewat.length} warna={NEGATIVE} keterangan="Semakin lama dibiarkan, semakin kecil peluangnya.">
          <DataTable sortable columns={kolom} rows={terlewat} loading={loading} defaultSort={{ key: "sisa", arah: "asc" }} />
        </Bagian>
      )}

      {hariIni.length > 0 && (
        <Bagian judul="Hari Ini" jumlah={hariIni.length} warna={ACCENT}>
          <DataTable sortable columns={kolom} rows={hariIni} loading={loading} />
        </Bagian>
      )}

      {pekanIni.length > 0 && (
        <Bagian judul="7 Hari ke Depan" jumlah={pekanIni.length} warna={PRIMARY}>
          <DataTable sortable columns={kolom} rows={pekanIni} loading={loading} defaultSort={{ key: "sisa", arah: "asc" }} />
        </Bagian>
      )}

      {nanti.length > 0 && (
        <Bagian judul="Lebih Lanjut" jumlah={nanti.length} warna={TEXT_MID}>
          <DataTable sortable searchable pageSize={25} columns={kolom} rows={nanti} loading={loading} defaultSort={{ key: "sisa", arah: "asc" }} />
        </Bagian>
      )}

      <CatatFollowUpModal
        lead={fuLead}
        open={Boolean(fuLead)}
        onClose={() => setFuLead(null)}
        onSelesai={() => {
          fetchData();
          segarkanNotifikasi();
        }}
      />

      <ModalJadwalUlang
        lead={jadwalLead}
        onClose={() => setJadwalLead(null)}
        onSelesai={() => {
          fetchData();
          segarkanNotifikasi();
        }}
        profile={profile}
        toast={toast}
      />
    </div>
  );
}

function Angka({ label, nilai, warna }) {
  return (
    <Card>
      <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: nilai > 0 && warna ? warna : TEXT_DARK }}>{nilai}</div>
    </Card>
  );
}

function Bagian({ judul, jumlah, warna, keterangan, children }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: keterangan ? 6 : 14, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: warna, flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{judul}</span>
        <span style={{ fontSize: 12, color: TEXT_MID }}>{jumlah}</span>
      </div>
      {keterangan && <div style={{ fontSize: 12.5, color: TEXT_MID, marginBottom: 14, lineHeight: 1.5 }}>{keterangan}</div>}
      {children}
    </Card>
  );
}

/**
 * Memindahkan sebuah tugas ke tanggal lain.
 *
 * Bukan follow-up — tidak ada yang dihubungi — sehingga tidak meminta bukti.
 * Pemindahannya tetap tercatat di riwayat, supaya jadwal yang terus mundur
 * terlihat sebagai pola, bukan menghilang tanpa jejak.
 */
function ModalJadwalUlang({ lead, onClose, onSelesai, profile, toast }) {
  const [tanggalBaru, setTanggalBaru] = useState("");
  const [rencana, setRencana] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!lead) return;
    setTanggalBaru(tanggalPlus(3));
    setRencana(lead.rencana_selanjutnya || "");
    setGalat("");
    setKirim(false);
  }, [lead]);

  async function jalankan() {
    if (!tanggalBaru) {
      setGalat("Tentukan tanggal barunya.");
      return;
    }

    setKirim(true);
    setGalat("");

    const { error: errLead } = await supabase
      .from("leads")
      .update({ tanggal_rencana: tanggalBaru, rencana_selanjutnya: rencana.trim() || null })
      .eq("id", lead.id);
    if (errLead) {
      setKirim(false);
      setGalat(errLead.message);
      return;
    }

    const { error: errCatatan } = await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      actor_id: profile?.id || null,
      activity: "Follow-up dijadwal ulang",
      note: `Dipindahkan ke ${tanggal(tanggalBaru)}`,
    });

    setKirim(false);

    if (errCatatan) toast.gagal(`Tersimpan, tetapi catatannya gagal: ${errCatatan.message}`);
    else toast.sukses(`Dipindahkan ke ${tanggal(tanggalBaru)}.`);

    onSelesai?.();
    onClose?.();
  }

  if (!lead) return null;

  return (
    <Modal open onClose={() => !kirim && onClose()} labelledBy="jadwal-judul" width={470}>
      <>
        <div id="jadwal-judul" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>
          Jadwal ulang — {lead.name}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 18, lineHeight: 1.5 }}>
          Dijadwalkan {tanggal(lead.tanggal_rencana)} · {tanggalRelatif(lead.tanggal_rencana)}
          {lead.rencana_selanjutnya ? ` · ${lead.rencana_selanjutnya}` : ""}
        </div>

        <div className="rg-2" style={{ marginBottom: 18 }}>
          <div>
            <label htmlFor="rm-tanggal" style={labelGaya}>
              Tanggal
            </label>
            <input id="rm-tanggal" type="date" value={tanggalBaru} onChange={(e) => setTanggalBaru(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="rm-rencana" style={labelGaya}>
              Yang akan dilakukan
            </label>
            <input id="rm-rencana" value={rencana} onChange={(e) => setRencana(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {galat && (
          <div role="alert" style={{ fontSize: 12.5, color: NEGATIVE, marginBottom: 14 }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={kirim} style={gayaSekunder}>
            Batal
          </button>
          <PrimaryButton onClick={jalankan} disabled={kirim}>
            {kirim ? "Menyimpan…" : "Pindahkan"}
          </PrimaryButton>
        </div>
      </>
    </Modal>
  );
}

const labelGaya = { display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_MID, marginBottom: 5 };

const gayaKecil = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 9,
  padding: "5px 11px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const gayaSelesai = { ...gayaKecil, borderColor: POSITIVE, color: POSITIVE };

const gayaSekunder = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT_DARK,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
