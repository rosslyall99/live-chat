// supabase/functions/notify-teams/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const url = Deno.env.get("TEAMS_WEBHOOK_URL");
    if (!url) return new Response("Missing TEAMS_WEBHOOK_URL", { status: 500 });

    const {
      title = "Live Chat",
      text = "",
      conversationUrl = "",
    } = await req.json();

    const bodyText =
      `**${title}**\n\n${text}` + (conversationUrl ? `\n\n${conversationUrl}` : "");

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: bodyText }),
    });

    if (!r.ok) {
      const err = await r.text();
      return new Response(`Teams error: ${r.status} ${err}`, { status: 502 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
