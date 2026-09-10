import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canVisit } from "../lib/permissions";

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#64748B" }}>
        Memuat...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Route-level role gate. Hiding a menu item is presentation only; this is what
 * stops a pasted URL — and RLS stops everything that gets past both.
 */
export function RoleRoute({ children }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  // The profile lands a moment after the session. Deciding before it arrives
  // would bounce every user off their own page on a hard refresh.
  if (loading || !profile) return null;

  if (!canVisit(profile, location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
