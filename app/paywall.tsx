import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import { PASSES, createPayment, formatXof, waitForAccess, type PassType } from '../lib/payments';
import { colors, font, radius, space } from '../theme/tokens';

type Phase = 'choose' | 'waiting' | 'done';

export default function Paywall() {
  const [selected, setSelected] = useState<PassType>('month');
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<Phase>('choose');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function pay() {
    setBusy(true);
    setMessage(null);

    const created = await createPayment(selected, phone);
    if (!created.ok) {
      setBusy(false);
      setMessage(created.error);
      return;
    }

    setPhase('waiting');
    setMessage(created.instructions);
    if (created.checkoutUrl) void Linking.openURL(created.checkoutUrl);

    // Le pass n'est crédité qu'une fois le webhook de l'agrégateur reçu :
    // on attend que la base le reflète plutôt que de croire le client.
    const granted = await waitForAccess();
    setBusy(false);

    if (granted) {
      setPhase('done');
      setMessage('Paiement confirmé. Ton accès est actif.');
      return;
    }
    setPhase('choose');
    setMessage("Paiement non confirmé. Si tu as validé sur ton téléphone, l'accès s'activera d'ici peu.");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Wordmark />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headline}>Réponses illimitées</Text>
        <Text style={styles.sub}>
          Tes 3 essais gratuits sont épuisés. Prends un pass et continue sans compter.
        </Text>

        <View style={styles.plans}>
          {PASSES.map((pass) => {
            const active = pass.id === selected;
            return (
              <Pressable
                key={pass.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${pass.name} ${formatXof(pass.amountXof)}`}
                onPress={() => setSelected(pass.id)}
                disabled={phase === 'waiting'}
                style={[styles.plan, active && styles.planActive]}
              >
                {pass.best ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>MEILLEURE OFFRE</Text>
                  </View>
                ) : null}

                <View style={styles.planBody}>
                  <View style={styles.planText}>
                    <Text style={[styles.planName, active && styles.planNameActive]}>{pass.name}</Text>
                    <Text style={styles.planPrice}>{formatXof(pass.amountXof)}</Text>
                    {pass.note ? <Text style={styles.planNote}>{pass.note}</Text> : null}
                  </View>

                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>NUMÉRO MOBILE MONEY</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex. 97000000"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          editable={phase !== 'waiting'}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        {phase === 'done' ? (
          <PrimaryButton label="Continuer" onPress={() => router.back()} style={styles.cta} />
        ) : (
          <PrimaryButton
            label={phase === 'waiting' ? 'En attente de confirmation…' : 'Payer'}
            onPress={pay}
            loading={busy}
            disabled={phone.trim().length < 8}
            style={styles.cta}
          />
        )}

        <Text style={styles.legal}>
          Paiement unique, sans renouvellement automatique. L'accès expire à la fin de la durée
          choisie.
        </Text>
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
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: font.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
    marginTop: space.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: font.body,
    fontSize: 16,
  },
  message: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  cta: {
    marginTop: space.sm,
  },
  legal: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
