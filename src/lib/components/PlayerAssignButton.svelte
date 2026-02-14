<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		/** Whether a user is currently assigned */
		isAssigned?: boolean;
		/** Photo URL of the assigned user */
		userPhotoURL?: string | null;
		/** User name (for alt text) */
		userName?: string;
		/** Whether the button is disabled */
		disabled?: boolean;
		/** Called when user wants to assign themselves */
		onassign?: () => void;
		/** Called when user wants to unassign */
		onunassign?: () => void;
	}

	let {
		isAssigned = false,
		userPhotoURL = null,
		userName = '',
		disabled = false,
		onassign,
		onunassign
	}: Props = $props();

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
</script>

<button
	type="button"
	class={[
		'player-assign-btn',
		isAssigned && 'assigned',
		disabled && 'disabled'
	]}
	onclick={handleClick}
	ontouchstart={handleTouchStart}
	ontouchend={handleClick}
	title={isAssigned ? m.invite_unassign() : m.invite_assignSelf()}
	{disabled}
>
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
</button>

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
</style>
