import { createClient } from "jsr:@supabase/supabase-js@2";

import { PASSES, isPassType } from "../_shared/passes.ts";
import { getProvider } from "../_shared/providers.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Numéros locaux : 8 à 15 chiffres, indicatif optionnel.
const PHONE_RE = /^\+?\d{8,15}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anon.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  let body: { pass?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!isPassType(body.pass)) {
    return json({ error: "invalid_pass", allowed: Object.keys(PASSES) }, 400);
  }
  const phone = (body.phone ?? "").replace(/[\s.-]/g, "");
  if (!PHONE_RE.test(phone)) return json({ error: "invalid_phone" }, 400);

  const pass = PASSES[body.pass];
  const provider = getProvider();
  const reference = crypto.randomUUID();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // La ligne est écrite AVANT de contacter l'agrégateur : si l'appel échoue à
  // mi-chemin, la référence existe déjà et le webhook pourra la retrouver.
  const { error: insertError } = await admin.from("payments").insert({
    user_id: user.id,
    provider: provider.name,
    provider_ref: reference,
    pass_type: body.pass,
    amount_xof: pass.amountXof,
    status: "pending",
  });
  if (insertError) {
    console.error("payments insert failed", insertError);
    return json({ error: "payment_setup_failed" }, 500);
  }

  try {
    const result = await provider.initiate({
      reference,
      amountXof: pass.amountXof,
      passType: body.pass,
      phone,
      userId: user.id,
    });
    return json({
      reference,
      amount_xof: pass.amountXof,
      pass: body.pass,
      ...result,
    });
  } catch (e) {
    console.error("provider initiate failed", e);
    await admin.from("payments").update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("provider", provider.name).eq("provider_ref", reference);
    return json({ error: "payment_setup_failed" }, 502);
  }
});
