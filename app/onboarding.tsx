import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import { supabase } from '../lib/supabase';
import { colors, font, radius, space } from '../theme/tokens';
import { ONBOARDING_SEEN_KEY } from './index';

const STEPS = [
  {
    headline: 'Arrête de te prendre la tête.',
    body: "Envoie une capture de n'importe quelle conversation, l'IA trouve les mots justes pour garder l'étincelle.",
    cta: 'Suivant',
  },
  {
    headline: 'Choisis ton style.',
    body: "Charmeur, Direct ou Joueur : le ton qui te ressemble et qui colle à l'énergie de la conversation.",
    cta: 'Suivant',
  },
  {
    headline: 'Copie. Colle. Connecte.',
    body: 'Trois réponses affûtées en un instant, pour relancer la conversation avec assurance.',
    cta: 'Commencer',
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  async function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    const { data } = await supabase.auth.getSession();
    router.replace(data.session ? '/home' : '/sign-in');
  }

  const { headline, body, cta } = STEPS[step];

  return (
    <Screen style={styles.screen}>
      <View style={styles.art}>
        <Wordmark />
        <Text style={styles.tagline}>AI-Powered Connections</Text>
      </View>

      <View style={styles.copy}>
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <PrimaryButton label={cta} onPress={next} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    justifyContent: 'space-between',
  },
  art: {
    flex: 1,
    marginTop: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  tagline: {
    color: colors.textMuted,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  copy: {
    paddingVertical: space.xl,
    gap: space.md,
  },
  headline: {
    color: colors.text,
    fontFamily: font.displayBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  dotActive: {
    width: 28,
    backgroundColor: colors.amber,
  },
});
