/**
 * Recursively clean an object for Firestore compatibility.
 * - Removes undefined values (Firestore rejects them)
 * - Converts NaN/Infinity to null (Firestore rejects them)
 * - Converts Firestore Timestamp objects to millis
 * - Passes FieldValue sentinels (deleteField, serverTimestamp, ...) through untouched
 *
 * Single canonical version — all Firebase modules import from here.
 */

/**
 * Firestore FieldValue sentinels (deleteField(), serverTimestamp(), arrayUnion…)
 * must reach Firestore as-is: recursing into them would strip their prototype
 * and turn e.g. deleteField() into a plain `{}`.
 *
 * Detected structurally (internal `_methodName` string + `isEqual` method)
 * instead of `instanceof FieldValue`: importing FieldValue here would break
 * every unit test that mocks 'firebase/firestore' without exporting it.
 */
function isFieldValueSentinel(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as { _methodName?: unknown })._methodName === 'string' &&
    typeof (obj as { isEqual?: unknown }).isEqual === 'function'
  );
}

export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'number' && !Number.isFinite(obj)) {
    return null as T;
  }

  if (isFieldValueSentinel(obj)) {
    return obj;
  }

  // Handle Firestore Timestamp objects (have toMillis method)
  if (obj && typeof obj === 'object' && 'toMillis' in obj && typeof (obj as any).toMillis === 'function') {
    return (obj as any).toMillis() as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)).filter(item => item !== undefined) as T;
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    });
    return cleaned as T;
  }

  return obj;
}
