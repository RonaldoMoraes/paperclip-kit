/**
 * Elevation, in the props each platform reads: a web theme's `boxShadow` entries do not
 * resolve on native and fail silently, so a lifted surface carries a style object rather
 * than a class. On iOS a shadow needs an opaque background on the same node, so it rides
 * the surface it lifts. Neutral black; a product that tints its shadow names the token
 * beside the value here, the way every native colour string does.
 */
export const FLOATING_SHADOW = {
  shadowColor: "#000000",
  shadowOpacity: 0.12,
  shadowRadius: 17,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;
