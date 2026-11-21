// Approximate centre of every area used by plans. Only the AREA is ever shown,
// never the meeting point (that's shared with confirmed guests on WhatsApp).
// Add an area here when you add one in data.ts or from the admin page.
export const CITY_CENTER: Record<string, [number, number]> = {
  jaipur: [26.9124, 75.7873], ahmedabad: [23.0225, 72.5714], udaipur: [24.5854, 73.7125],
};

export const AREAS: Record<string, [number, number]> = {
  // Jaipur
  "Bapu Nagar": [26.892, 75.809], "C-Scheme": [26.9065, 75.803], "Civil Lines": [26.905, 75.787], "Hawa Mahal": [26.9239, 75.8267],
  "Jagatpura": [26.823, 75.864], "Jal Mahal": [26.9535, 75.8462], "Jawahar Kala Kendra": [26.8936, 75.813], "Johari Bazaar": [26.9196, 75.827],
  "MI Road": [26.917, 75.81], "Malviya Nagar": [26.855, 75.815], "Mansarovar": [26.853, 75.766], "Nahargarh": [26.9373, 75.8155],
  "Raja Park": [26.899, 75.83], "Sanganer": [26.817, 75.786], "Sariska": [27.33, 76.43], "Tonk Road": [26.86, 75.802], "Vaishali Nagar": [26.911, 75.743],
  // Ahmedabad
  "Adalaj": [23.1667, 72.58], "Bodakdev": [23.04, 72.51], "CG Road": [23.03, 72.56], "Kankaria": [23.006, 72.601], "Law Garden": [23.027, 72.56],
  "Manek Chowk": [23.024, 72.588], "Navrangpura": [23.037, 72.56], "Polo Forest": [23.98, 73.26], "Prahlad Nagar": [23.012, 72.51],
  "Riverfront": [23.03, 72.575], "SG Highway": [23.03, 72.507], "Sabarmati Riverfront": [23.035, 72.577], "Satellite": [23.03, 72.517],
  "Shela": [23.004, 72.461], "Sindhu Bhavan Road": [23.045, 72.5], "Thaltej": [23.05, 72.505], "Vastrapur": [23.039, 72.529],
};

/** Area → coordinates, falling back to the city centre. `exact` is false for the fallback. */
export function areaPoint(area: string, city: string): { lat: number; lon: number; exact: boolean } {
  const k = Object.keys(AREAS).find((a) => a.toLowerCase() === area.trim().toLowerCase());
  const p = k ? AREAS[k] : CITY_CENTER[city] ?? CITY_CENTER.jaipur;
  return { lat: p[0], lon: p[1], exact: !!k };
}

export const kmBetween = (a: [number, number], b: [number, number]) => {
  const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Web Mercator, 256 px tiles.
export const project = (lat: number, lon: number, z: number) => {
  const n = 256 * 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
