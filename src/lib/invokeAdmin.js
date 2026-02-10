import { supabase } from "../supabaseClient";

export async function invokeAdmin(fn, body) {
  const { data: sessData, error: sessErr } = await supabase.auth.getSession();
  const token = sessData?.session?.access_token;

  if (sessErr || !token) {
    return { data: null, error: { message: "No active session", status: 401 } };
  }

  return await supabase.functions.invoke(fn, {
    body: body || {},
    headers: { Authorization: `Bearer ${token}` },
  });
}
