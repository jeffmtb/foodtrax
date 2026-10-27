import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecipesPage from '../../routes/(household)/recipes/+page.svelte';

const firestore = vi.hoisted(() => ({ onSnapshot: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	collection: vi.fn(),
	onSnapshot: firestore.onSnapshot
}));
vi.mock('$app/paths', () => ({
	resolve: (route: string) => route.replace('/(household)', '') || '/'
}));

beforeEach(() => {
	firestore.onSnapshot.mockReset().mockReturnValue(vi.fn());
	vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

function emptySnapshot(fromCache: boolean) {
	firestore.onSnapshot.mock.calls[0][2]({
		docs: [],
		empty: true,
		metadata: { fromCache }
	});
}

describe('Recipe collection states', () => {
	it('shows the first-recipe action for a successful empty server result', async () => {
		await render(RecipesPage);
		emptySnapshot(false);
		await expect.element(page.getByRole('heading', { name: 'No recipes yet' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'Create your first recipe' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('waits for the server before declaring an empty local result to be no recipes', async () => {
		await render(RecipesPage);
		emptySnapshot(true);
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Connecting to check your recipes');
		await expect
			.element(page.getByRole('heading', { name: 'No recipes yet' }))
			.not.toBeInTheDocument();
		emptySnapshot(false);
		await expect.element(page.getByRole('heading', { name: 'No recipes yet' })).toBeInTheDocument();
	});

	it('shows offline recovery rather than an empty collection when no server result is available', async () => {
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		await render(RecipesPage);
		emptySnapshot(true);
		await expect.element(page.getByRole('status')).toHaveTextContent('You’re offline');
		await expect
			.element(page.getByRole('heading', { name: 'No recipes yet' }))
			.not.toBeInTheDocument();
	});

	it.each([
		['permission-denied', 'check recipe access'],
		['unavailable', 'internet connection']
	])('explains a %s failure without claiming the collection is empty', async (code, message) => {
		await render(RecipesPage);
		firestore.onSnapshot.mock.calls[0][3]({ code });
		await expect.element(page.getByRole('alert')).toHaveTextContent(message);
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'No recipes yet' }))
			.not.toBeInTheDocument();
	});
});
