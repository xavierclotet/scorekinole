<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Bell, BellOff } from '@lucide/svelte';
	import { isFirebaseEnabled } from '$lib/firebase/config';
	import { currentUser } from '$lib/firebase/auth';
	import { getUserProfile, saveNotificationPreferences } from '$lib/firebase/userProfile';
	import { requestNotificationPermission } from '$lib/firebase/messaging';
	import type { NotificationPreferences } from '$lib/types/notifications';
	import { DEFAULT_NOTIFICATION_PREFERENCES } from '$lib/types/notifications';
	import { slide } from 'svelte/transition';

	let prefs = $state<NotificationPreferences>({ ...DEFAULT_NOTIFICATION_PREFERENCES });
	let loaded = $state(false);
	let toggling = $state(false);
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
		if (toggling) return;
		toggling = true;
		try {
			if (!prefs.enabled) {
				const token = await requestNotificationPermission();
				permissionState = typeof Notification !== 'undefined' ? Notification.permission : 'default';
				if (!token) return;
				prefs.enabled = true;
			} else {
				prefs.enabled = false;
			}
			await saveNotificationPreferences(prefs);
		} finally {
			toggling = false;
		}
	}

	async function togglePref(key: keyof Omit<NotificationPreferences, 'enabled'>) {
		prefs[key] = !prefs[key];
		await saveNotificationPreferences(prefs);
	}

	const isDenied = $derived(permissionState === 'denied');
</script>

{#if loaded}
	<div class="notification-section">
		<!-- Master toggle header -->
		<div class="notification-header">
			<div class="header-left">
				{#if prefs.enabled && !isDenied}
					<Bell class="notification-icon active" />
				{:else}
					<BellOff class="notification-icon" />
				{/if}
				<span class="notification-title">{m.notifications_title()}</span>
			</div>

			{#if !isDenied}
				<button
					class="toggle-switch"
					class:on={prefs.enabled}
					onclick={toggleMaster}
					role="switch"
					aria-checked={prefs.enabled}
					aria-label={m.notifications_enabled()}
				>
					<span class="toggle-dot"></span>
				</button>
			{/if}
		</div>

		{#if isDenied}
			<p class="notification-denied">{m.notifications_denied()}</p>
		{/if}

		{#if prefs.enabled && !isDenied}
			<div class="toggle-groups" transition:slide={{ duration: 200 }}>
				<!-- Tournament notifications -->
				<div class="toggle-group">
					<span class="toggle-group-label">{m.notifications_tournaments()}</span>
					<div class="toggle-group-card">
						<div class="toggle-row">
							<span class="toggle-label">{m.notifications_matchReady()}</span>
							<button
								class="toggle-switch small"
								class:on={prefs.tournament_matchReady}
								onclick={() => togglePref('tournament_matchReady')}
								role="switch"
								aria-checked={prefs.tournament_matchReady}
								aria-label={m.notifications_matchReady()}
							>
								<span class="toggle-dot"></span>
							</button>
						</div>

						<div class="toggle-divider"></div>

						<div class="toggle-row">
							<span class="toggle-label">{m.notifications_phaseChange()}</span>
							<button
								class="toggle-switch small"
								class:on={prefs.tournament_phaseChange}
								onclick={() => togglePref('tournament_phaseChange')}
								role="switch"
								aria-checked={prefs.tournament_phaseChange}
								aria-label={m.notifications_phaseChange()}
							>
								<span class="toggle-dot"></span>
							</button>
						</div>

						<div class="toggle-divider"></div>

						<div class="toggle-row">
							<span class="toggle-label">{m.notifications_ranking()}</span>
							<button
								class="toggle-switch small"
								class:on={prefs.tournament_ranking}
								onclick={() => togglePref('tournament_ranking')}
								role="switch"
								aria-checked={prefs.tournament_ranking}
								aria-label={m.notifications_ranking()}
							>
								<span class="toggle-dot"></span>
							</button>
						</div>
					</div>
				</div>

				<!-- Friendly match notifications -->
				<div class="toggle-group">
					<span class="toggle-group-label">{m.notifications_friendlyMatches()}</span>
					<div class="toggle-group-card">
						<div class="toggle-row">
							<span class="toggle-label">{m.notifications_inviteResponse()}</span>
							<button
								class="toggle-switch small"
								class:on={prefs.friendly_inviteResponse}
								onclick={() => togglePref('friendly_inviteResponse')}
								role="switch"
								aria-checked={prefs.friendly_inviteResponse}
								aria-label={m.notifications_inviteResponse()}
							>
								<span class="toggle-dot"></span>
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.notification-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.notification-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.header-left {
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

	/* Toggle groups */
	.toggle-groups {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.toggle-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.toggle-group-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--muted-foreground);
		padding-left: 2px;
	}

	.toggle-group-card {
		background: color-mix(in srgb, var(--muted) 50%, transparent);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}

	.toggle-divider {
		height: 1px;
		background: var(--border);
		margin: 0 10px;
	}

	/* Toggle rows */
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
	}

	.toggle-label {
		font-size: 12.5px;
		color: var(--foreground);
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
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.toggle-switch.on {
		background: var(--primary);
	}

	.toggle-switch.small {
		width: 32px;
		height: 18px;
		border-radius: 9px;
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

	.toggle-switch.small .toggle-dot {
		width: 14px;
		height: 14px;
	}

	.toggle-switch.small.on .toggle-dot {
		transform: translateX(14px);
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

		.toggle-switch.small {
			width: 28px;
			height: 16px;
		}

		.toggle-switch.small .toggle-dot {
			width: 12px;
			height: 12px;
		}

		.toggle-switch.small.on .toggle-dot {
			transform: translateX(12px);
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.notification-section {
			gap: 6px;
		}

		.notification-title {
			font-size: 12px;
		}

		.toggle-groups {
			gap: 8px;
		}

		.toggle-group-label {
			font-size: 10px;
		}

		.toggle-label {
			font-size: 11px;
		}

		.toggle-row {
			padding: 5px 8px;
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

		.toggle-switch.small {
			width: 28px;
			height: 16px;
		}

		.toggle-switch.small .toggle-dot {
			width: 12px;
			height: 12px;
		}

		.toggle-switch.small.on .toggle-dot {
			transform: translateX(12px);
		}
	}
</style>
