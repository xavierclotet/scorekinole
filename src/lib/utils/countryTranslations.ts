import * as m from '$lib/paraglide/messages.js';

/**
 * Map from stored country names (in Spanish) to translation message keys
 * The country names in the database are stored in Spanish
 */
const countryTranslationMap: Record<string, () => string> = {
  'Alemania': () => m.country_germany(),
  'Australia': () => m.country_australia(),
  'Austria': () => m.country_austria(),
  'Bélgica': () => m.country_belgium(),
  'Canadá': () => m.country_canada(),
  'Cataluña': () => m.country_catalonia(),
  'Corea del Sur': () => m.country_southKorea(),
  'Dinamarca': () => m.country_denmark(),
  'España': () => m.country_spain(),
  'Estados Unidos': () => m.country_unitedStates(),
  'Finlandia': () => m.country_finland(),
  'Francia': () => m.country_france(),
  'Hungría': () => m.country_hungary(),
  'Islandia': () => m.country_iceland(),
  'Italia': () => m.country_italy(),
  'Japón': () => m.country_japan(),
  'Luxemburgo': () => m.country_luxembourg(),
  'Noruega': () => m.country_norway(),
  'Nueva Zelanda': () => m.country_newZealand(),
  'Países Bajos': () => m.country_netherlands(),
  'Reino Unido': () => m.country_unitedKingdom(),
  'Rumanía': () => m.country_romania(),
  'Singapur': () => m.country_singapore(),
  'Suecia': () => m.country_sweden(),
  'Suiza': () => m.country_switzerland()
};

/**
 * Translates a country name from its stored form (Spanish) to the current locale
 * @param countryName - The country name as stored in the database (Spanish)
 * @returns The translated country name, or the original if no translation exists
 */
export function translateCountry(countryName: string): string {
  const translator = countryTranslationMap[countryName];
  return translator ? translator() : countryName;
}

/**
 * Gets the list of available countries translated to the current locale
 * @param countries - Array of country names as stored in the database (Spanish)
 * @returns Array of objects with value (original) and label (translated)
 */
export function getTranslatedCountryOptions(countries: string[]): Array<{ value: string; label: string }> {
  return countries.map(country => ({
    value: country,
    label: translateCountry(country)
  })).sort((a, b) => a.label.localeCompare(b.label));
}
