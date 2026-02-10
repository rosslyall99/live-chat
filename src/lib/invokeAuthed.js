import { supabase } from "../supabaseClient";

export async function invokeAuthed(fn, body) {
  const { data: sessData } = await supabase.auth.getSession();
  const token = sessData?.session?.access_token;

  if (!token) {
    return { data: null, error: { message: "No active session", status: 401 } };
  }

  return await supabase.functions.invoke(fn, {
    body: body || {},
    headers: { Authorization: `Bearer ${token}` },
  });
}
