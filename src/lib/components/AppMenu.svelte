<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { APP_VERSION } from '$lib/constants';

	import { Home, ChevronDown, Globe, Check, Trophy, BarChart3, CirclePlus, Shield, User, Users, Swords } from '@lucide/svelte';
	import { setLocale, getLocale } from '$lib/paraglide/runtime.js';
	import { currentUser } from '$lib/firebase/auth';
	import { saveUserLanguage } from '$lib/firebase/userProfile';
	import { isAdminUser, isSuperAdminUser } from '$lib/stores/admin';

	type PageId = 'game' | 'tournaments' | 'rankings' | 'my-stats';

	interface Props {
		showHome?: boolean;
		homeHref?: string;
		showLanguage?: boolean;
		showNavigation?: boolean;
		currentPage?: PageId;
		class?: string;
		children?: Snippet;
	}

	let {
		showHome = true,
		homeHref = '/',
		showLanguage = false,
		showNavigation = true,
		currentPage,
		class: className,
		children
	}: Props = $props();

	// Language selection
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

	// Navigation items
	const navItems: { id: PageId; href: string; labelKey: () => string }[] = [
		{ id: 'game', href: '/game', labelKey: () => m.common_newGame() },
		{ id: 'tournaments', href: '/tournaments', labelKey: () => m.common_tournaments() },
		{ id: 'rankings', href: '/rankings', labelKey: () => m.common_rankings() },
		{ id: 'my-stats', href: '/my-stats', labelKey: () => m.stats_myStatistics() }
	];

	let visibleNavItems = $derived(navItems.filter((item) => item.id !== currentPage));

	function handleHomeClick() {
		goto(homeHref);
	}

	// Navigation shortcuts mapping
	const navShortcuts: Record<string, PageId> = {
		u: 'tournaments',
		r: 'rankings',
		g: 'game',
		s: 'my-stats'
	};

	// Keyboard shortcuts
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			// Skip if typing in an input
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			// Skip if any dialog/modal is open (check DOM state)
			const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"], [data-sheet-content][data-state="open"]');
			if (hasOpenDialog) return;

			const isMod = e.ctrlKey || e.metaKey;

			// Escape - go home
			if (e.key === 'Escape' && showHome) {
				e.preventDefault();
				goto(homeHref);
				return;
			}

			// Navigation shortcuts (Ctrl/Cmd + key)
			if (isMod && showNavigation) {
				const key = e.key.toLowerCase();
				const targetPage = navShortcuts[key];
				if (targetPage && targetPage !== currentPage) {
					e.preventDefault();
					const item = navItems.find((n) => n.id === targetPage);
					if (item) goto(item.href);
				}
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function getNavIcon(id: PageId) {
		return { game: CirclePlus, tournaments: Trophy, rankings: BarChart3, 'my-stats': User }[id];
	}

	function getNavShortcut(id: PageId): string | null {
		const shortcuts: Record<PageId, string> = {
			game: 'G',
			tournaments: 'U',
			rankings: 'R',
			'my-stats': 'S'
		};
		return shortcuts[id] ? `Ctrl+${shortcuts[id]}` : null;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class={[
					"flex items-center font-['Lexend'] text-[1.15rem] font-semibold",
					"bg-transparent border-none py-1 px-2 cursor-pointer rounded",
					"transition-all duration-150 tracking-[0.01em]",
					"text-foreground/85 hover:text-foreground hover:bg-foreground/[0.06]",
					"active:scale-[0.97]",
					"max-sm:text-[1rem] max-sm:py-0.5 max-sm:px-1.5",
					"max-[480px]:text-[0.9rem] max-[480px]:py-0.5 max-[480px]:px-1",
					className
				]}
			>
				Scorekinole
				<span class="flex flex-col items-start ml-0.5">
					<span
						class={[
							"italic font-bold text-[0.75rem] text-[#dc2626] -rotate-[8deg]",
							"tracking-[0.08em] uppercase leading-none",
							"max-sm:text-[0.65rem] max-[480px]:text-[0.6rem]"
						]}
					>
						Arena
					</span>
					<span
						class={[
							"italic font-medium text-[0.6rem] -rotate-[8deg]",
							"tracking-[0.05em] leading-none mt-0.5 ml-0.5",
							"text-foreground/55",
							"max-sm:text-[0.5rem] max-[480px]:text-[0.45rem]"
						]}
					>
						v{APP_VERSION}
					</span>
				</span>
				<ChevronDown class="size-3.5 text-foreground/50 ml-1 shrink-0" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content align="start" sideOffset={8} class="min-w-56 p-2.5">
			{#if showHome}
				<DropdownMenu.Item
					onclick={handleHomeClick}
					class="cursor-pointer !pl-3 !pr-4 !py-2.5 !gap-2 rounded-lg transition-colors duration-150 hover:bg-accent group"
				>
					<div class="flex items-center justify-center size-8 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
						<Home class="size-4 text-primary" />
					</div>
					<span class="flex-1 font-medium">{m.common_goHome()}</span>
					<DropdownMenu.Shortcut>Esc</DropdownMenu.Shortcut>
				</DropdownMenu.Item>
			{/if}

			{#if children}
				{#if showHome}
					<DropdownMenu.Separator class="my-2" />
				{/if}
				{@render children()}
			{/if}

			{#if showNavigation && visibleNavItems.length > 0}
				{#if showHome || children}
					<DropdownMenu.Separator class="my-2" />
				{/if}
				{#each visibleNavItems as item}
					{@const Icon = getNavIcon(item.id)}
					<DropdownMenu.Item
						onclick={() => goto(item.href)}
						class="cursor-pointer !pl-3 !pr-4 !py-2.5 !gap-2 rounded-lg transition-colors duration-150 hover:bg-accent group"
					>
						<div class="flex items-center justify-center size-8 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
							{#if item.id === 'rankings'}
								<svg class="size-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
									<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z" />
								</svg>
							{:else}
								<Icon class="size-4 text-primary" />
							{/if}
						</div>
						<span class="flex-1 font-medium">{item.labelKey()}</span>
						{@const shortcut = getNavShortcut(item.id)}
						{#if shortcut}
							<DropdownMenu.Shortcut>{shortcut}</DropdownMenu.Shortcut>
						{/if}
					</DropdownMenu.Item>
				{/each}
			{/if}

			{#if $isAdminUser}
				<DropdownMenu.Separator class="my-2" />
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger
						class="cursor-pointer !pl-3 !pr-4 !py-2.5 !gap-2 rounded-lg transition-colors duration-150 hover:bg-accent group"
					>
						<div class="flex items-center justify-center size-8 rounded-md bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
							<Shield class="size-4 text-amber-500" />
						</div>
						<span class="flex-1 font-medium">{m.admin_panel()}</span>
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="min-w-48 p-1.5">
						{#if $isSuperAdminUser}
							<DropdownMenu.Item
								onclick={() => goto('/admin/users')}
								class="cursor-pointer !gap-3 !py-2 !px-3 rounded-md hover:bg-accent"
							>
								<div class="flex items-center justify-center size-6 rounded bg-primary/10">
									<Users class="size-3.5 text-primary" />
								</div>
								<span class="flex-1 text-sm">{m.admin_userManagement()}</span>
							</DropdownMenu.Item>
							
							<DropdownMenu.Item
								onclick={() => goto('/admin/matches')}
								class="cursor-pointer !gap-3 !py-2 !px-3 rounded-md hover:bg-accent"
							>
								<div class="flex items-center justify-center size-6 rounded bg-primary/10">
									<Swords class="size-3.5 text-primary" />
								</div>
								<span class="flex-1 text-sm">{m.admin_matchManagement()}</span>
							</DropdownMenu.Item>

							<DropdownMenu.Separator class="my-1" />
						{/if}

						<DropdownMenu.Item
							onclick={() => goto('/admin/tournaments')}
							class="cursor-pointer !gap-3 !py-2 !px-3 rounded-md hover:bg-accent"
						>
							<div class="flex items-center justify-center size-6 rounded bg-primary/10">
								<Trophy class="size-3.5 text-primary" />
							</div>
							<span class="flex-1 text-sm">{m.admin_tournaments()}</span>
						</DropdownMenu.Item>
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			{/if}

			{#if showLanguage}
				<DropdownMenu.Separator class="my-2" />
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger
						class="cursor-pointer !pl-3 !pr-4 !py-2.5 !gap-2 rounded-lg transition-colors duration-150 hover:bg-accent group"
					>
						<div class="flex items-center justify-center size-8 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
							<Globe class="size-4 text-primary" />
						</div>
						<span class="flex-1 font-medium">{m.common_language()}</span>
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="min-w-36 p-1.5">
						{#each languages as lang}
							{@const selected = currentLang === lang.code}
							<DropdownMenu.Item
								onclick={() => selectLanguage(lang.code)}
								class={[
									'cursor-pointer !gap-3 !py-2 !px-3 rounded-md',
									selected && 'bg-primary/15 text-primary'
								]}
							>
								<span class="font-semibold text-xs w-6">{lang.short}</span>
								<span class="flex-1">{lang.label}</span>
								{#if selected}
									<Check class="size-4" />
								{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
