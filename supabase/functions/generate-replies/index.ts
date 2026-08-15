import { createClient } from "jsr:@supabase/supabase-js@2";

const STYLES = ["charmeur", "direct", "joueur"] as const;
type Style = (typeof STYLES)[number];

// Le modèle est surchargeable par env : l'identifiant exact de Gemini 3.1
// Flash-Lite doit être confirmé côté console Google avant la mise en prod.
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.1-flash-lite";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// ~7,5 Mo de base64 ≈ 5,6 Mo d'image brute. Au-delà, l'appel Gemini échouerait
// de toute façon : autant refuser tôt et ne rien facturer.
const MAX_IMAGE_B64_LENGTH = 7_500_000;

const SYSTEM_PROMPT = `Tu es un assistant qui aide un utilisateur à répondre dans une conversation
de rencontre à partir d'une capture d'écran de chat.

CONTEXTE
On te fournit une image de conversation. Identifie :
- qui a envoyé le dernier message (l'utilisateur ou son interlocuteur)
- le ton général et la langue utilisée
- si l'interlocuteur montre des signes de désintérêt, malaise ou de vouloir
  clore la conversation

RÈGLE CRITIQUE : si l'interlocuteur montre un désintérêt clair, malaise, ou
refus, ne génère PAS de relances insistantes. Adapte les suggestions vers
une sortie polie ou n'insiste pas sur la séduction dans ce tour-là.

STYLES DISPONIBLES (l'utilisateur en choisit un)
- charmeur : fluide, complimente subtilement, pose une question ouverte
- direct : phrases courtes, franc, propose une action concrète (se voir,
  échanger un contact)
- joueur : taquin, une pointe d'humour ou de second degré, jamais méchant

CONTRAINTES DE FORME
- Réponds dans la même langue que la conversation détectée
- Longueur d'un vrai texto (1-2 phrases max), jamais de pavé
- Pas de clichés génériques ("Salut ça va ?"), ancre-toi dans ce qui a été
  dit dans la capture
- Pas de contenu sexuel explicite

Génère exactement 3 propositions distinctes pour le style demandé.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    conversation_detected: { type: "boolean" },
    suggestions: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ["conversation_detected", "suggestions"],
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1. Authentifier via JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anon.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  // Validation de l'entrée
  let body: { image?: string; mimeType?: string; style?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const style = body.style as Style;
  if (!STYLES.includes(style)) {
    return json({ error: "invalid_style", allowed: STYLES }, 400);
  }

  // Accepte aussi bien un base64 nu qu'une data URL.
  const image = (body.image ?? "").replace(/^data:[^;]+;base64,/, "");
  const mimeType = body.mimeType ?? "image/jpeg";
  if (!image) return json({ error: "missing_image" }, 400);
  if (image.length > MAX_IMAGE_B64_LENGTH) return json({ error: "image_too_large" }, 413);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 2. Vérifier le quota AVANT l'appel Gemini
  const { data: remaining, error: quotaError } = await admin.rpc("get_remaining_quota", {
    p_user_id: user.id,
  });
  if (quotaError) {
    console.error("quota check failed", quotaError);
    return json({ error: "quota_check_failed" }, 500);
  }
  if ((remaining ?? 0) <= 0) return json({ paywall: true }, 402);

  // 3. Appeler Gemini
  let result: { conversation_detected: boolean; suggestions: string[] };
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: image } },
              { text: `Style demandé : ${style}` },
            ],
          }],
          generationConfig: {
            temperature: 0.9,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      console.error("gemini http error", geminiRes.status, await geminiRes.text());
      return json({ error: "generation_failed" }, 502);
    }

    const payload = await geminiRes.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("gemini empty response", JSON.stringify(payload));
      return json({ error: "generation_failed" }, 502);
    }
    result = JSON.parse(text);
  } catch (e) {
    console.error("gemini call failed", e);
    return json({ error: "generation_failed" }, 502);
  }

  // Le responseSchema n'est pas une garantie dure : on revalide avant de facturer.
  const suggestions = Array.isArray(result?.suggestions)
    ? result.suggestions.filter((s) => typeof s === "string" && s.trim().length > 0)
    : [];
  if (typeof result?.conversation_detected !== "boolean") {
    console.error("gemini malformed payload", JSON.stringify(result));
    return json({ error: "generation_failed" }, 502);
  }
  if (result.conversation_detected && suggestions.length < 3) {
    console.error("gemini returned too few suggestions", JSON.stringify(result));
    return json({ error: "generation_failed" }, 502);
  }

  // 4. Logguer SEULEMENT après succès
  const { error: logError } = await admin.from("generations").insert({
    user_id: user.id,
    style,
    conversation_detected: result.conversation_detected,
    suggestion_count: suggestions.length,
  });
  if (logError) {
    // On a la réponse : la rendre quand même plutôt que de faire payer une
    // panne d'écriture à l'utilisateur. Le crédit non décompté est le moindre mal.
    console.error("generations insert failed", logError);
  }

  return json({
    conversation_detected: result.conversation_detected,
    suggestions,
    remaining_quota: Math.max((remaining ?? 0) - 1, 0),
  });
});
