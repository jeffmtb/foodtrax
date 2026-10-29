import {
	addDoc,
	collection,
	doc,
	getDocs,
	runTransaction,
	serverTimestamp,
	writeBatch,
	type Firestore,
	type Timestamp
} from 'firebase/firestore';

export const MAX_RECIPE_TITLE = 100;
export const MAX_INGREDIENT_LENGTH = 80;
export const MAX_INGREDIENTS = 100;
export const MAX_INSTRUCTIONS_LENGTH = 10_000;

export type RecipeInput = {
	title: string;
	ingredientsText: string;
	instructions: string;
};

export type Recipe = RecipeInput & {
	id: string;
	version: number;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};

export function ingredientLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function validateRecipe(input: RecipeInput): string | null {
	if (!input.title.trim()) return 'Give your recipe a name.';
	if (input.title.trim().length > MAX_RECIPE_TITLE)
		return 'Keep the recipe name to 100 characters.';
	const ingredients = ingredientLines(input.ingredientsText);
	if (!ingredients.length) return 'Add at least one ingredient.';
	if (ingredients.length > MAX_INGREDIENTS) return 'Use up to 100 ingredients per recipe.';
	const longLine = ingredients.findIndex((line) => line.length > MAX_INGREDIENT_LENGTH);
	if (longLine !== -1)
		return `Ingredient ${longLine + 1} is too long. Keep each ingredient to 80 characters so it fits your grocery list.`;
	if (input.instructions.length > MAX_INSTRUCTIONS_LENGTH)
		return 'Keep instructions and notes to 10,000 characters.';
	return null;
}

export function normalizeRecipe(input: RecipeInput): RecipeInput {
	const error = validateRecipe(input);
	if (error) throw new Error(error);
	return {
		title: input.title.trim(),
		ingredientsText: ingredientLines(input.ingredientsText).join('\n'),
		instructions: input.instructions.trim()
	};
}

function ingredientKey(text: string) {
	return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Compare the complete text, including measurements. Different amounts stay separate.
export function newGroceryIngredients(ingredients: string[], existingNames: string[]): string[] {
	const seen = new Set(existingNames.map(ingredientKey));
	return ingredients
		.map((name) => name.trim())
		.filter((name) => {
			const key = ingredientKey(name);
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export async function createRecipe(db: Firestore, input: RecipeInput): Promise<string> {
	const recipe = normalizeRecipe(input);
	const ref = await addDoc(collection(db, 'recipes'), {
		...recipe,
		version: 1,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});
	return ref.id;
}

export async function updateRecipe(db: Firestore, id: string, input: RecipeInput, version: number) {
	const recipe = normalizeRecipe(input);
	const ref = doc(db, 'recipes', id);
	await runTransaction(db, async (transaction) => {
		const snapshot = await transaction.get(ref);
		if (!snapshot.exists())
			throw new Error('This recipe was deleted. Copy your changes before leaving this page.');
		if (snapshot.data().version !== version) {
			throw new Error(
				'Someone else updated this recipe. Copy your changes, then cancel editing to see the latest version.'
			);
		}
		transaction.update(ref, { ...recipe, version: version + 1, updatedAt: serverTimestamp() });
	});
}

export async function deleteRecipe(db: Firestore, id: string, version: number) {
	const ref = doc(db, 'recipes', id);
	await runTransaction(db, async (transaction) => {
		const snapshot = await transaction.get(ref);
		if (!snapshot.exists()) return;
		if (snapshot.data().version !== version)
			throw new Error('This recipe has changed. Review the latest version before deleting it.');
		transaction.delete(ref);
	});
}

export async function addRecipeIngredients(db: Firestore, ingredients: string[]) {
	if (
		ingredients.length === 0 ||
		ingredients.length > MAX_INGREDIENTS ||
		ingredients.some(
			(line) => !line.trim() || line.trim().length > MAX_INGREDIENT_LENGTH || /[\r\n]/.test(line)
		)
	) {
		throw new Error('Select between 1 and 100 valid ingredients.');
	}
	const groceries = collection(db, 'groceryItems');
	const snapshot = await getDocs(groceries);
	const existingItems = snapshot.docs.slice().sort((a, b) => {
		const aOrder = a.data().sortOrder;
		const bOrder = b.data().sortOrder;
		if (typeof aOrder === 'number' && typeof bOrder === 'number' && aOrder !== bOrder) {
			return aOrder - bOrder;
		}
		const aCreatedAt = a.data().createdAt as Timestamp | undefined;
		const bCreatedAt = b.data().createdAt as Timestamp | undefined;
		if (!aCreatedAt) return bCreatedAt ? 1 : a.id.localeCompare(b.id);
		if (!bCreatedAt) return -1;
		return (
			aCreatedAt.seconds - bCreatedAt.seconds ||
			aCreatedAt.nanoseconds - bCreatedAt.nanoseconds ||
			a.id.localeCompare(b.id)
		);
	});
	const names = newGroceryIngredients(
		ingredients,
		existingItems.map((item) => item.data().name as string)
	);
	if (names.length) {
		const batch = writeBatch(db);
		const firstSortOrder =
			existingItems.reduce((highest, item) => Math.max(highest, item.data().sortOrder ?? -1), -1) + 1;
		names.forEach((name, index) => {
			batch.set(doc(groceries), {
				name,
				count: 1,
				inCart: false,
				createdAt: serverTimestamp(),
				sortOrder: firstSortOrder + index
			});
		});
		await batch.commit();
	}
	return { added: names.length, skipped: ingredients.length - names.length };
}
