<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { LoaderCircle, CircleCheck, CircleX, CircleAlert, LogIn } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import ScorekinoleLogo from '$lib/components/ScorekinoleLogo.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { currentUser, signInWithGoogle, authInitialized } from '$lib/firebase/auth';
	import { getPlayerName } from '$lib/firebase/userProfile';
	import {
		getInviteByCode,
		acceptInvite,
		isInviteExpired
	} from '$lib/firebase/matchInvites';
	import type { MatchInvite } from '$lib/types/matchInvite';

	// States
	let isLoading = $state(true);
	let isAccepting = $state(false);
	let isSigningIn = $state(false);
	let invite = $state<MatchInvite | null>(null);
	let error = $state<'not_found' | 'expired' | 'already_used' | 'own_invite' | 'already_accepted' | null>(null);
	let success = $state(false);

	// Get invite code from URL
	let inviteCode = $derived(page.url.searchParams.get('invite') || '');

	// Load invite on mount
	onMount(async () => {
		if (!inviteCode) {
			error = 'not_found';
			isLoading = false;
			return;
		}

		// Wait for auth to initialize
		const waitForAuth = () =>
			new Promise<void>((resolve) => {
				if ($authInitialized) {
					resolve();
					return;
				}
				const unsubscribe = authInitialized.subscribe((initialized) => {
					if (initialized) {
						unsubscribe();
						resolve();
					}
				});
			});

		await waitForAuth();

		// Load the invite
		const loadedInvite = await getInviteByCode(inviteCode);

		if (!loadedInvite) {
			error = 'not_found';
			isLoading = false;
			return;
		}

		// Check various error states
		if (isInviteExpired(loadedInvite)) {
			error = 'expired';
			isLoading = false;
			return;
		}

		if (loadedInvite.status === 'accepted') {
			// Check if current user already accepted
			if ($currentUser && loadedInvite.guestUserId === $currentUser.id) {
				error = 'already_accepted';
			} else {
				error = 'already_used';
			}
			isLoading = false;
			return;
		}

		if (loadedInvite.status !== 'pending') {
			error = 'not_found';
			isLoading = false;
			return;
		}

		// Check if trying to accept own invite
		if ($currentUser && loadedInvite.hostUserId === $currentUser.id) {
			error = 'own_invite';
			isLoading = false;
			return;
		}

		invite = loadedInvite;
		isLoading = false;
	});

	async function handleSignIn() {
		isSigningIn = true;
		try {
			await signInWithGoogle();
			// After sign in, recheck if it's their own invite
			if (invite && $currentUser && invite.hostUserId === $currentUser.id) {
				error = 'own_invite';
				invite = null;
			}
		} catch (err) {
			console.error('Sign in error:', err);
		} finally {
			isSigningIn = false;
		}
	}

	async function handleAccept() {
		if (!invite || !$currentUser) return;

		isAccepting = true;

		try {
			const playerName = await getPlayerName();

			const result = await acceptInvite(inviteCode, {
				guestUserId: $currentUser.id,
				guestUserName: playerName || $currentUser.name || 'Unknown',
				guestUserPhotoURL: $currentUser.photoURL
			});

			if (result) {
				success = true;
				invite = result;
			} else {
				error = 'not_found';
			}
		} catch (err) {
			console.error('Accept invite error:', err);
			error = 'not_found';
		} finally {
			isAccepting = false;
		}
	}

	function getErrorMessage() {
		switch (error) {
			case 'not_found':
				return m.join_inviteNotFound();
			case 'expired':
				return m.join_inviteExpired();
			case 'already_used':
				return m.join_alreadyUsed();
			case 'own_invite':
				return m.join_cannotJoinOwnInvite();
			case 'already_accepted':
				return m.join_alreadyAccepted();
			default:
				return m.common_error();
		}
	}

	// Derive game type - fallback based on inviteType for old invites without gameType
	let isDoubles = $derived((() => {
		if (!invite) return false;
		if (invite.matchContext.gameType) {
			return invite.matchContext.gameType === 'doubles';
		}
		// Fallback: if inviteType involves partners, it's doubles
		return invite.inviteType === 'my_partner' || invite.inviteType === 'opponent_partner';
	})());

	let gameTypeLabel = $derived(isDoubles ? m.join_doubles() : m.join_singles());

	// Derive role description based on invite type
	let roleDescription = $derived((() => {
		if (!invite) return '';
		const hostName = invite.hostUserName;
		switch (invite.inviteType) {
			case 'my_partner':
				return m.join_roleMyPartner({ name: hostName });
			case 'opponent_partner':
				return m.join_roleOpponentPartner();
			case 'opponent':
			default:
				return m.join_roleOpponent({ name: hostName });
		}
	})());
</script>

<svelte:head>
	<title>{m.join_pageTitle()}</title>
</svelte:head>

<div class="join-page">
	<div class="join-container">
		<div class="join-header">
			<ScorekinoleLogo />
		</div>
		<div class="join-card">
		{#if isLoading}
			<div class="state-container">
				<LoaderCircle class="animate-spin" size={48} />
				<p>{m.common_loading()}...</p>
			</div>
		{:else if error}
			<div class="state-container error">
				<CircleX size={48} />
				<h2>{getErrorMessage()}</h2>
				<Button href="/" variant="outline" style="padding: 0.75rem 2rem;">
					{m.common_goHome()}
				</Button>
			</div>
		{:else if success}
			<div class="state-container success">
				<CircleCheck size={64} />
				<h2>{m.join_successTitle()}</h2>
				<p class="success-desc">
					{m.join_successDesc({ role: roleDescription, gameType: gameTypeLabel.toLowerCase() })}
				</p>
				{#if invite?.hostUserPhotoURL}
					<img
						src={invite.hostUserPhotoURL}
						alt={invite.hostUserName}
						class="guest-avatar"
					/>
				{/if}
			</div>
		{:else if invite}
			<div class="invite-details">
				<h1>{m.join_pageTitle()}</h1>

				<!-- Host info -->
				<div class="host-info">
					<p class="invited-by">{m.join_invitedBy()}</p>
					<div class="host-profile">
						{#if invite.hostUserPhotoURL}
							<img
								src={invite.hostUserPhotoURL}
								alt={invite.hostUserName}
								class="host-avatar-small"
							/>
						{/if}
						<span class="host-name">{invite.hostUserName}</span>
					</div>
				</div>

				<!-- Match config -->
				<div class="match-config">
					<h3>{m.join_matchConfig()}</h3>
					<div class="config-grid">
						<div class="config-item">
							<span class="config-label">{m.scoring_gameMode()}</span>
							<span class="config-value">
								{invite.matchContext.gameMode === 'points'
									? `${invite.matchContext.pointsToWin}p`
									: `${invite.matchContext.roundsToPlay}r`}
								{#if invite.matchContext.matchesToWin > 1}
									<span class="matches-badge">{m.bracket_bestOf()}{invite.matchContext.matchesToWin}</span>
								{/if}
							</span>
						</div>
						<div class="config-item">
							<span class="config-label">{m.join_yourRole()}</span>
							<span class="config-value">
								<span class="game-type-badge">{gameTypeLabel}</span>
								{roleDescription}
							</span>
						</div>
					</div>
				</div>

				<!-- Action buttons -->
				<div class="actions">
					{#if $currentUser}
						<Button
							onclick={handleAccept}
							disabled={isAccepting}
							class="accept-btn w-full"
						>
							{#if isAccepting}
								<LoaderCircle class="animate-spin mr-2" size={16} />
								{m.join_accepting()}
							{:else}
								<CircleCheck class="mr-2" size={16} />
								{m.join_acceptInvite()}
							{/if}
						</Button>
					{:else}
						<div class="sign-in-section">
							<div class="sign-in-prompt">
								<CircleAlert size={20} />
								<p>{m.join_signInToAccept()}</p>
							</div>
							<Button
								onclick={handleSignIn}
								disabled={isSigningIn}
								class="w-full"
							>
								{#if isSigningIn}
									<LoaderCircle class="animate-spin mr-2" size={16} />
									{m.auth_signingIn()}
								{:else}
									<LogIn class="mr-2" size={16} />
									{m.auth_continueWithGoogle()}
								{/if}
							</Button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
		</div>
	</div>
</div>

<style>
	.join-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--background);
	}

	.join-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		width: 100%;
		max-width: 460px;
	}

	.join-header {
		display: flex;
		justify-content: center;
	}

	.join-card {
		background: var(--card);
		border-radius: 16px;
		padding: 2rem;
		width: 100%;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
	}

	.state-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 1rem;
		padding: 2rem 0;
	}

	.state-container.error {
		color: var(--destructive);
	}

	.state-container.success {
		color: var(--primary);
	}

	.success-desc {
		color: var(--muted-foreground);
		font-size: 0.875rem;
		max-width: 280px;
	}

	.guest-avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		margin-top: 0.5rem;
	}

	.invite-details {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.invite-details h1 {
		font-size: 1.5rem;
		font-weight: 600;
		text-align: center;
		margin: 0;
	}

	.host-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.invited-by {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.host-profile {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.host-avatar-small {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
	}

	.host-name {
		font-size: 1.125rem;
		font-weight: 500;
	}

	.match-config {
		background: var(--muted);
		border-radius: 12px;
		padding: 1rem;
	}

	.match-config h3 {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted-foreground);
		margin: 0 0 0.75rem 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.config-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.config-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.config-label {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.config-value {
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.matches-badge {
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: 0.75rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-weight: 600;
	}

	.game-type-badge {
		background: var(--muted-foreground);
		color: var(--card);
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.actions {
		display: flex;
		flex-direction: row;
		gap: 0.75rem;
	}

	.sign-in-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
	}

	.sign-in-prompt {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}
</style>
