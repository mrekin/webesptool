import { setupI18n } from '$lib/i18n';

// Initialize i18n on server side
export async function handle({ event, resolve }) {
	await setupI18n();

	const response = await resolve(event);
	return response;
}