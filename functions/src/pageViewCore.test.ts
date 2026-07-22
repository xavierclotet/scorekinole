import { describe, it, expect } from 'vitest';
import {
  isAllowedOrigin,
  pickClientIp,
  rateLimitKeyForIp,
  isBotUserAgent,
  validatePageViewPayload,
  ipCacheKey,
  isGeoCacheFresh,
  parseGeoResponse,
  encodePathKey,
  buildStatsIncrement,
  GEO_CACHE_TTL_MS,
  UNKNOWN_GEO,
} from './pageViewCore';

/** Payload mínimo válido, reutilizado y mutado en los tests de validación. */
function validBody(): Record<string, unknown> {
  return {
    path: '/tournaments/abc123',
    normalizedPath: '/tournaments/[id]',
    sessionId: '1700000000000_abc123xyz',
    deviceType: 'mobile',
    browserName: 'Chrome',
    screenSize: '390x844',
    language: 'es-ES',
    appVersion: '2.5.67',
    referrer: 'https://google.com/search',
    userId: '',
    userName: '',
    isAnonymous: true,
  };
}

describe('isAllowedOrigin', () => {
  it('acepta el dominio de producción', () => {
    expect(isAllowedOrigin('https://scorekinole.es')).toBe(true);
  });

  it('acepta los dominios de Firebase Hosting', () => {
    expect(isAllowedOrigin('https://scorekinole.web.app')).toBe(true);
    expect(isAllowedOrigin('https://scorekinole.firebaseapp.com')).toBe(true);
  });

  it('rechaza un origin desconocido', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
  });

  it('rechaza un origin ausente o no-string', () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin(42)).toBe(false);
  });

  it('rechaza un prefijo que no es el origin completo', () => {
    expect(isAllowedOrigin('https://scorekinole.es.evil.com')).toBe(false);
  });
});

describe('pickClientIp', () => {
  it('toma la última entrada válida de x-forwarded-for (la añade el front de Google)', () => {
    expect(pickClientIp('10.0.0.1', 'spoofed, 81.44.1.2')).toBe('81.44.1.2');
  });

  it('retrocede sobre entradas finales no válidas hasta una IP real', () => {
    expect(pickClientIp(undefined, '81.44.1.2, garbage')).toBe('81.44.1.2');
  });

  it('acepta x-forwarded-for como array de cabeceras', () => {
    expect(pickClientIp(undefined, ['10.0.0.1, 81.44.1.2'])).toBe('81.44.1.2');
  });

  it('acepta IPv6', () => {
    expect(pickClientIp(undefined, '2a02:9130::1')).toBe('2a02:9130::1');
  });

  it('cae a req.ip cuando no hay x-forwarded-for', () => {
    expect(pickClientIp('81.44.1.2', undefined)).toBe('81.44.1.2');
  });

  it('devuelve "unknown" cuando nada es una IP válida', () => {
    expect(pickClientIp('not-an-ip', 'garbage, more')).toBe('unknown');
    expect(pickClientIp(undefined, undefined)).toBe('unknown');
    expect(pickClientIp('', '')).toBe('unknown');
  });
});

describe('rateLimitKeyForIp', () => {
  it('es determinista y no contiene la IP en claro', () => {
    const k = rateLimitKeyForIp('81.44.1.2');
    expect(k).toBe(rateLimitKeyForIp('81.44.1.2'));
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain('81.44');
  });

  it('distingue IPs distintas', () => {
    expect(rateLimitKeyForIp('81.44.1.2')).not.toBe(rateLimitKeyForIp('81.44.1.3'));
  });
});

describe('isBotUserAgent', () => {
  it('detecta crawlers que se identifican', () => {
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)')).toBe(true);
  });

  it('detecta headless y herramientas HTTP', () => {
    expect(isBotUserAgent('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0')).toBe(true);
    expect(isBotUserAgent('curl/8.4.0')).toBe(true);
    expect(isBotUserAgent('python-requests/2.31.0')).toBe(true);
  });

  it('trata un UA ausente o vacío como bot', () => {
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent('   ')).toBe(true);
    expect(isBotUserAgent(42)).toBe(true);
  });

  it('deja pasar navegadores reales', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')).toBe(false);
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0')).toBe(false);
  });
});

describe('validatePageViewPayload', () => {
  it('acepta un payload anónimo válido', () => {
    const r = validatePageViewPayload(validBody());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.isAnonymous).toBe(true);
      expect(r.value.normalizedPath).toBe('/tournaments/[id]');
    }
  });

  it('acepta un payload de usuario registrado', () => {
    const r = validatePageViewPayload({
      ...validBody(),
      userId: 'user123',
      userName: 'Xavi',
      isAnonymous: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.userName).toBe('Xavi');
  });

  it('rechaza un body que no es objeto', () => {
    expect(validatePageViewPayload(null).ok).toBe(false);
    expect(validatePageViewPayload('nope').ok).toBe(false);
    expect(validatePageViewPayload([]).ok).toBe(false);
  });

  it('rechaza si falta path', () => {
    const body = validBody();
    delete body.path;
    expect(validatePageViewPayload(body).ok).toBe(false);
  });

  it('rechaza un path de 1000 chars', () => {
    const r = validatePageViewPayload({ ...validBody(), path: '/t/' + 'x'.repeat(1000) });
    expect(r.ok).toBe(false);
  });

  it('rechaza un referrer de 1000 chars', () => {
    const r = validatePageViewPayload({ ...validBody(), referrer: 'https://' + 'x'.repeat(1000) });
    expect(r.ok).toBe(false);
  });

  it('rechaza un deviceType fuera del enum', () => {
    const r = validatePageViewPayload({ ...validBody(), deviceType: 'toaster' });
    expect(r.ok).toBe(false);
  });

  it('rechaza isAnonymous no booleano', () => {
    const r = validatePageViewPayload({ ...validBody(), isAnonymous: 'yes' });
    expect(r.ok).toBe(false);
  });

  it('rechaza una visita anónima que trae userId', () => {
    const r = validatePageViewPayload({ ...validBody(), isAnonymous: true, userId: 'user123' });
    expect(r.ok).toBe(false);
  });

  it('rechaza una visita registrada sin userId', () => {
    const r = validatePageViewPayload({ ...validBody(), isAnonymous: false, userId: '' });
    expect(r.ok).toBe(false);
  });

  it('normaliza los campos opcionales ausentes a cadena vacía', () => {
    const body = validBody();
    delete body.referrer;
    const r = validatePageViewPayload(body);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.referrer).toBe('');
  });

  it('trunca campos largos pero permitidos en vez de rechazarlos', () => {
    const r = validatePageViewPayload({ ...validBody(), userName: 'N'.repeat(300) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.userName.length).toBeLessThanOrEqual(120);
  });
});

describe('ipCacheKey', () => {
  it('sustituye los puntos de una IPv4', () => {
    expect(ipCacheKey('81.44.1.2')).toBe('81_44_1_2');
  });

  it('sustituye los dos puntos de una IPv6', () => {
    expect(ipCacheKey('2a02:9130::1')).toBe('2a02_9130__1');
  });

  it('deja "unknown" intacto', () => {
    expect(ipCacheKey('unknown')).toBe('unknown');
  });
});

describe('isGeoCacheFresh', () => {
  const NOW = 1_800_000_000_000;

  it('considera fresca una entrada reciente', () => {
    expect(isGeoCacheFresh(NOW - 1000, NOW)).toBe(true);
  });

  it('considera caducada una entrada más vieja que el TTL', () => {
    expect(isGeoCacheFresh(NOW - GEO_CACHE_TTL_MS - 1, NOW)).toBe(false);
  });

  it('considera caducado un fetchedAt ausente o inválido', () => {
    expect(isGeoCacheFresh(undefined, NOW)).toBe(false);
    expect(isGeoCacheFresh('ayer', NOW)).toBe(false);
    expect(isGeoCacheFresh(NaN, NOW)).toBe(false);
  });
});

describe('parseGeoResponse', () => {
  it('extrae país y ciudad de una respuesta correcta', () => {
    const r = parseGeoResponse({
      success: true,
      country: 'Spain',
      country_code: 'ES',
      city: 'Barcelona',
    });
    expect(r).toEqual({ countryCode: 'ES', country: 'Spain', city: 'Barcelona' });
  });

  it('devuelve UNKNOWN_GEO cuando success es false', () => {
    expect(parseGeoResponse({ success: false, message: 'Invalid IP' })).toEqual(UNKNOWN_GEO);
  });

  it('devuelve UNKNOWN_GEO ante un JSON inesperado', () => {
    expect(parseGeoResponse(null)).toEqual(UNKNOWN_GEO);
    expect(parseGeoResponse('boom')).toEqual(UNKNOWN_GEO);
    expect(parseGeoResponse({})).toEqual(UNKNOWN_GEO);
  });

  it('normaliza el country_code a mayúsculas', () => {
    const r = parseGeoResponse({ success: true, country: 'Spain', country_code: 'es', city: '' });
    expect(r.countryCode).toBe('ES');
  });

  it('tolera una ciudad ausente', () => {
    const r = parseGeoResponse({ success: true, country: 'Spain', country_code: 'ES' });
    expect(r.city).toBe('');
  });

  it('trunca country y city desmesurados', () => {
    const r = parseGeoResponse({ success: true, country: 'X'.repeat(500), country_code: 'ES', city: 'Y'.repeat(500) });
    expect(r.country.length).toBeLessThanOrEqual(120);
    expect(r.city.length).toBeLessThanOrEqual(120);
  });
});

describe('encodePathKey', () => {
  it('codifica la raíz', () => {
    expect(encodePathKey('/')).toBe('_');
  });

  it('quita las barras y los corchetes', () => {
    expect(encodePathKey('/tournaments/[id]')).toBe('_tournaments_id');
  });
});

describe('buildStatsIncrement', () => {
  /** Sustituto de FieldValue.increment, comparable en los asserts. */
  const inc = (n: number) => ({ __inc: n });

  const anonInput = {
    normalizedPath: '/tournaments/[id]',
    deviceType: 'mobile',
    platform: 'web',
    browserName: 'Chrome',
    countryCode: 'ES',
    userId: '',
    userName: '',
    isAnonymous: true,
  };

  const regInput = {
    normalizedPath: '/ranking',
    deviceType: 'desktop',
    platform: 'web',
    browserName: 'Firefox',
    countryCode: 'FR',
    userId: 'user.with.dots',
    userName: 'Xavi',
    isAnonymous: false,
  };

  it('cuenta una visita anónima en la rama anon', () => {
    const out = buildStatsIncrement(anonInput, inc) as any;
    expect(out.viewsByCountry).toEqual({ anon: { ES: { __inc: 1 } } });
    expect(out.viewsByBrowser).toEqual({ anon: { Chrome: { __inc: 1 } } });
    expect(out.viewsByPath).toEqual({ anon: { _tournaments_id: { __inc: 1 } } });
    expect(out.viewsByDevice).toEqual({ anon: { mobile: { __inc: 1 } } });
    expect(out.viewsByPlatform).toEqual({ anon: { web: { __inc: 1 } } });
  });

  it('cuenta una visita registrada en la rama reg', () => {
    const out = buildStatsIncrement(regInput, inc) as any;
    expect(out.viewsByCountry).toEqual({ reg: { FR: { __inc: 1 } } });
    expect(out.viewsByPath).toEqual({ reg: { _ranking: { __inc: 1 } } });
  });

  it('mueve los contadores escalares al lado correcto', () => {
    const anon = buildStatsIncrement(anonInput, inc) as any;
    expect(anon.totalViews).toEqual({ __inc: 1 });
    expect(anon.anonymousViews).toEqual({ __inc: 1 });
    expect(anon.registeredViews).toEqual({ __inc: 0 });

    const reg = buildStatsIncrement(regInput, inc) as any;
    expect(reg.anonymousViews).toEqual({ __inc: 0 });
    expect(reg.registeredViews).toEqual({ __inc: 1 });
  });

  it('agrupa a los anónimos bajo la clave _anon con nombre Anónimo', () => {
    const out = buildStatsIncrement(anonInput, inc) as any;
    expect(out.viewsByUser).toEqual({ _anon: { __inc: 1 } });
    expect(out.userNames).toEqual({ _anon: 'Anónimo' });
  });

  it('escapa los puntos del userId (no son válidos como clave de mapa)', () => {
    const out = buildStatsIncrement(regInput, inc) as any;
    expect(out.viewsByUser).toEqual({ user_with_dots: { __inc: 1 } });
    expect(out.userNames).toEqual({ user_with_dots: 'Xavi' });
  });

  it('cae a valores "unknown" cuando faltan dimensiones', () => {
    const out = buildStatsIncrement(
      { ...anonInput, deviceType: '', browserName: '', countryCode: '' },
      inc
    ) as any;
    expect(out.viewsByDevice).toEqual({ anon: { unknown: { __inc: 1 } } });
    expect(out.viewsByBrowser).toEqual({ anon: { unknown: { __inc: 1 } } });
    expect(out.viewsByCountry).toEqual({ anon: { XX: { __inc: 1 } } });
  });
});
