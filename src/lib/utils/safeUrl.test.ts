import { describe, it, expect } from 'vitest';
import { safeHostname } from './safeUrl';

describe('safeHostname', () => {
	it('extracts hostname from a full https URL', () => {
		expect(safeHostname('https://www.fcbq.cat/torneo/2026')).toBe('www.fcbq.cat');
	});

	it('extracts hostname from an http URL with port and query', () => {
		expect(safeHostname('http://example.com:8080/p?x=1')).toBe('example.com');
	});

	it('handles protocol-less links without throwing (the page-crash case)', () => {
		expect(safeHostname('www.example.com')).toBe('www.example.com');
		expect(safeHostname('example.com/torneo')).toBe('example.com');
	});

	it('handles protocol-relative links', () => {
		expect(safeHostname('//cdn.example.com/x')).toBe('cdn.example.com');
	});

	it('returns the raw string for unparseable garbage instead of throwing', () => {
		expect(safeHostname('not a url at all')).toBe('not a url at all');
	});

	it('returns the raw string for empty input', () => {
		expect(safeHostname('')).toBe('');
	});

	it('does not misreport mailto-style links as empty', () => {
		const result = safeHostname('mailto:info@club.com');
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});
});
