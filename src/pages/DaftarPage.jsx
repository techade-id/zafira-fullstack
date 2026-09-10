import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Asterisk } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PRIMARY, PRIMARY_SOFT, ACCENT, PAGE_BG, SURFACE, BORDER, TEXT_DARK, TEXT_MID, NEGATIVE } from "../components/ui";

export default function DaftarPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selesai, setSelesai] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.full_name.trim() || !form.email.trim() || !form.password) {
      setError("Nama, email, dan password wajib diisi.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);
    setError("");
    const { error: signUpError } = await signUp(form.email.trim(), form.password, form.full_name.trim());
    setLoading(false);

    if (signUpError) {
      // Batas domain ditegakkan oleh trigger handle_new_user, jadi pesannya
      // datang dari database — diteruskan apa adanya karena sudah jelas.
      setError(signUpError.message);
      return;
    }
    setSelesai(true);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PAGE_BG, padding: 20 }}>
      <div style={{ background: SURFACE, width: 400, maxWidth: "90vw", borderRadius: 22, border: `1px solid ${BORDER}`, padding: "42px 34px", textAlign: "center" }}>
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
            color: PRIMARY,
          }}
        >
          <Asterisk size={30} />
        </div>

        {selesai ? (
          <>
            <h1 style={{ fontSize: 19, margin: "0 0 10px", color: TEXT_DARK, letterSpacing: "-0.02em" }}>Pendaftaran Diterima</h1>
            <p style={{ fontSize: 13.5, color: TEXT_MID, margin: "0 0 24px", lineHeight: 1.6 }}>
              Akun Anda sudah tercatat tetapi belum aktif. Admin akan menetapkan peran Anda terlebih dahulu — setelah itu Anda dapat masuk.
            </p>
            <button
              onClick={() => navigate("/login")}
              style={{ width: "100%", padding: 12, background: ACCENT, color: "#fff", border: "none", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Kembali ke Halaman Masuk
            </button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 21, margin: "0 0 6px", color: TEXT_DARK, letterSpacing: "-0.02em" }}>Daftar Akun</h1>
            <p style={{ fontSize: 13, color: TEXT_MID, margin: "0 0 22px", lineHeight: 1.6 }}>
              Gunakan email kantor Anda. Akun baru perlu disetujui admin sebelum dapat dipakai.
            </p>

            <Field icon={User} placeholder="Nama Lengkap" value={form.full_name} onChange={(v) => set("full_name", v)} onKeyDown={handleKeyDown} />
            <Field icon={Mail} type="email" placeholder="Email" value={form.email} onChange={(v) => set("email", v)} onKeyDown={handleKeyDown} />
            <Field icon={Lock} type="password" placeholder="Password (min. 8 karakter)" value={form.password} onChange={(v) => set("password", v)} onKeyDown={handleKeyDown} />
            <Field icon={Lock} type="password" placeholder="Ulangi Password" value={form.confirm} onChange={(v) => set("confirm", v)} onKeyDown={handleKeyDown} />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: "100%",
                padding: 13,
                background: ACCENT,
                color: "#fff",
                border: "none",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Memproses..." : "Daftar"}
            </button>

            <div style={{ color: NEGATIVE, fontSize: 12, marginTop: 10, minHeight: 14, lineHeight: 1.5 }}>{error}</div>

            <div style={{ fontSize: 13, color: TEXT_MID, marginTop: 6 }}>
              Sudah punya akun?{" "}
              <Link to="/login" style={{ color: PRIMARY, fontWeight: 600, textDecoration: "none" }}>
                Masuk
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ icon: Icon, type = "text", placeholder, value, onChange, onKeyDown }) {
  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <Icon size={16} color={TEXT_MID} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "12px 14px 12px 36px",
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
