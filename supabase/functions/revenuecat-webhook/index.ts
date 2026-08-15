import { createClient } from "jsr:@supabase/supabase-js@2";

// Secret partagé configuré côté dashboard RevenueCat (header Authorization).
// Ce n'est PAS un JWT Supabase : verify_jwt est désactivé pour cette fonction
// dans supabase/config.toml.
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET")!;

const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
]);
const EXPIRED_EVENTS = new Set([
  "EXPIRATION",
  "CANCELLATION",
  "BILLING_ISSUE",
]);

const STORE_MAP: Record<string, string> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparaison à temps constant : évite de fuiter le secret octet par octet. */
function secretMatches(provided: string): boolean {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!secretMatches(req.headers.get("Authorization") ?? "")) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: { event?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const event = payload?.event;
  const type = String(event?.type ?? "");
  const appUserId = String(event?.app_user_id ?? "");

  let status: string;
  if (ACTIVE_EVENTS.has(type)) status = "active";
  else if (EXPIRED_EVENTS.has(type)) status = "expired";
  // TEST, TRANSFER, SUBSCRIBER_ALIAS... : rien à écrire, mais on acquitte en 200
  // pour que RevenueCat ne retente pas indéfiniment.
  else return json({ ignored: type }, 200);

  // app_user_id doit être l'id Supabase (Purchases.logIn(supabaseUserId) côté
  // app). Un id anonyme RevenueCat ($RCAnonymousID:...) n'a pas de compte en
  // face : on acquitte sans écrire, un retry ne changerait rien.
  if (!UUID_RE.test(appUserId)) {
    console.error("unmapped app_user_id", appUserId, type);
    return json({ ignored: "unmapped_app_user_id" }, 200);
  }

  const expirationMs = Number(event?.expiration_at_ms ?? 0);
  const entitlements = event?.entitlement_ids as string[] | undefined;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await admin.from("subscriptions").upsert({
    user_id: appUserId,
    store: STORE_MAP[String(event?.store ?? "")] ?? null,
    revenuecat_entitlement: entitlements?.[0] ?? (event?.entitlement_id as string) ?? null,
    status,
    current_period_end: expirationMs > 0 ? new Date(expirationMs).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) {
    // 500 → RevenueCat retente. L'upsert est idempotent, un rejeu est sans risque.
    console.error("subscriptions upsert failed", error);
    return json({ error: "upsert_failed" }, 500);
  }

  return json({ ok: true, type, status });
});
