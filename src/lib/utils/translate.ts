/**
 * Translation utility using MyMemory API (free tier)
 * https://mymemory.translated.net/doc/spec.php
 *
 * Free limits:
 * - Without email: 1000 words/day
 * - With email: 10,000 words/day
 */

interface TranslationResponse {
	responseStatus: number;
	responseData: {
		translatedText: string;
		match: number;
	};
	quotaFinished?: boolean;
}

interface TranslateResult {
	success: boolean;
	translatedText?: string;
	error?: string;
}

// Language code mapping for MyMemory API
const LANGUAGE_MAP: Record<string, string> = {
	es: 'es',
	en: 'en',
	ca: 'ca'
};

/**
 * Simple language detection based on common words
 * Returns the most likely language code
 */
function detectLanguage(text: string): string {
	const lowerText = text.toLowerCase();

	// Catalan-specific patterns
	const catalanPatterns = [
		/\bel\s+torneig\b/,
		/\bla\s+partida\b/,
		/\bels\s+jugadors\b/,
		/\bles\s+rondes\b/,
		/\bamb\s+/,
		/\bper\s+a\b/,
		/\bque\s+es\b/,
		/\bd'aquest/,
		/\bl'encontre\b/,
		/\bserà\b/,
		/\btambé\b/,
		/\baixò\b/,
		/\bperò\b/,
		/\bdoncs\b/,
		/\bfins\b/
	];

	// Spanish-specific patterns
	const spanishPatterns = [
		/\bel\s+torneo\b/,
		/\bla\s+partida\b/,
		/\blos\s+jugadores\b/,
		/\blas\s+rondas\b/,
		/\bpara\s+/,
		/\bque\s+se\b/,
		/\bserá\b/,
		/\btambién\b/,
		/\besto\b/,
		/\bpero\b/,
		/\bentonces\b/,
		/\bhasta\b/
	];

	let catalanScore = 0;
	let spanishScore = 0;

	for (const pattern of catalanPatterns) {
		if (pattern.test(lowerText)) catalanScore++;
	}

	for (const pattern of spanishPatterns) {
		if (pattern.test(lowerText)) spanishScore++;
	}

	// Default to Catalan if tied or no matches (common for this app)
	return spanishScore > catalanScore ? 'es' : 'ca';
}

/**
 * Translate text using MyMemory API
 * @param text Text to translate
 * @param fromLang Source language code (es, en, ca, or 'autodetect')
 * @param toLang Target language code (es, en, ca)
 * @returns Translation result
 */
export async function translateText(
	text: string,
	fromLang: string,
	toLang: string
): Promise<TranslateResult> {
	// Handle auto-detection
	const detectedFrom = fromLang === 'autodetect' ? detectLanguage(text) : fromLang;

	// Don't translate if same language (after detection)
	if (detectedFrom === toLang) {
		return { success: true, translatedText: text };
	}

	// Validate languages
	const from = LANGUAGE_MAP[detectedFrom];
	const to = LANGUAGE_MAP[toLang];

	if (!from || !to) {
		return { success: false, error: 'Unsupported language' };
	}

	// Empty text check
	if (!text.trim()) {
		return { success: true, translatedText: '' };
	}

	try {
		const url = new URL('https://api.mymemory.translated.net/get');
		url.searchParams.set('q', text);
		url.searchParams.set('langpair', `${from}|${to}`);

		const response = await fetch(url.toString());

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}` };
		}

		const data: TranslationResponse = await response.json();

		if (data.quotaFinished) {
			return { success: false, error: 'Translation quota exceeded' };
		}

		if (data.responseStatus !== 200) {
			return { success: false, error: `API error: ${data.responseStatus}` };
		}

		return {
			success: true,
			translatedText: data.responseData.translatedText
		};
	} catch (err) {
		console.error('Translation error:', err);
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Unknown error'
		};
	}
}

/**
 * Get language display name
 */
export function getLanguageName(code: string, inLanguage: string): string {
	const names: Record<string, Record<string, string>> = {
		es: { es: 'Español', en: 'Spanish', ca: 'Castellà' },
		en: { es: 'Inglés', en: 'English', ca: 'Anglès' },
		ca: { es: 'Catalán', en: 'Catalan', ca: 'Català' }
	};
	return names[code]?.[inLanguage] || code;
}
