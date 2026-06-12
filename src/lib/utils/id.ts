/**
 * Unique ID generation with cross-browser support.
 *
 * `crypto.randomUUID()` requires Safari 15.4+ / Chrome 92+ AND a secure
 * context — it crashes on older iPhones and some Android browsers.
 * `crypto.getRandomValues()` is universally supported, so we fall back to
 * a manual RFC 4122 v4 UUID built from it.
 */
export function generateId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	const bytes = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
	}
	// RFC 4122 version (4) and variant (10xx) bits
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex: string[] = [];
	for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
	return (
		hex.slice(0, 4).join('') +
		'-' +
		hex.slice(4, 6).join('') +
		'-' +
		hex.slice(6, 8).join('') +
		'-' +
		hex.slice(8, 10).join('') +
		'-' +
		hex.slice(10, 16).join('')
	);
}
