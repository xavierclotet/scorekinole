<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Copy, Check, LoaderCircle, UserCheck, UserX, Clock } from '@lucide/svelte';
	import QRCode from 'qrcode';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages.js';
	import {
		createInvite,
		cancelInvite,
		subscribeToInvite,
		getInviteUrl,
		getInviteTimeRemaining,
		isInviteExpired
	} from '$lib/firebase/matchInvites';
	import {
		activeInvites,
		setActiveInvite,
		clearActiveInvite,
		setInviteUnsubscribe
	} from '$lib/stores/matchInvite';
	import { currentUser } from '$lib/firebase/auth';
	import { team1, team2, updateTeam, assignPartnerToTeam } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { getPlayerName } from '$lib/firebase/userProfile';
	import type { InviteType } from '$lib/types/matchInvite';

	interface Props {
		isOpen?: boolean;
		hostTeamNumber?: 1 | 2;
		/** Type of invitation - determines where the guest joins */
		inviteType?: InviteType;
		onclose?: () => void;
	}

	let { isOpen = false, hostTeamNumber = 1, inviteType = 'opponent', onclose }: Props = $props();

	// Get game type from settings
	const isDoubles = $derived($gameSettings.gameType === 'doubles');

	// Derive the title based on invite type
	let inviteTitle = $derived((() => {
		switch (inviteType) {
			case 'my_partner':
				return m.invite_inviteMyPartner();
			case 'opponent_partner':
				return m.invite_inviteOpponentPartner();
			case 'opponent':
			default:
				return m.invite_inviteOpponent();
		}
	})());

	// Derive descriptive instruction based on game type and invite type
	let inviteDescription = $derived((() => {
		if (isDoubles) {
			switch (inviteType) {
				case 'my_partner':
					return m.invite_descDoublesMyPartner();
				case 'opponent_partner':
					return m.invite_descDoublesOpponentPartner();
				case 'opponent':
				default:
					return m.invite_descDoublesOpponent();
			}
		} else {
			// Singles - only opponent case applies
			return m.invite_descSinglesOpponent();
		}
	})());

	let qrCodeSvg = $state('');
	let isCreating = $state(false);
	let isCopied = $state(false);
	let error = $state('');
	let timeRemaining = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Get the invite for THIS specific type (each type has its own unique code)
	let currentInvite = $derived($activeInvites[inviteType]);

	// Derive invite URL and state from the current invite for this type
	let inviteUrl = $derived(currentInvite ? getInviteUrl(currentInvite.inviteCode) : '');
	let isAccepted = $derived(currentInvite?.status === 'accepted');
	let isDeclined = $derived(currentInvite?.status === 'declined');
	let guestName = $derived(currentInvite?.guestUserName || '');
	let isExpired = $derived(currentInvite ? isInviteExpired(currentInvite) : false);

	// Check if we need a fresh invite (no invite, or previous was accepted/expired/declined)
	let needsNewInvite = $derived(
		!currentInvite ||
		currentInvite.status === 'accepted' ||
		currentInvite.status === 'declined' ||
		currentInvite.status === 'cancelled' ||
		currentInvite.status === 'expired' ||
		isInviteExpired(currentInvite)
	);

	// Countdown display
	let minutesLeft = $derived(Math.floor(timeRemaining / 60000));
	let secondsLeft = $derived(Math.floor((timeRemaining % 60000) / 1000));
	let formattedSeconds = $derived(secondsLeft.toString().padStart(2, '0'));

	// Generate QR code when invite is created
	$effect(() => {
		if (inviteUrl && !qrCodeSvg) {
			generateQRCode(inviteUrl);
		}
	});

	// When guest accepts, update the team store with their info
	$effect(() => {
		if (isAccepted && currentInvite) {
			const guestTeamNumber = currentInvite.guestTeamNumber;
			const guestRole = currentInvite.guestRole || 'player';

			if (guestTeamNumber) {
				if (guestRole === 'partner') {
					// Guest joins as partner
					assignPartnerToTeam(
						guestTeamNumber,
						currentInvite.guestUserName || '',
						currentInvite.guestUserId || null,
						currentInvite.guestUserPhotoURL || null
					);
				} else {
					// Guest joins as player (existing behavior)
					updateTeam(guestTeamNumber, {
						userId: currentInvite.guestUserId || null,
						name: currentInvite.guestUserName || '',
						userPhotoURL: currentInvite.guestUserPhotoURL || null
					});
				}
			}
		}
	});

	// Update countdown timer
	$effect(() => {
		if (currentInvite && !isAccepted && !isExpired) {
			// Start countdown interval
			if (countdownInterval) {
				clearInterval(countdownInterval);
			}

			// Initial update
			timeRemaining = getInviteTimeRemaining(currentInvite);

			countdownInterval = setInterval(() => {
				const invite = $activeInvites[inviteType];
				if (invite) {
					timeRemaining = getInviteTimeRemaining(invite);

					// If expired, clear the interval and create a new invite
					if (timeRemaining <= 0) {
						clearInterval(countdownInterval!);
						countdownInterval = null;
						clearActiveInvite(inviteType);
						qrCodeSvg = '';
						// Will trigger new invite creation via the other $effect
					}
				}
			}, 1000);
		} else if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});

	async function generateQRCode(url: string) {
		try {
			qrCodeSvg = await QRCode.toString(url, {
				type: 'svg',
				width: 160,
				margin: 1,
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

			const invite = await createInvite({
				hostUserId: $currentUser.id,
				hostUserName: playerName || $currentUser.name || 'Unknown',
				hostUserPhotoURL: $currentUser.photoURL,
				hostTeamNumber,
				inviteType,
				matchContext: {
					team1Name: $team1.name,
					team1Color: $team1.color,
					team2Name: $team2.name,
					team2Color: $team2.color,
					gameMode: $gameSettings.gameMode,
					pointsToWin: $gameSettings.pointsToWin,
					roundsToPlay: $gameSettings.roundsToPlay,
					matchesToWin: $gameSettings.matchesToWin,
					gameType: $gameSettings.gameType
				}
			});

			if (invite) {
				setActiveInvite(inviteType, invite);

				// Subscribe to real-time updates
				const unsubscribe = subscribeToInvite(invite.id, (updatedInvite) => {
					if (updatedInvite) {
						setActiveInvite(inviteType, updatedInvite);
					}
				});
				setInviteUnsubscribe(inviteType, unsubscribe);
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
		if (!currentInvite) return;

		const result = await cancelInvite(currentInvite.id);

		if (result === 'already_accepted') {
			// Guest already accepted! Don't clear - the subscription will update the UI
			console.log('Cannot cancel: guest already accepted the invite');
			return;
		}

		// Successfully cancelled - clear invite and close modal
		clearActiveInvite(inviteType);
		qrCodeSvg = '';
		onclose?.();
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

	// Create invite when modal opens if we need one
	// Don't create new invite if current one was just accepted/declined (show success/declined state instead)
	$effect(() => {
		if (isOpen && needsNewInvite && $currentUser && !isCreating && !isAccepted && !isDeclined) {
			// Clear old invite first
			if (currentInvite) {
				clearActiveInvite(inviteType);
				qrCodeSvg = '';
			}
			handleCreateInvite();
		}
	});
</script>

<Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
	<Dialog.Content class="invite-modal">
		{#if isCreating}
			<div class="invite-state">
				<LoaderCircle class="animate-spin" size={36} />
				<p>{m.invite_createInvite()}...</p>
			</div>
		{:else if error}
			<div class="invite-state">
				<p class="error-text">{error}</p>
				<Button onclick={handleCreateInvite} size="sm">
					{m.tournament_tryAgain()}
				</Button>
			</div>
		{:else if isAccepted}
			<div class="invite-success">
				<div class="success-icon">
					<UserCheck size={28} />
				</div>
				<h3>{m.invite_playerJoined({ name: guestName })}</h3>
				{#if currentInvite?.guestUserPhotoURL}
					<img
						src={currentInvite.guestUserPhotoURL}
						alt={guestName}
						class="guest-photo"
					/>
				{/if}
				<Button onclick={handleClose} class="close-btn">
					{m.common_close()}
				</Button>
			</div>
		{:else if isDeclined}
			<div class="invite-declined">
				<div class="declined-icon">
					<UserX size={28} />
				</div>
				<h3>{m.invite_playerDeclined({ name: guestName })}</h3>
				{#if currentInvite?.guestUserPhotoURL}
					<img
						src={currentInvite.guestUserPhotoURL}
						alt={guestName}
						class="guest-photo"
					/>
				{/if}
				<Button onclick={handleCreateInvite} class="close-btn">
					{m.invite_inviteAnother()}
				</Button>
			</div>
		{:else if currentInvite}
			<div class="invite-content">
				<div class="modal-header">
					<h2>{inviteTitle}</h2>
					<p class="invite-description">{inviteDescription}</p>
				</div>

				<div class="qr-section">
					<div class="qr-frame">
						{#if qrCodeSvg}
							<div class="qr-code">
								{@html qrCodeSvg}
							</div>
						{:else}
							<div class="qr-placeholder">
								<LoaderCircle class="animate-spin" size={28} />
							</div>
						{/if}
					</div>
				</div>

				<div class="code-section">
					<span class="invite-code">{currentInvite.inviteCode}</span>
					<button class="copy-btn" onclick={handleCopyLink}>
						{#if isCopied}
							<Check size={14} />
							{m.invite_linkCopied()}
						{:else}
							<Copy size={14} />
							{m.invite_copyLink()}
						{/if}
					</button>
				</div>

				<div class="status-bar">
					<div class="status-item">
						<span class="pulse-dot"></span>
						<span>{m.invite_waitingForPlayer()}</span>
					</div>
					<div class="status-item timer">
						<Clock size={13} />
						<span>{minutesLeft}:{formattedSeconds}</span>
					</div>
				</div>

				<button class="cancel-btn" onclick={handleCancelInvite}>
					{m.invite_cancelInvite()}
				</button>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.invite-modal) {
		max-width: 420px !important;
		padding: 0 !important;
		overflow: hidden !important;
		gap: 0 !important;
	}

	:global(.invite-modal button[data-dialog-close]) {
		cursor: pointer;
	}

	.invite-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		gap: 1rem;
		color: var(--muted-foreground);
	}

	.invite-state .error-text {
		color: var(--destructive);
		font-size: 0.875rem;
	}

	.invite-success {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1.5rem;
		gap: 0.75rem;
	}

	.success-icon {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: color-mix(in srgb, #22c55e 12%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #22c55e;
		margin-bottom: 0.5rem;
	}

	.invite-success h3 {
		font-size: 1rem;
		font-weight: 600;
		text-align: center;
		margin: 0;
	}

	.guest-photo {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid color-mix(in srgb, #22c55e 30%, transparent);
	}

	:global(.close-btn) {
		margin-top: 1rem;
		width: 100%;
	}

	.invite-content {
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		padding: 1.25rem 1.5rem 0;
		text-align: center;
	}

	.modal-header h2 {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
		color: var(--foreground);
	}

	.modal-header p {
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		margin: 0;
	}

	.modal-header .invite-description {
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		margin: 0.5rem 0 0;
		line-height: 1.4;
	}

	.qr-section {
		padding: 1.25rem 1.5rem 1rem;
		display: flex;
		justify-content: center;
	}

	.qr-frame {
		background: white;
		padding: 10px;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	.qr-code {
		width: 160px;
		height: 160px;
	}

	.qr-placeholder {
		width: 160px;
		height: 160px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-foreground);
		opacity: 0.5;
	}

	.code-section {
		padding: 0 1.5rem 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.invite-code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.3em;
		color: var(--foreground);
		background: var(--muted);
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
	}

	.copy-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.copy-btn:hover {
		color: var(--foreground);
		background: var(--muted);
	}

	.status-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		padding: 0.875rem 1.5rem;
		background: var(--muted);
		border-top: 1px solid var(--border);
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}

	.status-item.timer {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-weight: 500;
	}

	.pulse-dot {
		position: relative;
		width: 8px;
		height: 8px;
	}

	.pulse-dot::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--primary);
		animation: pulse 2s ease-in-out infinite;
	}

	.pulse-dot::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--primary);
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(2); opacity: 0; }
	}

	.cancel-btn {
		width: 100%;
		padding: 0.75rem;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		background: none;
		border: none;
		border-top: 1px solid var(--border);
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.cancel-btn:hover {
		color: var(--destructive);
	}
</style>
