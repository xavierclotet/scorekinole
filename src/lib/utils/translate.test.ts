import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateText, getLanguageName } from './translate';

/**
 * MyMemory translation wrapper used by the blog "Traducir" button.
 * Network is always mocked; these tests pin the short-circuits (same
 * language, empty text, unsupported codes) and the API error mapping.
 */

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
	return { ok, status, json: async () => body };
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('translateText', () => {
	const spanishText = 'El torneo será para los jugadores, pero también hasta entonces.';

	it('returns the original text without fetching when autodetect matches the target', async () => {
		const result = await translateText(spanishText, 'autodetect', 'es');
		expect(result).toEqual({ success: true, translatedText: spanishText });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('defaults autodetect to Catalan when no patterns match (app default)', async () => {
		const result = await translateText('hello world', 'autodetect', 'ca');
		expect(result).toEqual({ success: true, translatedText: 'hello world' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('short-circuits when explicit source equals target', async () => {
		const result = await translateText('anything at all', 'en', 'en');
		expect(result).toEqual({ success: true, translatedText: 'anything at all' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects unsupported language codes without fetching', async () => {
		const result = await translateText('bonjour', 'fr', 'en');
		expect(result).toEqual({ success: false, error: 'Unsupported language' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns empty translation for whitespace-only text without fetching', async () => {
		const result = await translateText('   ', 'en', 'es');
		expect(result).toEqual({ success: true, translatedText: '' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('translates via MyMemory with the right langpair on success', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				responseStatus: 200,
				responseData: { translatedText: 'Hola amigo', match: 1 }
			})
		);

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: true, translatedText: 'Hola amigo' });

		const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
		expect(requestedUrl.searchParams.get('langpair')).toBe('en|es');
		expect(requestedUrl.searchParams.get('q')).toBe('Hello friend of mine');
	});

	it('maps quotaFinished to a quota error', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				responseStatus: 200,
				quotaFinished: true,
				responseData: { translatedText: '', match: 0 }
			})
		);

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: false, error: 'Translation quota exceeded' });
	});

	it('maps a non-200 API responseStatus to an API error', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				responseStatus: 403,
				responseData: { translatedText: '', match: 0 }
			})
		);

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: false, error: 'API error: 403' });
	});

	it('maps a non-ok HTTP response to an HTTP error', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 429));

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: false, error: 'HTTP 429' });
	});

	it('surfaces network failures as an error result', async () => {
		fetchMock.mockRejectedValueOnce(new Error('network down'));

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: false, error: 'network down' });
	});

	it('detection tie ("la partida" scores in both es and ca) resolves to Catalan and DOES fetch', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				responseStatus: 200,
				responseData: { translatedText: 'la partida', match: 1 }
			})
		);

		const result = await translateText('la partida', 'autodetect', 'es');
		expect(result.success).toBe(true);

		const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
		expect(requestedUrl.searchParams.get('langpair')).toBe('ca|es');
	});

	it('empty translatedText from the API is success:true — callers treating it as truthy (blog page) show an error instead', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				responseStatus: 200,
				responseData: { translatedText: '', match: 0 }
			})
		);

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: true, translatedText: '' });
	});

	it('⚠ does NOT sanitize HTML in the API response — markup reaches the caller verbatim ({@html} consumers must escape it first)', async () => {
		const payload = '<img src=x onerror=alert(1)>Hola';
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				responseStatus: 200,
				responseData: { translatedText: payload, match: 1 }
			})
		);

		const result = await translateText('Hello friend of mine', 'en', 'es');
		expect(result).toEqual({ success: true, translatedText: payload });
	});
});

describe('getLanguageName', () => {
	it('returns the display name in the requested language', () => {
		expect(getLanguageName('es', 'en')).toBe('Spanish');
		expect(getLanguageName('ca', 'ca')).toBe('Català');
	});

	it('falls back to the raw code for unknown languages', () => {
		expect(getLanguageName('fr', 'en')).toBe('fr');
	});
});
