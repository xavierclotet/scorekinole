<script lang="ts">
	import { t } from '$lib/stores/language';
	import { createEventDispatcher, onMount } from 'svelte';
	import Button from './Button.svelte';
	import { getUserProfile } from '$lib/firebase/userProfile';

	export let isOpen: boolean = false;
	export let user: any = null;

	const dispatch = createEventDispatcher();

	let playerNameInput = '';
	let isLoading = false;

	// Load player name from Firestore when modal opens
	$: if (isOpen && user) {
		loadPlayerName();
	}

	async function loadPlayerName() {
		isLoading = true;
		try {
			const profile = await getUserProfile();
			playerNameInput = profile?.playerName || user.name || user.displayName || '';
		} catch (error) {
			console.error('Error loading player name:', error);
			playerNameInput = user.name || user.displayName || '';
		} finally {
			isLoading = false;
		}
	}

	function close() {
		isOpen = false;
		dispatch('close');
	}

	function updateProfile() {
		if (playerNameInput.trim()) {
			dispatch('update', { playerName: playerNameInput.trim() });
		}
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={close} role="button" tabindex="-1">
		<div class="modal" on:click|stopPropagation role="dialog">
			<div class="modal-header">
				<span class="modal-title">{$t('myProfile')}</span>
				<button class="close-btn" on:click={close} aria-label="Close">×</button>
			</div>
			<div class="modal-content">
				{#if user}
					<!-- Profile Photo -->
					<div class="photo-section">
						{#if user.photo || user.photoURL}
							<img src={user.photo || user.photoURL} alt="Profile" class="photo" />
						{:else}
							<div class="photo-placeholder">
								{user.email?.charAt(0).toUpperCase() || '?'}
							</div>
						{/if}
					</div>

					<!-- Profile Info - Read Only -->
					<div class="info-section">
						<label class="label">{$t('email')}</label>
						<div class="readonly">{user.email || '-'}</div>
					</div>

					<div class="info-section">
						<label class="label">{$t('userId')}</label>
						<div class="readonly uid">{user.id || user.uid || '-'}</div>
					</div>

					<div class="info-section">
						<label class="label">{$t('ranking')}</label>
						<div class="readonly">{$t('comingSoon')}</div>
					</div>

					<!-- Divider -->
					<div class="divider"></div>

					<!-- Editable Player Name -->
					<div class="info-section">
						<label for="profilePlayerNameInput" class="label editable">
							{$t('playerName')}
						</label>
						<input
							id="profilePlayerNameInput"
							type="text"
							class="input"
							bind:value={playerNameInput}
							placeholder={$t('enterPlayerName')}
							maxlength="30"
						/>
					</div>

					<!-- Update Button -->
					<div class="actions">
						<Button variant="primary" on:click={updateProfile}>
							{$t('updateProfile')}
						</Button>
					</div>
				{/if}
			</div>
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
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: #1a1f35;
		padding: 2rem;
		border-radius: 12px;
		max-width: 90%;
		width: 500px;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
	}

	.modal-header {
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: #fff;
		line-height: 1;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.close-btn:hover {
		transform: scale(1.1);
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.photo-section {
		display: flex;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.photo {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid #00ff88;
	}

	.photo-placeholder {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		background: rgba(0, 255, 136, 0.2);
		border: 3px solid #00ff88;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 3rem;
		font-weight: 700;
		color: #00ff88;
	}

	.info-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.label.editable {
		color: #00ff88;
	}

	.readonly {
		color: #fff;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		font-size: 1rem;
	}

	.readonly.uid {
		font-family: monospace;
		font-size: 0.85rem;
		word-break: break-all;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.2);
		margin: 0.5rem 0;
	}

	.input {
		width: 100%;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		transition: all 0.2s;
	}

	.input:focus {
		outline: none;
		border-color: #00ff88;
		background: rgba(255, 255, 255, 0.15);
	}

	.input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.photo,
		.photo-placeholder {
			width: 80px;
			height: 80px;
		}

		.photo-placeholder {
			font-size: 2.5rem;
		}
	}
</style>
