<script lang="ts">
	import { t } from '$lib/stores/language';
	import { signInWithGoogle } from '$lib/firebase/auth';
	import { createEventDispatcher } from 'svelte';
	import Button from './Button.svelte';

	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher();

	let isLoading = false;
	let error = '';

	async function handleGoogleSignIn() {
		isLoading = true;
		error = '';

		try {
			await signInWithGoogle();
			// Close modal on successful login
			close();
		} catch (err: any) {
			console.error('Login error:', err);
			error = err.message || 'Error al iniciar sesión';
		} finally {
			isLoading = false;
		}
	}

	function close() {
		isOpen = false;
		error = '';
		dispatch('close');
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={close} role="button" tabindex="-1">
		<div class="modal" on:click|stopPropagation role="dialog">
			<div class="modal-header">
				<span class="modal-title">{$t('login')}</span>
				<button class="close-btn" on:click={close} aria-label="Close">×</button>
			</div>
			<div class="modal-content">
				<p class="welcome-text">Inicia sesión para sincronizar tus partidas</p>

				{#if error}
					<div class="error-message">
						{error}
					</div>
				{/if}

				<div class="login-button-container">
					<Button
						variant="primary"
						size="large"
						on:click={handleGoogleSignIn}
						disabled={isLoading}
					>
						{#if isLoading}
							Iniciando sesión...
						{:else}
							<span class="google-icon">G</span>
							Continuar con Google
						{/if}
					</Button>
				</div>

				<p class="privacy-note">
					Tus datos se sincronizarán de forma segura con tu cuenta de Google
				</p>
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
		width: 400px;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
		border: 2px solid rgba(0, 255, 136, 0.3);
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

	.welcome-text {
		color: rgba(255, 255, 255, 0.8);
		font-size: 1rem;
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

	.login-button-container {
		display: flex;
		justify-content: center;
	}

	.login-button-container :global(button) {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.google-icon {
		font-weight: 700;
		font-size: 1.2rem;
		background: #fff;
		color: #4285f4;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.privacy-note {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.8rem;
		text-align: center;
		margin: 0;
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
			padding: 1.5rem;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.welcome-text {
			font-size: 0.9rem;
		}
	}
</style>
