import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Asterisk } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PRIMARY, PRIMARY_SOFT, PAGE_BG, BORDER, TEXT_DARK, TEXT_MID } from "../components/ui";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError("Email dan password wajib diisi.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PAGE_BG,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          width: 380,
          maxWidth: "90vw",
          borderRadius: 22,
          border: `1px solid ${BORDER}`,
          padding: "42px 34px",
          textAlign: "center",
        }}
      >
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
        <h1 style={{ fontSize: 21, marginBottom: 6, color: TEXT_DARK, letterSpacing: "-0.02em" }}>Griya Zafira CRM</h1>
        <p style={{ color: TEXT_MID, fontSize: 13, marginBottom: 24 }}>Masuk untuk melanjutkan ke Dashboard</p>

        <div>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Mail size={16} color={TEXT_MID} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Email"
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
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Lock size={16} color={TEXT_MID} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Password"
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

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%",
              padding: 13,
              background: PRIMARY,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>
          <div style={{ color: "#c25b5b", fontSize: 12, marginTop: 10, minHeight: 14 }}>{error}</div>
        </div>
      </div>
    </div>
  );
}
