import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import {
  getOffering,
  purchase,
  purchasesAvailable,
  restore,
  type PurchasesPackage,
} from '../lib/purchases';
import { colors, font, radius, space } from '../theme/tokens';

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  note?: string;
  best?: boolean;
  pkg?: PurchasesPackage;
};

/** Ordre d'affichage de la maquette : l'annuel au milieu, mis en avant. */
const ORDER = ['WEEKLY', 'ANNUAL', 'MONTHLY'];

const PERIOD_LABEL: Record<string, string> = {
  WEEKLY: '/week',
  ANNUAL: '/year',
  MONTHLY: '/month',
};

// Repli quand RevenueCat n'est pas joignable (Expo Go, ou Offering non
// configuré). Ces prix sont indicatifs : Apple exige ceux du store.
const FALLBACK: Plan[] = [
  { id: 'WEEKLY', name: 'WEEKLY', price: '$6.99', period: '/week' },
  { id: 'ANNUAL', name: 'ANNUAL', price: '$59.99', period: '/year', note: 'Approx $4.99/month', best: true },
  { id: 'MONTHLY', name: 'MONTHLY', price: '$19.99', period: '/month' },
];

export default function Paywall() {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState('ANNUAL');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const offering = await getOffering();
      if (!offering) return;

      const mapped = offering.availablePackages
        .filter((p) => ORDER.includes(p.packageType))
        .sort((a, b) => ORDER.indexOf(a.packageType) - ORDER.indexOf(b.packageType))
        .map<Plan>((p) => ({
          id: p.identifier,
          name: p.packageType,
          price: p.product.priceString,
          period: PERIOD_LABEL[p.packageType] ?? '',
          best: p.packageType === 'ANNUAL',
          pkg: p,
        }));

      if (!mapped.length) return;
      setPlans(mapped);
      setLive(true);
      setSelected(mapped.find((p) => p.best)?.id ?? mapped[0].id);
    })();
  }, []);

  async function confirm() {
    const plan = plans.find((p) => p.id === selected);
    if (!plan?.pkg) {
      setMessage('Subscriptions are not available in this build yet.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const outcome = await purchase(plan.pkg);
    setBusy(false);

    if (outcome.status === 'purchased') {
      // Le webhook RevenueCat met Supabase à jour de son côté ; le quota est
      // relu au prochain appel de generate-replies.
      router.back();
      return;
    }
    if (outcome.status === 'error') setMessage(outcome.message);
  }

  async function onRestore() {
    setBusy(true);
    setMessage(null);
    const outcome = await restore();
    setBusy(false);
    setMessage(
      outcome.status === 'purchased' ? 'Purchases restored.' : 'Nothing to restore.',
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Wordmark />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headline}>Get Unlimited Plays</Text>
        <Text style={styles.sub}>
          Never be at a loss for words again. Unlock the ultimate conversational advantage.
        </Text>

        <View style={styles.plans}>
          {plans.map((plan) => {
            const active = plan.id === selected;
            return (
              <Pressable
                key={plan.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${plan.name} ${plan.price}${plan.period}`}
                onPress={() => setSelected(plan.id)}
                style={[styles.plan, active && styles.planActive]}
              >
                {plan.best ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>BEST VALUE</Text>
                  </View>
                ) : null}

                <View style={styles.planBody}>
                  <View style={styles.planText}>
                    <Text style={[styles.planName, active && styles.planNameActive]}>
                      {plan.name}
                    </Text>
                    <Text style={styles.planPrice}>
                      {plan.price}
                      <Text style={styles.planPeriod}>{plan.period}</Text>
                    </Text>
                    {plan.note ? <Text style={styles.planNote}>{plan.note}</Text> : null}
                  </View>

                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <PrimaryButton label="Continue" onPress={confirm} loading={busy} style={styles.cta} />

        <Text style={styles.legal}>
          Cancel anytime. Billing recurs at the frequency shown above until cancelled.
        </Text>

        {!live ? (
          <Text style={styles.legal}>
            Showing indicative prices — store pricing loads in a native build.
          </Text>
        ) : null}

        <View style={styles.links}>
          <Pressable onPress={onRestore} disabled={!purchasesAvailable}>
            <Text style={styles.link}>Restore Purchases</Text>
          </Pressable>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.link}>Terms</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.link}>Privacy</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  headline: {
    color: colors.text,
    fontFamily: font.displayBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.7,
    textAlign: 'center',
    marginTop: space.lg,
  },
  sub: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
  plans: {
    gap: space.md,
    marginTop: space.lg,
  },
  plan: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.outline,
    padding: space.md,
  },
  planActive: {
    borderColor: colors.amber,
    backgroundColor: colors.surfaceHigh,
  },
  badge: {
    position: 'absolute',
    top: -14,
    right: space.md,
    backgroundColor: colors.amber,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  badgeText: {
    color: colors.onAmber,
    fontFamily: font.bodySemi,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  planBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  planText: {
    flex: 1,
    gap: space.xs,
  },
  planName: {
    color: colors.textMuted,
    fontFamily: font.bodySemi,
    fontSize: 13,
    letterSpacing: 1,
  },
  planNameActive: {
    color: colors.amber,
  },
  planPrice: {
    color: colors.text,
    fontFamily: font.displayBold,
    fontSize: 30,
    letterSpacing: -0.5,
  },
  planPeriod: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 16,
  },
  planNote: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 14,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.amber,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
  },
  message: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 14,
    textAlign: 'center',
  },
  cta: {
    marginTop: space.lg,
  },
  legal: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
  },
  link: {
    color: colors.textMuted,
    fontFamily: font.bodySemi,
    fontSize: 12,
  },
  dot: {
    color: colors.outline,
    fontSize: 12,
  },
});
