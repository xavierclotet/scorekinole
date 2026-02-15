/**
 * YouTube URL utilities
 */

const YOUTUBE_PATTERNS = [
	/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
	/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
	/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
	/(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
	/(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
];

export function extractYouTubeId(url: string): string | null {
	if (!url) return null;
	for (const pattern of YOUTUBE_PATTERNS) {
		const match = url.match(pattern);
		if (match) return match[1];
	}
	return null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
	return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'hq' | 'maxres' = 'hq'): string {
	const qualityMap = {
		default: 'default',
		hq: 'hqdefault',
		maxres: 'maxresdefault'
	};
	return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

export function isValidYouTubeUrl(url: string): boolean {
	return extractYouTubeId(url) !== null;
}
