import { SUPABASE_URL, supabase } from './supabase';

export type Style = 'charmeur' | 'direct' | 'joueur';

export const STYLES: { id: Style; label: string }[] = [
  { id: 'charmeur', label: 'Charming' },
  { id: 'direct', label: 'Direct' },
  { id: 'joueur', label: 'Playful' },
];

/**
 * Capture courante partagée entre l'écran d'upload et l'écran de résultats.
 * Un simple module : l'image en base64 est trop lourde pour transiter par les
 * paramètres de route, et rien d'autre n'a besoin d'y réagir.
 */
export const current: {
  uri: string | null;
  base64: string | null;
  mimeType: string;
  style: Style;
  suggestions: string[];
  conversationDetected: boolean;
} = {
  uri: null,
  base64: null,
  mimeType: 'image/jpeg',
  style: 'charmeur',
  suggestions: [],
  conversationDetected: true,
};

export type GenerateResult =
  | { ok: true; suggestions: string[]; conversationDetected: boolean }
  | { ok: false; paywall: true }
  | { ok: false; paywall?: false; error: string };

/** Appelle l'Edge Function generate-replies avec le JWT de la session courante. */
export async function generateReplies(): Promise<GenerateResult> {
  if (!current.base64) return { ok: false, error: 'Aucune capture sélectionnée.' };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Session expirée.' };

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/generate-replies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: current.base64,
        mimeType: current.mimeType,
        style: current.style,
      }),
    });
  } catch {
    return { ok: false, error: 'Connexion impossible. Vérifie ton réseau.' };
  }

  // 402 est le signal paywall posé par l'Edge Function.
  if (res.status === 402) return { ok: false, paywall: true };

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    return { ok: false, error: "La génération a échoué. Réessaie dans un instant." };
  }

  current.suggestions = body.suggestions ?? [];
  current.conversationDetected = body.conversation_detected ?? false;
  return {
    ok: true,
    suggestions: current.suggestions,
    conversationDetected: current.conversationDetected,
  };
}
