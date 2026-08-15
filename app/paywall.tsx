import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import { colors, font, radius, space } from '../theme/tokens';

/**
 * Prix affichés en dur pour l'instant. Phase 4 : ils viendront de l'Offering
 * RevenueCat, seule source acceptable pour Apple (prix localisé du store).
 */
const PLANS = [
  { id: 'weekly', name: 'WEEKLY', price: '$6.99', period: '/week' },
  { id: 'annual', name: 'ANNUAL', price: '$59.99', period: '/year', note: 'Approx $4.99/month', best: true },
  { id: 'monthly', name: 'MONTHLY', price: '$19.99', period: '/month' },
] as const;

export default function Paywall() {
  const [selected, setSelected] = useState<string>('annual');
  const router = useRouter();

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
          {PLANS.map((plan) => {
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
                {'best' in plan && plan.best ? (
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
                    {'note' in plan && plan.note ? (
                      <Text style={styles.planNote}>{plan.note}</Text>
                    ) : null}
                  </View>

                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton label="Continue" onPress={() => router.back()} style={styles.cta} />

        <Text style={styles.legal}>
          Cancel anytime. Billing recurs at the frequency shown until cancelled.
        </Text>
        <View style={styles.links}>
          <Text style={styles.link}>Restore Purchases</Text>
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
