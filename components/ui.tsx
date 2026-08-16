import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, radius, space } from '../theme/tokens';

/**
 * Conteneur d'écran. Le contenu est borné à une largeur de téléphone et centré :
 * sur le web desktop, sans cette borne, les écrans s'étirent sur toute la
 * fenêtre et la mise en page conçue pour du mobile s'effondre.
 */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.inner, style]}>{children}</View>
    </SafeAreaView>
  );
}

/** Signature de marque : le mot-symbole ambre avec son étincelle. */
export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <Text style={styles.spark}>✦</Text>
      <Text style={styles.wordmarkText}>Verbly</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.primary,
        off && styles.primaryOff,
        pressed && !off && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAmber} />
      ) : (
        <Text style={styles.primaryLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  spark: {
    color: colors.amber,
    fontSize: 22,
  },
  wordmarkText: {
    color: colors.amber,
    fontFamily: font.displayBold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  primary: {
    backgroundColor: colors.amber,
    borderRadius: radius.pill,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryOff: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryLabel: {
    color: colors.onAmber,
    fontFamily: font.displaySemi,
    fontSize: 18,
  },
});
