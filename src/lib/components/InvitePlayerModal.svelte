<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Copy, Check, X, Loader2, UserCheck } from '@lucide/svelte';
	import QRCode from 'qrcode';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchInvite } from '$lib/types/matchInvite';
	import {
		createInvite,
		cancelInvite,
		subscribeToInvite,
		getInviteUrl
	} from '$lib/firebase/matchInvites';
	import {
		activeInvite,
		setActiveInvite,
		clearActiveInvite,
		setInviteUnsubscribe
	} from '$lib/stores/matchInvite';
	import { currentUser } from '$lib/firebase/auth';
	import { team1, team2, updateTeam } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { getPlayerName } from '$lib/firebase/userProfile';

	interface Props {
		isOpen?: boolean;
		hostTeamNumber?: 1 | 2;
		onclose?: () => void;
	}

	let { isOpen = false, hostTeamNumber = 1, onclose }: Props = $props();

	let qrCodeSvg = $state('');
	let isCreating = $state(false);
	let isCopied = $state(false);
	let error = $state('');

	// Derive invite URL and state from the active invite
	let inviteUrl = $derived($activeInvite ? getInviteUrl($activeInvite.inviteCode) : '');
	let isAccepted = $derived($activeInvite?.status === 'accepted');
	let guestName = $derived($activeInvite?.guestUserName || '');

	// Generate QR code when invite is created
	$effect(() => {
		if (inviteUrl && !qrCodeSvg) {
			generateQRCode(inviteUrl);
		}
	});

	// When guest accepts, update the team store with their info
	$effect(() => {
		if (isAccepted && $activeInvite) {
			const guestTeamNumber = $activeInvite.guestTeamNumber;
			if (guestTeamNumber) {
				updateTeam(guestTeamNumber, {
					userId: $activeInvite.guestUserId || null,
					name: $activeInvite.guestUserName || '',
					userPhotoURL: $activeInvite.guestUserPhotoURL || null
				});
			}
		}
	});

	async function generateQRCode(url: string) {
		try {
			qrCodeSvg = await QRCode.toString(url, {
				type: 'svg',
				width: 200,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff'
				}
			});
		} catch (err) {
			console.error('Error generating QR code:', err);
		}
	}

	async function handleCreateInvite() {
		if (!$currentUser) return;

		isCreating = true;
		error = '';

		try {
			const playerName = await getPlayerName();
			const hostTeam = hostTeamNumber === 1 ? $team1 : $team2;
			const guestTeam = hostTeamNumber === 1 ? $team2 : $team1;

			const invite = await createInvite({
				hostUserId: $currentUser.id,
				hostUserName: playerName || $currentUser.name || 'Unknown',
				hostUserPhotoURL: $currentUser.photoURL,
				hostTeamNumber,
				matchContext: {
					team1Name: $team1.name,
					team1Color: $team1.color,
					team2Name: $team2.name,
					team2Color: $team2.color,
					gameMode: $gameSettings.gameMode,
					pointsToWin: $gameSettings.pointsToWin,
					roundsToPlay: $gameSettings.roundsToPlay,
					matchesToWin: $gameSettings.matchesToWin
				}
			});

			if (invite) {
				setActiveInvite(invite);

				// Subscribe to real-time updates
				const unsubscribe = subscribeToInvite(invite.id, (updatedInvite) => {
					if (updatedInvite) {
						setActiveInvite(updatedInvite);
					}
				});
				setInviteUnsubscribe(unsubscribe);
			} else {
				error = 'Error creating invite';
			}
		} catch (err) {
			console.error('Error creating invite:', err);
			error = 'Error creating invite';
		} finally {
			isCreating = false;
		}
	}

	async function handleCancelInvite() {
		if (!$activeInvite) return;

		await cancelInvite($activeInvite.id);
		clearActiveInvite();
		qrCodeSvg = '';
	}

	async function handleCopyLink() {
		if (!inviteUrl) return;

		try {
			await navigator.clipboard.writeText(inviteUrl);
			isCopied = true;
			setTimeout(() => {
				isCopied = false;
			}, 2000);
		} catch (err) {
			console.error('Error copying link:', err);
		}
	}

	function handleClose() {
		// Don't clear the invite when closing - let it stay active
		onclose?.();
	}

	// Create invite when modal opens if we don't have one
	$effect(() => {
		if (isOpen && !$activeInvite && $currentUser) {
			handleCreateInvite();
		}
	});
</script>

<Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{m.invite_invitePlayer()}</Dialog.Title>
		</Dialog.Header>

		<div class="invite-content">
			{#if isCreating}
				<div class="loading-state">
					<Loader2 class="animate-spin" size={32} />
					<p>{m.invite_createInvite()}...</p>
				</div>
			{:else if error}
				<div class="error-state">
					<p class="text-destructive">{error}</p>
					<Button onclick={handleCreateInvite}>
						{m.tournament_tryAgain()}
					</Button>
				</div>
			{:else if isAccepted}
				<div class="accepted-state">
					<div class="accepted-icon">
						<UserCheck size={48} />
					</div>
					<h3 class="accepted-title">{m.invite_playerJoined({ name: guestName })}</h3>
					{#if $activeInvite?.guestUserPhotoURL}
						<img
							src={$activeInvite.guestUserPhotoURL}
							alt={guestName}
							class="guest-avatar"
						/>
					{/if}
					<Button onclick={handleClose} class="mt-4">
						{m.common_close()}
					</Button>
				</div>
			{:else if $activeInvite}
				<div class="invite-state">
					<!-- QR Code -->
					<div class="qr-container">
						{#if qrCodeSvg}
							{@html qrCodeSvg}
						{:else}
							<div class="qr-placeholder">
								<Loader2 class="animate-spin" size={24} />
							</div>
						{/if}
					</div>

					<p class="scan-text">{m.invite_scanQR()}</p>

					<!-- Invite Code -->
					<div class="code-section">
						<p class="code-label">{m.invite_orShareCode()}</p>
						<div class="code-display">
							<span class="code">{$activeInvite.inviteCode}</span>
						</div>
					</div>

					<!-- Copy Link Button -->
					<Button
						variant="outline"
						onclick={handleCopyLink}
						class="copy-btn"
					>
						{#if isCopied}
							<Check size={16} class="mr-2" />
							{m.invite_linkCopied()}
						{:else}
							<Copy size={16} class="mr-2" />
							{m.invite_copyLink()}
						{/if}
					</Button>

					<!-- Waiting indicator -->
					<div class="waiting-section">
						<Loader2 class="animate-spin" size={16} />
						<span>{m.invite_waitingForPlayer()}</span>
					</div>

					<!-- Cancel button -->
					<Button
						variant="ghost"
						onclick={handleCancelInvite}
						class="cancel-btn"
					>
						{m.invite_cancelInvite()}
					</Button>
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.invite-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 0;
		min-height: 300px;
	}

	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		flex: 1;
	}

	.accepted-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		flex: 1;
		text-align: center;
	}

	.accepted-icon {
		color: var(--primary);
	}

	.accepted-title {
		font-size: 1.25rem;
		font-weight: 600;
	}

	.guest-avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
	}

	.invite-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.qr-container {
		background: white;
		padding: 1rem;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.qr-container :global(svg) {
		width: 200px;
		height: 200px;
	}

	.qr-placeholder {
		width: 200px;
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f0f0f0;
		border-radius: 8px;
	}

	.scan-text {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.code-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.code-label {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.code-display {
		background: var(--muted);
		padding: 0.5rem 1.5rem;
		border-radius: 8px;
	}

	.code {
		font-family: monospace;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.2em;
	}

	.copy-btn {
		width: 100%;
	}

	.waiting-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.cancel-btn {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}
</style>
