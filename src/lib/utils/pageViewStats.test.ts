import { describe, it, expect } from 'vitest';
import {
	readBranch,
	sumBranches,
	sumBlogViews,
	viewsForAudience,
	countryFlagUrl,
	countryName,
	formatReferrer
} from './pageViewStats';
import type { PageViewDailyStats } from '$lib/types/pageView';

/** Doc antiguo: mapas planos, sin contadores por audiencia. */
const legacyStat = {
	id: '2026-06-01',
	date: '2026-06-01',
	totalViews: 10,
	viewsByBrowser: { Chrome: 7, Firefox: 3 },
	viewsByCountry: {},
	viewsByPath: {},
	viewsByDevice: {},
	viewsByPlatform: {},
	viewsByUser: {},
	userNames: {}
} as unknown as PageViewDailyStats;

/** Doc nuevo: mapas partidos y contadores escalares por audiencia. */
const splitStat = {
	id: '2026-07-01',
	date: '2026-07-01',
	totalViews: 30,
	registeredViews: 10,
	anonymousViews: 20,
	viewsByBrowser: { reg: { Chrome: 10 }, anon: { Safari: 20 } },
	viewsByCountry: { reg: { ES: 10 }, anon: { ES: 15, FR: 5 } },
	viewsByPath: {},
	viewsByDevice: {},
	viewsByPlatform: {},
	viewsByUser: {},
	userNames: {}
} as unknown as PageViewDailyStats;

describe('readBranch', () => {
	it('lee la rama reg de un mapa partido', () => {
		expect(readBranch(splitStat.viewsByBrowser, 'registered')).toEqual({ Chrome: 10 });
	});

	it('lee la rama anon de un mapa partido', () => {
		expect(readBranch(splitStat.viewsByBrowser, 'anonymous')).toEqual({ Safari: 20 });
	});

	it('suma ambas ramas con audience "all"', () => {
		expect(readBranch(splitStat.viewsByCountry, 'all')).toEqual({ ES: 25, FR: 5 });
	});

	it('trata un mapa plano heredado como rama reg', () => {
		expect(readBranch(legacyStat.viewsByBrowser, 'registered')).toEqual({ Chrome: 7, Firefox: 3 });
		expect(readBranch(legacyStat.viewsByBrowser, 'all')).toEqual({ Chrome: 7, Firefox: 3 });
	});

	it('devuelve vacío al pedir los anónimos de un mapa plano heredado', () => {
		expect(readBranch(legacyStat.viewsByBrowser, 'anonymous')).toEqual({});
	});

	it('tolera mapas ausentes o inválidos', () => {
		expect(readBranch(undefined, 'all')).toEqual({});
		expect(readBranch(null, 'all')).toEqual({});
		expect(readBranch('boom', 'all')).toEqual({});
	});

	it('tolera una rama presente y la otra ausente', () => {
		expect(readBranch({ anon: { ES: 4 } }, 'all')).toEqual({ ES: 4 });
		expect(readBranch({ anon: { ES: 4 } }, 'registered')).toEqual({});
	});
});

describe('sumBranches', () => {
	it('agrega el mismo campo a lo largo de varios días', () => {
		expect(sumBranches([legacyStat, splitStat], 'viewsByBrowser', 'all')).toEqual({
			Chrome: 17,
			Firefox: 3,
			Safari: 20
		});
	});

	it('respeta el filtro de audiencia al agregar', () => {
		expect(sumBranches([legacyStat, splitStat], 'viewsByBrowser', 'anonymous')).toEqual({
			Safari: 20
		});
	});

	it('devuelve vacío sin datos', () => {
		expect(sumBranches([], 'viewsByBrowser', 'all')).toEqual({});
	});
});

describe('viewsForAudience', () => {
	it('devuelve el total con audience "all"', () => {
		expect(viewsForAudience(splitStat, 'all')).toBe(30);
	});

	it('usa los contadores escalares de cada audiencia', () => {
		expect(viewsForAudience(splitStat, 'registered')).toBe(10);
		expect(viewsForAudience(splitStat, 'anonymous')).toBe(20);
	});

	it('atribuye todo el histórico heredado a registrados', () => {
		expect(viewsForAudience(legacyStat, 'registered')).toBe(10);
		expect(viewsForAudience(legacyStat, 'anonymous')).toBe(0);
		expect(viewsForAudience(legacyStat, 'all')).toBe(10);
	});
});

describe('countryFlagUrl', () => {
	it('construye la URL de flagcdn para un código válido', () => {
		expect(countryFlagUrl('ES')).toBe('https://flagcdn.com/w20/es.png');
		expect(countryFlagUrl('us', 40)).toBe('https://flagcdn.com/w40/us.png');
	});

	it('devuelve null para XX, vacío o códigos inválidos', () => {
		expect(countryFlagUrl('XX')).toBeNull();
		expect(countryFlagUrl('')).toBeNull();
		expect(countryFlagUrl('ESP')).toBeNull();
	});
});

describe('countryName', () => {
	it('resuelve el nombre en español', () => {
		expect(countryName('ES')).toBe('España');
		expect(countryName('US')).toBe('Estados Unidos');
		expect(countryName('fr')).toBe('Francia');
	});

	it('devuelve Desconocido para XX y cae al código o guion en entradas raras', () => {
		expect(countryName('XX')).toBe('Desconocido');
		expect(countryName('')).toBe('—');
	});
});

describe('formatReferrer', () => {
	it('extrae el host', () => {
		expect(formatReferrer('https://www.google.com/search?q=kinole')).toBe('google.com');
	});

	it('quita el prefijo www', () => {
		expect(formatReferrer('https://www.instagram.com/')).toBe('instagram.com');
	});

	it('devuelve un guion cuando es directo', () => {
		expect(formatReferrer('')).toBe('—');
	});

	it('devuelve un guion ante una URL inválida', () => {
		expect(formatReferrer('no-soy-una-url')).toBe('—');
	});
});

describe('sumBlogViews', () => {
	it('suma mapas planos antiguos y ramas reg/anon a través de varios días', () => {
		const legacy = {
			date: '2026-07-01',
			viewsByPath: { '_blog_mi-post': 3, _ranking: 5 }
		} as unknown as PageViewDailyStats;
		const split = {
			date: '2026-07-02',
			viewsByPath: {
				reg: { '_blog_mi-post': 2 },
				anon: { '_blog_mi-post': 4, '_blog_otro-post': 7, _root: 9 }
			}
		} as unknown as PageViewDailyStats;

		expect(sumBlogViews([legacy, split])).toEqual({
			'mi-post': 9,
			'otro-post': 7
		});
	});

	it('ignora el índice del blog y claves sin slug', () => {
		const stat = {
			date: '2026-07-03',
			viewsByPath: { _blog: 11, _blog_: 2 }
		} as unknown as PageViewDailyStats;

		expect(sumBlogViews([stat])).toEqual({});
	});

	it('devuelve vacío sin datos', () => {
		expect(sumBlogViews([])).toEqual({});
	});
});
