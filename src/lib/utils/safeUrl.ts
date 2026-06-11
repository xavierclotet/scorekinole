/**
 * Display-safe URL helpers.
 *
 * `new URL(link)` throws for links stored without a protocol ("www.example.com"),
 * and a throw inside a Svelte template takes the whole page down. Tournament
 * externalLink is free-text in the wizards, so it must be parsed defensively.
 */

/**
 * Extract the hostname of a link for display.
 * Falls back to prefixing https:// for protocol-less links, and to the raw
 * string when it cannot be parsed at all. Never throws.
 */
export function safeHostname(link: string): string {
	for (const candidate of [link, `https://${link}`]) {
		try {
			const { hostname } = new URL(candidate);
			if (hostname) return hostname;
		} catch {
			/* try next candidate */
		}
	}
	return link;
}
