/**
 * Recursively clean an object for Firestore compatibility.
 * - Removes undefined values (Firestore rejects them)
 * - Converts NaN/Infinity to null (Firestore rejects them)
 * - Converts Firestore Timestamp objects to millis
 *
 * Single canonical version — all Firebase modules import from here.
 */
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'number' && !Number.isFinite(obj)) {
    return null as T;
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
