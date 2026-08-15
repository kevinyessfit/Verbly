// Palette et échelles de l'identité Verbly.
// Source : CLAUDE.md (qui fait foi) + le DESIGN.md de l'export Stitch pour les
// tailles de typo et le rythme d'espacement.

export const colors = {
  bg: '#14151F',
  surface: '#1D1F2C',
  surfaceHigh: '#2A2D3D',
  amber: '#F5A623',
  amberSoft: '#FFC880',
  coral: '#FF6F59',
  text: '#F4F2ED',
  textMuted: '#D7C3AE',
  onAmber: '#452B00',
  outline: 'rgba(244, 242, 237, 0.10)',
  outlineAmber: 'rgba(245, 166, 35, 0.35)',
} as const;

export const font = {
  displayBold: 'DMSans_700Bold',
  displaySemi: 'DMSans_600SemiBold',
  body: 'FiraSans_400Regular',
  bodyMedium: 'FiraSans_500Medium',
  bodySemi: 'FiraSans_600SemiBold',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const radius = {
  sm: 8,
  lg: 16,
  pill: 9999,
} as const;
