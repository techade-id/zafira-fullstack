import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { canWrite } from "../lib/permissions";
import ModalProspek from "./ModalProspek";
import { PRIMARY } from "./ui";

/**
 * Menangkap prospek dalam hitungan detik, dari halaman mana pun.
 *
 * PRD §4.1 sudah membuat formulir intaknya minimal — tiga bidang. Yang tersisa
 * adalah jaraknya: seorang Sales di pameran atau OTS harus membuka menu,
 * berpindah ke halaman Prospek, menekan "+ Prospek Baru", baru mengisi. Dengan
 * calon pembeli berdiri di depannya, tiga langkah itu sudah terlalu banyak —
 * dan prospek yang dicatat di kertas biasanya berhenti di kertas.
 *
 * Tombol ini duduk di header, jadi selalu satu ketukan jauhnya. Formulirnya
 * sama dengan tombol "+ Prospek Baru" di halaman Leads (ModalProspek).
 */
export default function TambahProspekCepat() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [buka, setBuka] = useState(false);

  if (!canWrite(profile, "lead")) return null;

  return (
    <>
      <button
        onClick={() => setBuka(true)}
        title="Prospek baru"
        aria-label="Tambah prospek baru"
        className="icon-btn tambah-cepat"
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: PRIMARY,
          border: `1px solid ${PRIMARY}`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Plus size={19} />
      </button>

      <ModalProspek
        open={buka}
        lead={null}
        onClose={() => setBuka(false)}
        onSaved={(id) => id && navigate(`/prospek?sorot=${id}`)}
      />
    </>
  );
}
