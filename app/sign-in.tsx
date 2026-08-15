import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton, Screen, Wordmark } from '../components/ui';
import { identify } from '../lib/purchases';
import { supabase } from '../lib/supabase';
import { colors, font, radius, space } from '../theme/tokens';

export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    setBusy(true);
    setMessage(null);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    // Sur inscription, le projet peut exiger une confirmation par email :
    // dans ce cas il n'y a pas encore de session.
    if (!data.session) {
      setMessage('Check your inbox to confirm your address, then sign in.');
      setMode('sign-in');
      return;
    }
    await identify(data.session.user.id);
    router.replace('/home');
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={styles.header}>
          <Wordmark />
        </View>

        <View style={styles.form}>
          <Text style={styles.headline}>
            {mode === 'sign-in' ? 'Welcome back.' : 'Create your account.'}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <PrimaryButton
            label={mode === 'sign-in' ? 'Sign in' : 'Sign up'}
            onPress={submit}
            loading={busy}
            disabled={!email.trim() || password.length < 6}
          />

          <Pressable onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
            <Text style={styles.switch}>
              {mode === 'sign-in' ? 'No account yet? Sign up' : 'Already registered? Sign in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space.lg,
  },
  fill: {
    flex: 1,
  },
  header: {
    paddingVertical: space.lg,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    gap: space.md,
    paddingBottom: space.xxl,
  },
  headline: {
    color: colors.text,
    fontFamily: font.displayBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: space.sm,
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
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 14,
  },
  switch: {
    color: colors.textMuted,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: space.md,
  },
});
