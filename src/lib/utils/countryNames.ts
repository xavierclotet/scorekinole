import * as m from '$lib/paraglide/messages.js';

/**
 * Translate an ISO country code (or known regional code like 'CAT') to a
 * localized country name. Falls back to the code itself when unknown.
 */
export function getCountryName(code: string): string {
	const translations: Record<string, () => string> = {
		AR: () => m.country_AR(), AU: () => m.country_AU(), AT: () => m.country_AT(),
		BE: () => m.country_BE(), BR: () => m.country_BR(), CA: () => m.country_CA(),
		CAT: () => m.country_CAT(), CL: () => m.country_CL(), CN: () => m.country_CN(),
		CO: () => m.country_CO(), CZ: () => m.country_CZ(), DE: () => m.country_DE(),
		DK: () => m.country_DK(), ES: () => m.country_ES(), FI: () => m.country_FI(),
		FR: () => m.country_FR(), GB: () => m.country_GB(), GR: () => m.country_GR(),
		HU: () => m.country_HU(), IE: () => m.country_IE(), IN: () => m.country_IN(),
		IS: () => m.country_IS(), IT: () => m.country_IT(), JP: () => m.country_JP(),
		KR: () => m.country_KR(), LU: () => m.country_LU(), MX: () => m.country_MX(),
		NL: () => m.country_NL(), NO: () => m.country_NO(), NZ: () => m.country_NZ(),
		PL: () => m.country_PL(), PT: () => m.country_PT(), RO: () => m.country_RO(),
		RU: () => m.country_RU(), SE: () => m.country_SE(), SG: () => m.country_SG(),
		CH: () => m.country_CH(), US: () => m.country_US(), UY: () => m.country_UY(),
		VE: () => m.country_VE(), ZA: () => m.country_ZA()
	};
	return translations[code]?.() || code;
}

/**
 * Map subnational/regional codes onto their parent ISO country for
 * ranking-filter purposes. Catalonia (CAT) is part of Spain (ES), so a CAT
 * player must be counted as Spanish when filtering by country.
 *
 * The player's own stored `country` is left untouched — this only affects
 * grouping and filter comparisons.
 */
const REGION_TO_COUNTRY: Record<string, string> = {
	CAT: 'ES'
};

export function normalizeCountryForFilter(code: string | undefined): string | undefined {
	if (!code) return code;
	return REGION_TO_COUNTRY[code] ?? code;
}
