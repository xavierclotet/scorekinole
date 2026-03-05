import { describe, it, expect } from 'vitest';
import { extractYouTubeId, getYouTubeEmbedUrl, getYouTubeThumbnail, isValidYouTubeUrl } from './youtube';

describe('extractYouTubeId', () => {
	it('extracts ID from standard watch URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID from youtu.be short URL', () => {
		expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID from embed URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID from shorts URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID from live URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID when extra query params are present', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&index=2')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID with hyphens and underscores', () => {
		expect(extractYouTubeId('https://youtu.be/a1B-c2D_e3F')).toBe('a1B-c2D_e3F');
	});

	it('returns null for a random string', () => {
		expect(extractYouTubeId('not-a-url')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(extractYouTubeId('')).toBeNull();
	});

	it('returns null for a non-YouTube domain', () => {
		expect(extractYouTubeId('https://www.vimeo.com/watch?v=dQw4w9WgXcQ')).toBeNull();
	});

	it('returns null for a YouTube-like URL with too-short ID', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
	});
});

describe('getYouTubeEmbedUrl', () => {
	it('constructs correct embed URL with rel and modestbranding params', () => {
		expect(getYouTubeEmbedUrl('dQw4w9WgXcQ')).toBe(
			'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1'
		);
	});
});

describe('getYouTubeThumbnail', () => {
	it('returns hq thumbnail by default', () => {
		expect(getYouTubeThumbnail('dQw4w9WgXcQ')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
		);
	});

	it('returns default quality thumbnail when explicitly requested', () => {
		expect(getYouTubeThumbnail('dQw4w9WgXcQ', 'default')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg'
		);
	});

	it('returns maxres quality thumbnail when explicitly requested', () => {
		expect(getYouTubeThumbnail('dQw4w9WgXcQ', 'maxres')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
		);
	});
});

describe('isValidYouTubeUrl', () => {
	it('returns true for a valid watch URL', () => {
		expect(isValidYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
	});

	it('returns true for a valid youtu.be URL', () => {
		expect(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
	});

	it('returns false for a random string', () => {
		expect(isValidYouTubeUrl('hello world')).toBe(false);
	});

	it('returns false for an empty string', () => {
		expect(isValidYouTubeUrl('')).toBe(false);
	});
});
