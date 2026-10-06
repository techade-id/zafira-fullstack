import React, { useState } from "react";
import { Wallet, Pencil, Trash2, Upload, Check, Eye } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { canWrite } from "../lib/permissions";
import { segarkanNotifikasi } from "../lib/useNotifications";
import { unggahBuktiTransfer, unggahKuitansi, hapusPembayaran } from "../lib/berkas";
import { rupiah, tanggal, tanggalWaktu, labelJenisBayar } from "../lib/format";
import ModalPembayaran from "./ModalPembayaran";
import { usePratinjau } from "./PratinjauBerkas";
import { Card, DataTable, Badge, MenuAksi, ConfirmDialog, PrimaryButton, friendlyDbError, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, ACCENT, ACCENT_DARK } from "./ui";

/**
 * Tab Pembayaran di halaman konsumen — kini tempat bekerja, bukan hanya
 * tempat membaca.
 *
 * Sebelumnya tabel ini baca-saja, dan setiap pembayaran harus dicatat dari
 * modul Pembayaran: keluar dari kartu konsumen, memilih nama yang sama dari
 * daftar seluruh konsumen, lalu kembali. Kini dicatat dari sini, dengan
 * konsumen yang sudah pasti, beserta bukti, kuitansi, ubah, dan hapus —
 * hak aksesnya sama persis dengan modul Pembayaran.
 */
export default function PembayaranKonsumen({ konsumen, pembayaran, editable }) {
  const { profile } = useAuth();
  const toast = useToast();
  const bolehCatat = canWrite(profile, "payment");
  const bolehVerifikasi = canWrite(profile, "payment_verify");
  const bolehHapus = canWrite(profile, "payment_delete");
  const [bukaPratinjau, pratinjau] = usePratinjau();

  const [formulir, setFormulir] = useState(null); // { pembayaran: null | row }
  const [sibuk, setSibuk] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [hapusSibuk, setHapusSibuk] = useState(false);
  const [hapusGalat, setHapusGalat] = useState("");

  const total = pembayaran.filter((p) => p.status === "terverifikasi").reduce((s, p) => s + Number(p.amount || 0), 0);
  const menunggu = pembayaran.filter((p) => p.status !== "terverifikasi").reduce((s, p) => s + Number(p.amount || 0), 0);
  // Booking fee biasanya sudah tercatat dari konversi prospek; pembayaran
  // berikutnya hampir selalu DP.
  const jenisAwal = pembayaran.some((p) => p.payment_type === "booking") ? "dp" : "booking";

  const berkas = pembayaran.flatMap((r) => {
    const ket = `${rupiah(r.amount)} · ${tanggal(r.payment_date)}`;
    return [
      r.bukti_transfer_url && { kunci: `b-${r.id}`, bucket: "payment-proofs", path: r.bukti_transfer_url, judul: `Bukti transfer ${labelJenisBayar(r.payment_type)}`, keterangan: ket },
      r.proof_url && { kunci: `k-${r.id}`, bucket: "payment-receipts", path: r.proof_url, judul: `Kuitansi ${labelJenisBayar(r.payment_type)}`, keterangan: ket },
    ].filter(Boolean);
  });
  const lihat = (kunci) => bukaPratinjau(berkas, Math.max(0, berkas.findIndex((b) => b.kunci === kunci)));

  async function jalankan(kunci, kerja, pesan) {
    setSibuk(kunci);
    const { error } = await kerja();
    setSibuk(null);
    if (error) {
      toast.gagal(error);
      return;
    }
    toast.sukses(pesan);
    segarkanNotifikasi();
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Riwayat Pembayaran</div>
          <div style={{ fontSize: 12, color: TEXT_MID, marginTop: 2 }}>
            {rupiah(total)} terverifikasi
            {menunggu > 0 && <span style={{ color: ACCENT_DARK }}> · {rupiah(menunggu)} belum terverifikasi</span>}
          </div>
        </div>
        {bolehCatat && (
          <PrimaryButton subject="payment" onClick={() => setFormulir({ pembayaran: null })}>
            + Catat Pembayaran
          </PrimaryButton>
        )}
      </div>

      <DataTable
        sortable
        defaultSort={{ key: "payment_date", arah: "desc" }}
        emptyIcon={Wallet}
        emptyLabel="Belum ada pembayaran"
        emptyHint={bolehCatat ? "Catat pembayaran pertama lewat tombol + Catat Pembayaran." : "Pembayaran yang dicatat akan muncul di sini."}
        columns={[
          {
            key: "payment_type",
            label: "Jenis",
            render: (row) => (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: TEXT_DARK }}>{labelJenisBayar(row.payment_type)}</div>
                {row.notes && <div style={{ fontSize: 11.5, color: TEXT_MID, marginTop: 2, whiteSpace: "normal" }}>{row.notes}</div>}
              </div>
            ),
          },
          { key: "amount", label: "Nominal", align: "right", sortValue: (row) => Number(row.amount), render: (row) => rupiah(row.amount) },
          { key: "payment_date", label: "Tanggal", render: (row) => tanggal(row.payment_date) },
          { key: "status", label: "Status", render: (row) => <Badge value={row.status} /> },
          {
            key: "berkas",
            label: "Bukti & Kuitansi",
            sortable: false,
            render: (row) => {
              const lunas = row.status === "terverifikasi";
              return (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {row.bukti_transfer_url ? (
                    <button onClick={() => lihat(`b-${row.id}`)} style={tombol}>
                      <Eye size={12} aria-hidden="true" /> Bukti
                    </button>
                  ) : (
                    editable &&
                    !lunas && (
                      <PilihBerkas
                        label="Unggah bukti"
                        ikon={Upload}
                        sibuk={sibuk === `b-${row.id}`}
                        onPilih={(f) => jalankan(`b-${row.id}`, () => unggahBuktiTransfer(row, f), "Bukti transfer terkirim — menunggu verifikasi Finance.")}
                      />
                    )
                  )}
                  {row.proof_url ? (
                    <button onClick={() => lihat(`k-${row.id}`)} style={tombol}>
                      <Eye size={12} aria-hidden="true" /> Kuitansi
                    </button>
                  ) : (
                    // Hanya Finance: mengunggah kuitansi = memverifikasi pembayaran.
                    bolehVerifikasi &&
                    !lunas && (
                      <PilihBerkas
                        label="Verifikasi + kuitansi"
                        ikon={Check}
                        utama
                        sibuk={sibuk === `k-${row.id}`}
                        onPilih={(f) => jalankan(`k-${row.id}`, () => unggahKuitansi(row, f), "Pembayaran terverifikasi dan kuitansi tersimpan.")}
                      />
                    )
                  )}
                  {!row.bukti_transfer_url && !row.proof_url && !(editable && !lunas) && !(bolehVerifikasi && !lunas) && (
                    <span style={{ fontSize: 12, color: TEXT_MID }}>-</span>
                  )}
                </div>
              );
            },
          },
          { key: "created_at", label: "Dicatat", render: (row) => tanggalWaktu(row.created_at) },
          {
            key: "aksi",
            label: "",
            sortable: false,
            render: (row) => (
              <MenuAksi
                items={[
                  // Sama dengan modul Pembayaran: yang sudah terverifikasi
                  // hanya boleh dikoreksi Finance.
                  bolehCatat && (row.status !== "terverifikasi" || bolehVerifikasi) && { label: "Ubah", ikon: Pencil, onClick: () => setFormulir({ pembayaran: row }) },
                  bolehHapus && { label: "Hapus", ikon: Trash2, rusak: true, pisah: true, onClick: () => { setHapusGalat(""); setHapus(row); } },
                ]}
              />
            ),
          },
        ]}
        rows={pembayaran}
      />

      <ModalPembayaran
        open={Boolean(formulir)}
        konsumen={{ id: konsumen.id, name: konsumen.name }}
        pembayaran={formulir?.pembayaran || null}
        jenisAwal={jenisAwal}
        onClose={() => setFormulir(null)}
      />

      <ConfirmDialog
        open={Boolean(hapus)}
        title="Hapus pembayaran ini?"
        message={hapus ? `${labelJenisBayar(hapus.payment_type)} ${rupiah(hapus.amount)} tanggal ${tanggal(hapus.payment_date)} akan dihapus permanen.` : ""}
        warning={hapus?.status === "terverifikasi" ? "Pembayaran ini sudah terverifikasi — total yang diakui konsumen ikut berkurang." : null}
        busy={hapusSibuk}
        error={hapusGalat}
        onCancel={() => !hapusSibuk && setHapus(null)}
        onConfirm={async () => {
          setHapusSibuk(true);
          const { error } = await hapusPembayaran(hapus);
          setHapusSibuk(false);
          if (error) {
            setHapusGalat(friendlyDbError(error));
            return;
          }
          setHapus(null);
          toast.sukses("Pembayaran dihapus.");
          segarkanNotifikasi();
        }}
      />

      {pratinjau}
    </Card>
  );
}

function PilihBerkas({ label, ikon: Ikon, utama, sibuk, onPilih }) {
  return (
    <label style={{ ...tombol, ...(utama ? { borderColor: ACCENT, color: "#fff", background: ACCENT } : { color: PRIMARY }), cursor: sibuk ? "default" : "pointer" }}>
      <Ikon size={12} aria-hidden="true" />
      {sibuk ? "Mengunggah…" : label}
      <input
        type="file"
        accept="image/*,application/pdf"
        disabled={sibuk}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPilih(f);
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}

const tombol = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: TEXT_DARK,
  borderRadius: 9,
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
