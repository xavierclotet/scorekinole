/**
 * Tests for the blog markdown renderer ({@html} sink in /blog/[slug]).
 *
 * The critical property is HTML escaping: translated content comes from the
 * MyMemory public API and must never inject markup. Formatting tests pin the
 * existing pipeline (headings, lists, bold, paragraphs) so the escaping fix
 * doesn't change rendering of the real posts.
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, renderMarkdown } from './blogMarkdown';

describe('escapeHtml', () => {
	it('escapes all HTML-significant characters', () => {
		expect(escapeHtml(`<img src=x onerror="alert('1')" & more>`)).toBe(
			'&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot; &amp; more&gt;'
		);
	});

	it('leaves plain text untouched', () => {
		expect(escapeHtml('Hola, torneo de crokinole 2026')).toBe('Hola, torneo de crokinole 2026');
	});
});

describe('renderMarkdown — seguridad (XSS)', () => {
	it('neutraliza tags HTML en el texto (payload de traducción malicioso)', () => {
		const html = renderMarkdown('<img src=x onerror=alert(1)>Hola');
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Hola');
	});

	it('neutraliza <script> aunque venga dentro de markdown válido', () => {
		const html = renderMarkdown('## Título\n\n<script>steal()</script>\n\n- item');
		expect(html).not.toContain('<script');
		expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
		// El markdown sigue funcionando alrededor:
		expect(html).toContain('<h2>Título</h2>');
		expect(html).toContain('<ul><li>item</li></ul>');
	});

	it('solo emite los tags del propio renderer', () => {
		const html = renderMarkdown('**negrita** con <b>html</b>\n\n### Sub');
		const tags = [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase());
		expect(new Set(tags)).toEqual(new Set(['p', 'strong', 'h3']));
	});
});

describe('renderMarkdown — formato', () => {
	it('convierte encabezados ## y ###', () => {
		const html = renderMarkdown('## Grande\n\n### Pequeño');
		expect(html).toContain('<h2>Grande</h2>');
		expect(html).toContain('<h3>Pequeño</h3>');
	});

	it('convierte listas con - y * y las agrupa en un único <ul>', () => {
		const html = renderMarkdown('- uno\n- dos\n* tres');
		expect(html).toContain('<ul><li>uno</li>');
		expect(html).toContain('<li>tres</li></ul>');
		expect(html.match(/<ul>/g)).toHaveLength(1);
	});

	it('convierte **negrita** y separa párrafos por línea en blanco', () => {
		const html = renderMarkdown('Hola **mundo**\n\nSegundo párrafo');
		expect(html).toContain('<strong>mundo</strong>');
		expect(html).toContain('</p><p>');
		expect(html.startsWith('<p>')).toBe(true);
		expect(html.endsWith('</p>')).toBe(true);
	});

	it('las URLs en negrita del contenido real se conservan', () => {
		// Aparece tal cual en el post 'nuevo-dominio-scorekinole-es'
		const html = renderMarkdown('**https://scorekinole.es**');
		expect(html).toContain('<strong>https://scorekinole.es</strong>');
	});
});
