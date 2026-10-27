import { describe, expect, it } from 'vitest';
import { nextGroceryItemCount } from './grocery-items';

describe('nextGroceryItemCount', () => {
	it('decrements down to 1', () => {
		expect(nextGroceryItemCount(2, -1)).toBe(1);
	});

	it('does not decrement below 1', () => {
		expect(nextGroceryItemCount(1, -1)).toBeNull();
	});

	it('increments up to 9', () => {
		expect(nextGroceryItemCount(8, 1)).toBe(9);
	});

	it('does not increment above 9', () => {
		expect(nextGroceryItemCount(9, 1)).toBeNull();
	});
});
