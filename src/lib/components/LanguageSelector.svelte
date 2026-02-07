<script lang="ts">
	import { gameSettings } from '$lib/stores/gameSettings';
	import * as m from '$lib/paraglide/messages.js';

	let isOpen = $state(false);

	const languages = [
		{ code: 'es' as const, label: 'Español', short: 'ES' },
		{ code: 'ca' as const, label: 'Català', short: 'CA' },
		{ code: 'en' as const, label: 'English', short: 'EN' }
	];

	function toggleOpen() {
		isOpen = !isOpen;
	}

	function selectLanguage(lang: 'es' | 'ca' | 'en') {
		gameSettings.update((settings) => ({ ...settings, language: lang }));
		gameSettings.save();
		isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.language-selector')) {
			isOpen = false;
		}
	}

	$effect(() => {
		if (isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="language-selector">
	<button
		class="lang-toggle"
		onclick={toggleOpen}
		title={m.common_language()}
		aria-expanded={isOpen}
		aria-haspopup="listbox"
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10" />
			<path d="M2 12h20" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	</button>

	{#if isOpen}
		<div class="lang-dropdown" role="listbox">
			{#each languages as lang}
				<button
					class="lang-option"
					class:active={$gameSettings.language === lang.code}
					onclick={() => selectLanguage(lang.code)}
					role="option"
					aria-selected={$gameSettings.language === lang.code}
				>
					<span class="lang-short">{lang.short}</span>
					<span class="lang-full">{lang.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.language-selector {
		position: relative;
	}

	.lang-toggle {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.05);
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 50%;
		color: rgba(0, 0, 0, 0.6);
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
	}

	.lang-toggle svg {
		width: 16px;
		height: 16px;
	}

	.lang-toggle:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #1a1a2e;
		border-color: rgba(0, 0, 0, 0.3);
	}

	.lang-toggle:active {
		transform: scale(0.95);
	}

	.lang-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		overflow: hidden;
		z-index: 100;
		min-width: 140px;
		animation: dropdownIn 0.15s ease-out;
	}

	@keyframes dropdownIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.lang-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 14px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
		color: #333;
	}

	.lang-option:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.lang-option.active {
		background: rgba(59, 130, 246, 0.1);
		color: #2563eb;
	}

	.lang-short {
		font-weight: 600;
		font-size: 12px;
		width: 24px;
	}

	.lang-full {
		font-size: 14px;
	}

	/* Dark theme */
	:global([data-theme='dark']) .lang-toggle {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.7);
	}

	:global([data-theme='dark']) .lang-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #60a5fa;
		border-color: rgba(96, 165, 250, 0.3);
	}

	:global([data-theme='dark']) .lang-dropdown {
		background: #1e1e2e;
		border-color: rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	:global([data-theme='dark']) .lang-option {
		color: rgba(255, 255, 255, 0.9);
	}

	:global([data-theme='dark']) .lang-option:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	:global([data-theme='dark']) .lang-option.active {
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
	}
</style>
