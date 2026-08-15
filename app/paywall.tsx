import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { screen } from '../theme/placeholder';

export default function Paywall() {
  return (
    <View style={screen.container}>
      <Text style={screen.title}>paywall</Text>
      <Link href="/" style={screen.link}>← home</Link>
    </View>
  );
}
