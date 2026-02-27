<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		signInWithGoogle,
		signInWithFacebook,
		setPendingLinkCredential,
		getCredentialFromError
	} from '$lib/firebase/auth';
	import Button from './Button.svelte';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
	}

	let { isOpen = $bindable(false), onclose }: Props = $props();

	let isLoading = $state<'google' | 'facebook' | false>(false);
	let error = $state('');
	let linkingMessage = $state('');

	async function handleGoogleSignIn() {
		isLoading = 'google';
		error = '';

		try {
			await signInWithGoogle();
			// If we were linking, clear the message
			linkingMessage = '';
			close();
		} catch (err: any) {
			console.error('Login error:', err);
			error = err.message || m.auth_loginError();
		} finally {
			isLoading = false;
		}
	}

	async function handleFacebookSignIn() {
		isLoading = 'facebook';
		error = '';
		linkingMessage = '';

		try {
			await signInWithFacebook();
			close();
		} catch (err: any) {
			console.error('Facebook login error:', err);
			if (err.code === 'auth/account-exists-with-different-credential') {
				// Save the Facebook credential for linking after Google sign-in
				const credential = getCredentialFromError(err);
				if (credential) {
					setPendingLinkCredential(credential);
					linkingMessage = m.auth_linkAccountSignInWithGoogle();
				} else {
					error = m.auth_accountExistsWithDifferentProvider();
				}
			} else {
				error = err.message || m.auth_loginError();
			}
		} finally {
			isLoading = false;
		}
	}

	function close() {
		isOpen = false;
		error = '';
		linkingMessage = '';
		setPendingLinkCredential(null);
		onclose?.();
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={close} role="none">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" onclick={stopPropagation} role="dialog" tabindex="-1">
			<div class="modal-header">
				<span class="modal-title">{m.auth_login()}</span>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="modal-content">
				<p class="welcome-text">{m.auth_loginWelcome()}</p>

				{#if error}
					<div class="error-message">
						{error}
					</div>
				{/if}

				{#if linkingMessage}
					<div class="linking-message">
						{linkingMessage}
					</div>
				{/if}

				<div class="login-buttons">
					<Button
						variant="primary"
						size="large"
						onclick={handleGoogleSignIn}
						disabled={!!isLoading}
					>
						{#if isLoading === 'google'}
							{m.auth_signingIn()}
						{:else}
							<span class="google-icon">G</span>
							{m.auth_continueWithGoogle()}
						{/if}
					</Button>

					<Button
						variant="primary"
						size="large"
						onclick={handleFacebookSignIn}
						disabled={!!isLoading}
					>
						{#if isLoading === 'facebook'}
							{m.auth_signingIn()}
						{:else}
							<span class="facebook-icon">f</span>
							{m.auth_continueWithFacebook()}
						{/if}
					</Button>
				</div>

				<p class="privacy-note">
					{m.auth_loginPrivacyNote()}
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

	.linking-message {
		background: rgba(66, 133, 244, 0.15);
		border: 1px solid rgba(66, 133, 244, 0.4);
		color: #7ab3ff;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-size: 0.9rem;
		text-align: center;
	}

	.login-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.login-buttons :global(button) {
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

	.facebook-icon {
		font-weight: 700;
		font-size: 1.2rem;
		background: #fff;
		color: #1877f2;
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
