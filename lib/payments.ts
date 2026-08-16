import { SUPABASE_URL, supabase } from './supabase';

export type PassType = 'day' | 'week' | 'month';

/**
 * Affichage uniquement. Le montant réellement débité est celui du catalogue
 * serveur (supabase/functions/_shared/passes.ts) : le client ne choisit qu'un
 * identifiant de pass, jamais un prix.
 */
export const PASSES: { id: PassType; name: string; amountXof: number; note?: string; best?: boolean }[] = [
  { id: 'day', name: '24 HEURES', amountXof: 200 },
  { id: 'month', name: '30 JOURS', amountXof: 3000, note: 'Environ 100 FCFA par jour', best: true },
  { id: 'week', name: '7 JOURS', amountXof: 1000 },
];

export function formatXof(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

export type CreatePaymentResult =
  | { ok: true; reference: string; instructions: string; checkoutUrl?: string }
  | { ok: false; error: string };

export async function createPayment(pass: PassType, phone: string): Promise<CreatePaymentResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Session expirée.' };

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pass, phone }),
    });
  } catch {
    return { ok: false, error: 'Connexion impossible. Vérifie ton réseau.' };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    const reason = body?.error === 'invalid_phone' ? 'Numéro invalide.' : 'Le paiement n\'a pas pu démarrer.';
    return { ok: false, error: reason };
  }
  return { ok: true, reference: body.reference, instructions: body.instructions, checkoutUrl: body.checkoutUrl };
}

/** True dès qu'un pass actif est visible en base, false au bout du délai. */
export async function waitForAccess(timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('status', 'active')
      .gt('current_period_end', new Date().toISOString())
      .maybeSingle();
    if (data) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}
