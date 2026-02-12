# Development Guide

Technical documentation for developers working on ScoreCroki.

## Tech Stack

### Core Technologies
- **Framework**: SvelteKit with Svelte 5 (runes syntax)
- **Language**: TypeScript
- **Build**: Vite 6.x
- **Mobile**: Capacitor 6.x (Android)
- **Backend**: Firebase (Auth, Firestore, Storage)
- **i18n**: Paraglide (inlang)

## Styling Architecture

The project uses a **hybrid styling approach** for gradual migration:

| System | Usage | Location |
|--------|-------|----------|
| **Component-scoped CSS** | Existing components | `<style>` in `.svelte` files |
| **Tailwind CSS v4** | New components & utilities | `class="..."` attributes |
| **shadcn-svelte** | UI component library | `$lib/components/ui/` |

### Adding shadcn Components

```bash
# Add a new component
npx shadcn-svelte@latest add button
npx shadcn-svelte@latest add dialog
npx shadcn-svelte@latest add card

# Use in your component
import { Button } from '$lib/components/ui/button';
```

### Tailwind Utilities

Tailwind v4 utilities are available everywhere:

```svelte
<div class="flex items-center gap-4 p-4 bg-card rounded-lg">
  <span class="text-muted-foreground">Hello</span>
</div>
```

### Color System

The app defines semantic colors that work with both systems:

| Tailwind Class | CSS Variable | Usage |
|----------------|--------------|-------|
| `bg-background` | `--background` | Page background |
| `bg-card` | `--card` | Card/modal backgrounds |
| `text-foreground` | `--foreground` | Primary text |
| `text-muted-foreground` | `--muted-foreground` | Secondary text |
| `bg-primary` | `--primary` | Primary actions (green) |
| `bg-destructive` | `--destructive` | Destructive actions (red) |

Legacy CSS variables (`--bg-primary`, `--accent-green`, etc.) are preserved for existing components.

### Configuration Files

| File | Purpose |
|------|---------|
| `src/app.css` | Tailwind imports + CSS variables + custom styles |
| `components.json` | shadcn-svelte configuration |
| `src/lib/utils/cn.ts` | Class merging utility |

## Project Structure

See [CLAUDE.md](../CLAUDE.md) for detailed project structure and architecture documentation.

## Related Documentation

- [TIEBREAKER.md](TIEBREAKER.md) - Tiebreaker rules for tournaments
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment instructions
- [FIRESTORE_INDEXES.md](../FIRESTORE_INDEXES.md) - Firestore index configuration
