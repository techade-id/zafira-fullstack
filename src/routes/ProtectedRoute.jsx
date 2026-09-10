import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canVisit } from "../lib/permissions";
import { PRIMARY, PRIMARY_SOFT, ACCENT, PAGE_BG, SURFACE, BORDER, TEXT_DARK, TEXT_MID } from "../components/ui";

function Layar({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PAGE_BG, padding: 20 }}>
      {children}
    </div>
  );
}

/**
 * Akun yang belum disetujui tetap dapat masuk — Supabase Auth tidak tahu
 * apa-apa soal persetujuan. Yang menahannya adalah is_active, dan tanpa layar
 * ini pengguna akan melihat aplikasi yang tampak rusak: menu kosong, tabel
 * kosong, tanpa penjelasan apa pun.
 */
function MenungguPersetujuan({ profile, onSignOut }) {
  return (
    <Layar>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 22, padding: "38px 34px", width: 420, maxWidth: "90vw", textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: PRIMARY_SOFT,
            borderRadius: 17,
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
          }}
        >
          ⏳
        </div>
        <h1 style={{ fontSize: 19, margin: "0 0 8px", color: TEXT_DARK, letterSpacing: "-0.02em" }}>Menunggu Persetujuan</h1>
        <p style={{ fontSize: 13.5, color: TEXT_MID, margin: "0 0 6px", lineHeight: 1.6 }}>
          Akun <b style={{ color: TEXT_DARK }}>{profile?.full_name}</b> sudah terdaftar, tetapi belum diaktifkan.
        </p>
        <p style={{ fontSize: 13, color: TEXT_MID, margin: "0 0 24px", lineHeight: 1.6 }}>
          Hubungi admin untuk menetapkan peran Anda. Setelah disetujui, cukup masuk kembali.
        </p>
        <button
          onClick={onSignOut}
          style={{ width: "100%", padding: 12, background: ACCENT, color: "#fff", border: "none", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Keluar
        </button>
      </div>
    </Layar>
  );
}

export default function ProtectedRoute({ children }) {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return <Layar><span style={{ fontFamily: "sans-serif", color: TEXT_MID }}>Memuat...</span></Layar>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Profil menyusul sesaat setelah sesi; memutuskan sebelum ia tiba akan
  // melempar setiap pengguna keluar dari halamannya sendiri saat refresh.
  if (!profile) {
    return <Layar><span style={{ fontFamily: "sans-serif", color: TEXT_MID }}>Memuat profil...</span></Layar>;
  }

  if (profile.is_active === false) {
    return <MenungguPersetujuan profile={profile} onSignOut={signOut} />;
  }

  return children;
}

/**
 * Penjagaan rute berbasis peran. Menyembunyikan menu hanyalah tampilan; ini
 * yang menahan URL yang ditempel — dan RLS menahan apa pun yang lolos keduanya.
 */
export function RoleRoute({ children }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading || !profile) return null;

  if (!canVisit(profile, location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
