/**
 * Minimal markdown renderer for blog posts (/blog/[slug]).
 *
 * The output is injected with {@html}, so the input is HTML-escaped FIRST.
 * This matters because the "Traducir" button feeds this function text coming
 * from the MyMemory API — a public, collaborative translation memory whose
 * responses must be treated as untrusted (they can contain arbitrary markup).
 * Only the tags this renderer emits (h2/h3/ul/li/strong/p) reach the DOM.
 */

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function renderMarkdown(text: string): string {
	let html = escapeHtml(text)
		.replace(/^### (.+)$/gm, '<h3>$1</h3>')
		.replace(/^## (.+)$/gm, '<h2>$1</h2>')
		.replace(/^\* (.+)$/gm, '<li>$1</li>')
		.replace(/^- (.+)$/gm, '<li>$1</li>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\n\n/g, '</p><p>');
	html = '<p>' + html + '</p>';
	html = html.replace(/<\/p>\s*<li>/g, '<li>');
	html = html.replace(/<\/li>\s*<p>/g, '</li>');
	html = html.replace(/(<li>.*?<\/li>)/gs, (m) => `<ul>${m}</ul>`);
	html = html.replace(/<\/ul>\s*<ul>/g, '');
	return html;
}
