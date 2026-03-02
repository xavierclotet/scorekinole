<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime.js';
	import { currentUser } from '$lib/firebase/auth';
	import { saveUserLanguage } from '$lib/firebase/userProfile';
	import * as m from '$lib/paraglide/messages.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Globe, Check } from '@lucide/svelte';

	const languages = [
		{ code: 'es' as const, label: 'Español', short: 'ES' },
		{ code: 'ca' as const, label: 'Català', short: 'CA' },
		{ code: 'en' as const, label: 'English', short: 'EN' }
	];

	let currentLang = $derived(getLocale());

	async function selectLanguage(lang: 'es' | 'ca' | 'en') {
		setLocale(lang);
		if ($currentUser) {
			await saveUserLanguage(lang);
		}
	}

	function isSelected(code: string) {
		return currentLang === code;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon"
				class="size-9 rounded-full bg-foreground/5 border border-foreground/15 text-foreground/70 hover:bg-foreground/10 hover:text-foreground hover:border-foreground/30"
				title={m.common_language()}
			>
				<Globe class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content align="end" sideOffset={8}>
			<div class="lang-menu" data-lang-menu>
				{#each languages as lang}
					{@const selected = isSelected(lang.code)}
					<button
						class="lang-item"
						class:lang-selected={selected}
						onclick={() => selectLanguage(lang.code)}
					>
						<span class="lang-code">{lang.short}</span>
						<span class="lang-label">{lang.label}</span>
						{#if selected}
							<Check class="lang-check-icon" />
						{/if}
					</button>
				{/each}
			</div>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	/* Portal renders outside component DOM — use :global with data attribute to scope */
	:global([data-lang-menu]) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		min-width: 160px;
	}

	:global([data-lang-menu] .lang-item) {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--foreground);
		transition: background 0.15s ease;
		text-align: left;
		width: 100%;
		font-family: inherit;
	}

	:global([data-lang-menu] .lang-item:hover) {
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
	}

	:global([data-lang-menu] .lang-item.lang-selected) {
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
	}

	:global([data-lang-menu] .lang-item.lang-selected:hover) {
		background: color-mix(in srgb, var(--primary) 18%, transparent);
	}

	:global([data-lang-menu] .lang-code) {
		font-weight: 600;
		font-size: 0.75rem;
		width: 24px;
		flex-shrink: 0;
		opacity: 0.7;
	}

	:global([data-lang-menu] .lang-item.lang-selected .lang-code) {
		opacity: 1;
	}

	:global([data-lang-menu] .lang-label) {
		flex: 1;
	}

	:global([data-lang-menu] .lang-check-icon) {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}
</style>
