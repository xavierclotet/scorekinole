<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { currentUser, signOut } from '$lib/firebase/auth';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Avatar from '$lib/components/ui/avatar';
	import { User, LogOut, LogIn, ChevronRight } from '@lucide/svelte';

	interface Props {
		onlogin?: () => void;
		onprofile?: () => void;
	}

	let { onlogin, onprofile }: Props = $props();

	function handleLogin() {
		onlogin?.();
	}

	function handleProfile() {
		onprofile?.();
	}

	async function handleSignOut() {
		await signOut();
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger asChild>
		<button
			class="flex items-center justify-center size-9 rounded-full bg-transparent border-none text-white/70 cursor-pointer transition-all duration-200 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
			aria-label="Profile"
		>
			{#if $currentUser?.photoURL}
				<Avatar.Root class="size-7 ring-2 ring-white/20 transition-all duration-200 hover:ring-white/40">
					<Avatar.Image src={$currentUser.photoURL} alt="" referrerpolicy="no-referrer" />
					<Avatar.Fallback class="text-xs font-medium bg-gradient-to-br from-primary/80 to-primary text-primary-foreground">
						{$currentUser.email?.charAt(0).toUpperCase() || '?'}
					</Avatar.Fallback>
				</Avatar.Root>
			{:else}
				<User class="size-5" />
			{/if}
		</button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content class="w-64 p-0 shadow-xl border-border/50" align="end" sideOffset={8}>
			{#if $currentUser}
				<!-- User info header -->
				<div class="flex items-center gap-3 px-4 py-4 bg-muted/30 border-b border-border/50">
					<Avatar.Root class="size-11 ring-2 ring-border/50 flex-shrink-0">
						<Avatar.Image src={$currentUser.photoURL} alt="" referrerpolicy="no-referrer" />
						<Avatar.Fallback class="text-base font-semibold bg-gradient-to-br from-primary/80 to-primary text-primary-foreground">
							{$currentUser.email?.charAt(0).toUpperCase() || '?'}
						</Avatar.Fallback>
					</Avatar.Root>
					<div class="flex flex-col min-w-0 flex-1 gap-0.5">
						<span class="text-sm font-semibold text-foreground truncate">
							{$currentUser.name || 'User'}
						</span>
						<span class="text-xs text-muted-foreground truncate">
							{$currentUser.email}
						</span>
					</div>
				</div>

				<!-- Menu actions -->
				<div class="p-2">
					<DropdownMenu.Item
						onclick={handleProfile}
						class="cursor-pointer px-3 py-2.5 gap-3 rounded-lg transition-colors duration-150 hover:bg-accent group"
					>
						<div class="flex items-center justify-center size-8 rounded-md bg-muted/50 group-hover:bg-muted transition-colors">
							<User class="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<span class="flex-1 font-medium">{m.auth_myProfile()}</span>
						<ChevronRight class="size-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
					</DropdownMenu.Item>

					<DropdownMenu.Separator class="my-2" />

					<DropdownMenu.Item
						onclick={handleSignOut}
						class="cursor-pointer px-3 py-2.5 gap-3 rounded-lg transition-colors duration-150 text-destructive hover:bg-destructive/10 group"
					>
						<div class="flex items-center justify-center size-8 rounded-md bg-destructive/10 group-hover:bg-destructive/20 transition-colors">
							<LogOut class="size-4" />
						</div>
						<span class="flex-1 font-medium">{m.auth_logout()}</span>
					</DropdownMenu.Item>
				</div>
			{:else}
				<!-- Not logged in -->
				<div class="p-3">
					<DropdownMenu.Item
						onclick={handleLogin}
						class="cursor-pointer px-4 py-3 gap-3 rounded-lg justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-colors duration-150 group"
					>
						<LogIn class="size-4" />
						<span class="font-medium">{m.auth_login()}</span>
					</DropdownMenu.Item>
				</div>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
