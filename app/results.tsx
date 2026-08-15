import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import { STYLES, current, generateReplies } from '../lib/generation';
import { colors, font, radius, space } from '../theme/tokens';

export default function Results() {
  const [suggestions, setSuggestions] = useState(current.suggestions);
  const [detected, setDetected] = useState(current.conversationDetected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Change à chaque régénération : force le rejeu de l'animation de surlignage.
  const [pass, setPass] = useState(0);
  const router = useRouter();

  const styleLabel = STYLES.find((s) => s.id === current.style)?.label ?? current.style;

  async function regenerate() {
    setBusy(true);
    setError(null);
    const result = await generateReplies();
    setBusy(false);

    if (result.ok) {
      setSuggestions(result.suggestions);
      setDetected(result.conversationDetected);
      setPass((p) => p + 1);
      return;
    }
    if (result.paywall) {
      router.push('/paywall');
      return;
    }
    setError(result.error);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Wordmark />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>CONTEXT</Text>
        <View style={styles.context}>
          {current.uri ? (
            <Image source={{ uri: current.uri }} style={styles.thumb} resizeMode="cover" />
          ) : null}
          <View style={styles.contextText}>
            <Text style={styles.contextTitle}>Your screenshot</Text>
            <Text style={styles.contextTone}>Tone: {styleLabel}</Text>
          </View>
        </View>

        {!detected ? (
          <Text style={styles.notice}>
            We couldn't find a conversation in this screenshot. Try another one for sharper replies.
          </Text>
        ) : null}

        <Text style={styles.headline}>Suggested Replies</Text>

        {suggestions.map((text, i) => (
          <SuggestionCard key={`${pass}-${i}`} text={text} index={i} />
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label="Generate More Options"
          onPress={regenerate}
          loading={busy}
          style={styles.cta}
        />
        <Text style={styles.footnote}>Tap a reply to copy it to your clipboard.</Text>
      </ScrollView>
    </Screen>
  );
}

/**
 * Signature visuelle de Verbly : un surlignage ambre traverse la suggestion à
 * son apparition — « le bon mot, choisi parmi d'autres ».
 */
function SuggestionCard({ text, index }: { text: string; index: number }) {
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!width) return;
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 700,
      delay: index * 140,
      useNativeDriver: true,
    }).start();
  }, [width, index, sweep]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy reply: ${text}`}
      onPress={copy}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.cardText}>{text}</Text>

      <View style={styles.cardFooter}>
        <Text style={[styles.copyLabel, copied && styles.copyLabelDone]}>
          {copied ? 'Copied' : 'Copy'}
        </Text>
      </View>

      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sweep,
            {
              width,
              opacity: sweep.interpolate({
                inputRange: [0, 0.15, 0.85, 1],
                outputRange: [0, 0.35, 0.35, 0],
              }),
              transform: [
                {
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-width, width],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: font.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  context: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    alignItems: 'center',
  },
  thumb: {
    width: 56,
    height: 76,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
  contextText: {
    flex: 1,
    gap: space.xs,
  },
  contextTitle: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: 16,
  },
  contextTone: {
    color: colors.amber,
    fontFamily: font.bodyMedium,
    fontSize: 14,
  },
  notice: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
  },
  headline: {
    color: colors.text,
    fontFamily: font.displayBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginTop: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineAmber,
    padding: space.md,
    gap: space.md,
    overflow: 'hidden',
  },
  cardPressed: {
    backgroundColor: colors.surfaceHigh,
  },
  cardText: {
    color: colors.text,
    fontFamily: font.body,
    fontSize: 18,
    lineHeight: 28,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    paddingTop: space.sm + 4,
  },
  copyLabel: {
    color: colors.amber,
    fontFamily: font.bodySemi,
    fontSize: 14,
  },
  copyLabelDone: {
    color: colors.textMuted,
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.amber,
  },
  error: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 14,
    textAlign: 'center',
  },
  cta: {
    marginTop: space.md,
  },
  footnote: {
    color: colors.textMuted,
    fontFamily: font.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
  },
});
