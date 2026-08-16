// Couche d'abstraction des agrégateurs mobile money.
//
// L'agrégateur n'est pas encore choisi. Tout le reste du code parle à cette
// interface : brancher KkiaPay, FedaPay ou CinetPay revient à ajouter un
// adaptateur ici, sans toucher aux fonctions ni à l'app.

import type { PassType } from './passes.ts';

export type InitiateInput = {
  reference: string;
  amountXof: number;
  passType: PassType;
  phone: string;
  userId: string;
};

export type InitiateResult = {
  /** URL de paiement à ouvrir, quand l'agrégateur en fournit une. */
  checkoutUrl?: string;
  /** Message à afficher à l'utilisateur en attendant la confirmation. */
  instructions: string;
};

export type Provider = {
  name: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Valide l'authenticité d'un appel entrant du webhook. */
  verifyWebhook(req: Request, rawBody: string): boolean;
};

/** Comparaison à temps constant, comme pour l'ancien webhook RevenueCat. */
function secretMatches(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Adaptateur de test : ne contacte aucun opérateur, se contente d'enregistrer
 * l'intention. Le paiement se confirme en appelant payment-webhook à la main,
 * ce qui rend tout le flux testable avant d'avoir un compte marchand.
 */
const stub: Provider = {
  name: 'stub',
  initiate({ reference, amountXof, phone }) {
    console.log('stub payment initiated', { reference, amountXof, phone });
    return Promise.resolve({
      instructions:
        `Paiement simulé de ${amountXof} FCFA depuis le ${phone}. ` +
        `Confirme-le en appelant payment-webhook avec la référence ${reference}.`,
    });
  },
  verifyWebhook(req) {
    return secretMatches(
      req.headers.get('Authorization') ?? '',
      Deno.env.get('PAYMENT_WEBHOOK_SECRET') ?? undefined,
    );
  },
};

const PROVIDERS: Record<string, Provider> = { stub };

export function getProvider(): Provider {
  const name = Deno.env.get('PAYMENT_PROVIDER') ?? 'stub';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`unknown payment provider: ${name}`);
  return provider;
}
