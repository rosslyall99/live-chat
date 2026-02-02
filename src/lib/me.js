import { supabase } from "../supabaseClient";

export async function getMeAndRole() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { user: null, role: null };

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_active) return { user, role: null };
  return { user, role: profile.role || null };
}
