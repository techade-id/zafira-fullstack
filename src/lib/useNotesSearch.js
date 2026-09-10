import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Below this length the trigram index cannot be used and Postgres falls back to
 * scanning every table, so the query is not sent at all. Kept here so the input
 * and the results list agree on when searching has actually started.
 */
export const MIN_QUERY = 3;

/**
 * Debounced global notes search (REVISI §1.3).
 *
 * Calls `search_notes`, which runs SECURITY INVOKER — every row that comes back
 * has already passed RLS, so a Sales user only ever sees their own records.
 */
export function useNotesSearch(query, { limit = 20, enabled = true } = {}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = (query || "").trim();

    if (!enabled || q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("search_notes", { p_q: q, p_limit: limit });
      if (!active) return;
      setLoading(false);
      if (rpcError) {
        setError(rpcError.message);
        setResults([]);
        return;
      }
      setError("");
      setResults(data || []);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, limit, enabled]);

  return { results, loading, error };
}

/** Groups hits by module, preserving the order the modules first appear in. */
export function groupByModule(results) {
  const groups = [];
  const index = new Map();
  for (const row of results) {
    if (!index.has(row.modul)) {
      index.set(row.modul, groups.length);
      groups.push({ modul: row.modul, rows: [] });
    }
    groups[index.get(row.modul)].rows.push(row);
  }
  return groups;
}
