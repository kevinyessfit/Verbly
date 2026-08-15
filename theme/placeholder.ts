import { StyleSheet } from 'react-native';

// Styles minimaux des écrans vides. Fond encre pour ne pas prendre un flash
// blanc à chaque navigation ; tout le reste arrive avec les maquettes Stitch.
export const screen = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#14151F',
  },
  title: {
    color: '#F4F2ED',
    fontSize: 20,
  },
  link: {
    color: '#F5A623',
    fontSize: 16,
  },
});
