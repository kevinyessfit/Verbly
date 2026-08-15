import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { screen } from '../theme/placeholder';

// Écran d'accueil / upload. Placeholder : les liens servent à vérifier que
// la navigation fonctionne, ils sauteront avec les maquettes Stitch.
export default function Home() {
  return (
    <View style={screen.container}>
      <Text style={screen.title}>home / upload</Text>
      <Link href="/onboarding" style={screen.link}>→ onboarding</Link>
      <Link href="/sign-in" style={screen.link}>→ sign-in</Link>
      <Link href="/results" style={screen.link}>→ results</Link>
      <Link href="/paywall" style={screen.link}>→ paywall</Link>
    </View>
  );
}
