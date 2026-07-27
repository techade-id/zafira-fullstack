/**
 * Supabase caps a single response at 1000 rows by default, and does it
 * silently — you get 1000 rows and no error, so totals and exports go quietly
 * wrong once the table grows past that. This pages through with .range()
 * until a short page comes back.
 *
 * Pass a function that builds the query fresh each call, since a PostgREST
 * builder can only be awaited once:
 *
 *   const { data, error } = await fetchAllRows(() =>
 *     supabase.from("leads").select("*").order("created_at", { ascending: false })
 *   );
 */
export async function fetchAllRows(makeQuery, { pageSize = 1000, maxRows = 100000 } = {}) {
  const all = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: all, error };

    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return { data: all, error: null };
}
