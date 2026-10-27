import { describe, expect, it } from 'vitest';
import { recipeLoadErrorMessage } from './recipe-load-errors';

describe('recipe load failures', () => {
	it('distinguishes denied access from a connection failure', () => {
		expect(recipeLoadErrorMessage('permission-denied')).toContain('check recipe access');
		expect(recipeLoadErrorMessage('permission-denied')).not.toContain('internet');
	});

	it.each(['unavailable', 'deadline-exceeded'])('identifies connection errors: %s', (code) => {
		expect(recipeLoadErrorMessage(code)).toContain('internet connection');
	});

	it('offers sign-in recovery for expired authentication', () => {
		expect(recipeLoadErrorMessage('unauthenticated')).toContain('Sign out and sign in again');
	});

	it.each(['resource-exhausted', 'unknown', 'internal', 'not-found'])(
		'never treats a failed request as an empty recipe collection: %s',
		(code) => {
			const message = recipeLoadErrorMessage(code);
			expect(message).not.toContain('No recipes');
			expect(message).not.toContain('internet');
		}
	);
});
