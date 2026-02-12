<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { adminTheme } from '$lib/stores/theme';
	import type { Tournament } from '$lib/types/tournament';
	import type { UserProfile } from '$lib/firebase/userProfile';
	import {
		addTournamentAdmin,
		removeTournamentAdmin,
		transferTournamentOwnership,
		getAdminUsers,
		getEffectiveOwnerId
	} from '$lib/firebase/tournaments';
	import { getUserProfileById } from '$lib/firebase/userProfile';
	import { currentUser } from '$lib/firebase/auth';
	import { isSuperAdmin } from '$lib/firebase/admin';

	interface Props {
		tournament: Tournament;
		onClose: () => void;
		onUpdated?: () => void;
	}

	let { tournament, onClose, onUpdated }: Props = $props();

	// State
	let availableAdmins: (UserProfile & { userId: string })[] = $state([]);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// Search state
	let searchQuery = $state('');
	let selectedToAdd = $state<Set<string>>(new Set());

	// Transfer ownership state
	let showTransferConfirm = $state(false);
	let transferTargetId = $state('');
	let keepAsAdmin = $state(true);

	// Derived
	const ownerId = $derived(getEffectiveOwnerId(tournament));
	const adminIds = $derived(tournament.adminIds || []);

	// Get admin info with names
	let adminInfoMap = $state<Map<string, { name: string; photoURL?: string }>>(new Map());

	// Filtered admins for selection (exclude owner and current admins)
	const filteredAdmins = $derived(
		availableAdmins.filter((admin) => {
			if (admin.userId === ownerId) return false;
			if (adminIds.includes(admin.userId)) return false;
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				return (
					admin.playerName?.toLowerCase().includes(query) ||
					admin.email?.toLowerCase().includes(query)
				);
			}
			return true;
		})
	);

	// Can current user manage admins?
	let canManage = $state(false);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		isLoading = true;
		try {
			availableAdmins = await getAdminUsers();

			const map = new Map<string, { name: string; photoURL?: string }>();
			availableAdmins.forEach((admin) => {
				map.set(admin.userId, {
					name: admin.playerName || 'Usuario',
					photoURL: admin.photoURL || undefined
				});
			});

			// Add owner if not already in map
			if (ownerId && !map.has(ownerId)) {
				// Try to fetch owner profile, fall back to createdBy.userName
				const ownerProfile = await getUserProfileById(ownerId);
				if (ownerProfile) {
					map.set(ownerId, { name: ownerProfile.playerName || 'Usuario', photoURL: ownerProfile.photoURL || undefined });
				} else if (tournament.createdBy) {
					map.set(ownerId, { name: tournament.ownerName || tournament.createdBy.userName });
				}
			}

			// Also fetch any collaborators not in the admin list (safety check)
			for (const adminId of adminIds) {
				if (!map.has(adminId)) {
					const profile = await getUserProfileById(adminId);
					if (profile) {
						map.set(adminId, { name: profile.playerName || 'Usuario', photoURL: profile.photoURL || undefined });
					}
				}
			}

			adminInfoMap = map;

			const user = $currentUser;
			if (user) {
				const isOwner = ownerId === user.id;
				const superAdmin = await isSuperAdmin();
				canManage = isOwner || superAdmin;
			}
		} catch (error) {
			console.error('Error loading admin data:', error);
			errorMessage = 'Error loading data';
		} finally {
			isLoading = false;
		}
	}

	function getAdminName(userId: string): string {
		return adminInfoMap.get(userId)?.name || userId.substring(0, 8) + '...';
	}

	function getAdminPhoto(userId: string): string | undefined {
		return adminInfoMap.get(userId)?.photoURL;
	}

	function toggleAdminSelection(userId: string) {
		const newSet = new Set(selectedToAdd);
		if (newSet.has(userId)) {
			newSet.delete(userId);
		} else {
			newSet.add(userId);
		}
		selectedToAdd = newSet;
	}

	async function handleAddSelectedAdmins() {
		if (selectedToAdd.size === 0) return;

		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			let addedCount = 0;
			const userIds = Array.from(selectedToAdd);

			for (const userId of userIds) {
				const success = await addTournamentAdmin(tournament.id, userId);
				if (success) {
					addedCount++;
					tournament.adminIds = [...(tournament.adminIds || []), userId];
				}
			}

			if (addedCount > 0) {
				successMessage = addedCount === 1 ? m.admin_adminAdded() : m.admin_adminsAdded({ count: addedCount.toString() });
				onUpdated?.();
			} else {
				errorMessage = m.common_error();
			}
		} catch (error) {
			console.error('Error adding admins:', error);
			errorMessage = m.common_error();
		} finally {
			isSaving = false;
			searchQuery = '';
			selectedToAdd = new Set();
		}
	}

	async function handleRemoveAdmin(userId: string) {
		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			const success = await removeTournamentAdmin(tournament.id, userId);
			if (success) {
				successMessage = m.admin_adminRemoved();
				tournament.adminIds = adminIds.filter((id) => id !== userId);
				onUpdated?.();
			} else {
				errorMessage = m.common_error();
			}
		} catch (error) {
			console.error('Error removing admin:', error);
			errorMessage = m.common_error();
		} finally {
			isSaving = false;
		}
	}

	function initiateTransfer(targetId: string) {
		transferTargetId = targetId;
		showTransferConfirm = true;
	}

	async function confirmTransfer() {
		if (!transferTargetId) return;

		isSaving = true;
		errorMessage = '';
		successMessage = '';

		// Fetch the user profile directly to ensure we get the correct name
		let newOwnerName = getAdminName(transferTargetId);
		try {
			const targetProfile = await getUserProfileById(transferTargetId);
			if (targetProfile?.playerName) {
				newOwnerName = targetProfile.playerName;
			}
		} catch (e) {
			console.warn('Could not fetch target profile, using cached name:', e);
		}

		try {
			const success = await transferTournamentOwnership(
				tournament.id,
				transferTargetId,
				newOwnerName,
				keepAsAdmin
			);
			if (success) {
				successMessage = m.admin_ownershipTransferred();
				const previousOwnerId = ownerId;
				tournament.ownerId = transferTargetId;
				tournament.ownerName = newOwnerName;

				let newAdminIds = adminIds.filter((id) => id !== transferTargetId);
				if (keepAsAdmin && previousOwnerId) {
					newAdminIds = [...newAdminIds, previousOwnerId];
				}
				tournament.adminIds = newAdminIds;

				onUpdated?.();
				showTransferConfirm = false;
				await loadData();
			} else {
				errorMessage = m.common_error();
			}
		} catch (error) {
			console.error('Error transferring ownership:', error);
			errorMessage = m.common_error();
		} finally {
			isSaving = false;
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" data-theme={$adminTheme} onclick={onClose}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal" onclick={stopPropagation} role="dialog" aria-modal="true" tabindex="-1">
		<!-- Header -->
		<div class="modal-header">
			<h2>{m.admin_tournamentAdmins()}</h2>
			<button class="close-btn" onclick={onClose} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="modal-content">
			{#if isLoading}
				<div class="loading">
					<div class="spinner"></div>
				</div>
			{:else}
				<!-- Two Column Layout -->
				<div class="columns">
					<!-- Left: Current Admins -->
					<div class="column">
						<div class="column-header">
							<span class="column-title">{m.admin_tournamentAdmins()}</span>
							<span class="badge">{1 + adminIds.length}</span>
						</div>

						<div class="admins-scroll">
							<!-- Owner -->
							<div class="admin-row owner">
								<div class="admin-avatar">
									{#if getAdminPhoto(ownerId || '')}
										<img src={getAdminPhoto(ownerId || '')} alt="" />
									{:else}
										<span>{getAdminName(ownerId || '').charAt(0).toUpperCase()}</span>
									{/if}
								</div>
								<div class="admin-details">
									<span class="admin-name">{getAdminName(ownerId || '')}</span>
									<span class="owner-badge">👑 {m.admin_owner()}</span>
								</div>
							</div>

							<!-- Collaborators -->
							{#each adminIds as adminId}
								<div class="admin-row">
									<div class="admin-avatar">
										{#if getAdminPhoto(adminId)}
											<img src={getAdminPhoto(adminId)} alt="" />
										{:else}
											<span>{getAdminName(adminId).charAt(0).toUpperCase()}</span>
										{/if}
									</div>
									<div class="admin-details">
										<span class="admin-name">{getAdminName(adminId)}</span>
									</div>
									{#if canManage}
										<div class="row-actions">
											<button
												class="icon-action transfer"
												title={m.admin_transferOwnership()}
												onclick={() => initiateTransfer(adminId)}
												disabled={isSaving}
											>
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
												</svg>
											</button>
											<button
												class="icon-action remove"
												title={m.common_remove()}
												onclick={() => handleRemoveAdmin(adminId)}
												disabled={isSaving}
											>
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M18 6L6 18M6 6l12 12" />
												</svg>
											</button>
										</div>
									{/if}
								</div>
							{/each}

							{#if adminIds.length === 0}
								<div class="empty-hint">{m.admin_noCollaborators()}</div>
							{/if}
						</div>
					</div>

					<!-- Right: Add Admins -->
					{#if canManage}
						<div class="column">
							<div class="column-header">
								<span class="column-title">{m.admin_addCollaborator()}</span>
							</div>

							<input
								type="text"
								class="search-input"
								placeholder={m.admin_searchAdmin()}
								bind:value={searchQuery}
							/>

							<div class="admin-list">
								{#each filteredAdmins.slice(0, 6) as admin}
									<button
										class="selectable-admin"
										class:selected={selectedToAdd.has(admin.userId)}
										onclick={() => toggleAdminSelection(admin.userId)}
										disabled={isSaving}
									>
										<div class="check-box" class:checked={selectedToAdd.has(admin.userId)}>
											{#if selectedToAdd.has(admin.userId)}
												<svg viewBox="0 0 24 24" fill="currentColor">
													<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
												</svg>
											{/if}
										</div>
										<div class="admin-avatar small">
											{#if admin.photoURL}
												<img src={admin.photoURL} alt="" referrerpolicy="no-referrer" />
											{:else}
												<span>{admin.playerName?.charAt(0).toUpperCase() || '?'}</span>
											{/if}
										</div>
										<span class="admin-name">{admin.playerName}</span>
									</button>
								{/each}

								{#if filteredAdmins.length === 0}
									<div class="empty-hint">No hay admins disponibles</div>
								{/if}
							</div>

							{#if selectedToAdd.size > 0}
								<button
									class="add-btn"
									onclick={handleAddSelectedAdmins}
									disabled={isSaving}
								>
									{#if isSaving}
										<span class="spinner small"></span>
									{:else}
										{m.admin_addSelected({ count: selectedToAdd.size.toString() })}
									{/if}
								</button>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Messages -->
				{#if errorMessage || successMessage}
					<div class="message" class:error={!!errorMessage} class:success={!!successMessage}>
						{errorMessage || successMessage}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Transfer Confirmation -->
	{#if showTransferConfirm}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="confirm-overlay" onclick={() => (showTransferConfirm = false)}>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="confirm-modal" onclick={stopPropagation}>
				<h3>{m.admin_confirmTransfer()}</h3>
				<p>{m.admin_transferDescription({ name: getAdminName(transferTargetId) })}</p>

				<label class="checkbox-row">
					<input type="checkbox" bind:checked={keepAsAdmin} />
					<span>{m.admin_keepAsCollaborator()}</span>
				</label>

				<div class="confirm-actions">
					<button class="btn secondary" onclick={() => (showTransferConfirm = false)} disabled={isSaving}>
						{m.common_cancel()}
					</button>
					<button class="btn primary" onclick={confirmTransfer} disabled={isSaving}>
						{#if isSaving}
							<span class="spinner small"></span>
						{:else}
							{m.admin_transfer()}
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		backdrop-filter: blur(2px);
	}

	.modal {
		background: white;
		border-radius: 10px;
		width: 100%;
		max-width: 600px;
		min-height: 350px;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
	}

	.modal-overlay[data-theme='dark'] .modal {
		background: #1a2332;
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid #e5e7eb;
		background: #f8fafc;
	}

	.modal-overlay[data-theme='dark'] .modal-header {
		background: #0f1419;
		border-color: #2d3748;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: #1f2937;
	}

	.modal-overlay[data-theme='dark'] .modal-header h2 {
		color: #e5e7eb;
	}

	.close-btn {
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.close-btn svg {
		width: 16px;
		height: 16px;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.modal-overlay[data-theme='dark'] .close-btn:hover {
		background: #374151;
		color: #e5e7eb;
	}

	/* Content */
	.modal-content {
		padding: 1rem;
		overflow: hidden;
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	/* Columns */
	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
		overflow: hidden;
	}

	.column-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #e5e7eb;
		flex-shrink: 0;
	}

	.admins-scroll {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		padding-right: 0.25rem;
	}

	.admins-scroll::-webkit-scrollbar {
		width: 4px;
	}

	.admins-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.admins-scroll::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 2px;
	}

	.modal-overlay[data-theme='dark'] .admins-scroll::-webkit-scrollbar-thumb {
		background: #4b5563;
	}

	.modal-overlay[data-theme='dark'] .column-header {
		border-color: #374151;
	}

	.column-title {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #6b7280;
	}

	.modal-overlay[data-theme='dark'] .column-title {
		color: #9ca3af;
	}

	.badge {
		background: #e5e7eb;
		color: #4b5563;
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border-radius: 10px;
	}

	.modal-overlay[data-theme='dark'] .badge {
		background: #374151;
		color: #9ca3af;
	}

	/* Admin Rows */
	.admin-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem;
		border-radius: 6px;
		background: #f9fafb;
	}

	.admin-row.owner {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1));
		border: 1px solid rgba(251, 191, 36, 0.3);
	}

	.modal-overlay[data-theme='dark'] .admin-row {
		background: #0f1419;
	}

	.modal-overlay[data-theme='dark'] .admin-row.owner {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.1));
		border-color: rgba(251, 191, 36, 0.4);
	}

	.admin-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea, #764ba2);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
	}

	.admin-avatar.small {
		width: 26px;
		height: 26px;
	}

	.admin-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.admin-avatar span {
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.admin-avatar.small span {
		font-size: 0.65rem;
	}

	.admin-details {
		flex: 1;
		min-width: 0;
	}

	.admin-name {
		display: block;
		font-size: 0.8rem;
		font-weight: 500;
		color: #1f2937;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.modal-overlay[data-theme='dark'] .admin-name {
		color: #e5e7eb;
	}

	.owner-badge {
		font-size: 0.65rem;
		color: #b45309;
	}

	.modal-overlay[data-theme='dark'] .owner-badge {
		color: #fbbf24;
	}

	.row-actions {
		display: flex;
		gap: 0.25rem;
	}

	.icon-action {
		width: 26px;
		height: 26px;
		border: none;
		background: transparent;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.icon-action svg {
		width: 14px;
		height: 14px;
	}

	.icon-action.transfer {
		color: #6366f1;
	}

	.icon-action.transfer:hover {
		background: rgba(99, 102, 241, 0.1);
	}

	.icon-action.remove {
		color: #ef4444;
	}

	.icon-action.remove:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	.icon-action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Search & List */
	.search-input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 0.8rem;
		background: white;
		color: #1f2937;
	}

	.search-input:focus {
		outline: none;
		border-color: #667eea;
	}

	.modal-overlay[data-theme='dark'] .search-input {
		background: #0f1419;
		border-color: #374151;
		color: #e5e7eb;
	}

	.admin-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 180px;
		overflow-y: auto;
	}

	.selectable-admin {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border: none;
		background: #f9fafb;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.selectable-admin:hover {
		background: #f3f4f6;
	}

	.selectable-admin.selected {
		background: rgba(99, 102, 241, 0.1);
	}

	.modal-overlay[data-theme='dark'] .selectable-admin {
		background: #0f1419;
	}

	.modal-overlay[data-theme='dark'] .selectable-admin:hover {
		background: #1a2332;
	}

	.modal-overlay[data-theme='dark'] .selectable-admin.selected {
		background: rgba(99, 102, 241, 0.2);
	}

	.check-box {
		width: 16px;
		height: 16px;
		border: 2px solid #d1d5db;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.check-box.checked {
		background: #6366f1;
		border-color: #6366f1;
		color: white;
	}

	.check-box svg {
		width: 12px;
		height: 12px;
	}

	.modal-overlay[data-theme='dark'] .check-box {
		border-color: #4b5563;
	}

	.add-btn {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: all 0.15s;
	}

	.add-btn:hover:not(:disabled) {
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.add-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.empty-hint {
		font-size: 0.75rem;
		color: #9ca3af;
		text-align: center;
		padding: 1rem;
	}

	/* Message */
	.message {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		text-align: center;
	}

	.message.error {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}

	.message.success {
		background: #f0fdf4;
		color: #16a34a;
		border: 1px solid #bbf7d0;
	}

	.modal-overlay[data-theme='dark'] .message.error {
		background: rgba(220, 38, 38, 0.1);
		border-color: rgba(220, 38, 38, 0.3);
	}

	.modal-overlay[data-theme='dark'] .message.success {
		background: rgba(22, 163, 74, 0.1);
		border-color: rgba(22, 163, 74, 0.3);
	}

	/* Confirm Modal */
	.confirm-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
	}

	.confirm-modal {
		background: white;
		padding: 1.25rem;
		border-radius: 10px;
		max-width: 360px;
		width: 90%;
	}

	.modal-overlay[data-theme='dark'] .confirm-modal {
		background: #1a2332;
	}

	.confirm-modal h3 {
		margin: 0 0 0.5rem 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: #1f2937;
	}

	.modal-overlay[data-theme='dark'] .confirm-modal h3 {
		color: #e5e7eb;
	}

	.confirm-modal p {
		margin: 0 0 1rem 0;
		font-size: 0.85rem;
		color: #6b7280;
	}

	.modal-overlay[data-theme='dark'] .confirm-modal p {
		color: #9ca3af;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		margin-bottom: 1rem;
		cursor: pointer;
		color: #374151;
	}

	.modal-overlay[data-theme='dark'] .checkbox-row {
		color: #d1d5db;
	}

	.checkbox-row input {
		width: 16px;
		height: 16px;
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn {
		flex: 1;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		transition: all 0.15s;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn.secondary {
		background: #f3f4f6;
		color: #374151;
	}

	.btn.secondary:hover:not(:disabled) {
		background: #e5e7eb;
	}

	.modal-overlay[data-theme='dark'] .btn.secondary {
		background: #374151;
		color: #e5e7eb;
	}

	.btn.primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
	}

	.btn.primary:hover:not(:disabled) {
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
	}

	/* Spinner */
	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(99, 102, 241, 0.2);
		border-top-color: #6366f1;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.spinner.small {
		width: 14px;
		height: 14px;
		border-width: 2px;
		border-color: rgba(255, 255, 255, 0.3);
		border-top-color: white;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Responsive */
	@media (max-width: 550px) {
		.columns {
			grid-template-columns: 1fr;
		}

		.modal {
			max-height: 90vh;
		}
	}
</style>
