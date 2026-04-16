<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		signInWithGoogle,
		signUpWithEmail,
		signInWithEmail,
		resetPassword,
		resendVerificationEmail
	} from '$lib/firebase/auth';
	import { Eye, EyeOff, Mail, ArrowLeft, CheckCircle2 } from '@lucide/svelte';
	import Button from './Button.svelte';

	type View = 'providers' | 'email-signin' | 'email-signup' | 'verify-email' | 'reset-password' | 'reset-sent';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
	}

	let { isOpen = $bindable(false), onclose }: Props = $props();

	let view = $state<View>('providers');
	let isLoading = $state(false);
	let error = $state('');
	let showGmailHint = $state(false);

	// Form fields
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	// Password requirements (only relevant for signup)
	let pwHasMinLength = $derived(password.length >= 8);
	let pwHasUppercase = $derived(/[A-Z]/.test(password));
	let pwHasLowercase = $derived(/[a-z]/.test(password));
	let pwHasNumber = $derived(/[0-9]/.test(password));
	let pwAllValid = $derived(pwHasMinLength && pwHasUppercase && pwHasLowercase && pwHasNumber);

	// Verify email state
	let verifyEmail = $state('');
	let resent = $state(false);

	// Reset password state
	let resetEmail = $state('');

	function resetForm() {
		email = '';
		password = '';
		confirmPassword = '';
		showPassword = false;
		showConfirmPassword = false;
		error = '';
		showGmailHint = false;
		resent = false;
		resetEmail = '';
	}

	function setView(newView: View) {
		error = '';
		view = newView;
	}

	async function handleGoogleSignIn() {
		isLoading = true;
		error = '';

		try {
			await signInWithGoogle();
			close();
		} catch (err: any) {
			console.error('Login error:', err);
			if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/popup-blocked') {
				error = m.auth_popupClosed();
			} else if (err.code === 'auth/account-exists-with-different-credential') {
				error = m.auth_accountExistsDifferentProvider();
			} else if (err.code === 'auth/user-disabled') {
				error = m.auth_userDisabled();
			} else if (err.code === 'auth/network-request-failed') {
				error = m.auth_networkError();
			} else {
				error = m.auth_loginError();
			}
		} finally {
			isLoading = false;
		}
	}

	async function handleEmailSignIn() {
		if (!email || !password) return;

		isLoading = true;
		error = '';
		showGmailHint = false;

		try {
			await signInWithEmail(email.trim(), password);
			close();
		} catch (err: any) {
			console.error('Email sign in error:', err);
			if (err.code === 'GMAIL_USE_GOOGLE_SIGNIN') {
				error = m.auth_gmailUseGoogleSignIn();
				showGmailHint = true;
			} else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
				error = m.auth_invalidCredentials();
			} else if (err.code === 'auth/too-many-requests') {
				error = m.auth_tooManyAttempts();
			} else if (err.code === 'auth/user-disabled') {
				error = m.auth_userDisabled();
			} else if (err.code === 'auth/network-request-failed') {
				error = m.auth_networkError();
			} else {
				error = m.auth_loginError();
			}
		} finally {
			isLoading = false;
		}
	}

	async function handleEmailSignUp() {
		if (!email || !password || !confirmPassword) return;

		if (!pwAllValid) {
			error = m.auth_passwordRequirements();
			return;
		}

		if (password !== confirmPassword) {
			error = m.auth_passwordsDoNotMatch();
			return;
		}

		isLoading = true;
		error = '';

		try {
			await signUpWithEmail(email.trim(), password);
			verifyEmail = email.trim().toLowerCase();
			setView('verify-email');
		} catch (err: any) {
			console.error('Email sign up error:', err);
			if (err.code === 'GMAIL_USE_GOOGLE_SIGNIN') {
				error = m.auth_gmailUseGoogleSignIn();
				showGmailHint = true;
			} else if (err.code === 'auth/email-already-in-use') {
				error = m.auth_emailAlreadyInUse();
			} else if (err.code === 'auth/weak-password') {
				error = m.auth_passwordTooShort();
			} else if (err.code === 'auth/too-many-requests') {
				error = m.auth_tooManyAttempts();
			} else if (err.code === 'auth/network-request-failed') {
				error = m.auth_networkError();
			} else {
				error = m.auth_loginError();
			}
		} finally {
			isLoading = false;
		}
	}

	async function handleResetPassword() {
		if (!resetEmail) return;

		isLoading = true;
		error = '';

		try {
			await resetPassword(resetEmail.trim());
			setView('reset-sent');
		} catch (err: any) {
			console.error('Reset password error:', err);
			if (err.code === 'auth/too-many-requests') {
				error = m.auth_tooManyAttempts();
			} else if (err.code === 'auth/network-request-failed') {
				error = m.auth_networkError();
			} else {
				// Don't reveal if email exists or not — always show success
				setView('reset-sent');
			}
		} finally {
			isLoading = false;
		}
	}

	let resending = $state(false);

	async function handleResendVerification() {
		if (resending) return;
		resending = true;
		try {
			await resendVerificationEmail();
			resent = true;
			setTimeout(() => { resent = false; }, 5000);
		} catch (err) {
			console.error('Error resending verification:', err);
		} finally {
			resending = false;
		}
	}

	function close() {
		isOpen = false;
		isLoading = false;
		error = '';
		view = 'providers';
		resetForm();
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

	function handleFormSubmit(handler: () => void) {
		return (e: Event) => {
			e.preventDefault();
			handler();
		};
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={close} role="none">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" onclick={stopPropagation} role="dialog" tabindex="-1">
			<div class="modal-header">
				<span class="modal-title">
					{#if view === 'providers'}
						{m.auth_login()}
					{:else if view === 'email-signin'}
						{m.auth_signInWithEmail()}
					{:else if view === 'email-signup'}
						{m.auth_createAccount()}
					{:else if view === 'verify-email'}
						{m.auth_verifyEmailTitle()}
					{:else if view === 'reset-password'}
						{m.auth_resetPassword()}
					{:else if view === 'reset-sent'}
						{m.auth_resetEmailSent()}
					{/if}
				</span>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="modal-content">

				{#if view === 'providers'}
					<!-- Provider selection view -->
					<p class="welcome-text">{m.auth_loginWelcome()}</p>

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					<div class="login-buttons">
						<Button
							variant="primary"
							size="large"
							onclick={handleGoogleSignIn}
							disabled={isLoading}
						>
							{#if isLoading}
								{m.auth_signingIn()}
							{:else}
								<span class="google-icon">G</span>
								{m.auth_continueWithGoogle()}
							{/if}
						</Button>
					</div>

					<div class="divider">
						<span>{m.auth_orDivider()}</span>
					</div>

					<div class="login-buttons">
						<Button
							variant="primary"
							size="large"
							onclick={() => { resetForm(); setView('email-signin'); }}
							disabled={isLoading}
						>
							<Mail size={18} />
							{m.auth_continueWithEmail()}
						</Button>
					</div>

					<p class="privacy-note">{m.auth_loginPrivacyNote()}</p>

				{:else if view === 'email-signin'}
					<!-- Email sign in form -->
					<button class="back-link" onclick={() => setView('providers')}>
						<ArrowLeft size={16} />
						{m.auth_backToSignIn()}
					</button>

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					{#if showGmailHint}
						<div class="gmail-hint">
							<Button
								variant="primary"
								size="large"
								onclick={handleGoogleSignIn}
								disabled={isLoading}
							>
								<span class="google-icon">G</span>
								{m.auth_continueWithGoogle()}
							</Button>
						</div>
					{/if}

					<form class="email-form" onsubmit={handleFormSubmit(handleEmailSignIn)}>
						<div class="input-group">
							<label for="signin-email">{m.auth_email()}</label>
							<input
								id="signin-email"
								type="email"
								bind:value={email}
								autocomplete="email"
								required
							/>
						</div>

						<div class="input-group">
							<label for="signin-password">{m.auth_password()}</label>
							<div class="password-wrapper">
								<input
									id="signin-password"
									type={showPassword ? 'text' : 'password'}
									bind:value={password}
									autocomplete="current-password"
									required
								/>
								<button
									type="button"
									class="toggle-password"
									onclick={() => showPassword = !showPassword}
									tabindex={-1}
								>
									{#if showPassword}
										<EyeOff size={18} />
									{:else}
										<Eye size={18} />
									{/if}
								</button>
							</div>
						</div>

						<button
							type="button"
							class="forgot-password-link"
							onclick={() => { resetEmail = email; setView('reset-password'); }}
						>
							{m.auth_forgotPassword()}
						</button>

						<Button
							variant="primary"
							size="large"
							type="submit"
							disabled={isLoading || !email || !password}
						>
							{#if isLoading}
								{m.auth_signingIn()}
							{:else}
								{m.auth_signIn()}
							{/if}
						</Button>
					</form>

					<p class="switch-text">
						{m.auth_noAccountYet()}
						<button class="text-link" onclick={() => { error = ''; setView('email-signup'); }}>
							{m.auth_signUp()}
						</button>
					</p>

				{:else if view === 'email-signup'}
					<!-- Email sign up form -->
					<button class="back-link" onclick={() => setView('providers')}>
						<ArrowLeft size={16} />
						{m.auth_backToSignIn()}
					</button>

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					{#if showGmailHint}
						<div class="gmail-hint">
							<Button
								variant="primary"
								size="large"
								onclick={handleGoogleSignIn}
								disabled={isLoading}
							>
								<span class="google-icon">G</span>
								{m.auth_continueWithGoogle()}
							</Button>
						</div>
					{/if}

					<form class="email-form" onsubmit={handleFormSubmit(handleEmailSignUp)}>
						<div class="input-group">
							<label for="signup-email">{m.auth_email()}</label>
							<input
								id="signup-email"
								type="email"
								bind:value={email}
								autocomplete="email"
								required
							/>
						</div>

						<div class="input-group">
							<label for="signup-password">{m.auth_password()}</label>
							<div class="password-wrapper">
								<input
									id="signup-password"
									type={showPassword ? 'text' : 'password'}
									bind:value={password}
									autocomplete="new-password"
									minlength="8"
									required
								/>
								<button
									type="button"
									class="toggle-password"
									onclick={() => showPassword = !showPassword}
									tabindex={-1}
								>
									{#if showPassword}
										<EyeOff size={18} />
									{:else}
										<Eye size={18} />
									{/if}
								</button>
							</div>
							{#if password.length > 0}
								<ul class="pw-requirements">
									<li class={pwHasMinLength ? 'met' : ''}>{m.auth_passwordMinLength()}</li>
									<li class={pwHasUppercase ? 'met' : ''}>{m.auth_passwordUppercase()}</li>
									<li class={pwHasLowercase ? 'met' : ''}>{m.auth_passwordLowercase()}</li>
									<li class={pwHasNumber ? 'met' : ''}>{m.auth_passwordNumber()}</li>
								</ul>
							{/if}
						</div>

						<div class="input-group">
							<label for="signup-confirm">{m.auth_confirmPassword()}</label>
							<div class="password-wrapper">
								<input
									id="signup-confirm"
									type={showConfirmPassword ? 'text' : 'password'}
									bind:value={confirmPassword}
									autocomplete="new-password"
									minlength="8"
									required
								/>
								<button
									type="button"
									class="toggle-password"
									onclick={() => showConfirmPassword = !showConfirmPassword}
									tabindex={-1}
								>
									{#if showConfirmPassword}
										<EyeOff size={18} />
									{:else}
										<Eye size={18} />
									{/if}
								</button>
							</div>
						</div>

						<Button
							variant="primary"
							size="large"
							type="submit"
							disabled={isLoading || !email || !pwAllValid || !confirmPassword || password !== confirmPassword}
						>
							{#if isLoading}
								{m.auth_signingIn()}
							{:else}
								{m.auth_createAccount()}
							{/if}
						</Button>
					</form>

					<p class="switch-text">
						{m.auth_alreadyHaveAccount()}
						<button class="text-link" onclick={() => { error = ''; setView('email-signin'); }}>
							{m.auth_signIn()}
						</button>
					</p>

				{:else if view === 'verify-email'}
					<!-- Email verification pending -->
					<div class="verify-email-view">
						<div class="verify-icon">
							<Mail size={48} />
						</div>
						<p class="verify-text">
							{m.auth_verifyEmailSent({ email: verifyEmail })}
						</p>
						{#if resent}
							<div class="resent-badge">
								<CheckCircle2 size={16} />
								{m.auth_verificationSent()}
							</div>
						{:else}
							<Button
								variant="primary"
								size="large"
								onclick={handleResendVerification}
								disabled={resending}
							>
								{resending ? m.auth_signingIn() : m.auth_resendVerification()}
							</Button>
						{/if}
					</div>

				{:else if view === 'reset-password'}
					<!-- Reset password form -->
					<button class="back-link" onclick={() => setView('email-signin')}>
						<ArrowLeft size={16} />
						{m.auth_backToSignIn()}
					</button>

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					<p class="welcome-text">{m.auth_resetPasswordDescription()}</p>

					<form class="email-form" onsubmit={handleFormSubmit(handleResetPassword)}>
						<div class="input-group">
							<label for="reset-email">{m.auth_email()}</label>
							<input
								id="reset-email"
								type="email"
								bind:value={resetEmail}
								autocomplete="email"
								required
							/>
						</div>

						<Button
							variant="primary"
							size="large"
							type="submit"
							disabled={isLoading || !resetEmail}
						>
							{#if isLoading}
								{m.auth_signingIn()}
							{:else}
								{m.auth_sendResetLink()}
							{/if}
						</Button>
					</form>

				{:else if view === 'reset-sent'}
					<!-- Reset email sent confirmation -->
					<div class="verify-email-view">
						<div class="verify-icon success">
							<CheckCircle2 size={48} />
						</div>
						<p class="verify-text">
							{m.auth_resetEmailSentDescription()}
						</p>
						<Button
							variant="primary"
							size="large"
							onclick={() => { resetForm(); setView('email-signin'); }}
						>
							{m.auth_backToSignIn()}
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
		gap: 1.25rem;
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

	.gmail-hint {
		display: flex;
		flex-direction: column;
	}

	.gmail-hint :global(button) {
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

	.divider {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.85rem;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.15);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0;
		transition: color 0.2s;
	}

	.back-link:hover {
		color: #fff;
	}

	/* Email form styles */
	.email-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.input-group label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.input-group input {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		padding: 0.7rem 0.85rem;
		color: #fff;
		font-size: 1rem;
		outline: none;
		transition: border-color 0.2s;
		width: 100%;
	}

	.input-group input:focus {
		border-color: rgba(0, 255, 136, 0.5);
	}

	.input-group input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.password-wrapper {
		position: relative;
		display: flex;
	}

	.password-wrapper input {
		padding-right: 3rem;
	}

	.toggle-password {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		transition: color 0.2s;
	}

	.toggle-password:hover {
		color: rgba(255, 255, 255, 0.7);
	}

	.pw-requirements {
		list-style: none;
		padding: 0;
		margin: 0.25rem 0 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.2rem 0.75rem;
	}

	.pw-requirements li {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		transition: color 0.2s;
		padding-left: 1.1rem;
		position: relative;
	}

	.pw-requirements li::before {
		content: '○';
		position: absolute;
		left: 0;
		font-size: 0.65rem;
	}

	.pw-requirements li.met {
		color: #4ade80;
	}

	.pw-requirements li.met::before {
		content: '●';
	}

	.forgot-password-link {
		background: none;
		border: none;
		color: rgba(0, 255, 136, 0.7);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0;
		text-align: right;
		transition: color 0.2s;
	}

	.forgot-password-link:hover {
		color: rgba(0, 255, 136, 1);
	}

	.email-form :global(button[type="submit"]) {
		margin-top: 0.25rem;
	}

	/* Switch between signin/signup */
	.switch-text {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
		text-align: center;
		margin: 0;
	}

	.text-link {
		background: none;
		border: none;
		color: rgba(0, 255, 136, 0.8);
		font-size: 0.9rem;
		cursor: pointer;
		padding: 0;
		font-weight: 600;
		transition: color 0.2s;
	}

	.text-link:hover {
		color: rgba(0, 255, 136, 1);
	}

	/* Verify email view */
	.verify-email-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		text-align: center;
		padding: 1rem 0;
	}

	.verify-icon {
		color: rgba(0, 255, 136, 0.7);
		opacity: 0.9;
	}

	.verify-icon.success {
		color: #4ade80;
	}

	.verify-text {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0;
	}

	.resent-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #4ade80;
		font-size: 0.9rem;
		font-weight: 500;
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
