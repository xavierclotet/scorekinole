/**
 * Serialize a JSON-LD value for safe embedding inside a
 * `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone does NOT escape `</script>`, `<!--`, `&`, or the
 * U+2028/U+2029 separators, so a user-controlled string (e.g. a tournament or
 * player name) could break out of the script tag and inject markup/JS (XSS).
 * Escaping `<`, `>`, `&` and the JS line separators prevents that; JSON parsers
 * decode the `\uXXXX` escapes transparently, so the structured data is unchanged.
 *
 * A single object is wrapped in an array (schema.org "graph" shape), matching
 * how the JSON-LD is consumed.
 */

// Code points that must not appear raw inside a <script> tag:
// 0x3c '<', 0x3e '>', 0x26 '&', 0x2028 line sep, 0x2029 paragraph sep.
const UNSAFE_CODE_POINTS = new Set([0x3c, 0x3e, 0x26, 0x2028, 0x2029]);

export function serializeJsonLd(jsonLd: object | object[]): string {
	const json = JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
	let out = '';
	for (const ch of json) {
		const code = ch.charCodeAt(0);
		out += UNSAFE_CODE_POINTS.has(code) ? '\\u' + code.toString(16).padStart(4, '0') : ch;
	}
	return out;
}
