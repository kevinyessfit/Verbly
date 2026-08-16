import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { supabase } from '../lib/supabase';
import { colors } from '../theme/tokens';

export const ONBOARDING_SEEN_KEY = 'verbly.onboarding.seen';

/** Aiguillage au démarrage : onboarding une seule fois, puis auth, puis upload. */
export default function Gate() {
  const [route, setRoute] = useState<'/onboarding' | '/sign-in' | '/home' | null>(null);

  useEffect(() => {
    (async () => {
      const [seen, { data }] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_SEEN_KEY),
        supabase.auth.getSession(),
      ]);
      if (!seen) setRoute('/onboarding');
      else if (!data.session) setRoute('/sign-in');
      else setRoute('/home');
    })();
  }, []);

  if (!route) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <Redirect href={route} />;
}
