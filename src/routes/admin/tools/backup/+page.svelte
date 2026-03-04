<script lang="ts">
	import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import JsonTreeNode from '$lib/components/admin/JsonTreeNode.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { goto } from '$app/navigation';
	import { adminTheme } from '$lib/stores/theme';
	import { ChevronLeft, Download, Upload, LoaderCircle, CircleCheck, CircleAlert, Eye, X } from '@lucide/svelte';
	import {
		FIRESTORE_COLLECTIONS,
		exportCollections,
		restoreDocuments,
		downloadJson,
		type BackupData
	} from '$lib/firebase/backup';

	// Tab state
	let activeTab: 'export' | 'import' = $state('export');

	// Export state
	let selectedCollections = $state(new Set<string>(FIRESTORE_COLLECTIONS as unknown as string[]));
	let isExporting = $state(false);
	let exportResult: { docCount: number; collections: string[] } | null = $state(null);

	// Preview state (browse live Firestore data)
	let previewData: Record<string, Record<string, any>> = $state({});
	let previewLoading = $state('');
	let previewError = $state('');

	// Import state
	let backupData: BackupData | null = $state(null);
	let importError = $state('');
	let selectedDocs = $state(new Set<string>());

	// Restore state
	let restoreTarget = $state('');
	let restoreDialogOpen = $state(false);
	let isRestoring = $state(false);
	let restoreProgress = $state(0);
	let restoreTotal = $state(0);
	let restoreResult: { collection: string; count: number } | null = $state(null);

	// Export
	function toggleCollection(name: string) {
		const next = new Set(selectedCollections);
		if (next.has(name)) next.delete(name);
		else next.add(name);
		selectedCollections = next;
	}

	function toggleAll() {
		if (selectedCollections.size === FIRESTORE_COLLECTIONS.length) {
			selectedCollections = new Set();
		} else {
			selectedCollections = new Set(FIRESTORE_COLLECTIONS as unknown as string[]);
		}
	}

	async function previewCollection(name: string) {
		if (previewData[name]) {
			const next = { ...previewData };
			delete next[name];
			previewData = next;
			return;
		}
		previewLoading = name;
		previewError = '';
		try {
			const result = await exportCollections([name]);
			previewData = { ...previewData, [name]: result.data[name] };
		} catch (err) {
			console.error('Preview error:', err);
			previewError = `Error al cargar ${name}`;
		} finally {
			previewLoading = '';
		}
	}

	async function handleExport() {
		if (selectedCollections.size === 0) return;
		isExporting = true;
		exportResult = null;
		try {
			const data = await exportCollections([...selectedCollections]);
			const date = new Date().toISOString().split('T')[0];
			downloadJson(data, `scorekinole-backup-${date}.json`);
			exportResult = {
				docCount: data.metadata.documentCount,
				collections: data.metadata.collections
			};
		} catch (err) {
			console.error('Export error:', err);
		} finally {
			isExporting = false;
		}
	}

	// Import
	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importError = '';
		backupData = null;
		selectedDocs = new Set();

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const parsed = JSON.parse(e.target?.result as string);
				if (!parsed.metadata || !parsed.data) {
					importError = 'Archivo de backup inválido: falta metadata o data';
					return;
				}
				backupData = parsed as BackupData;
			} catch {
				importError = 'Error al leer el archivo JSON';
			}
		};
		reader.readAsText(file);
	}

	function getDocCount(collectionData: Record<string, any>): number {
		return Object.keys(collectionData).length;
	}

	function openRestoreDialog(collectionName: string) {
		restoreTarget = collectionName;
		restoreDialogOpen = true;
		restoreResult = null;
	}

	async function confirmRestore() {
		if (!backupData || !restoreTarget) return;

		const docs = backupData.data[restoreTarget];
		if (!docs) return;

		isRestoring = true;
		restoreProgress = 0;
		restoreTotal = Object.keys(docs).length;

		try {
			const collectionDocKeys = Object.keys(docs);
			const selectedForCollection = collectionDocKeys.filter((k) => selectedDocs.has(`${restoreTarget}/${k}`));

			const docsToRestore =
				selectedForCollection.length > 0
					? Object.fromEntries(selectedForCollection.map((k) => [k, docs[k]]))
					: docs;

			restoreTotal = Object.keys(docsToRestore).length;

			const count = await restoreDocuments(restoreTarget, docsToRestore, (restored, total) => {
				restoreProgress = restored;
				restoreTotal = total;
			});

			restoreResult = { collection: restoreTarget, count };
		} catch (err) {
			console.error('Restore error:', err);
			importError = `Error al restaurar: ${err}`;
		} finally {
			isRestoring = false;
		}
	}

	function toggleDocSelection(docPath: string) {
		const next = new Set(selectedDocs);
		if (next.has(docPath)) next.delete(docPath);
		else next.add(docPath);
		selectedDocs = next;
	}

	function selectedCountForCollection(collectionName: string): number {
		return [...selectedDocs].filter((k) => k.startsWith(collectionName + '/')).length;
	}

	let restoreDocCount = $derived(
		restoreTarget && backupData
			? (() => {
					const docs = backupData.data[restoreTarget];
					if (!docs) return 0;
					const collectionDocKeys = Object.keys(docs);
					const selectedForCollection = collectionDocKeys.filter((k) =>
						selectedDocs.has(`${restoreTarget}/${k}`)
					);
					return selectedForCollection.length > 0 ? selectedForCollection.length : collectionDocKeys.length;
				})()
			: 0
	);
</script>

<SuperAdminGuard>
	<div class="backup-layout" data-theme={$adminTheme}>
		<header class="backup-navbar">
			<nav class="backup-navbar-inner">
				<button onclick={() => goto('/admin')} class="backup-back-btn">
					<span class="backup-back-icon">
						<ChevronLeft size={16} />
					</span>
					<span class="backup-back-label">Admin</span>
				</button>
				<div class="backup-navbar-actions">
					<ThemeToggle />
				</div>
			</nav>
		</header>

		<main class="backup-content">
			<section class="backup-header">
				<h1 class="backup-title">Copias de Seguridad</h1>
				<p class="backup-subtitle">Exporta e importa datos de Firestore</p>
			</section>

			<!-- Tabs -->
			<div class="tab-bar">
				<button
					class={['tab-btn', activeTab === 'export' && 'active']}
					onclick={() => (activeTab = 'export')}
				>
					<Download size={15} />
					Exportar
				</button>
				<button
					class={['tab-btn', activeTab === 'import' && 'active']}
					onclick={() => (activeTab = 'import')}
				>
					<Upload size={15} />
					Importar / Restaurar
				</button>
			</div>

			<!-- Export Tab -->
			{#if activeTab === 'export'}
				<section class="tab-content">
					<div class="section-card">
						<div class="section-card-header">
							<h2>Seleccionar colecciones</h2>
							<button class="link-btn" onclick={toggleAll}>
								{selectedCollections.size === FIRESTORE_COLLECTIONS.length
									? 'Deseleccionar todas'
									: 'Seleccionar todas'}
							</button>
						</div>

						<div class="collection-list">
							{#each FIRESTORE_COLLECTIONS as col (col)}
								<div class="collection-row">
									<div class="collection-row-top">
										<label class={['collection-item', selectedCollections.has(col) && 'selected']}>
											<input
												type="checkbox"
												checked={selectedCollections.has(col)}
												onchange={() => toggleCollection(col)}
											/>
											<span class="collection-name">{col}</span>
										</label>
										<button
											class={['preview-btn', previewData[col] && 'active']}
											onclick={() => previewCollection(col)}
											disabled={previewLoading === col}
										>
											{#if previewLoading === col}
												<LoaderCircle size={14} />
											{:else if previewData[col]}
												<X size={14} />
											{:else}
												<Eye size={14} />
											{/if}
										</button>
									</div>

									{#if previewData[col]}
										<div class="preview-tree">
											<span class="preview-tree-label">
												{Object.keys(previewData[col]).length} documentos
											</span>
											<div class="tree-container">
												<JsonTreeNode
													nodeKey={col}
													value={previewData[col]}
													depth={0}
												/>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>

						{#if previewError}
							<div class="result-banner error" style="margin-top: 8px">
								<CircleAlert size={16} />
								<span>{previewError}</span>
							</div>
						{/if}

						<div class="section-card-footer">
							<Button
								disabled={selectedCollections.size === 0 || isExporting}
								onclick={handleExport}
							>
								{#if isExporting}
									<LoaderCircle size={16} class="animate-spin" />
									Exportando...
								{:else}
									<Download size={16} />
									Exportar {selectedCollections.size} colección{selectedCollections.size !== 1 ? 'es' : ''}
								{/if}
							</Button>
						</div>
					</div>

					{#if exportResult}
						<div class="result-banner success">
							<CircleCheck size={18} />
							<span>
								Backup descargado: <strong>{exportResult.docCount}</strong> documentos
								de <strong>{exportResult.collections.length}</strong> colecciones
							</span>
						</div>
					{/if}
				</section>
			{/if}

			<!-- Import Tab -->
			{#if activeTab === 'import'}
				<section class="tab-content">
					<div class="section-card">
						<h2>Cargar archivo de backup</h2>
						<label class="file-input-label">
							<Upload size={18} />
							<span>Seleccionar archivo .json</span>
							<input
								type="file"
								accept=".json"
								onchange={handleFileSelect}
								class="file-input-hidden"
							/>
						</label>
					</div>

					{#if importError}
						<div class="result-banner error">
							<CircleAlert size={18} />
							<span>{importError}</span>
						</div>
					{/if}

					{#if restoreResult}
						<div class="result-banner success">
							<CircleCheck size={18} />
							<span>
								<strong>{restoreResult.count}</strong> documentos restaurados
								en <strong>{restoreResult.collection}</strong>
							</span>
						</div>
					{/if}

					{#if backupData}
						<div class="section-card">
							<div class="metadata-header">
								<div class="metadata-item">
									<span class="metadata-label">Fecha</span>
									<span class="metadata-value">
										{new Date(backupData.metadata.date).toLocaleString('es-ES')}
									</span>
								</div>
								<div class="metadata-item">
									<span class="metadata-label">Documentos</span>
									<span class="metadata-value">{backupData.metadata.documentCount}</span>
								</div>
								<div class="metadata-item">
									<span class="metadata-label">Colecciones</span>
									<span class="metadata-value">{backupData.metadata.collections.length}</span>
								</div>
							</div>
						</div>

						{#each Object.entries(backupData.data) as [collectionName, collectionData] (collectionName)}
							{@const selectedCount = selectedCountForCollection(collectionName)}
							<div class="section-card collection-section">
								<div class="collection-header">
									<div class="collection-info">
										<h3>{collectionName}</h3>
										<span class="doc-count">{getDocCount(collectionData)} documentos</span>
									</div>
									<div class="collection-actions">
										{#if selectedCount > 0}
											<button class="selected-count-badge" onclick={() => openRestoreDialog(collectionName)}>
												Restaurar {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
											</button>
										{:else}
											<button class="restore-all-btn" onclick={() => openRestoreDialog(collectionName)}>
												Restaurar todos
											</button>
										{/if}
									</div>
								</div>

								<p class="collection-hint">Marca los documentos que quieras restaurar, o pulsa "Restaurar todos"</p>

								<div class="tree-container">
									<JsonTreeNode
										nodeKey={collectionName}
										value={collectionData}
										depth={0}
										selectable={true}
										selectedKeys={new Set(
											[...selectedDocs]
												.filter((k) => k.startsWith(collectionName + '/'))
												.map((k) => k.split('/')[1])
										)}
										onToggleKey={(key) => toggleDocSelection(`${collectionName}/${key}`)}
									/>
								</div>
							</div>
						{/each}
					{/if}
				</section>
			{/if}
		</main>
	</div>
</SuperAdminGuard>

<!-- Restore Confirmation Dialog -->
<Dialog.Root bind:open={restoreDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Restaurar colección</Dialog.Title>
			<Dialog.Description>
				¿Restaurar <strong>{restoreDocCount}</strong> documentos en
				<strong>{restoreTarget}</strong>? Los documentos existentes con el mismo ID serán
				sobrescritos.
			</Dialog.Description>
		</Dialog.Header>

		{#if isRestoring}
			<div class="restore-progress">
				<div class="progress-bar">
					<div
						class="progress-fill"
						style="width: {restoreTotal > 0 ? (restoreProgress / restoreTotal) * 100 : 0}%"
					></div>
				</div>
				<span class="progress-text">{restoreProgress} / {restoreTotal}</span>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (restoreDialogOpen = false)} disabled={isRestoring}>
				Cancelar
			</Button>
			<Button onclick={confirmRestore} disabled={isRestoring}>
				{#if isRestoring}
					<LoaderCircle size={16} class="animate-spin" />
					Restaurando...
				{:else}
					Confirmar
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Layout */
	.backup-layout {
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--background);
		color: var(--foreground);
		font-family: system-ui, -apple-system, sans-serif;
	}

	/* Navbar */
	.backup-navbar {
		position: sticky;
		top: 0;
		z-index: 50;
		width: 100%;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
		background: color-mix(in srgb, var(--background) 85%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	.backup-navbar-inner {
		width: 100%;
		padding: 0 16px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.backup-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted-foreground);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: color 0.2s;
	}

	.backup-back-btn:hover {
		color: var(--primary);
	}

	.backup-back-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--background);
		transition: all 0.2s;
	}

	.backup-back-btn:hover .backup-back-icon {
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	.backup-back-label {
		display: none;
	}

	.backup-navbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* Content */
	.backup-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 720px;
		margin: 0 auto;
		padding: 24px 16px 32px;
		gap: 16px;
		overflow-y: auto;
	}

	/* Header */
	.backup-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.backup-title {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--foreground);
		margin: 0;
		line-height: 1.3;
	}

	.backup-subtitle {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0;
	}

	/* Tabs */
	.tab-bar {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: color-mix(in srgb, var(--muted) 50%, transparent);
		border-radius: 10px;
	}

	.tab-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted-foreground);
		background: none;
		border: none;
		border-radius: 7px;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}

	.tab-btn.active {
		background: var(--background);
		color: var(--foreground);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.tab-btn:not(.active):hover {
		color: var(--foreground);
	}

	/* Tab content */
	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* Section cards */
	.section-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		padding: 16px;
	}

	.section-card h2 {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 12px;
		color: var(--foreground);
	}

	.section-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.section-card-header h2 {
		margin: 0;
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--primary);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}

	.link-btn:hover {
		text-decoration: underline;
	}

	.section-card-footer {
		margin-top: 14px;
		display: flex;
		justify-content: flex-end;
	}

	/* shadcn Button overrides (Tailwind classes don't apply outside primitives) */
	.section-card-footer :global(button) {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		font-size: 13px;
		font-weight: 500;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
	}

	.section-card-footer :global(button:hover) {
		opacity: 0.9;
	}

	.section-card-footer :global(button:disabled) {
		opacity: 0.5;
		pointer-events: none;
	}

	.section-card-footer :global(button svg) {
		flex-shrink: 0;
	}

	/* Collection list */
	.collection-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.collection-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.collection-row-top {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.collection-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--border);
		cursor: pointer;
		transition: all 0.15s;
		font-size: 13px;
		flex: 1;
		min-width: 0;
	}

	.collection-item:hover {
		border-color: color-mix(in srgb, var(--primary) 40%, transparent);
	}

	.collection-item.selected {
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
		background: color-mix(in srgb, var(--primary) 6%, transparent);
	}

	.collection-item input[type='checkbox'] {
		accent-color: var(--primary);
		width: 14px;
		height: 14px;
	}

	.collection-name {
		font-weight: 500;
		color: var(--foreground);
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 12px;
	}

	/* Preview button */
	.preview-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--background);
		color: var(--muted-foreground);
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.preview-btn:hover {
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 6%, transparent);
	}

	.preview-btn.active {
		border-color: var(--primary);
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 10%, transparent);
	}

	.preview-btn:disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	/* Preview tree */
	.preview-tree {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-left: 4px;
	}

	.preview-tree-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* File input */
	.file-input-label {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px;
		border: 2px dashed var(--border);
		border-radius: 10px;
		cursor: pointer;
		color: var(--muted-foreground);
		font-size: 13px;
		font-weight: 500;
		transition: all 0.2s;
	}

	.file-input-label:hover {
		border-color: var(--primary);
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 4%, transparent);
	}

	.file-input-hidden {
		display: none;
	}

	/* Metadata */
	.metadata-header {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}

	.metadata-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metadata-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.metadata-value {
		font-size: 14px;
		font-weight: 600;
		color: var(--foreground);
	}

	/* Collection sections (import tab) */
	.collection-section {
		overflow: hidden;
	}

	.collection-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.collection-info {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.collection-info h3 {
		font-size: 14px;
		font-weight: 600;
		margin: 0;
		color: var(--foreground);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.doc-count {
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.collection-actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.restore-all-btn,
	.selected-count-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 500;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.restore-all-btn {
		background: var(--background);
		color: var(--foreground);
		border: 1px solid var(--border);
	}

	.restore-all-btn:hover {
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
		color: var(--primary);
	}

	.selected-count-badge {
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
	}

	.selected-count-badge:hover {
		opacity: 0.9;
	}

	.collection-hint {
		font-size: 11px;
		color: var(--muted-foreground);
		margin: 0 0 8px;
		font-style: italic;
	}

	.tree-container {
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
		border-radius: 8px;
		padding: 8px;
		background: color-mix(in srgb, var(--muted) 20%, transparent);
	}

	/* Result banners */
	.result-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 10px;
		font-size: 13px;
	}

	.result-banner.success {
		background: color-mix(in srgb, #22c55e 10%, transparent);
		color: #16a34a;
		border: 1px solid color-mix(in srgb, #22c55e 25%, transparent);
	}

	:global(.dark) .result-banner.success {
		color: #4ade80;
	}

	.result-banner.error {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #dc2626;
		border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
	}

	:global(.dark) .result-banner.error {
		color: #f87171;
	}

	/* Restore progress */
	.restore-progress {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 0;
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: var(--muted);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--primary);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 12px;
		color: var(--muted-foreground);
		text-align: center;
	}

	/* Desktop */
	@media (min-width: 540px) {
		.backup-navbar-inner {
			padding: 0 24px;
		}

		.backup-back-label {
			display: inline;
		}

		.backup-content {
			padding: 40px 24px 48px;
		}

		.backup-title {
			font-size: 28px;
		}

		.collection-list {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}

		.collection-row {
			grid-column: span 1;
		}

		/* When preview is open, take full width */
		.collection-row:has(.preview-tree) {
			grid-column: 1 / -1;
		}
	}
</style>
