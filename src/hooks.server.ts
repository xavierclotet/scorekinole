import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server.js';

export const handle: Handle = async ({ event, resolve }) => {
	return paraglideMiddleware(event.request, ({ locale }) => {
		// Set locale in locals for access in load functions if needed
		event.locals.locale = locale;

		// Resolve with the potentially modified request
		return resolve(event);
	});
};
