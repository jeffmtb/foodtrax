import {
	deleteDoc,
	doc,
	serverTimestamp,
	setDoc,
	type CollectionReference,
	type Timestamp
} from 'firebase/firestore';

export type GroceryItem = {
	id: string;
	name: string;
	count: number;
	inCart: boolean;
	createdAt?: Timestamp;
	sortOrder?: number;
};

export function nextGroceryItemCount(count: number, change: -1 | 1): number | null {
	const nextCount = count + change;
	return nextCount < 1 || nextCount > 9 ? null : nextCount;
}

export async function deleteGroceryItem(itemsRef: CollectionReference, item: Pick<GroceryItem, 'id'>) {
	await deleteDoc(doc(itemsRef, item.id));
}

export async function restoreGroceryItem(itemsRef: CollectionReference, item: GroceryItem) {
	await setDoc(doc(itemsRef, item.id), {
		name: item.name,
		count: item.count,
		inCart: item.inCart,
		createdAt: item.createdAt ?? serverTimestamp(),
		...(item.sortOrder !== undefined ? { sortOrder: item.sortOrder } : {})
	});
}
