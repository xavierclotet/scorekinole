<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Bell, BellOff } from '@lucide/svelte';
	import { isFirebaseEnabled } from '$lib/firebase/config';
	import { currentUser } from '$lib/firebase/auth';
	import { getUserProfile, saveNotificationPreferences } from '$lib/firebase/userProfile';
	import { requestNotificationPermission } from '$lib/firebase/messaging';
	import type { NotificationPreferences } from '$lib/types/notifications';
	import { DEFAULT_NOTIFICATION_PREFERENCES } from '$lib/types/notifications';

	let prefs = $state<NotificationPreferences>({ ...DEFAULT_NOTIFICATION_PREFERENCES });
	let loaded = $state(false);
	let permissionState = $state<NotificationPermission>(
		typeof Notification !== 'undefined' ? Notification.permission : 'default'
	);

	// Load preferences from Firestore
	$effect(() => {
		if ($currentUser && isFirebaseEnabled()) {
			loadPreferences();
		}
	});

	async function loadPreferences() {
		const profile = await getUserProfile();
		if (profile?.notificationPreferences) {
			prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...profile.notificationPreferences };
		}
		loaded = true;
	}

	async function toggleMaster() {
		if (!prefs.enabled) {
			// Always request token when enabling (handles both new permission and already-granted)
			const token = await requestNotificationPermission();
			permissionState = typeof Notification !== 'undefined' ? Notification.permission : 'default';
			if (!token) return; // User denied permission or error
			prefs.enabled = true;
		} else {
			prefs.enabled = false;
		}
		await saveNotificationPreferences(prefs);
	}

	async function togglePref(key: keyof Omit<NotificationPreferences, 'enabled'>) {
		prefs[key] = !prefs[key];
		await saveNotificationPreferences(prefs);
	}

	const isDenied = $derived(permissionState === 'denied');
</script>

{#if loaded}
	<div class="notification-section">
		<div class="notification-header">
			{#if prefs.enabled && !isDenied}
				<Bell class="notification-icon active" />
			{:else}
				<BellOff class="notification-icon" />
			{/if}
			<span class="notification-title">{m.notifications_title()}</span>
		</div>

		{#if isDenied}
			<p class="notification-denied">{m.notifications_denied()}</p>
		{:else}
			<!-- Master toggle -->
			<label class="toggle-row">
				<span class="toggle-label">{m.notifications_enabled()}</span>
				<button
					class="toggle-switch"
					class:on={prefs.enabled}
					onclick={toggleMaster}
					role="switch"
					aria-checked={prefs.enabled}
				>
					<span class="toggle-dot"></span>
				</button>
			</label>

			{#if prefs.enabled}
				<div class="toggle-list">
					<label class="toggle-row sub">
						<span class="toggle-label">{m.notifications_matchReady()}</span>
						<button
							class="toggle-switch"
							class:on={prefs.tournament_matchReady}
							onclick={() => togglePref('tournament_matchReady')}
							role="switch"
							aria-checked={prefs.tournament_matchReady}
						>
							<span class="toggle-dot"></span>
						</button>
					</label>

					<label class="toggle-row sub">
						<span class="toggle-label">{m.notifications_phaseChange()}</span>
						<button
							class="toggle-switch"
							class:on={prefs.tournament_phaseChange}
							onclick={() => togglePref('tournament_phaseChange')}
							role="switch"
							aria-checked={prefs.tournament_phaseChange}
						>
							<span class="toggle-dot"></span>
						</button>
					</label>

					<label class="toggle-row sub">
						<span class="toggle-label">{m.notifications_ranking()}</span>
						<button
							class="toggle-switch"
							class:on={prefs.tournament_ranking}
							onclick={() => togglePref('tournament_ranking')}
							role="switch"
							aria-checked={prefs.tournament_ranking}
						>
							<span class="toggle-dot"></span>
						</button>
					</label>

					<label class="toggle-row sub">
						<span class="toggle-label">{m.notifications_inviteResponse()}</span>
						<button
							class="toggle-switch"
							class:on={prefs.friendly_inviteResponse}
							onclick={() => togglePref('friendly_inviteResponse')}
							role="switch"
							aria-checked={prefs.friendly_inviteResponse}
						>
							<span class="toggle-dot"></span>
						</button>
					</label>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.notification-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.notification-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	:global(.notification-icon) {
		width: 14px;
		height: 14px;
		color: var(--muted-foreground);
	}

	:global(.notification-icon.active) {
		color: var(--primary);
	}

	.notification-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--foreground);
	}

	.notification-denied {
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 0;
		line-height: 1.4;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		cursor: pointer;
	}

	.toggle-row.sub {
		padding-left: 4px;
	}

	.toggle-label {
		font-size: 13px;
		color: var(--foreground);
	}

	.toggle-row.sub .toggle-label {
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.toggle-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 2px;
	}

	/* Custom toggle switch */
	.toggle-switch {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 10px;
		border: none;
		background: var(--muted);
		cursor: pointer;
		transition: background 0.2s;
		padding: 0;
		flex-shrink: 0;
	}

	.toggle-switch.on {
		background: var(--primary);
	}

	.toggle-dot {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s;
	}

	.toggle-switch.on .toggle-dot {
		transform: translateX(16px);
	}

	@media (max-width: 380px) {
		.toggle-switch {
			width: 32px;
			height: 18px;
		}

		.toggle-dot {
			width: 14px;
			height: 14px;
		}

		.toggle-switch.on .toggle-dot {
			transform: translateX(14px);
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.notification-section {
			gap: 6px;
		}

		.notification-title {
			font-size: 12px;
		}

		.toggle-label {
			font-size: 12px;
		}

		.toggle-row.sub .toggle-label {
			font-size: 11px;
		}

		.toggle-list {
			gap: 5px;
		}

		.toggle-switch {
			width: 32px;
			height: 18px;
		}

		.toggle-dot {
			width: 14px;
			height: 14px;
		}

		.toggle-switch.on .toggle-dot {
			transform: translateX(14px);
		}
	}
</style>
