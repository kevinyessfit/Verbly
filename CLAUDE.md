# Verbly — Assistant IA de drague

## Vue d'ensemble

**Verbly** — app mobile qui analyse une capture d'écran de conversation
(dating apps, messageries) et génère 3 suggestions de réponse selon un
style choisi par l'utilisateur. Marché : global/international. Stratégie
de lancement : cloner le concept dominant du marché (Rizz, W Rizz,
Tchatch...), itérer ensuite sur la différenciation.

Nom choisi après vérification que l'espace de nommage évident (wing/rizz/
flirt/spark/charm/smooth + variantes) est déjà saturé de clones quasi
identiques (Wingly, Wingr, Wingy, WingAI, Winggg, Glint sont tous déjà
pris). Verbly = nom inventé, pas un mot du dictionnaire → plus sûr côté
disponibilité de marque/store.

## Stack

- **Frontend** : Expo + TypeScript (React Native) — même approche que Mangi
- **Backend/DB** : Supabase (Postgres, Auth, Edge Functions)
- **Paiement** : RevenueCat + Apple/Google IAP (pas Stripe — contenu digital
  consommé in-app)
- **Vision LLM** : Gemini 3.1 Flash-Lite via l'API Google Generative
  Language. **Ne pas utiliser Gemini 2.5 Flash-Lite** (déprécié le
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

-- SUBSCRIPTIONS (écrite uniquement par le webhook RevenueCat, service_role)
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
ouvrir le paywall RevenueCat.

### `revenuecat-webhook`

- Authentifié par un secret partagé (header `Authorization`, PAS un JWT
  Supabase — configuré côté dashboard RevenueCat)
- `app_user_id` de l'event RevenueCat = `id` Supabase — **nécessite**
  `Purchases.logIn(supabaseUserId)` côté app au login
- `INITIAL_PURCHASE` / `RENEWAL` / `PRODUCT_CHANGE` / `UNCANCELLATION` →
  `status: active`
- `EXPIRATION` / `CANCELLATION` / `BILLING_ISSUE` → `status: expired`
- `upsert` sur `subscriptions` avec `onConflict: user_id` (un seul row
  d'abonnement courant par utilisateur)
- Retourner `500` en cas d'erreur d'écriture pour que RevenueCat retente

## Monétisation

Un seul entitlement RevenueCat (`pro`), trois fréquences de facturation
sur le même palier de fonctionnalités — pattern dominant du marché :

| Formule | Prix indicatif | Essai |
|---|---|---|
| Hebdo | $4.99–$6.99/semaine | 3 jours |
| Mensuel | $14.99–$19.99/mois | 7 jours |
| Annuel | $59.99–$79.99/an | — (à mettre en avant comme "meilleure offre") |

Essai gratuit hors abonnement : 3 générations à vie (voir
`get_remaining_quota`), pas un quota récurrent.

## Conformité store (à traiter avant soumission)

- Privacy policy explicite sur le traitement d'images contenant des
  données d'un tiers (l'interlocuteur dans la capture) — pas juste
  l'utilisateur. Préciser : images traitées mais non stockées.
- Classement d'âge probable 17+ (contenu dating/suggestif)
- Prix et fréquence de facturation visibles **avant** confirmation d'achat
  dans le paywall — point de contrôle strict d'Apple sur ce pattern
  hebdo + essai court
- Ne pas présenter l'app comme un simple wrapper autour d'une API IA dans
  la description store — Apple rejette facilement ce type de listing

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

- [ ] Écran paywall (3 cartes de prix, design + logique de sélection)
- [ ] UI principale : image picker + sélecteur de style + affichage des
      3 suggestions + bouton copier/régénérer
- [ ] Créer les produits IAP dans App Store Connect / Play Console
- [ ] Config Offering "default" dans RevenueCat avec les 3 Packages
- [ ] Rédiger la privacy policy réelle
- [ ] Tester le flow webhook de bout en bout (achat sandbox → sync Supabase)
