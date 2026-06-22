import { createClient } from "jsr:@supabase/supabase-js@2";

const FALLBACK_QUOTE = {
  quote: "Measure twice, promise once.",
  author: "Slanj HUB",
  source: "fallback",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getLondonDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function isSafeShortQuote(quote: string) {
  if (!quote || quote.length > 150) return false;

  const blocked = [
    /\bshit\b/i,
    /\bfuck/i,
    /\bcunt\b/i,
    /\bbastard\b/i,
    /\bdamn\b/i,
    /\bgod\b/i,
    /\bjesus\b/i,
    /\bchrist\b/i,
    /\btrump\b/i,
    /\bbiden\b/i,
    /\bwar\b/i,
  ];

  return !blocked.some((pattern) => pattern.test(quote));
}

async function fetchZenQuote() {
  const response = await fetch("https://zenquotes.io/api/today", {
    headers: {
      accept: "application/json",
      "user-agent": "Slanj-HUB-login-quote/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`ZenQuotes returned ${response.status}`);
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : null;
  const quote = cleanText(row?.q);
  const author = cleanText(row?.a) || null;

  if (!isSafeShortQuote(quote)) {
    throw new Error("ZenQuotes response was unsuitable for the login terminal.");
  }

  return {
    quote,
    author,
    source: "zenquotes",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(200, { ok: true, ...FALLBACK_QUOTE, cached: false });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const quoteDate = getLondonDate();

  try {
    const { data: cachedQuote, error: cachedError } = await adminClient
      .from("hub_daily_quotes")
      .select("quote_text, quote_author, source")
      .eq("quote_date", quoteDate)
      .maybeSingle();

    if (cachedError) throw cachedError;

    if (cachedQuote?.quote_text) {
      return json(200, {
        ok: true,
        quote: cachedQuote.quote_text,
        author: cachedQuote.quote_author,
        source: cachedQuote.source || "cache",
        cached: true,
      });
    }

    const freshQuote = await fetchZenQuote();

    const { error: saveError } = await adminClient
      .from("hub_daily_quotes")
      .upsert(
        {
          quote_date: quoteDate,
          quote_text: freshQuote.quote,
          quote_author: freshQuote.author,
          source: freshQuote.source,
        },
        { onConflict: "quote_date" },
      );

    if (saveError) {
      console.warn("[login-quote] Could not cache quote", saveError);
    }

    return json(200, {
      ok: true,
      ...freshQuote,
      cached: false,
    });
  } catch (error) {
    console.warn("[login-quote] Falling back to local quote", error);

    return json(200, {
      ok: true,
      ...FALLBACK_QUOTE,
      cached: false,
    });
  }
});
