import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import { STYLES, current, generateReplies, type Style } from '../lib/generation';
import { colors, font, radius, space } from '../theme/tokens';

export default function Home() {
  const [uri, setUri] = useState<string | null>(current.uri);
  const [style, setStyle] = useState<Style>(current.style);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      setError("Impossible de lire cette image.");
      return;
    }
    current.uri = asset.uri;
    current.base64 = asset.base64;
    current.mimeType = asset.mimeType ?? 'image/jpeg';
    setUri(asset.uri);
  }

  function choose(next: Style) {
    current.style = next;
    setStyle(next);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    const result = await generateReplies();
    setBusy(false);

    if (result.ok) {
      router.push('/results');
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.headline}>Ne sèche plus jamais.</Text>
        <Text style={styles.sub}>
          Envoie une capture de ta conversation, on s'occupe du reste.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer une capture de conversation"
          onPress={pick}
          style={({ pressed }) => [styles.dropzone, pressed && styles.dropzonePressed]}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.dropzoneEmpty}>
              <View style={styles.uploadBadge}>
                <Text style={styles.uploadGlyph}>↑</Text>
              </View>
              <Text style={styles.dropTitle}>Dépose ta capture ici</Text>
              <Text style={styles.dropHint}>ou appuie pour choisir un fichier</Text>
            </View>
          )}
        </Pressable>

        {uri ? (
          <Pressable onPress={pick}>
            <Text style={styles.replace}>Choisir une autre capture</Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionLabel}>CHOISIS TON STYLE</Text>
        <View style={styles.pills}>
          {STYLES.map(({ id, label }) => {
            const active = id === style;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => choose(id)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label="Générer les réponses"
          onPress={generate}
          loading={busy}
          disabled={!uri}
          style={styles.cta}
        />
      </ScrollView>
    </Screen>
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
  dropzone: {
    height: 300,
    marginTop: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dropzonePressed: {
    borderColor: colors.outlineAmber,
  },
  dropzoneEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  preview: {
    flex: 1,
    width: '100%',
  },
  uploadBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  uploadGlyph: {
    color: colors.onAmber,
    fontSize: 32,
    fontFamily: font.displayBold,
  },
  dropTitle: {
    color: colors.text,
    fontFamily: font.displayBold,
    fontSize: 24,
  },
  dropHint: {
    color: colors.textMuted,
    fontFamily: font.body,
    fontSize: 16,
  },
  replace: {
    color: colors.amber,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    textAlign: 'center',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: font.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: space.md,
  },
  pills: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
  },
  pill: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  pillActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  pillLabel: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: 15,
  },
  pillLabelActive: {
    color: colors.onAmber,
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
});
