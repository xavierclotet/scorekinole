/**
 * Lógica pura del pipeline de page views: validación del payload público,
 * control de origin, caché de geolocalización y construcción de los
 * incrementos de /pageViewStats.
 *
 * Sin I/O a propósito — todo lo que toca Firestore o la red vive en index.ts.
 * Espejo del patrón de playerStatsCore.ts y selfRegistrationCore.ts.
 */

export const ALLOWED_ORIGINS: readonly string[] = [
  "https://scorekinole.es",
  "https://www.scorekinole.es",
  "https://scorekinole.web.app",
  "https://scorekinole.firebaseapp.com",
];

export function isAllowedOrigin(origin: unknown): boolean {
  return typeof origin === "string" && ALLOWED_ORIGINS.includes(origin);
}

/**
 * La IP del cliente. Cloud Functions v2 corre sobre Express con trust proxy,
 * así que req.ip suele bastar; el fallback a x-forwarded-for cubre el caso de
 * que no lo esté. El primer valor de la lista es el cliente original, el resto
 * son los proxies intermedios.
 */
export function pickClientIp(reqIp: unknown, xForwardedFor: unknown): string {
  if (typeof reqIp === "string" && reqIp.trim()) return reqIp.trim();

  const raw = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
  if (typeof raw === "string") {
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}

export interface PageViewInput {
  path: string;
  normalizedPath: string;
  sessionId: string;
  deviceType: string;
  browserName: string;
  screenSize: string;
  language: string;
  appVersion: string;
  referrer: string;
  userId: string;
  userName: string;
  isAnonymous: boolean;
}

export type ValidationResult =
  | { ok: true; value: PageViewInput }
  | { ok: false; reason: string };

const MAX_LONG = 500;   // path, referrer — se rechazan si se pasan
const MAX_SHORT = 120;  // userName, language, etc — se truncan
const DEVICE_TYPES = ["mobile", "tablet", "desktop"];

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function validatePageViewPayload(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "body must be an object" };
  }

  const b = body as Record<string, unknown>;

  const path = asString(b.path);
  if (!path) return { ok: false, reason: "path is required" };
  if (path.length >= MAX_LONG) return { ok: false, reason: "path too long" };

  const referrer = asString(b.referrer);
  if (referrer.length >= MAX_LONG) return { ok: false, reason: "referrer too long" };

  const deviceType = asString(b.deviceType);
  if (!DEVICE_TYPES.includes(deviceType)) {
    return { ok: false, reason: "invalid deviceType" };
  }

  if (typeof b.isAnonymous !== "boolean") {
    return { ok: false, reason: "isAnonymous must be a boolean" };
  }
  const isAnonymous = b.isAnonymous;

  const userId = asString(b.userId);
  // Coherencia: un anónimo no puede reclamar identidad, y un registrado no
  // puede omitirla. Sin esto, cualquiera podría inflar las stats de otro user.
  if (isAnonymous && userId) return { ok: false, reason: "anonymous view cannot carry a userId" };
  if (!isAnonymous && !userId) return { ok: false, reason: "registered view requires a userId" };

  const normalizedPath = asString(b.normalizedPath) || path;
  if (normalizedPath.length >= MAX_LONG) {
    return { ok: false, reason: "normalizedPath too long" };
  }

  return {
    ok: true,
    value: {
      path,
      normalizedPath,
      sessionId: asString(b.sessionId).slice(0, MAX_SHORT),
      deviceType,
      browserName: asString(b.browserName).slice(0, MAX_SHORT),
      screenSize: asString(b.screenSize).slice(0, MAX_SHORT),
      language: asString(b.language).slice(0, MAX_SHORT),
      appVersion: asString(b.appVersion).slice(0, MAX_SHORT),
      referrer,
      userId: userId.slice(0, MAX_SHORT),
      userName: asString(b.userName).slice(0, MAX_SHORT),
      isAnonymous,
    },
  };
}

/** Los IDs de documento no admiten '/', y '.' rompe las rutas de campo. */
export function ipCacheKey(ip: string): string {
  return ip.replace(/[.:]/g, "_");
}

export const GEO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isGeoCacheFresh(fetchedAt: unknown, now: number): boolean {
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return false;
  return now - fetchedAt < GEO_CACHE_TTL_MS;
}

export interface GeoResult {
  countryCode: string;
  country: string;
  city: string;
}

export const UNKNOWN_GEO: GeoResult = {
  countryCode: "XX",
  country: "Desconocido",
  city: "",
};

/** Parsea la respuesta de ipwho.is. Cualquier forma inesperada → UNKNOWN_GEO. */
export function parseGeoResponse(json: unknown): GeoResult {
  if (typeof json !== "object" || json === null) return UNKNOWN_GEO;

  const j = json as Record<string, unknown>;
  if (j.success !== true) return UNKNOWN_GEO;

  const countryCode = asString(j.country_code).toUpperCase();
  if (!countryCode) return UNKNOWN_GEO;

  return {
    countryCode,
    country: asString(j.country) || UNKNOWN_GEO.country,
    city: asString(j.city),
  };
}

/**
 * Duplicado intencionado de src/lib/utils/pageViewPaths.ts: functions/ y src/
 * son paquetes npm distintos con tsconfigs distintos y no comparten módulos.
 * Si cambia una, debe cambiar la otra — los tests de ambos lados lo fijan.
 */
export function encodePathKey(normalizedPath: string): string {
  return normalizedPath.replace(/\//g, "_").replace(/[[\]]/g, "") || "_root";
}

export interface StatsInput {
  normalizedPath: string;
  deviceType: string;
  platform: string;
  browserName: string;
  countryCode: string;
  userId: string;
  userName: string;
  isAnonymous: boolean;
}

/**
 * Objeto de merge para /pageViewStats/{fecha}.
 *
 * `inc` se inyecta (en producción es FieldValue.increment) para que esta
 * función siga siendo pura y comparable en los tests.
 *
 * Los mapas de desglose van partidos en ramas `reg` / `anon` para que el
 * filtro de audiencia del dashboard funcione también sobre los gráficos.
 * Los docs antiguos tienen estos mapas planos; el lector los interpreta como
 * `reg`, que es correcto: antes de esta feature solo se trackeaba a usuarios
 * con sesión iniciada.
 */
export function buildStatsIncrement(
  pv: StatsInput,
  inc: (n: number) => unknown
): Record<string, unknown> {
  const branch = pv.isAnonymous ? "anon" : "reg";

  const pathKey = encodePathKey(pv.normalizedPath);
  const deviceKey = pv.deviceType || "unknown";
  const platformKey = pv.platform || "unknown";
  const browserKey = pv.browserName || "unknown";
  const countryKey = pv.countryCode || UNKNOWN_GEO.countryCode;

  const userKey = pv.isAnonymous ? "_anon" : pv.userId.replace(/\./g, "_");
  const userName = pv.isAnonymous ? "Anónimo" : pv.userName || "Unknown";

  return {
    totalViews: inc(1),
    registeredViews: inc(pv.isAnonymous ? 0 : 1),
    anonymousViews: inc(pv.isAnonymous ? 1 : 0),
    viewsByPath: { [branch]: { [pathKey]: inc(1) } },
    viewsByDevice: { [branch]: { [deviceKey]: inc(1) } },
    viewsByPlatform: { [branch]: { [platformKey]: inc(1) } },
    viewsByBrowser: { [branch]: { [browserKey]: inc(1) } },
    viewsByCountry: { [branch]: { [countryKey]: inc(1) } },
    viewsByUser: { [userKey]: inc(1) },
    userNames: { [userKey]: userName },
  };
}
