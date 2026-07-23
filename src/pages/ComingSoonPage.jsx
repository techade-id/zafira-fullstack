import React from "react";
import { Card, PageTitle, TEXT_MID } from "../components/ui";

export default function ComingSoonPage({ title, description, plannedFields }) {
  return (
    <div>
      <PageTitle title={title} subtitle={description} />
      <Card>
        <div style={{ fontSize: 13, color: TEXT_MID, marginBottom: plannedFields ? 12 : 0 }}>
          Modul ini sudah punya tabel di database (lihat <code>supabase/schema.sql</code>) tapi UI CRUD-nya belum
          dibangun. Gunakan halaman Prospek atau Pembayaran sebagai contoh pola untuk melanjutkan.
        </div>
        {plannedFields && (
          <ul style={{ fontSize: 13, color: TEXT_MID, marginTop: 10, paddingLeft: 18 }}>
            {plannedFields.map((f) => (
              <li key={f} style={{ marginBottom: 4 }}>
                {f}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
