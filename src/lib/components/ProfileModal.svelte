<script lang="ts">
	// import { t } from '$lib/stores/language'; // Legacy - to remove after full migration
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { getUserProfile } from '$lib/firebase/userProfile';

	interface Props {
		isOpen?: boolean;
		user?: any;
		onclose?: () => void;
		onupdate?: (data: { playerName: string }) => void;
	}

	let { isOpen = $bindable(false), user = null, onclose, onupdate }: Props = $props();

	let playerNameInput = $state('');
	let rankingPoints = $state(0);
	let isLoading = $state(false);

	// Load player data from Firestore when modal opens
	$effect(() => {
		if (isOpen && user) {
			loadPlayerData();
		}
	});

	async function loadPlayerData() {
		isLoading = true;
		try {
			const profile = await getUserProfile();
			playerNameInput = profile?.playerName || user.name || user.displayName || '';
			rankingPoints = profile?.ranking || 0;
		} catch (error) {
			console.error('Error loading player data:', error);
			playerNameInput = user.name || user.displayName || '';
			rankingPoints = 0;
		} finally {
			isLoading = false;
		}
	}

	function close() {
		isOpen = false;
		onclose?.();
	}

	function updateProfile() {
		if (playerNameInput.trim()) {
			onupdate?.({ playerName: playerNameInput.trim() });
		}
	}

	function goToRankings() {
		close();
		goto('/rankings');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		} else if (event.key === 'Enter' && playerNameInput.trim()) {
			updateProfile();
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" onclick={close} role="button" tabindex="-1">
		<div class="modal" onclick={stopPropagation} role="dialog">
			<!-- Close button -->
			<button class="close-btn" onclick={close} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"/>
					<line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>

			{#if user}
				<!-- Profile header with photo -->
				<div class="profile-header">
					<div class="photo-wrapper">
						{#if user.photo || user.photoURL}
							<img src={user.photo || user.photoURL} alt="" class="photo" />
						{:else}
							<div class="photo-placeholder">
								{user.email?.charAt(0).toUpperCase() || '?'}
							</div>
						{/if}
					</div>
					<h2 class="profile-title">{m.auth_myProfile()}</h2>
				</div>

				<!-- Info grid -->
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">{m.auth_email()}</span>
						<span class="info-value">{user.email || '-'}</span>
					</div>
					<button class="info-item ranking-link" onclick={goToRankings}>
						<span class="info-label">{m.ranking_pointsLabel()}</span>
						<span class="info-value ranking">
							<span class="ranking-badge">{rankingPoints}</span>
							<span class="ranking-unit">pts</span>
							<svg class="ranking-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="9 18 15 12 9 6"/>
							</svg>
						</span>
					</button>
				</div>

				<!-- Editable section -->
				<div class="edit-section">
					<label for="profilePlayerNameInput" class="edit-label">
						{m.auth_playerName()}
					</label>
					<div class="input-wrapper">
						<input
							id="profilePlayerNameInput"
							type="text"
							class="input"
							bind:value={playerNameInput}
							placeholder={m.auth_enterPlayerName()}
							maxlength="20"
						/>
					</div>
					<p class="input-hint">{m.auth_playerNameDescription()}</p>
				</div>

				<!-- Actions -->
				<div class="actions">
					<button class="btn-cancel" onclick={close}>{m.common_cancel()}</button>
					<button class="btn-save" onclick={updateProfile} disabled={!playerNameInput.trim()}>
						{m.common_save()}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		background: #0f1218;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 16px;
		max-width: 360px;
		width: 100%;
		position: relative;
		animation: modalSlide 0.2s ease-out;
		overflow: hidden;
	}

	@keyframes modalSlide {
		from {
			opacity: 0;
			transform: translateY(-16px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.close-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: all 0.15s;
		z-index: 10;
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	/* Profile header */
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem 1.5rem 1rem;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%);
	}

	.photo-wrapper {
		margin-bottom: 0.75rem;
	}

	.photo {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(255, 255, 255, 0.1);
	}

	.photo-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
		border: 2px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 600;
		color: #64b5f6;
	}

	.profile-title {
		font-size: 1rem;
		font-weight: 600;
		color: #fff;
		margin: 0;
	}

	/* Info grid */
	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: rgba(255, 255, 255, 0.04);
		border-top: 1px solid rgba(255, 255, 255, 0.04);
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.75rem 1rem;
		background: #0f1218;
	}

	.info-label {
		font-size: 0.65rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.info-value {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.info-value.mono {
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.info-value.ranking {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.ranking-badge {
		font-size: 1rem;
		font-weight: 700;
		color: #fbbf24;
	}

	.ranking-unit {
		font-size: 0.65rem;
		font-weight: 500;
		color: rgba(251, 191, 36, 0.7);
	}

	.ranking-arrow {
		width: 14px;
		height: 14px;
		stroke: rgba(251, 191, 36, 0.5);
		margin-left: auto;
		transition: all 0.15s;
	}

	.ranking-link {
		cursor: pointer;
		border: none;
		text-align: left;
		transition: background 0.15s;
	}

	.ranking-link:hover {
		background: rgba(251, 191, 36, 0.08);
	}

	.ranking-link:hover .ranking-arrow {
		stroke: #fbbf24;
		transform: translateX(2px);
	}

	/* Edit section */
	.edit-section {
		padding: 1rem 1.25rem;
	}

	.edit-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		margin-bottom: 0.5rem;
	}

	.input-wrapper {
		position: relative;
	}

	.input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		color: #fff;
		font-size: 0.875rem;
		transition: all 0.15s;
	}

	.input:focus {
		outline: none;
		border-color: rgba(59, 130, 246, 0.5);
		background: rgba(255, 255, 255, 0.06);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.input-hint {
		margin: 0.375rem 0 0;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.35);
	}

	/* Actions */
	.actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem 1.25rem;
		justify-content: flex-end;
	}

	.btn-cancel,
	.btn-save {
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}

	.btn-cancel:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.btn-save {
		background: #3b82f6;
		border: none;
		color: #fff;
	}

	.btn-save:hover:not(:disabled) {
		background: #2563eb;
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Responsive */
	@media (max-width: 400px) {
		.modal {
			max-width: 100%;
		}

		.profile-header {
			padding: 1.25rem 1rem 0.875rem;
		}

		.photo,
		.photo-placeholder {
			width: 56px;
			height: 56px;
		}

		.photo-placeholder {
			font-size: 1.25rem;
		}

		.info-item {
			padding: 0.625rem 0.875rem;
		}

		.edit-section {
			padding: 0.875rem 1rem;
		}

		.actions {
			padding: 0.625rem 1rem 1rem;
		}
	}
</style>
