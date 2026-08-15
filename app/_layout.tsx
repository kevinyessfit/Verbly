import { DMSans_600SemiBold, DMSans_700Bold, useFonts } from '@expo-google-fonts/dm-sans';
import {
  FiraSans_400Regular,
  FiraSans_500Medium,
  FiraSans_600SemiBold,
} from '@expo-google-fonts/fira-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { colors } from '../theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_700Bold,
    DMSans_600SemiBold,
    FiraSans_400Regular,
    FiraSans_500Medium,
    FiraSans_600SemiBold,
  });

  // Fond encre pendant le chargement des polices : pas de flash blanc.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
    </>
  );
}
