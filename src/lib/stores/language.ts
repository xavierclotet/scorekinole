import { writable } from 'svelte/store';
import { setLocale } from '$lib/paraglide/runtime.js';

export type Language = 'es' | 'ca' | 'en';

// Store for current language
const _language = writable<Language>('es');

// Wrapper that syncs with Paraglide
export const language = {
    subscribe: _language.subscribe,
    set: (lang: Language) => {
        _language.set(lang);
        // Sync with Paraglide (without reload to avoid page refresh)
        setLocale(lang);
    },
    update: (fn: (lang: Language) => Language) => {
        _language.update((current) => {
            const newLang = fn(current);
            setLocale(newLang);
            return newLang;
        });
    }
};

