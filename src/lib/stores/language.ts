import { writable, derived } from 'svelte/store';
import { translations, type Language, type TranslationKey } from '$lib/i18n/translations';

// Store for current language
export const language = writable<Language>('es');

// Derived store for translation function
// This makes translations reactive automatically
export const t = derived(
    language,
    ($lang) => (key: TranslationKey): string => {
        return translations[$lang]?.[key] || key;
    }
);
