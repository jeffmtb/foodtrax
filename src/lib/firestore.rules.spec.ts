import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	deleteField,
	serverTimestamp,
	Timestamp
} from 'firebase/firestore';
import { deleteGroceryItem, restoreGroceryItem } from './grocery-items';
import { addRecipeIngredients, createRecipe, deleteRecipe, updateRecipe } from './recipes';

const projectId = 'demo-food-trax-rules';
const memberUid = 'grocery-list-member';
const otherUid = 'another-user';
let testEnv: RulesTestEnvironment;

function validGroceryItem() {
	return {
		name: 'Bananas',
		count: 2,
		inCart: false,
		createdAt: Timestamp.now()
	};
}

function validRecipe() {
	return {
		title: 'Tomato soup',
		ingredientsText: '400 g tomatoes\n½ cup cream',
		instructions: 'Simmer until ready.',
		version: 1,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};
}

async function seedMember(uid = memberUid) {
	await testEnv.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), 'groceryListMembers', uid), {
			displayName: 'Test member',
			role: 'member'
		});
	});
}

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId,
		firestore: {
			host: '127.0.0.1',
			port: 8080,
			rules: readFileSync('firestore.rules', 'utf8')
		}
	});
});

afterEach(async () => {
	await testEnv.clearFirestore();
});

afterAll(async () => {
	await testEnv.cleanup();
});

describe('Firestore security rules', () => {
	it('denies grocery list and membership access to signed-out users', async () => {
		const db = testEnv.unauthenticatedContext().firestore();

		await assertFails(getDocs(collection(db, 'groceryItems')));
		await assertFails(setDoc(doc(db, 'groceryItems', 'bananas'), validGroceryItem()));
		await assertFails(getDoc(doc(db, 'groceryListMembers', memberUid)));
	});

	it('denies grocery item access to authenticated users without membership', async () => {
		const db = testEnv.authenticatedContext(otherUid).firestore();

		await assertFails(getDocs(collection(db, 'groceryItems')));
		await assertFails(setDoc(doc(db, 'groceryItems', 'bananas'), validGroceryItem()));
		await assertFails(deleteDoc(doc(db, 'groceryItems', 'bananas')));
	});

	it('allows a member to read, create, update, and delete grocery items', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();
		const itemRef = doc(db, 'groceryItems', 'bananas');

		await assertSucceeds(setDoc(itemRef, validGroceryItem()));
		await assertSucceeds(getDoc(itemRef));
		await assertSucceeds(getDocs(collection(db, 'groceryItems')));
		await assertSucceeds(updateDoc(itemRef, { count: 3 }));
		await assertSucceeds(deleteDoc(itemRef));
	});

	it('deletes a grocery item by its document ID', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();
		const itemsRef = collection(db, 'groceryItems');
		const item = { id: 'delete-bananas', ...validGroceryItem() };
		const itemRef = doc(db, 'groceryItems', item.id);

		await assertSucceeds(setDoc(itemRef, validGroceryItem()));
		await assertSucceeds(deleteGroceryItem(itemsRef, item));

		const deletedItem = await assertSucceeds(getDoc(itemRef));
		expect(deletedItem.exists()).toBe(false);
	});

	it('undo restores the deleted item with its original ID and values', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();
		const itemsRef = collection(db, 'groceryItems');
		const item = {
			id: 'undo-bananas',
			name: 'Bananas',
			count: 6,
			inCart: true,
			createdAt: Timestamp.fromMillis(1_700_000_000_000)
		};
		const itemRef = doc(db, 'groceryItems', item.id);

		await assertSucceeds(
			setDoc(itemRef, {
				name: item.name,
				count: item.count,
				inCart: item.inCart,
				createdAt: item.createdAt
			})
		);
		await assertSucceeds(deleteGroceryItem(itemsRef, item));
		await assertSucceeds(restoreGroceryItem(itemsRef, item));

		const restoredItem = await assertSucceeds(getDoc(itemRef));
		expect(restoredItem.exists()).toBe(true);
		expect(restoredItem.data()).toMatchObject({
			name: item.name,
			count: item.count,
			inCart: item.inCart
		});
		expect((restoredItem.data()?.createdAt as Timestamp).isEqual(item.createdAt)).toBe(true);
	});

	it('allows members to read only their own membership and blocks membership changes', async () => {
		await seedMember();
		await seedMember(otherUid);
		const db = testEnv.authenticatedContext(memberUid).firestore();

		await assertSucceeds(getDoc(doc(db, 'groceryListMembers', memberUid)));
		await assertFails(getDoc(doc(db, 'groceryListMembers', otherUid)));
		await assertFails(getDocs(collection(db, 'groceryListMembers')));
		await assertFails(
			setDoc(doc(db, 'groceryListMembers', memberUid), { displayName: 'Changed', role: 'owner' })
		);
		await assertFails(updateDoc(doc(db, 'groceryListMembers', memberUid), { role: 'owner' }));
		await assertFails(deleteDoc(doc(db, 'groceryListMembers', memberUid)));
	});

	it('rejects grocery items with invalid fields or values', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();
		const itemRef = doc(db, 'groceryItems', 'invalid-item');

		await assertFails(setDoc(itemRef, { ...validGroceryItem(), count: 0 }));
		await assertFails(setDoc(itemRef, { ...validGroceryItem(), count: 10 }));
		await assertFails(setDoc(itemRef, { ...validGroceryItem(), name: '' }));
		await assertFails(setDoc(itemRef, { ...validGroceryItem(), unexpected: true }));
	});

	it('allows the maximum grocery item count of 9', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();

		await assertSucceeds(
			setDoc(doc(db, 'groceryItems', 'maximum-count'), { ...validGroceryItem(), count: 9 })
		);
	});

	it('denies access to collections outside the grocery list schema', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();

		await assertFails(getDocs(collection(db, 'privateData')));
		await assertFails(setDoc(doc(db, 'privateData', 'secret'), { value: 'no access' }));
	});
});

describe('Shared recipes', () => {
	it('denies signed-out and non-member recipe reads, creates, updates, and deletes', async () => {
		await seedMember();
		const member = testEnv.authenticatedContext(memberUid).firestore();
		await setDoc(doc(member, 'recipes', 'soup'), validRecipe());
		for (const context of [
			testEnv.unauthenticatedContext(),
			testEnv.authenticatedContext(otherUid)
		]) {
			const db = context.firestore();
			const ref = doc(db, 'recipes', 'soup');
			await assertFails(getDocs(collection(db, 'recipes')));
			await assertFails(getDoc(ref));
			await assertFails(setDoc(doc(db, 'recipes', 'new'), validRecipe()));
			await assertFails(
				updateDoc(ref, { title: 'Changed', version: 2, updatedAt: serverTimestamp() })
			);
			await assertFails(deleteDoc(ref));
		}
	});

	it('lets another household member read, edit, and delete a shared recipe', async () => {
		await seedMember();
		await seedMember(otherUid);
		const db = testEnv.authenticatedContext(memberUid).firestore();
		const otherDb = testEnv.authenticatedContext(otherUid).firestore();
		const ref = doc(db, 'recipes', 'soup');
		await assertSucceeds(setDoc(ref, validRecipe()));
		const otherRef = doc(otherDb, 'recipes', 'soup');
		await assertSucceeds(getDoc(otherRef));
		await assertSucceeds(getDocs(collection(otherDb, 'recipes')));
		await assertSucceeds(
			updateDoc(otherRef, { title: 'Creamy tomato soup', version: 2, updatedAt: serverTimestamp() })
		);
		await assertSucceeds(deleteDoc(otherRef));
	});

	it('validates recipe fields on both create and update', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();
		const invalid: Record<string, unknown>[] = [
			{ title: '' },
			{ title: '   ' },
			{ title: 'a'.repeat(101) },
			{ title: 123 },
			{ ingredientsText: '' },
			{ ingredientsText: 'a'.repeat(81) },
			{ ingredientsText: Array(101).fill('Salt').join('\n') },
			{ ingredientsText: 'Salt\n\nPepper' },
			{ ingredientsText: ['Salt'] },
			{ instructions: 'a'.repeat(10001) },
			{ instructions: 1 },
			{ extra: 'not permitted' },
			{ createdAt: 'yesterday' },
			{ updatedAt: 'today' },
			{ createdAt: Timestamp.fromMillis(1) },
			{ updatedAt: Timestamp.fromMillis(1) }
		];
		for (const [index, fields] of invalid.entries()) {
			await assertFails(
				setDoc(doc(db, 'recipes', `bad-${index}`), { ...validRecipe(), ...fields })
			);
		}
		const ref = doc(db, 'recipes', 'soup');
		await setDoc(ref, validRecipe());
		for (const fields of invalid) {
			await assertFails(updateDoc(ref, { version: 2, updatedAt: serverTimestamp(), ...fields }));
		}
		for (const field of [
			'title',
			'ingredientsText',
			'instructions',
			'version',
			'createdAt',
			'updatedAt'
		]) {
			const missing = validRecipe() as Record<string, unknown>;
			delete missing[field];
			await assertFails(setDoc(doc(db, 'recipes', `missing-${field}`), missing));
			await assertFails(
				updateDoc(ref, { version: 2, updatedAt: serverTimestamp(), [field]: deleteField() })
			);
		}
		await assertFails(setDoc(doc(db, 'recipes', 'bad-version'), { ...validRecipe(), version: 2 }));
		await assertFails(updateDoc(ref, { version: 1, updatedAt: serverTimestamp() }));
		await assertFails(updateDoc(ref, { version: 3, updatedAt: serverTimestamp() }));
		await assertFails(updateDoc(ref, { version: 1.5, updatedAt: serverTimestamp() }));
	});

	it('accepts maximum recipe sizes and measured Unicode ingredient text', async () => {
		await seedMember();
		const db = testEnv.authenticatedContext(memberUid).firestore();
		await assertSucceeds(
			setDoc(doc(db, 'recipes', 'maximum'), {
				...validRecipe(),
				title: 'a'.repeat(100),
				ingredientsText: Array(100).fill('a'.repeat(80)).join('\n'),
				instructions: 'a'.repeat(10000)
			})
		);
		await assertSucceeds(setDoc(doc(db, 'recipes', 'measured'), validRecipe()));
	});

	it('saves, detects stale edits and deletes, and preserves creation time', async () => {
		await seedMember();
		// collection() unwraps the emulator's compat instance for the modular helpers.
		const db = collection(testEnv.authenticatedContext(memberUid).firestore(), 'recipes').firestore;
		const input = {
			title: 'Soup',
			ingredientsText: '400 g tomatoes\n½ cup cream',
			instructions: 'Simmer.'
		};
		const id = await createRecipe(db, input);
		const original = await getDoc(doc(db, 'recipes', id));
		await updateRecipe(db, id, { ...input, title: 'Creamy soup' }, 1);
		await expect(updateRecipe(db, id, { ...input, title: 'Stale edit' }, 1)).rejects.toThrow(
			'Someone else updated'
		);
		await expect(deleteRecipe(db, id, 1)).rejects.toThrow('has changed');
		const updated = await getDoc(doc(db, 'recipes', id));
		expect(updated.data()?.title).toBe('Creamy soup');
		expect(updated.data()?.createdAt.isEqual(original.data()?.createdAt)).toBe(true);
		await deleteRecipe(db, id, 2);
		await expect(updateRecipe(db, id, input, 2)).rejects.toThrow('was deleted');
	});

	it('imports measured ingredients with count 1 and skips full text duplicates on subsequent imports', async () => {
		await seedMember();
		// collection() unwraps the emulator's compat instance for the modular helpers.
		const db = collection(testEnv.authenticatedContext(memberUid).firestore(), 'recipes').firestore;
		await setDoc(doc(db, 'groceryItems', 'existing'), {
			...validGroceryItem(),
			name: '400 g tomatoes',
			count: 3,
			inCart: true
		});
		expect(
			await addRecipeIngredients(db, ['400 g tomatoes', '½ cup cream', '½ CUP cream'])
		).toEqual({ added: 1, skipped: 2 });
		const snapshot = await getDocs(collection(db, 'groceryItems'));
		const cream = snapshot.docs.find((item) => item.data().name === '½ cup cream');
		expect(cream?.data()).toMatchObject({ name: '½ cup cream', count: 1, inCart: false });
		expect((await getDoc(doc(db, 'groceryItems', 'existing'))).data()).toMatchObject({
			count: 3,
			inCart: true
		});
		expect(await addRecipeIngredients(db, ['½ cup cream'])).toEqual({ added: 0, skipped: 1 });
		await expect(addRecipeIngredients(db, ['2 eggs', 'a'.repeat(81)])).rejects.toThrow(
			'valid ingredients'
		);
		expect((await getDocs(collection(db, 'groceryItems'))).size).toBe(2);
	});
});
