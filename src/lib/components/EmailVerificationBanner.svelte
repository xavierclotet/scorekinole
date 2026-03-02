<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { resendVerificationEmail, signOut } from '$lib/firebase/auth';
	import { Mail, RefreshCw, LogOut, CheckCircle2 } from '@lucide/svelte';

	let resending = $state(false);
	let resent = $state(false);

	async function handleResend() {
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

	function handleAlreadyVerified() {
		window.location.reload();
	}

	async function handleSignOut() {
		await signOut();
	}
</script>

<div class="verification-banner">
	<div class="banner-content">
		<div class="banner-icon">
			<Mail size={20} />
		</div>
		<span class="banner-text">{m.auth_verifyEmailBanner()}</span>
	</div>
	<div class="banner-actions">
		{#if resent}
			<span class="resent-msg">
				<CheckCircle2 size={14} />
				{m.auth_verificationSent()}
			</span>
		{:else}
			<button class="banner-btn resend-btn" onclick={handleResend} disabled={resending}>
				<RefreshCw size={14} class={resending ? 'spinning' : ''} />
				{m.auth_resendVerification()}
			</button>
		{/if}
		<button class="banner-btn verify-btn" onclick={handleAlreadyVerified}>
			{m.auth_alreadyVerified()}
		</button>
		<button class="banner-btn logout-btn" onclick={handleSignOut}>
			<LogOut size={14} />
			{m.auth_logout()}
		</button>
	</div>
</div>

<style>
	.verification-banner {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		background: linear-gradient(135deg, #b45309, #92400e);
		color: #fff;
		padding: 0.75rem 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.banner-icon {
		flex-shrink: 0;
		opacity: 0.9;
	}

	.banner-text {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.banner-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.resent-msg {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: #d9f99d;
		font-weight: 500;
	}

	.banner-btn {
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: #fff;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		white-space: nowrap;
		transition: background 0.2s;
	}

	.banner-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.banner-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.logout-btn {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
	}

	:global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@media (max-width: 600px) {
		.verification-banner {
			flex-direction: column;
			align-items: flex-start;
			padding: 0.75rem;
		}

		.banner-actions {
			width: 100%;
		}

		.banner-btn {
			flex: 1;
			justify-content: center;
		}
	}
</style>
