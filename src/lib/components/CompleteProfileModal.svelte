<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { currentUser } from '$lib/firebase/auth';
	import { isPlayerNameTaken } from '$lib/firebase/userProfile';
	import Button from './Button.svelte';

	interface Props {
		isOpen?: boolean;
		onsave?: (playerName: string) => void | Promise<void>;
	}

	let { isOpen = false, onsave }: Props = $props();

	let playerNameInput = $state('');
	let isLoading = $state(false);
	let error = $state('');

	// Pre-fill with Google display name when modal opens
	$effect(() => {
		if (isOpen && $currentUser) {
			playerNameInput = $currentUser.name || '';
		}
	});

	function hasFirstAndLastName(name: string): boolean {
		const parts = name.trim().split(/\s+/);
		return parts.length >= 2 && parts.every((p) => p.length > 0);
	}

	async function save() {
		if (!playerNameInput.trim()) {
			error = m.auth_enterPlayerName();
			return;
		}

		if (!hasFirstAndLastName(playerNameInput)) {
			error = m.auth_playerNameRequired();
			return;
		}

		isLoading = true;
		error = '';

		try {
			const taken = await isPlayerNameTaken(playerNameInput.trim());
			if (taken) {
				error = m.auth_playerNameTaken();
				isLoading = false;
				return;
			}

			await onsave?.(playerNameInput.trim());
		} catch (err: any) {
			console.error('Error saving profile:', err);
			error = err.message || 'Error saving profile';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && playerNameInput.trim()) {
			save();
		}
	}
</script>

{#if isOpen}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<span class="modal-title">{m.auth_setPlayerName()}</span>
			</div>
			<div class="modal-content">
				{#if $currentUser?.photoURL}
					<div class="user-photo">
						<img src={$currentUser.photoURL} alt="" referrerpolicy="no-referrer" />
					</div>
				{/if}

				<p class="welcome-text">
					{m.auth_playerNameDescription()}
				</p>

				{#if error}
					<div class="error-message">
						{error}
					</div>
				{/if}

				<div class="input-group">
					<label for="completeProfileNameInput" class="label">
						{m.auth_playerName()}
					</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="completeProfileNameInput"
						type="text"
						class="input"
						bind:value={playerNameInput}
						placeholder={m.auth_enterPlayerName()}
						maxlength="30"
						onkeydown={handleKeydown}
						autofocus
						disabled={isLoading}
					/>
					<span class="hint">{m.auth_playerNameDescription()}</span>
				</div>

				<div class="actions">
					<Button variant="primary" onclick={save} disabled={isLoading || !hasFirstAndLastName(playerNameInput)}>
						{#if isLoading}
							{m.common_saving()}...
						{:else}
							{m.common_save()}
						{/if}
					</Button>
				</div>
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
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.modal {
		background: #1a1f35;
		padding: 2rem;
		border-radius: 12px;
		max-width: 90%;
		width: 420px;
		max-height: 90vh;
		overflow-y: auto;
		border: 2px solid rgba(0, 255, 136, 0.3);
		animation: modalAppear 0.2s ease-out;
	}

	@keyframes modalAppear {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.modal-header {
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.user-photo {
		display: flex;
		justify-content: center;
	}

	.user-photo img {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		border: 3px solid rgba(0, 255, 136, 0.4);
	}

	.welcome-text {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.95rem;
		text-align: center;
		margin: 0;
	}

	.error-message {
		background: rgba(255, 68, 68, 0.2);
		border: 1px solid rgba(255, 68, 68, 0.5);
		color: #ff4444;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-size: 0.9rem;
		text-align: center;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
		font-weight: 500;
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

	.input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.hint {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 2px;
	}

	.actions {
		display: flex;
		justify-content: center;
		margin-top: 0.5rem;
	}

	.actions :global(button) {
		min-width: 150px;
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
			padding: 1.5rem;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.user-photo img {
			width: 64px;
			height: 64px;
		}
	}
</style>
