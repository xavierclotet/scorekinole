<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		/** Whether a user is currently assigned */
		isAssigned?: boolean;
		/** Photo URL of the assigned user */
		userPhotoURL?: string | null;
		/** User name (for alt text) */
		userName?: string;
		/** Whether the button is disabled */
		disabled?: boolean;
		/** Tooltip text to show on hover/tap */
		tooltipText?: string;
		/** Which side the tooltip appears on */
		tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
		/** Whether to show the onboarding hint popover */
		showHint?: boolean;
		/** Custom hint message (defaults to assign-self message) */
		hintMessage?: string;
		/** Called when user wants to assign themselves */
		onassign?: () => void;
		/** Called when user wants to unassign */
		onunassign?: () => void;
		/** Called when the hint popover is dismissed */
		ondismissHint?: () => void;
	}

	let {
		isAssigned = false,
		userPhotoURL = null,
		userName = '',
		disabled = false,
		tooltipText = '',
		tooltipSide = 'top',
		showHint = false,
		hintMessage = '',
		onassign,
		onunassign,
		ondismissHint
	}: Props = $props();

	// Use custom tooltip or default
	let effectiveTooltip = $derived(
		tooltipText || (isAssigned ? m.invite_unassignPlayer({ name: userName }) : m.invite_assignSelf())
	);

	// Delay showing hint to let the page settle
	let hintReady = $state(false);

	$effect(() => {
		if (showHint) {
			const timer = setTimeout(() => { hintReady = true; }, 800);
			return () => clearTimeout(timer);
		} else {
			hintReady = false;
		}
	});

	let showPopover = $derived(showHint && hintReady && !isAssigned);

	function handleClick(e: MouseEvent | TouchEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (disabled) return;

		if (isAssigned) {
			onunassign?.();
		} else {
			onassign?.();
		}
	}

	function handleTouchStart(e: TouchEvent) {
		e.stopPropagation();
	}

	function handleDismissHint() {
		ondismissHint?.();
	}
</script>

{#snippet buttonContent()}
	{#if isAssigned}
		{#if userPhotoURL}
			<img src={userPhotoURL} alt={userName} class="avatar" />
		{:else}
			<div class="avatar-placeholder">
				{userName.charAt(0).toUpperCase()}
			</div>
		{/if}
		<span class="unassign-overlay">
			<X size={12} />
		</span>
	{:else}
		<Plus size={16} />
	{/if}
{/snippet}

{#if showPopover}
	<Popover.Root open onOpenChange={(v) => { if (!v) handleDismissHint(); }}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class={['player-assign-btn', 'hint-active', disabled && 'disabled']}
					onclick={handleClick}
					ontouchstart={handleTouchStart}
					ontouchend={handleClick}
					{disabled}
				>
					{@render buttonContent()}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content side="bottom" sideOffset={8} class="hint-popover-content">
			<p class="hint-message">{hintMessage || m.invite_assignHintMessage()}</p>
			<button class="hint-dismiss-btn" onclick={handleDismissHint}>
				{m.update_gotIt()}
			</button>
		</Popover.Content>
	</Popover.Root>
{:else}
	<Tooltip.Provider>
		<Tooltip.Root delayDuration={100}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class={[
							'player-assign-btn',
							isAssigned && 'assigned',
							disabled && 'disabled'
						]}
						onclick={handleClick}
						ontouchstart={handleTouchStart}
						ontouchend={handleClick}
						{disabled}
					>
						{@render buttonContent()}
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content sideOffset={5} side={tooltipSide}>
				{effectiveTooltip}
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{/if}

<style>
	.player-assign-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px dashed currentColor;
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
		transition: all 0.2s ease;
		position: relative;
		flex-shrink: 0;
	}

	.player-assign-btn:hover:not(.disabled) {
		opacity: 1;
		transform: scale(1.1);
	}

	.player-assign-btn.assigned {
		border: none;
		opacity: 1;
	}

	.player-assign-btn.disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.player-assign-btn.hint-active {
		animation: pulse-hint 2s ease-in-out infinite;
		border-color: var(--primary);
		opacity: 1;
	}

	@keyframes pulse-hint {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 40%, transparent); }
		50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary) 0%, transparent); }
	}

	.avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 600;
	}

	.unassign-overlay {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.player-assign-btn:hover .unassign-overlay {
		opacity: 1;
	}

	/* Portal styles — popover content renders outside component scope */
	:global(.hint-popover-content) {
		width: auto !important;
		max-width: 220px !important;
		padding: 12px !important;
	}

	:global(.hint-message) {
		margin: 0 0 8px 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--popover-foreground);
	}

	:global(.hint-dismiss-btn) {
		display: block;
		width: 100%;
		padding: 4px 8px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	:global(.hint-dismiss-btn:hover) {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--foreground);
		border-color: var(--primary);
	}
</style>
