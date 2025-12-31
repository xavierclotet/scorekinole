<script lang="ts">
	import { t } from '$lib/stores/language';
	import { createEventDispatcher } from 'svelte';
	import Button from './Button.svelte';

	export let isOpen: boolean = false;
	export let playerName: string = '';

	const dispatch = createEventDispatcher();

	let inputValue = playerName;

	$: if (isOpen) {
		inputValue = playerName;
	}

	function save() {
		if (inputValue.trim()) {
			dispatch('save', inputValue.trim());
			close();
		}
	}

	function close() {
		isOpen = false;
		dispatch('close');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			save();
		}
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={close} role="button" tabindex="-1">
		<div class="modal" on:click|stopPropagation role="dialog">
			<div class="modal-header">
				<span class="modal-title">{$t('setPlayerName')}</span>
			</div>
			<div class="modal-content">
				<label for="playerNameInput" class="label">
					{$t('playerNameDescription')}
				</label>
				<input
					id="playerNameInput"
					type="text"
					class="input"
					bind:value={inputValue}
					placeholder={$t('enterPlayerName')}
					maxlength="30"
					on:keydown={handleKeydown}
					autofocus
				/>
				<div class="actions">
					<Button variant="primary" on:click={save}>
						{$t('save')}
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
	}

	.modal-header {
		margin-bottom: 1.5rem;
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
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
	}
</style>
