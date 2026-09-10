#!/usr/bin/env bash
#
# Menjalankan suite pengujian database terhadap Postgres lokal.
#
#   ./supabase/tests/run.sh          (atau: npm run test:db)
#
# Yang dilakukan: membuat database sekali pakai, memasang seluruh migrasi
# berurutan, mengisi data uji, menjalankan berkas uji, lalu menghapus
# databasenya kembali. Tidak menyentuh proyek Supabase mana pun.
#
# Keluar dengan status bukan-nol bila ada uji yang gagal, sehingga CI dan
# skrip lain dapat membedakan lulus dari gagal.
#
# Variabel lingkungan:
#   TEST_DB   nama database sementara (default: zafira_test)
#   KEEP_DB=1 jangan hapus database di akhir, untuk menelusuri kegagalan

set -uo pipefail

DB="${TEST_DB:-zafira_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL="$ROOT/supabase"
TESTS="$SQL/tests"
LOG="$(mktemp -t zafira-test.XXXXXX)"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql tidak ditemukan. Pasang Postgres terlebih dahulu (mis. brew install postgresql)." >&2
  exit 2
fi

if ! pg_isready -q 2>/dev/null; then
  echo "Server Postgres lokal tidak berjalan. Jalankan dulu (mis. brew services start postgresql)." >&2
  exit 2
fi

cleanup() {
  rm -f "$LOG"
  if [ "${KEEP_DB:-0}" = "1" ]; then
    echo ""
    echo "Database $DB dipertahankan. Telusuri dengan: psql -d $DB"
  else
    dropdb --if-exists "$DB" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Menjalankan satu berkas SQL. Mengembalikan status psql apa adanya, dan hanya
# mencetak keluaran bila gagal — NOTICE dari `create ... if not exists` di
# dalam migrasi memang ramai tetapi tidak berarti apa-apa.
run_sql() {
  local file="$1"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$file" >"$LOG" 2>&1
  local code=$?
  if [ $code -ne 0 ]; then
    echo ""
    grep -E "ERROR|FATAL" "$LOG" | head -10
  fi
  return $code
}

echo "▸ Menyiapkan database $DB"
dropdb --if-exists "$DB" 2>/dev/null || true
createdb "$DB" || exit 2

echo "▸ Memasang skema dan migrasi"
for f in "$TESTS/00_harness.sql" "$SQL/schema.sql" "$SQL"/migration_0*.sql "$SQL/storage.sql"; do
  if run_sql "$f"; then
    echo "  ✓ $(basename "$f")"
  else
    echo "  ✗ $(basename "$f") — migrasi gagal, suite dihentikan"
    exit 2
  fi
done

echo "▸ Mengisi data uji"
if ! run_sql "$TESTS/01_fixtures.sql"; then
  echo "  ✗ 01_fixtures.sql gagal, suite dihentikan"
  exit 2
fi

# Sebuah berkas uji bisa terhenti di tengah jalan bila ada pernyataan tak
# terduga yang gagal. Itu dicatat sebagai kegagalan, tetapi berkas berikutnya
# tetap dijalankan supaya satu masalah tidak menyembunyikan sisanya.
echo "▸ Menjalankan uji"
aborted=0
for f in "$TESTS"/0[2-9]_*.sql; do
  if run_sql "$f"; then
    echo "  ✓ $(basename "$f")"
  else
    echo "  ✗ $(basename "$f") — berhenti di tengah berkas"
    aborted=$((aborted + 1))
  fi
done

# ON_ERROR_STOP juga di sini: ringkasan melempar exception bila ada uji gagal,
# dan tanpa flag ini psql tetap keluar dengan status 0 — suite yang selalu
# hijau lebih berbahaya daripada tidak ada suite sama sekali.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$TESTS/99_summary.sql"
summary=$?

if [ $summary -ne 0 ] || [ $aborted -gt 0 ]; then
  exit 1
fi
exit 0
