import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with intelligent conflict resolution.
 * Used by shadcn-svelte components for class composition.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
