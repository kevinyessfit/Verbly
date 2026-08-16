import { createClient } from "jsr:@supabase/supabase-js@2";

import { getProvider } from "../_shared/providers.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Opérateur déclaré par l'agrégateur, ramené aux valeurs acceptées en base.
const CHANNELS: Record<string, string> = {
  MTN: "mtn",
  MOOV: "moov",
  CELTIIS: "celtiis",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const provider = getProvider();
  const rawBody = await req.text();
  if (!provider.verifyWebhook(req, rawBody)) return json({ error: "unauthorized" }, 401);

  let event: { reference?: string; status?: string; channel?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const reference = String(event.reference ?? "");
  const status = String(event.status ?? "").toLowerCase();
  if (!reference) return json({ error: "missing_reference" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: payment, error: lookupError } = await admin
    .from("payments")
    .select("id, user_id, pass_type, status")
    .eq("provider", provider.name)
    .eq("provider_ref", reference)
    .maybeSingle();

  if (lookupError) {
    console.error("payment lookup failed", lookupError);
    return json({ error: "lookup_failed" }, 500);
  }
  // Référence inconnue : un rejeu n'y changera rien, on acquitte pour arrêter
  // les tentatives de l'agrégateur.
  if (!payment) {
    console.error("unknown payment reference", reference);
    return json({ ignored: "unknown_reference" }, 200);
  }

  // Idempotence : l'agrégateur rejoue ses webhooks, un pass déjà crédité ne
  // doit pas l'être une seconde fois.
  if (payment.status === "succeeded") return json({ ok: true, already: true }, 200);

  if (status !== "succeeded" && status !== "success") {
    const { error } = await admin
      .from("payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (error) {
      console.error("payment update failed", error);
      return json({ error: "update_failed" }, 500);
    }
    return json({ ok: true, status: "failed" }, 200);
  }

  // On marque payé d'abord, en exigeant que la ligne soit encore `pending` :
  // deux webhooks simultanés ne peuvent pas créditer deux pass.
  const { data: claimed, error: claimError } = await admin
    .from("payments")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select("id");

  if (claimError) {
    console.error("payment claim failed", claimError);
    return json({ error: "update_failed" }, 500);
  }
  if (!claimed?.length) return json({ ok: true, already: true }, 200);

  const { data: periodEnd, error: grantError } = await admin.rpc("grant_pass", {
    p_user_id: payment.user_id,
    p_pass_type: payment.pass_type,
    p_store: CHANNELS[String(event.channel ?? "").toUpperCase()] ?? "other",
  });

  if (grantError) {
    // Le paiement est encaissé mais l'accès n'est pas crédité : on rouvre la
    // ligne pour que le rejeu de l'agrégateur retente le grant.
    console.error("grant_pass failed", grantError);
    await admin.from("payments").update({ status: "pending" }).eq("id", payment.id);
    return json({ error: "grant_failed" }, 500);
  }

  return json({ ok: true, current_period_end: periodEnd });
});
