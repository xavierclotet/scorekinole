import changelogRaw from '../../../CHANGELOG.md?raw';

export interface ChangelogEntry {
	version: string;
	date: string;
	changes: string[];
}

/**
 * Parses CHANGELOG.md and returns the most recent N versions
 */
export function getRecentChanges(count = 5): ChangelogEntry[] {
	if (!changelogRaw) return [];

	const entries: ChangelogEntry[] = [];
	const versionRegex = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/;
	const lines = changelogRaw.split('\n');

	let current: ChangelogEntry | null = null;

	for (const line of lines) {
		const match = line.match(versionRegex);
		if (match) {
			if (current) entries.push(current);
			if (entries.length >= count) break;
			current = { version: match[1], date: match[2], changes: [] };
		} else if (current && line.startsWith('- ')) {
			current.changes.push(line.slice(2).trim());
		}
	}

	if (current && entries.length < count) {
		entries.push(current);
	}

	return entries;
}
