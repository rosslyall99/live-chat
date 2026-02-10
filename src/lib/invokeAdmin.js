import { supabase } from "../supabaseClient";

// Returns { data, error } and NEVER refreshes session, NEVER signs out.
export async function invokeAdmin(fn, body = {}) {
  const { data: sessData, error: sessErr } = await supabase.auth.getSession();
  const token = sessData?.session?.access_token;

  if (sessErr || !token) {
    return { data: null, error: { status: 401, message: "No active session" } };
  }

  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    return {
      data: null,
      error: {
        status: error?.context?.status || error?.status || 500,
        message: error.message || "Invoke failed",
        raw: error,
      },
    };
  }

  return { data, error: null };
}
