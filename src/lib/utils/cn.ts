import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Snippet } from 'svelte';

/**
 * Merge Tailwind CSS classes with intelligent conflict resolution.
 * Used by shadcn-svelte components for class composition.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithoutChild<T> = Omit<T, "child">;
export type WithoutChildren<T> = Omit<T, "children">;
export type WithoutChildrenOrChild<T> = Omit<T, "children" | "child">;

/**
 * Utility type for components that accept an element reference.
 * Used by shadcn-svelte components for ref binding.
 */
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & {
	ref?: E | null;
	children?: Snippet;
};
