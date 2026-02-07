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
 * Translate text using MyMemory API
 * @param text Text to translate
 * @param fromLang Source language code (es, en, ca)
 * @param toLang Target language code (es, en, ca)
 * @returns Translation result
 */
export async function translateText(
	text: string,
	fromLang: string,
	toLang: string
): Promise<TranslateResult> {
	// Don't translate if same language
	if (fromLang === toLang) {
		return { success: true, translatedText: text };
	}

	// Validate languages
	const from = LANGUAGE_MAP[fromLang];
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
