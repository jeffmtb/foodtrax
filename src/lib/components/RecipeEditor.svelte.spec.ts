import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecipeEditor from './RecipeEditor.svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));

describe('RecipeEditor', () => {
	it('edits a recipe and passes measured ingredient text through unchanged', async () => {
		const save = vi.fn().mockResolvedValue(undefined);
		const done = vi.fn();
		render(RecipeEditor, {
			initial: { title: 'Soup', ingredientsText: '400 g tomatoes', instructions: 'Simmer.' },
			onsave: save,
			ondone: done,
			oncancel: vi.fn()
		});
		await page.getByRole('textbox', { name: 'Recipe name' }).fill('Tomato soup');
		await page
			.getByRole('textbox', { name: 'Ingredients', exact: true })
			.fill('400 g tomatoes\n½ cup cream');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		expect(save).toHaveBeenCalledWith({
			title: 'Tomato soup',
			ingredientsText: '400 g tomatoes\n½ cup cream',
			instructions: 'Simmer.'
		});
		expect(done).toHaveBeenCalledOnce();
	});

	it('keeps invalid ingredient text editable without saving or truncating it', async () => {
		const save = vi.fn();
		render(RecipeEditor, { onsave: save, ondone: vi.fn(), oncancel: vi.fn() });
		await page.getByRole('textbox', { name: 'Recipe name' }).fill('Soup');
		await page.getByRole('textbox', { name: 'Ingredients', exact: true }).fill('a'.repeat(81));
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Ingredient 1 is too long');
		expect(save).not.toHaveBeenCalled();
		await expect
			.element(page.getByRole('textbox', { name: 'Ingredients', exact: true }))
			.toHaveValue('a'.repeat(81));
	});

	it('retains changes and allows retry after a failed save', async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error('Someone else updated this recipe.'))
			.mockResolvedValueOnce(undefined);
		const done = vi.fn();
		render(RecipeEditor, {
			initial: { title: 'Soup', ingredientsText: '2 carrots', instructions: '' },
			onsave: save,
			ondone: done,
			oncancel: vi.fn()
		});
		await page.getByRole('textbox', { name: 'Ingredients', exact: true }).fill('3 carrots');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Someone else updated');
		await expect
			.element(page.getByRole('textbox', { name: 'Ingredients', exact: true }))
			.toHaveValue('3 carrots');
		expect(done).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Save recipe' }).click();
		expect(done).toHaveBeenCalledOnce();
	});
});
