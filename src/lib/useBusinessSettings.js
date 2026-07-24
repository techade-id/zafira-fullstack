import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

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
