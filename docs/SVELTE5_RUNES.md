# Svelte 5 Runes Reference

This project uses **Svelte 5** with the runes syntax. Understanding the runes is critical for writing correct code.

**Official Migration Guide**: https://svelte.dev/docs/svelte/v5-migration-guide

## Core Runes

### `$props()` - Component Props
```svelte
<script lang="ts">
  interface Props {
    name: string;
    count?: number;
    onSave?: () => void;
  }

  let { name, count = 0, onSave }: Props = $props();
</script>
```

### `$state()` - Reactive State
```typescript
let count = $state(0);
let items = $state<string[]>([]);
let selectedIds = $state<Set<number>>(new Set());
```

### `$derived()` - Computed Values
```typescript
let doubled = $derived(count * 2);
let filtered = $derived(items.filter(i => i.active));

// For complex computations, use IIFE:
let canSave = $derived((() => {
  if (someCondition) {
    return validateA();
  }
  return validateB();
})());
```

### `$effect()` - Side Effects
```typescript
$effect(() => {
  if (count > 10) {
    console.log('Count exceeded 10');
  }
});
```

### `$inspect()` - Debugging Reactive State

**Use `$inspect()` instead of `console.log()` when debugging reactive state.** It re-runs automatically whenever its arguments change, tracks state deeply, and is stripped in production.

```typescript
let count = $state(0);
$inspect('count:', count); // Logs every time count changes
$inspect('Debug state:', { count, items, isValid });
```

## Critical Rule: `$derived` vs `$effect`

**NEVER use `$effect` to synchronize state. Use `$derived` instead.**

```typescript
// ❌ WRONG
let canSave = $state(false);
$effect(() => { canSave = someCondition && otherCondition; });

// ✅ CORRECT
let canSave = $derived(someCondition && otherCondition);
```

**When to use `$effect`**: DOM manipulation, external APIs, logging, subscriptions.
**When to use `$derived`**: Computed values, filtered data, validation, conditional flags.

**NEVER reassign a `$derived` value** - include all transformations in the derivation:
```typescript
// ❌ items = [...items].sort(); // Assignment is ignored!
// ✅
let items = $derived(source.filter(x => x.active).sort());
```

## Critical Rule: `{@const}` Placement

`{@const}` can ONLY be the immediate child of: `{#snippet}`, `{#if}/{:else if}/{:else}`, `{#each}`, `{:then}/{:catch}`, `<svelte:fragment>`, `<svelte:boundary>`, `<Component>`.

```svelte
<!-- ✅ CORRECT - @const as direct child of {#each} -->
{#each items as item}
  {@const calculated = computeValue(item)}
  <tr><td>{calculated}</td></tr>
{/each}

<!-- ❌ WRONG - @const inside HTML elements -->
{#each items as item}
  <tr><td>{@const calculated = computeValue(item)}{calculated}</td></tr>
{/each}
```

## Event Handlers

Use standard DOM event attributes (not `on:` directives):
```svelte
<button onclick={handleClick}>Click</button>
<button onclick={(e) => { e.stopPropagation(); handleClick(e); }}>Click</button>
<input oninput={handleInput} onkeydown={handleKeydown} />
```

## Event Dispatchers → Callback Props

```svelte
<script lang="ts">
  interface Props {
    onsave?: (data: Data) => void;
    onclose?: () => void;
  }

  let { onsave, onclose }: Props = $props();

  function handleSave() {
    onsave?.(data);
  }
</script>

<!-- Parent: -->
<ChildComponent onsave={handleSave} onclose={handleClose} />
```

## Store Subscriptions in Runes Mode

Reading stores with `$` prefix works the same:
```typescript
import { gameSettings } from '$lib/stores/gameSettings';
<span>Language: {$gameSettings.language}</span>
```

## SvelteKit 2.x Page State

Use `$app/state` (NOT `$app/stores`):
```typescript
import { page } from '$app/state';
let id = $derived(page.params.id);       // No $ prefix needed
let path = $derived(page.url.pathname);  // No $ prefix needed
```
