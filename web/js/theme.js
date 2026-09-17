// Maps the goth color vocabulary used in gothstronomy.db's `colors` column
// to concrete hex values for canvas rendering. Every string that appears in
// that column (verified against the live data) has an entry here; ANY is a
// safety net if the dataset ever grows a new color name.
export const COLOR_MAP = {
  "Ash Grey": "#9a97a6",
  "Black": "#0a0a0d",
  "Blood Red": "#a4102a",
  "Bone White": "#ece6da",
  "Charcoal": "#332f36",
  "Deep Violet": "#5a2678",
  "Gold-tarnish": "#a9863f",
  "Iron Grey": "#5c5d66",
  "Midnight Blue": "#141a3d",
  "Moss Black": "#20261b",
  "Obsidian": "#100f16",
  "Pale Grey": "#bdbac4",
  "Rust": "#8a4324",
  "Rust-gold": "#b17a3c",
  "Silver": "#c9cad4",
  "Venom Green-Black": "#2c3b21",
  ANY: "#8a2846",
};

export function resolveColor(name) {
  return COLOR_MAP[name] || COLOR_MAP.ANY;
}

// Given a stage row's `colorList` (already split on commas), pick a small
// consistent palette: primary (glow/explosions), secondary (enemies),
// tertiary (ambient/background tint).
export function paletteFor(colorList) {
  const c0 = resolveColor(colorList[0]);
  const c1 = resolveColor(colorList[1] || colorList[0]);
  const c2 = resolveColor(colorList[2] || colorList[1] || colorList[0]);
  return { primary: c0, secondary: c1, tertiary: c2 };
}
