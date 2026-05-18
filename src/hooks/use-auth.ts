import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type Role = "admin" | "employee" | "it_personnel";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    // Setup the listener BEFORE reading the initial session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setRole(null);
        setFullName(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Fetch role + name whenever the session changes.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setRole((roles?.[0]?.role as Role) ?? "employee");
      setFullName(profile?.full_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { session, loading, role, fullName, signOut };
}
