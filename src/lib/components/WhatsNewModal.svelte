<script lang="ts">
	import Modal from './Modal.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getRecentChanges, type ChangelogEntry } from '$lib/utils/changelog';
	import { translateText } from '$lib/utils/translate';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import { LoaderCircle } from '@lucide/svelte';

	interface Props {
		isOpen: boolean;
		onclose: () => void;
	}

	let { isOpen, onclose }: Props = $props();

	const entries = getRecentChanges(5);
	const locale = getLocale();
	const needsTranslation = locale !== 'en';

	let translatedMap = $state<Record<string, string[]>>({});
	let isTranslating = $state(false);

	$effect(() => {
		if (isOpen && needsTranslation && Object.keys(translatedMap).length === 0) {
			loadTranslations();
		}
	});

	async function loadTranslations() {
		if (!browser) return;

		const cacheKey = `scorekinole_changelog_${locale}`;
		const cached = localStorage.getItem(cacheKey);

		if (cached) {
			try {
				const parsed = JSON.parse(cached) as Record<string, string[]>;
				if (entries.every(e => parsed[e.version])) {
					translatedMap = parsed;
					return;
				}
			} catch { /* ignore corrupt cache */ }
		}

		isTranslating = true;
		const result: Record<string, string[]> = { ...translatedMap };

		for (const entry of entries) {
			if (result[entry.version]) continue;

			const translated: string[] = [];
			for (const change of entry.changes) {
				const res = await translateText(change, 'en', locale);
				translated.push(res.success && res.translatedText ? res.translatedText : change);
			}
			result[entry.version] = translated;
			translatedMap = { ...result };
		}

		isTranslating = false;
		localStorage.setItem(cacheKey, JSON.stringify(result));
	}

	function getChanges(entry: ChangelogEntry): string[] {
		if (!needsTranslation) return entry.changes;
		return translatedMap[entry.version] || entry.changes;
	}
</script>

<Modal {isOpen} title={m.update_whatsNew()} onClose={onclose}>
	<div class="changelog-container">
		{#if isTranslating}
			<div class="translating-hint">
				<LoaderCircle class="spin-icon" size={14} />
				<span>{m.update_translating()}</span>
			</div>
		{/if}

		<div class="timeline">
			{#each entries as entry, i (entry.version)}
				<div class="version-block" class:is-current={i === 0}>
					<div class="version-header">
						<span class="version-pill">
							v{entry.version}
						</span>
						{#if i === 0}
							<span class="current-badge">{m.update_current()}</span>
						{/if}
						<span class="version-date">{entry.date}</span>
					</div>

					<ul class="changes-list">
						{#each getChanges(entry) as change, ci (ci)}
							<li>{change}</li>
						{/each}
					</ul>

					{#if i < entries.length - 1}
						<div class="version-separator"></div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="modal-footer">
			<Button onclick={onclose} class="w-full max-w-[200px]">
				{m.update_gotIt()}
			</Button>
		</div>
	</div>
</Modal>

<style>
	.changelog-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 65vh;
		overflow: hidden;
	}

	.translating-hint {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.35);
		padding: 0.25rem 0;
		flex-shrink: 0;
	}

	:global([data-theme='light']) .translating-hint,
	:global([data-theme='violet-light']) .translating-hint {
		color: rgba(0, 0, 0, 0.35);
	}

	:global(.spin-icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.timeline {
		flex: 1;
		overflow-y: auto;
		padding-right: 0.5rem;
		display: flex;
		flex-direction: column;
	}

	.timeline::-webkit-scrollbar {
		width: 4px;
	}

	.timeline::-webkit-scrollbar-track {
		background: transparent;
	}

	.timeline::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.12);
		border-radius: 2px;
	}

	.timeline::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.version-block {
		padding: 0.75rem 0;
	}

	.version-block:first-child {
		padding-top: 0;
	}

	.version-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.version-pill {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.2rem 0.55rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.7);
		letter-spacing: 0.02em;
	}

	.is-current .version-pill {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
	}

	.current-badge {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.12rem 0.4rem;
		border-radius: 3px;
		background: var(--primary);
		color: var(--primary-foreground);
		line-height: 1.2;
	}

	.version-date {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.3);
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}

	.changes-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.changes-list li {
		font-size: 0.78rem;
		line-height: 1.45;
		color: rgba(255, 255, 255, 0.6);
		padding-left: 1rem;
		position: relative;
	}

	.changes-list li::before {
		content: '';
		position: absolute;
		left: 0.2rem;
		top: 0.5em;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
	}

	.is-current .changes-list li {
		color: rgba(255, 255, 255, 0.75);
	}

	.is-current .changes-list li::before {
		background: color-mix(in srgb, var(--primary) 50%, transparent);
	}

	.version-separator {
		margin-top: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.modal-footer {
		display: flex;
		justify-content: center;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}

	/* ── Light themes ── */
	:global([data-theme='light']) .version-pill,
	:global([data-theme='violet-light']) .version-pill {
		background: rgba(0, 0, 0, 0.05);
		color: rgba(0, 0, 0, 0.6);
	}

	:global([data-theme='light']) .is-current .version-pill,
	:global([data-theme='violet-light']) .is-current .version-pill {
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
	}

	:global([data-theme='light']) .version-date,
	:global([data-theme='violet-light']) .version-date {
		color: rgba(0, 0, 0, 0.35);
	}

	:global([data-theme='light']) .changes-list li,
	:global([data-theme='violet-light']) .changes-list li {
		color: rgba(0, 0, 0, 0.5);
	}

	:global([data-theme='light']) .is-current .changes-list li,
	:global([data-theme='violet-light']) .is-current .changes-list li {
		color: rgba(0, 0, 0, 0.7);
	}

	:global([data-theme='light']) .changes-list li::before,
	:global([data-theme='violet-light']) .changes-list li::before {
		background: rgba(0, 0, 0, 0.15);
	}

	:global([data-theme='light']) .is-current .changes-list li::before,
	:global([data-theme='violet-light']) .is-current .changes-list li::before {
		background: color-mix(in srgb, var(--primary) 50%, transparent);
	}

	:global([data-theme='light']) .version-separator,
	:global([data-theme='violet-light']) .version-separator {
		border-bottom-color: rgba(0, 0, 0, 0.06);
	}

	:global([data-theme='light']) .modal-footer,
	:global([data-theme='violet-light']) .modal-footer {
		border-top-color: rgba(0, 0, 0, 0.06);
	}

	:global([data-theme='light']) .timeline::-webkit-scrollbar-thumb,
	:global([data-theme='violet-light']) .timeline::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.1);
	}

	:global([data-theme='light']) .timeline::-webkit-scrollbar-thumb:hover,
	:global([data-theme='violet-light']) .timeline::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.18);
	}

	/* ── Mobile ── */
	@media (max-width: 600px) {
		.changelog-container {
			max-height: 60vh;
		}

		.changes-list li {
			font-size: 0.72rem;
		}

		.version-pill {
			font-size: 0.72rem;
		}

		.version-date {
			font-size: 0.65rem;
		}
	}

	@media (max-width: 600px) and (orientation: portrait) {
		.changelog-container {
			max-height: 68vh;
		}
	}

	@media (orientation: landscape) and (max-height: 500px) {
		.changelog-container {
			max-height: 50vh;
		}
	}
</style>
