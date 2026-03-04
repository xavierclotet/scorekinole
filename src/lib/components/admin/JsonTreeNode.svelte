<script lang="ts">
	import JsonTreeNode from './JsonTreeNode.svelte';

	interface Props {
		nodeKey: string;
		value: any;
		depth?: number;
		selectable?: boolean;
		selectedKeys?: Set<string>;
		onToggleKey?: (key: string) => void;
	}

	let {
		nodeKey,
		value,
		depth = 0,
		selectable = false,
		selectedKeys = new Set(),
		onToggleKey
	}: Props = $props();

	const initialDepth = depth;
	let expanded = $state(initialDepth < 1);

	let isObject = $derived(value !== null && typeof value === 'object' && !Array.isArray(value));
	let isArray = $derived(Array.isArray(value));
	let isExpandable = $derived(isObject || isArray);

	let childEntries = $derived(
		isObject
			? Object.entries(value)
			: isArray
				? value.map((v: any, i: number) => [String(i), v])
				: []
	);

	let previewLabel = $derived(
		isArray
			? `[${value.length}]`
			: isObject
				? `{${Object.keys(value).length}}`
				: ''
	);

	let valueType = $derived(
		value === null
			? 'null'
			: typeof value === 'boolean'
				? 'boolean'
				: typeof value === 'number'
					? 'number'
					: typeof value === 'string'
						? 'string'
						: 'other'
	);

	function displayValue(val: any): string {
		if (val === null) return 'null';
		if (typeof val === 'string') return `"${val.length > 80 ? val.slice(0, 80) + '…' : val}"`;
		return String(val);
	}
</script>

<div class="tree-node" style="padding-left: {depth * 1.25}rem">
	<div class="tree-row">
		{#if selectable && depth === 1}
			<input
				type="checkbox"
				checked={selectedKeys.has(nodeKey)}
				onchange={() => onToggleKey?.(nodeKey)}
				class="tree-checkbox"
			/>
		{/if}

		{#if isExpandable}
			<button class="tree-toggle" onclick={() => (expanded = !expanded)}>
				<span class={['tree-chevron', expanded && 'expanded']}>▶</span>
			</button>
		{:else}
			<span class="tree-spacer"></span>
		{/if}

		<span class="tree-key">{nodeKey}</span>

		{#if isExpandable}
			<span class="tree-preview">{previewLabel}</span>
		{:else}
			<span class="tree-colon">: </span>
			<span class={['tree-value', `type-${valueType}`]}>{displayValue(value)}</span>
		{/if}
	</div>

	{#if isExpandable && expanded}
		<div class="tree-children">
			{#each childEntries as [childKey, childValue] (childKey)}
				<JsonTreeNode
					nodeKey={childKey}
					value={childValue}
					depth={depth + 1}
					{selectable}
					{selectedKeys}
					{onToggleKey}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tree-node {
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 12.5px;
		line-height: 1.6;
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: 4px;
		border-radius: 4px;
		padding: 1px 4px;
		transition: background 0.15s;
	}

	.tree-row:hover {
		background: color-mix(in srgb, var(--muted) 40%, transparent);
	}

	.tree-checkbox {
		width: 14px;
		height: 14px;
		accent-color: var(--primary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.tree-toggle {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-foreground);
		flex-shrink: 0;
	}

	.tree-chevron {
		display: inline-block;
		font-size: 9px;
		transition: transform 0.15s ease;
	}

	.tree-chevron.expanded {
		transform: rotate(90deg);
	}

	.tree-spacer {
		width: 16px;
		flex-shrink: 0;
	}

	.tree-key {
		color: var(--foreground);
		font-weight: 500;
		white-space: nowrap;
	}

	.tree-colon {
		color: var(--muted-foreground);
	}

	.tree-preview {
		color: var(--muted-foreground);
		font-size: 11px;
		opacity: 0.7;
	}

	.tree-value {
		word-break: break-all;
	}

	.tree-value.type-string {
		color: #22863a;
	}

	:global(.dark) .tree-value.type-string {
		color: #7ee787;
	}

	.tree-value.type-number {
		color: #005cc5;
	}

	:global(.dark) .tree-value.type-number {
		color: #79c0ff;
	}

	.tree-value.type-boolean {
		color: #d97706;
	}

	:global(.dark) .tree-value.type-boolean {
		color: #fbbf24;
	}

	.tree-value.type-null {
		color: var(--muted-foreground);
		font-style: italic;
	}

	.tree-children {
		border-left: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
		margin-left: 8px;
	}
</style>
