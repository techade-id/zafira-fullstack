import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleOf } from "../lib/permissions";
import { useDaftarSiteplan, usePetaSiteplan, useSekarang } from "../lib/useSiteplan";
import { MODE_PETA } from "../lib/siteplan";
import { rupiah, telepon, tanggal } from "../lib/format";
import SiteplanVektor from "../components/SiteplanVektor";
import { Card, PageTitle, Badge, Modal, EmptyState, PrimaryButton, BORDER, TEXT_MID, TEXT_DARK, PRIMARY, ORANGE, ORANGE_LIGHT, NEGATIVE } from "../components/ui";

/**
 * Siteplan Digital — tampilan operasional proyek.
 *
 * Sejak migrasi 022, penggambaran kavling, hold, dan seluruh alat pemasaran
 * pindah ke halaman Siteplan (di bawah Dashboard). Halaman ini tetap ada untuk
 * tim proyek dan lapangan, dengan pertanyaan yang lebih sempit — unit mana
 * yang terjual, siapa pemiliknya, sampai mana bangunannya — dan membaca data
 * yang persis sama, jadi keduanya tidak mungkin berbeda isi.
 */
const MODE = ["status", "progres"];

export default function SiteplanDigitalPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const sekarang = useSekarang();
  const { proyek, siteplans, memuat, galat } = useDaftarSiteplan();
  const [aktifId, setAktifId] = useState(null);
  const [mode, setMode] = useState(roleOf(profile) === "tim_lapangan" ? "progres" : "status");
  const [cari, setCari] = useState("");
  const [modal, setModal] = useState(null);

  const aktif = siteplans.find((s) => s.id === aktifId) || siteplans[0] || null;
  const peta = usePetaSiteplan(aktif?.id);
  const namaProyek = (id) => proyek.find((p) => p.id === id)?.name || "";
  const q = cari.trim().toUpperCase();
  const k = modal ? peta.kavling.find((x) => x.id === modal) : null;
  const ada = useMemo(() => peta.kavling.some((x) => x.bentuk), [peta.kavling]);

  return (
    <div>
      <PageTitle
        title="Siteplan Digital"
        subtitle="Klik kavling untuk melihat konsumen dan progres pembangunan"
        action={
          <Link to={aktif ? `/siteplan?p=${aktif.project_id}&sp=${aktif.id}` : "/siteplan"} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: PRIMARY, textDecoration: "none" }}>
            Buka Siteplan lengkap <ArrowRight size={14} />
          </Link>
        }
      />

      {galat && (
        <Card style={{ borderColor: "#F2D3D1", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: NEGATIVE }}>{galat}</div>
        </Card>
      )}

      {!memuat && !galat && siteplans.length === 0 && (
        <Card>
          <EmptyState icon={MapIcon} label="Belum ada siteplan" hint="Siteplan dibuat dan digambar di halaman Siteplan." action={<PrimaryButton onClick={() => navigate("/siteplan")}>Ke halaman Siteplan</PrimaryButton>} />
        </Card>
      )}

      {siteplans.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {siteplans.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setAktifId(s.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  background: aktif?.id === s.id ? ORANGE_LIGHT : "#fff",
                  fontWeight: aktif?.id === s.id ? 600 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {namaProyek(s.project_id)} · {s.nama}
              </button>
            ))}
          </div>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div role="radiogroup" aria-label="Mode peta" style={{ display: "flex", gap: 6 }}>
                {MODE.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${mode === m ? PRIMARY : BORDER}`, background: mode === m ? PRIMARY : "#fff", color: mode === m ? "#fff" : TEXT_MID, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    {MODE_PETA[m].label}
                  </button>
                ))}
              </div>
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari unit (mis. A12)"
                aria-label="Cari unit"
                style={{ padding: "7px 12px", border: `1px solid ${BORDER}`, borderRadius: 999, fontSize: 12, outline: "none", width: 160 }}
              />
            </div>

            {ada ? (
              <SiteplanVektor
                siteplan={aktif}
                kavling={peta.kavling}
                fasilitas={peta.fasilitas}
                mode={mode}
                terpilih={modal}
                onPilih={(x) => setModal(x.id)}
                redup={(x) => (q ? !String(x.unit_code).toUpperCase().includes(q) : false)}
                sekarang={sekarang}
                tinggi={520}
              />
            ) : (
              <EmptyState icon={MapIcon} label={peta.memuat ? "Memuat…" : "Belum ada kavling yang digambar"} hint={peta.memuat ? undefined : "Kavling digambar lewat editor di halaman Siteplan."} />
            )}
          </Card>
        </>
      )}

      <Modal open={Boolean(k)} labelledBy="sd-judul" onClose={() => setModal(null)} width={400}>
        {k && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div id="sd-judul" style={{ fontSize: 16, fontWeight: 700 }}>
                Unit {k.unit_code}
              </div>
              <Badge value={k.status} />
            </div>
            <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14 }}>
              {[k.block && `Blok ${k.block}`, k.type && `Tipe ${k.type}`, k.price && rupiah(k.price)].filter(Boolean).join(" · ")}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: TEXT_MID, marginBottom: 6 }}>Konsumen</div>
            {k.konsumen ? (
              <div style={{ fontSize: 13, marginBottom: 14 }}>
                <Link to={`/konsumen/${k.konsumen.id}`} style={{ color: TEXT_DARK, fontWeight: 600 }}>
                  {k.konsumen.nama}
                </Link>
                <div style={{ color: TEXT_MID }}>{telepon(k.konsumen.telepon)}</div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: 14 }}>
                {k.status === "booking" || k.status === "terjual" ? "Konsumen milik rekan tim lain." : "Belum ada konsumen untuk unit ini."}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: TEXT_MID, marginBottom: 6 }}>Progres Pembangunan</div>
            {k.progres ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ background: BORDER, borderRadius: 20, height: 8, marginBottom: 6, overflow: "hidden" }}>
                  <div style={{ background: ORANGE, height: "100%", width: `${Number(k.progres.persen) || 0}%` }} />
                </div>
                <div style={{ color: TEXT_MID }}>
                  {Number(k.progres.persen) || 0}% · <Badge value={k.progres.status} />
                  {k.progres.target && ` · target ${tanggal(k.progres.target)}`}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: TEXT_MID }}>Belum ada data monitoring lapangan untuk unit ini.</div>
            )}

            <PrimaryButton onClick={() => setModal(null)} style={{ marginTop: 18, width: "100%", background: "#fff", color: TEXT_MID, border: `1px solid ${BORDER}` }}>
              Tutup
            </PrimaryButton>
          </>
        )}
      </Modal>
    </div>
  );
}
