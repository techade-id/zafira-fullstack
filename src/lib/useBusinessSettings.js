import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Returns `options` guaranteed to contain `current`.
 *
 * Without this, a value that was removed from Pengaturan Bisnis renders as an
 * empty <select>, and the next save writes that blank back — so merely opening
 * a record's form would destroy the stored value.
 */
export function withCurrentValue(options, current) {
  if (!current || options.includes(current)) return options;
  return [...options, current];
}

export function useBusinessSettings(category) {
  const [values, setValues] = useState([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("business_settings")
      .select("value")
      .eq("category", category)
      .order("sort_order")
      .then(({ data }) => {
        if (active) setValues((data || []).map((r) => r.value));
      });
    return () => {
      active = false;
    };
  }, [category]);

  return values;
}
