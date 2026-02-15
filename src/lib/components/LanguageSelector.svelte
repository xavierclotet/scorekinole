<script lang="ts">
	import { gameSettings } from '$lib/stores/gameSettings';
	import { setLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Globe, Check } from '@lucide/svelte';

	const languages = [
		{ code: 'es' as const, label: 'Español', short: 'ES' },
		{ code: 'ca' as const, label: 'Català', short: 'CA' },
		{ code: 'en' as const, label: 'English', short: 'EN' }
	];

	let currentLang = $derived($gameSettings.language);

	function selectLanguage(lang: 'es' | 'ca' | 'en') {
		gameSettings.update((settings) => ({ ...settings, language: lang }));
		gameSettings.save();
		// setLocale triggers page reload to apply translations
		setLocale(lang);
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
		<DropdownMenu.Content align="end" sideOffset={8} class="min-w-40 p-2">
			{#each languages as lang}
				{@const selected = isSelected(lang.code)}
				<DropdownMenu.Item
					onclick={() => selectLanguage(lang.code)}
					class={['cursor-pointer gap-3 py-2.5 px-3 rounded-md', selected && 'bg-primary/15 text-primary']}
				>
					<span class="font-semibold text-xs w-6">{lang.short}</span>
					<span class="flex-1">{lang.label}</span>
					{#if selected}
						<Check class="size-4" />
					{/if}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
