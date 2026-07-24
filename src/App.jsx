import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProspekPage from "./pages/ProspekPage";
import PembayaranPage from "./pages/PembayaranPage";
import KonsumenPage from "./pages/KonsumenPage";
import PembatalanPage from "./pages/PembatalanPage";
import ProyekPage from "./pages/ProyekPage";
import SiteplanPage from "./pages/SiteplanPage";
import KontraktorPage from "./pages/KontraktorPage";
import MonitoringLapanganPage from "./pages/MonitoringLapanganPage";
import KomplainPage from "./pages/KomplainPage";
import LaporanPage from "./pages/LaporanPage";
import IklanPage from "./pages/IklanPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="prospek" element={<ProspekPage />} />
            <Route path="pembayaran" element={<PembayaranPage />} />
            <Route path="konsumen" element={<KonsumenPage />} />
            <Route path="pembatalan" element={<PembatalanPage />} />
            <Route path="proyek" element={<ProyekPage />} />
            <Route path="siteplan" element={<SiteplanPage />} />
            <Route path="kontraktor" element={<KontraktorPage />} />
            <Route path="monitoring-lapangan" element={<MonitoringLapanganPage />} />
            <Route path="komplain" element={<KomplainPage />} />
            <Route path="laporan" element={<LaporanPage />} />
            <Route path="iklan" element={<IklanPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
