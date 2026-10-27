import { describe, expect, it } from 'vitest';
import { ingredientLines, newGroceryIngredients, normalizeRecipe, validateRecipe } from './recipes';

const recipe = { title: 'Soup', ingredientsText: '400 g tomatoes\n½ cup cream', instructions: '' };

describe('recipe ingredient handling', () => {
	it('preserves measurements and line order while removing blank lines and pasted CRLFs', () => {
		expect(ingredientLines('  ½ cup flour  \r\n\r\n 2 eggs\n400 g tomatoes ')).toEqual([
			'½ cup flour',
			'2 eggs',
			'400 g tomatoes'
		]);
		expect(
			normalizeRecipe({
				...recipe,
				title: ' Soup ',
				ingredientsText: ' 400 g tomatoes\r\n\n½ cup cream ',
				instructions: ' Simmer. '
			})
		).toEqual({
			title: 'Soup',
			ingredientsText: '400 g tomatoes\n½ cup cream',
			instructions: 'Simmer.'
		});
	});

	it('skips complete text matches, including repetitions, while retaining different measurements', () => {
		expect(
			newGroceryIngredients(
				['½ cup flour', '2 eggs', '2  EGGS', '1 cup flour', 'Salt'],
				['  ½ CUP flour ', 'salt']
			)
		).toEqual(['2 eggs', '1 cup flour']);
	});

	it('requires a name and ingredients', () => {
		expect(validateRecipe({ ...recipe, title: ' ' })).toBe('Give your recipe a name.');
		expect(validateRecipe({ ...recipe, ingredientsText: '\n \n' })).toBe(
			'Add at least one ingredient.'
		);
	});

	it('rejects overlong ingredient text instead of truncating measurements', () => {
		expect(validateRecipe({ ...recipe, ingredientsText: `2 eggs\n${'a'.repeat(81)}` })).toContain(
			'Ingredient 2'
		);
		expect(() => normalizeRecipe({ ...recipe, ingredientsText: 'a'.repeat(81) })).toThrow(
			'80 characters'
		);
	});

	it('accepts boundary values and rejects excess title, ingredient count, and notes', () => {
		expect(
			validateRecipe({
				title: 'a'.repeat(100),
				ingredientsText: Array(100).fill('a'.repeat(80)).join('\n'),
				instructions: 'a'.repeat(10000)
			})
		).toBeNull();
		expect(validateRecipe({ ...recipe, title: 'a'.repeat(101) })).toContain('100 characters');
		expect(
			validateRecipe({ ...recipe, ingredientsText: Array(101).fill('Salt').join('\n') })
		).toContain('100 ingredients');
		expect(validateRecipe({ ...recipe, instructions: 'a'.repeat(10001) })).toContain('10,000');
	});
});
