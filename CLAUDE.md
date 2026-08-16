# Verbly — Assistant IA de drague

## Vue d'ensemble

**Verbly** — app web mobile qui analyse une capture d'écran de conversation
(dating apps, messageries) et génère 3 suggestions de réponse selon un
style choisi par l'utilisateur. Marché : Afrique de l'Ouest francophone,
paiement en mobile money. Stratégie de lancement : cloner le concept
dominant du marché (Rizz, W Rizz, Tchatch...), itérer ensuite sur la
différenciation.

Note de positionnement : sur ce marché l'usage dominant est WhatsApp et
Instagram DM plutôt que les apps de rencontre. Le prompt couvre déjà
« dating apps, messageries » ; le vocabulaire produit reste à revoir.

Nom choisi après vérification que l'espace de nommage évident (wing/rizz/
flirt/spark/charm/smooth + variantes) est déjà saturé de clones quasi
identiques (Wingly, Wingr, Wingy, WingAI, Winggg, Glint sont tous déjà
pris). Verbly = nom inventé, pas un mot du dictionnaire → plus sûr côté
disponibilité de marque/store.

## Stack

- **Frontend** : Expo + TypeScript (React Native) — même approche que Mangi
- **Backend/DB** : Supabase (Postgres, Auth, Edge Functions)
- **Distribution** : web mobile d'abord, pas de store. Ni Apple ni Google ne
  permettent d'encaisser en mobile money via leur facturation in-app, donc le
  store est incompatible avec le moyen de paiement du marché visé.
- **Paiement** : mobile money (MTN, Moov, Celtiis) via un agrégateur, non
  encore choisi (KkiaPay / FedaPay / CinetPay). Le code parle à une interface
  `Provider` dans `supabase/functions/_shared/providers.ts` ; brancher un
  agrégateur = écrire un adaptateur. Un adaptateur `stub` permet de tester le
  flux complet sans compte marchand.
- **Pas d'abonnement auto-renouvelé** : le mobile money ne fait pas de
  prélèvement récurrent fiable. Le modèle est le **pass prépayé**.
- **Vision LLM** : Gemini 3.1 Flash-Lite via l'API Google Generative
  Language. Identifiant confirmé en appel réel : `gemini-3.1-flash-lite`
  (surchargeable sans redéploiement via le secret `GEMINI_MODEL`).
  **Ne pas utiliser Gemini 2.5 Flash-Lite** (déprécié le
  16 octobre 2026). **DeepSeek exclu** : son API publique est text-only,
  pas de vision exposée malgré le "Vision Mode" de leur app grand public.

## Flow produit (MVP)

1. Auth (email + Sign in with Apple obligatoire sur iOS)
2. Upload capture d'écran (image picker Expo)
3. Choix du style : `charmeur` / `direct` / `joueur`
4. Appel Edge Function → Gemini → 3 suggestions
5. Copier / régénérer
6. Paywall après épuisement de l'essai gratuit

Hors scope V1 (à garder pour itération) : mémoire multi-tours, analyse de
bio/profil, multi-langue au-delà de la détection auto, feedback utilisateur
sur les réponses envoyées.

## Prompt système (Edge Function `generate-replies`)

```
Tu es un assistant qui aide un utilisateur à répondre dans une conversation
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

Génère exactement 3 propositions distinctes pour le style demandé.
```

Sortie forcée en JSON via `responseSchema` :

```json
{
  "type": "object",
  "properties": {
    "conversation_detected": { "type": "boolean" },
    "suggestions": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 3,
      "maxItems": 3
    }
  },
  "required": ["conversation_detected", "suggestions"]
}
```

`conversation_detected` sert de garde-fou si l'utilisateur upload une image
qui n'est pas une capture de chat.

## Schéma Supabase

Principes : **pas de stockage d'image** (données d'un tiers, pas juste de
l'utilisateur — inutile de garder ce risque), **quota calculé côté serveur
uniquement**, jamais fiable côté client.

```sql
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text default 'fr',
  created_at timestamptz default now()
);

-- SUBSCRIPTIONS (écrite uniquement par payment-webhook, service_role)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store text check (store in ('app_store', 'play_store')),
  revenuecat_entitlement text,
  status text not null check (status in ('trialing', 'active', 'expired', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint subscriptions_user_id_unique unique (user_id)
);
create index on public.subscriptions (user_id, status);

-- GENERATIONS (log d'usage uniquement, écrite par generate-replies, service_role)
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  style text not null,
  conversation_detected boolean not null,
  suggestion_count int not null default 0,
  created_at timestamptz default now()
);
create index on public.generations (user_id, created_at);

-- QUOTA : essai gratuit unique de 3 générations, non renouvelable
create or replace function public.get_remaining_quota(p_user_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_is_subscribed boolean;
  v_used_total int;
  v_free_trial constant int := 3;
begin
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id
      and status = 'active'
      and current_period_end > now()
  ) into v_is_subscribed;

  if v_is_subscribed then
    return 999;
  end if;

  select count(*) into v_used_total
  from public.generations
  where user_id = p_user_id;

  return greatest(v_free_trial - v_used_total, 0);
end;
$$;

-- RLS : lecture seule côté client, toute écriture passe par service_role
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.generations enable row level security;

create policy "profiles: user lit son propre profil"
  on public.profiles for select using (auth.uid() = id);

create policy "subscriptions: user lit son propre abonnement"
  on public.subscriptions for select using (auth.uid() = user_id);

create policy "generations: user lit son propre historique"
  on public.generations for select using (auth.uid() = user_id);
```

## Edge Functions

### `generate-replies`

Ordre d'exécution strict :
1. Authentifier via JWT (`supabase.auth.getUser`)
2. Vérifier `get_remaining_quota()` **avant** l'appel Gemini → `402` avec
   `{ paywall: true }` si quota épuisé
3. Appeler Gemini 3.1 Flash-Lite avec le prompt + `responseSchema`,
   `temperature: 0.9` (pour que "régénérer" donne de vraies variantes)
4. Logguer dans `generations` **seulement après succès** — un échec réseau
   ne doit jamais coûter un crédit d'essai à l'utilisateur

Le `402 Payment Required` est le signal que l'app doit intercepter pour
ouvrir le paywall.

Deux cas limites tranchés sur les crédits :
- `conversation_detected: false` est quand même loggué dans `generations`,
  donc une image qui n'est pas une capture de chat consomme un essai gratuit.
- Si l'insert dans `generations` échoue après un appel Gemini réussi, les
  suggestions sont renvoyées quand même et l'erreur est loggée : ce crédit
  n'est pas décompté. Une panne d'écriture ne doit pas être payée par
  l'utilisateur.

### `create-payment`

1. Authentifier via JWT
2. Valider le pass demandé (`day` / `week` / `month`) et le numéro
3. Écrire une ligne `payments` en `pending` **avant** de contacter
   l'agrégateur — si l'appel échoue à mi-chemin, la référence existe déjà et
   le webhook pourra la retrouver
4. Appeler `provider.initiate()` et renvoyer la référence + les consignes

Le client n'envoie **jamais** de montant : il choisit un identifiant de pass,
le prix vient du catalogue serveur (`_shared/passes.ts`).

### `payment-webhook`

- `verify_jwt = false` : l'agrégateur n'a pas de JWT Supabase. Authentifié
  par secret partagé (`PAYMENT_WEBHOOK_SECRET`), comparaison à temps constant,
  **fail closed** si le secret n'est pas configuré.
- Idempotence à deux niveaux : contrainte unique `(provider, provider_ref)` en
  base, et le passage `pending → succeeded` est conditionné à
  `.eq('status', 'pending')` pour que deux webhooks simultanés ne créditent
  pas deux pass.
- Succès → `grant_pass()`, qui **prolonge** `current_period_end` au lieu de
  l'écraser (acheter un pass en cours de période cumule).
- Référence inconnue → `200 {ignored}` (un rejeu n'y changerait rien).
- Échec du grant après encaissement → la ligne repasse `pending` et on renvoie
  `500` pour que l'agrégateur retente.

## Monétisation

Pass prépayés, pas d'abonnement : le mobile money ne sait pas prélever
automatiquement. L'utilisateur achète une durée d'accès et repaie s'il veut
prolonger.

| Pass | Prix | Rôle |
|---|---|---|
| 24 heures | 200 FCFA | Prix d'entrée, achat impulsif |
| 7 jours | 1 000 FCFA | Le volume |
| 30 jours | 3 000 FCFA | Mis en avant comme « meilleure offre » |

Prix ancrés sur les forfaits data mobiles, pas sur des données de marché :
à valider en conditions réelles. Les changer est trivial (catalogue serveur),
et sans renouvellement automatique il n'y a aucun abonné historique à migrer.

Il n'y a **pas** de pass annuel : payé d'avance en FCFA sur un marché à
renouvellement manuel, il ne se vendrait pas.

Essai gratuit : 3 générations à vie (voir `get_remaining_quota`), pas un
quota récurrent.

## Conformité

Plus de revue Apple/Google : le web supprime le risque de rejet « wrapper
autour d'une API IA », le classement 17+ et le contrôle sur le pattern
d'abonnement. Restent :

- Privacy policy explicite sur le traitement d'images contenant des
  données d'un tiers (l'interlocuteur dans la capture) — pas juste
  l'utilisateur. Préciser : images traitées mais non stockées.
- Prix et durée visibles **avant** confirmation de paiement.
- Mentions légales de l'entité qui encaisse, exigées par l'agrégateur.

## Identité visuelle (direction donnée à Google Stitch)

- **Palette** : fond encre profond (#14151F), surface carte (#1D1F2C),
  accent primaire ambre (#F5A623), accent secondaire corail doux (#FF6F59),
  texte (#F4F2ED). Volontairement à l'écart du cliché rose/violet dégradé
  que toutes les apps concurrentes utilisent.
- **Typo** : display en slab/geometric bold (le mot généré a du poids),
  corps de texte en sans-serif humaniste très lisible.
- **Signature** : les 3 suggestions apparaissent comme des cartes
  "surlignées" — un effet de surlignage/highlight qui traverse le texte à
  l'apparition, pour incarner visuellement "le bon mot choisi parmi
  d'autres".
- Détail complet dans le prompt Stitch ci-dessous.

## Prompts Google Stitch (design)

Voir explication d'usage dans la conversation. Prompt de lancement (mode
App, à soumettre en premier) :

```
Design a mobile app called Verbly, an AI-powered dating reply assistant.
Users upload a screenshot of a dating app conversation, pick a reply
style, and get 3 AI-generated message suggestions to copy into their chat.

Vibe: confident, witty, sharp — like a clever friend who always knows
what to text back. Avoid the typical pink/purple romantic gradient look
most dating assistant apps use.

Theme:
- Dark, ink-navy background (#14151F) with a warm amber accent (#F5A623)
  and a soft coral secondary accent (#FF6F59)
- Card surfaces slightly lighter than the background (#1D1F2C)
- Off-white text (#F4F2ED)
- Bold, slab-serif or geometric display font for headlines and generated
  replies, paired with a clean humanist sans-serif for body text and UI
  labels
- Rounded corners, generous spacing, feels premium and modern, not cutesy

Core screens:
1. Onboarding — 2-3 short screens introducing the app and its value prop
2. Home/upload screen — big call-to-action to upload a chat screenshot,
   style selector (Charming, Direct, Playful) as pill buttons
3. Results screen — shows the uploaded screenshot thumbnail plus 3
   generated reply suggestions as distinct cards, each with a copy button
   and a regenerate icon
4. Paywall screen — after the free trial is used, shows 3 subscription
   options (weekly, monthly, annual) with the annual plan highlighted as
   best value

Generate the Home/upload screen first.
```

Prompts de suivi (un à la fois, après la génération initiale) :

```
Now design the Results screen: the uploaded screenshot as a small
thumbnail at the top, then 3 reply suggestion cards below. Each card
should feel like a highlight sweeps across the text as it appears —
the visual idea of "the right word, chosen among others."
```

```
Now design the Paywall screen: 3 pricing cards (weekly, monthly, annual)
stacked vertically, annual card visually dominant with a "Best value"
badge, price and billing frequency clearly visible above the confirm
button.
```

```
Now design the onboarding sequence: 3 screens, each with a short bold
headline, one supporting sentence, and a simple illustrative graphic
element — no stock-photo people, keep it abstract/typographic.
```

## TODO restant

- [x] Écran paywall (3 cartes de prix, design + logique de sélection)
- [x] UI principale : image picker + sélecteur de style + affichage des
      3 suggestions + bouton copier/régénérer
- [x] Passage aux pass mobile money : migration, `grant_pass`, table
      `payments`, `create-payment` + `payment-webhook`, paywall en FCFA
- [x] Flux de paiement testé de bout en bout avec l'adaptateur `stub`
      (402 → paiement → pass crédité → génération à nouveau autorisée)
- [x] Cible web ajoutée (`react-native-web`), bundle web vérifié
- [ ] Choisir l'agrégateur et écrire son adaptateur dans `_shared/providers.ts`
- [ ] Ouvrir le compte marchand (entité légale + vérification) — chemin
      critique, plusieurs semaines, à lancer en parallèle du code
- [ ] Régénérer `PAYMENT_WEBHOOK_SECRET` avant la production : celui en place
      a servi aux tests
- [ ] Rendre les écrans responsives pour le web (pensés pour du mobile natif)
- [ ] Héberger le web et brancher un nom de domaine
- [ ] Rédiger la privacy policy réelle
- [ ] Décider du sort de la confirmation d'email Supabase (active aujourd'hui,
      SMTP intégré non fiable)
