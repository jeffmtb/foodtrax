<script lang="ts">
	import { onMount } from 'svelte';
	import {
		collection,
		doc,
		getDocs,
		onSnapshot,
		serverTimestamp,
		updateDoc,
		writeBatch
	} from 'firebase/firestore';
	import {
		deleteGroceryItem,
		nextGroceryItemCount,
		restoreGroceryItem,
		type GroceryItem
	} from '../../lib/grocery-items';
	import { db } from '../../lib/firebase';

	const itemsRef = collection(db, 'groceryItems');

	let items = $state<GroceryItem[]>([]);
	let newItemName = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let clearing = $state(false);
	let errorMessage = $state('');
	let recentlyDeleted = $state<GroceryItem | null>(null);
	let undoingDelete = $state(false);
	let draggedItemId = $state<string | null>(null);
	let dragCandidate: {
		itemId: string;
		pointerId: number;
		startX: number;
		startY: number;
		started: boolean;
		changed: boolean;
		timer?: ReturnType<typeof setTimeout>;
	} | null = null;
	let undoTimeout: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		const stopItems = onSnapshot(
			itemsRef,
			(snapshot) => {
				items = snapshot.docs
					.map((item) => ({ id: item.id, ...item.data() }) as GroceryItem)
					.sort((a, b) => {
						if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number') {
							const orderDifference = a.sortOrder - b.sortOrder;
							if (orderDifference) return orderDifference;
						}
						if (!a.createdAt) return b.createdAt ? 1 : a.id.localeCompare(b.id);
						if (!b.createdAt) return -1;

						const timestampOrder =
							a.createdAt.seconds - b.createdAt.seconds ||
							a.createdAt.nanoseconds - b.createdAt.nanoseconds;
						return timestampOrder || a.id.localeCompare(b.id);
					});
				loading = false;
			},
			(error) => {
				console.error('Unable to listen to grocery items', error);
				loading = false;
				errorMessage = 'Could not connect to the grocery list. Please try refreshing.';
			}
		);
		return () => {
			stopItems();
			if (dragCandidate?.timer) clearTimeout(dragCandidate.timer);
			if (undoTimeout) clearTimeout(undoTimeout);
		};
	});

	function moveItem(itemId: string, targetId: string) {
		const from = items.findIndex((item) => item.id === itemId);
		const to = items.findIndex((item) => item.id === targetId);
		if (from < 0 || to < 0 || from === to) return;
		const next = [...items];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		items = next;
	}

	async function saveItemOrder() {
		try {
			for (let start = 0; start < items.length; start += 450) {
				const batch = writeBatch(db);
				for (const [offset, item] of items.slice(start, start + 450).entries()) {
					batch.update(doc(itemsRef, item.id), { sortOrder: start + offset });
				}
				await batch.commit();
			}
		} catch (error) {
			console.error('Unable to save grocery item order', error);
			errorMessage = 'Could not save the new list order. Please try again.';
		}
	}

	function startDrag(candidate: NonNullable<typeof dragCandidate>) {
		if (candidate.timer) clearTimeout(candidate.timer);
		candidate.started = true;
		draggedItemId = candidate.itemId;
	}

	function handleReorderPointerDown(itemId: string, event: PointerEvent) {
		if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
		if (dragCandidate?.timer) clearTimeout(dragCandidate.timer);
		const candidate: NonNullable<typeof dragCandidate> = {
			itemId,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			started: false,
			changed: false
		};
		dragCandidate = candidate;
		if (event.pointerType !== 'mouse') {
			candidate.timer = setTimeout(() => {
				if (dragCandidate === candidate) startDrag(candidate);
			}, 350);
		}
	}

	function handleReorderPointerMove(event: PointerEvent) {
		const candidate = dragCandidate;
		if (!candidate || candidate.pointerId !== event.pointerId) return;
		if (!candidate.started) {
			if (event.pointerType !== 'mouse') return;
			if (Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) < 4) return;
			startDrag(candidate);
		}
		event.preventDefault();
		const target = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
		if (target) {
			const previousIndex = items.findIndex((item) => item.id === candidate.itemId);
			const targetIndex = items.findIndex((item) => item.id === target);
			if (previousIndex !== targetIndex) candidate.changed = true;
			moveItem(candidate.itemId, target);
		}
	}

	function finishReorderPointer(event: PointerEvent) {
		const candidate = dragCandidate;
		if (!candidate || candidate.pointerId !== event.pointerId) return;
		if (candidate.timer) clearTimeout(candidate.timer);
		dragCandidate = null;
		if (candidate.started) {
			draggedItemId = null;
			if (candidate.changed) void saveItemOrder();
		}
	}

	function handleReorderKeydown(itemId: string, event: KeyboardEvent) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const index = items.findIndex((item) => item.id === itemId);
		const target = items[index + (event.key === 'ArrowUp' ? -1 : 1)];
		if (!target) return;
		moveItem(itemId, target.id);
		void saveItemOrder();
	}

	async function addItem(event: SubmitEvent) {
		event.preventDefault();
		const name = newItemName.trim();
		if (!name) return;

		saving = true;
		errorMessage = '';
		try {
			const batch = writeBatch(db);
			const newItem = doc(itemsRef);
			const sortOrder =
				items.reduce((highest, item) => Math.max(highest, item.sortOrder ?? -1), -1) + 1;
			batch.set(newItem, {
				name,
				count: 1,
				inCart: false,
				createdAt: serverTimestamp(),
				sortOrder
			});
			await batch.commit();
			newItemName = '';
		} catch (error) {
			console.error('Unable to add grocery item', error);
			errorMessage = 'Could not add that item. Please try again.';
		} finally {
			saving = false;
		}
	}

	async function changeCount(item: GroceryItem, amount: number) {
		if (amount !== -1 && amount !== 1) return;
		const nextCount = nextGroceryItemCount(item.count, amount);
		if (nextCount === null) return;

		try {
			await updateDoc(doc(itemsRef, item.id), { count: nextCount });
		} catch (error) {
			console.error('Unable to update grocery item count', error);
			errorMessage = `Could not update ${item.name}. Please try again.`;
		}
	}

	async function toggleInCart(item: GroceryItem) {
		try {
			await updateDoc(doc(itemsRef, item.id), { inCart: !item.inCart });
		} catch (error) {
			console.error('Unable to update cart status', error);
			errorMessage = `Could not update ${item.name}. Please try again.`;
		}
	}

	async function removeItem(item: GroceryItem) {
		try {
			await deleteGroceryItem(itemsRef, item);
			if (undoTimeout) clearTimeout(undoTimeout);
			recentlyDeleted = item;
			undoTimeout = setTimeout(() => {
				recentlyDeleted = null;
				undoTimeout = undefined;
			}, 6000);
		} catch (error) {
			console.error('Unable to delete grocery item', error);
			errorMessage = `Could not delete ${item.name}. Please try again.`;
		}
	}

	async function undoDelete() {
		if (!recentlyDeleted || undoingDelete) return;
		const item = recentlyDeleted;
		if (undoTimeout) clearTimeout(undoTimeout);
		undoTimeout = undefined;
		undoingDelete = true;
		try {
			await restoreGroceryItem(itemsRef, item);
			recentlyDeleted = null;
		} catch (error) {
			console.error('Unable to undo grocery item deletion', error);
			errorMessage = `Could not restore ${item.name}. Please try again.`;
		} finally {
			undoingDelete = false;
		}
	}

	async function clearList() {
		if (clearing || items.length === 0) return;
		if (
			!window.confirm(
				`Clear all ${items.length} items from your grocery list? This cannot be undone.`
			)
		)
			return;

		clearing = true;
		errorMessage = '';
		try {
			const snapshot = await getDocs(itemsRef);
			for (let start = 0; start < snapshot.docs.length; start += 450) {
				const batch = writeBatch(db);
				for (const item of snapshot.docs.slice(start, start + 450)) batch.delete(item.ref);
				await batch.commit();
			}
		} catch (error) {
			console.error('Unable to clear grocery list', error);
			errorMessage = 'Could not clear the entire list. Please try again.';
		} finally {
			clearing = false;
		}
	}
</script>

<svelte:window
	onpointermove={handleReorderPointerMove}
	onpointerup={finishReorderPointer}
	onpointercancel={finishReorderPointer}
/>

<svelte:head>
	<title>Grocery list · Food Trax</title>
	<meta name="description" content="A simple shared grocery list." />
</svelte:head>

<form class="add-form" onsubmit={addItem}>
	<label class="sr-only" for="new-item">Add an item to your list</label>
	<span class="input-plus" aria-hidden="true">+</span>
	<input
		id="new-item"
		bind:value={newItemName}
		placeholder="Add something to your list..."
		maxlength="80"
	/>
	<button class="add-button" type="submit" disabled={saving || !newItemName.trim()}>
		{saving ? 'Adding…' : 'Add item'}
	</button>
</form>

{#if errorMessage}
	<p class="error-message" role="alert">{errorMessage}</p>
{/if}

<section class="items-section" aria-labelledby="items-heading">
	<div class="section-heading">
		<h2 id="items-heading">Your list</h2>
		<button
			class="clear-button"
			type="button"
			onclick={clearList}
			disabled={clearing || items.length === 0}
		>
			Clear
		</button>
	</div>

	<div class="table-head" aria-hidden="true">
		<span>QTY</span>
		<span>ITEM</span>
		<span>IN CART</span>
		<span></span>
	</div>

	{#if loading}
		<div class="empty-state">Loading your list…</div>
	{:else if items.length === 0}
		<div class="empty-state">Your list is clear. Add your first item above.</div>
	{:else}
		<ul class="item-list">
			{#each items as item (item.id)}
				<li
					class:checked={item.inCart}
					class:dragging={draggedItemId === item.id}
					data-item-id={item.id}
				>
					<div class="quantity-control" aria-label={`Quantity for ${item.name}`}>
						<button
							type="button"
							aria-label={`Decrease ${item.name} quantity`}
							disabled={item.count <= 1}
							onclick={() => changeCount(item, -1)}>−</button
						>
						<span>{item.count}</span>
						<button
							type="button"
							aria-label={`Increase ${item.name} quantity`}
							disabled={item.count >= 9}
							onclick={() => changeCount(item, 1)}>+</button
						>
					</div>
					<span class="item-name">{item.name}</span>
					<div class="cart-and-reorder">
						<button
							class="reorder-handle"
							type="button"
							aria-label={`Reorder ${item.name}. Use the up and down arrow keys to move it.`}
							aria-keyshortcuts="ArrowUp ArrowDown"
							onpointerdown={(event) => handleReorderPointerDown(item.id, event)}
							onkeydown={(event) => handleReorderKeydown(item.id, event)}
						>
							<svg viewBox="0 0 16 20" aria-hidden="true">
								<circle cx="5" cy="5" r="1.3" /><circle cx="11" cy="5" r="1.3" />
								<circle cx="5" cy="10" r="1.3" /><circle cx="11" cy="10" r="1.3" />
								<circle cx="5" cy="15" r="1.3" /><circle cx="11" cy="15" r="1.3" />
							</svg>
						</button>
						<label class="cart-toggle">
							<input type="checkbox" checked={item.inCart} onchange={() => toggleInCart(item)} />
							<span class="custom-check" aria-hidden="true"></span>
							<span class="sr-only">{item.inCart ? 'In cart' : 'Not in cart'}: {item.name}</span>
						</label>
					</div>
					<button
						class="delete-button"
						type="button"
						aria-label={`Delete ${item.name}`}
						onclick={() => removeItem(item)}
					>
						<svg viewBox="0 0 20 20" aria-hidden="true"
							><path d="M4.5 6h11m-9.5 0 .6 10h5.8L13 6m-5.5 0V4h5v2m-6 2 .3 6m4.4-6-.3 6" /></svg
						>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<footer class="card-footer">
	<span>Made for smoother grocery runs</span><span class="footer-star" aria-hidden="true">✳</span>
</footer>
{#if recentlyDeleted}
	<div class="undo-snackbar" role="status" aria-live="polite">
		<span>Deleted {recentlyDeleted.name}</span>
		<button
			type="button"
			onclick={undoDelete}
			disabled={undoingDelete}
			aria-label={`Undo deleting ${recentlyDeleted.name}`}
		>
			{undoingDelete ? 'Undoing…' : 'Undo'}
		</button>
	</div>
{/if}
<p class="page-note">A shared list, always up to date.</p>

<style>
	.add-form {
		height: 52px;
		margin: 22px 0 24px;
		display: flex;
		align-items: center;
		gap: 10px;
		border: 1px solid #dfe7e1;
		border-radius: 10px;
		padding: 5px 6px 5px 14px;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.add-form:focus-within {
		border-color: #79aa8b;
		box-shadow: 0 0 0 3px #e6f2e9;
	}
	.input-plus {
		color: #7e9d87;
		font-size: 21px;
		font-weight: 400;
	}
	.add-form input {
		flex: 1;
		width: 0;
		border: 0;
		outline: 0;
		color: #33443a;
		background: transparent;
		font-size: 13px;
	}
	.add-form input::placeholder {
		color: #a3ada6;
	}
	.add-button {
		align-self: stretch;
		border: 0;
		border-radius: 7px;
		padding: 0 16px;
		background: #236a4b;
		color: white;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
		transition: background 0.2s;
	}
	.add-button:hover:not(:disabled) {
		background: #18573c;
	}
	.add-button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.items-section {
		padding-bottom: 14px;
	}
	.section-heading {
		margin-bottom: 12px;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.section-heading h2 {
		margin: 0;
		color: #34463b;
		font-size: 15px;
		font-weight: 700;
	}
	.clear-button {
		min-height: 34px;
		border: 0;
		border-radius: 7px;
		padding: 0 13px;
		background: #236a4b;
		color: #fff;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
		transition: background 0.2s;
	}
	.clear-button:hover:not(:disabled) {
		background: #18573c;
	}
	.clear-button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.table-head,
	.item-list li {
		display: grid;
		grid-template-columns: 118px 1fr 78px 36px;
		align-items: center;
	}
	.table-head {
		padding: 0 10px 9px 13px;
		color: #9ba69e;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 1px;
	}
	.table-head span:nth-child(3) {
		text-align: center;
	}
	.item-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.item-list li {
		min-height: 62px;
		border-top: 1px solid #eff2ef;
		padding: 7px 8px 7px 12px;
		transition: background 0.15s;
	}
	.item-list li:hover {
		background: #fbfcfb;
	}
	.item-list li.dragging {
		position: relative;
		z-index: 1;
		background: #edf5ef;
		box-shadow: 0 3px 12px #243d2c22;
	}
	.quantity-control {
		width: max-content;
		height: 31px;
		display: flex;
		align-items: center;
		overflow: hidden;
		border: 1px solid #e1e8e2;
		border-radius: 7px;
		background: #fff;
	}
	.quantity-control button {
		width: 31px;
		height: 29px;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: #63806d;
		font-size: 17px;
		cursor: pointer;
	}
	.quantity-control button:hover:not(:disabled) {
		background: #edf5ef;
		color: #245f41;
	}
	.quantity-control button:disabled {
		color: #c9d1cb;
		cursor: default;
	}
	.quantity-control span {
		min-width: 24px;
		color: #3f5146;
		text-align: center;
		font-size: 12px;
		font-weight: 650;
	}
	.item-name {
		color: #37473e;
		font-size: 13px;
		font-weight: 560;
		transition: color 0.15s;
	}
	.checked .item-name {
		color: #9aa69e;
		text-decoration: line-through;
	}
	.cart-and-reorder {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}
	.reorder-handle {
		width: 34px;
		height: 40px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: #829187;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.reorder-handle:active {
		cursor: grabbing;
	}
	.reorder-handle:hover,
	.reorder-handle:focus-visible {
		background: #edf5ef;
		color: #3d7351;
		outline: none;
	}
	.reorder-handle svg {
		width: 16px;
		height: 20px;
		fill: currentColor;
	}
	.cart-toggle {
		position: relative;
		justify-self: center;
		width: 19px;
		height: 19px;
		cursor: pointer;
	}
	.cart-toggle input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.custom-check {
		position: absolute;
		inset: 0;
		border: 1.5px solid #cbd6cd;
		border-radius: 5px;
		background: white;
		transition: all 0.15s;
	}
	.custom-check::after {
		content: '';
		position: absolute;
		left: 5px;
		top: 2px;
		width: 5px;
		height: 9px;
		border: solid white;
		border-width: 0 1.8px 1.8px 0;
		transform: rotate(45deg) scale(0);
		transition: transform 0.15s;
	}
	.cart-toggle input:checked + .custom-check {
		border-color: #317b56;
		background: #317b56;
	}
	.cart-toggle input:checked + .custom-check::after {
		transform: rotate(45deg) scale(1);
	}
	.cart-toggle input:focus-visible + .custom-check {
		outline: 3px solid #d6eadc;
		outline-offset: 2px;
	}
	.delete-button {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: #aab4ac;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.delete-button:hover {
		background: #fff0ee;
		color: #c25348;
	}
	.delete-button svg {
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.4;
	}
	.empty-state {
		min-height: 100px;
		display: grid;
		place-items: center;
		border-top: 1px solid #eff2ef;
		color: #929e95;
		font-size: 13px;
		text-align: center;
	}
	.error-message {
		margin: -18px 0 22px;
		border-radius: 8px;
		background: #fff1ef;
		padding: 10px 12px;
		color: #a84036;
		font-size: 12px;
	}
	.card-footer {
		min-height: 51px;
		border-top: 1px solid #edf0ed;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		color: #a3ada5;
		font-size: 10px;
	}
	.footer-star {
		color: #74a386;
		font-size: 12px;
	}
	.page-note {
		margin: 17px 0 0;
		color: #9aa69d;
		font-size: 11px;
	}
	.undo-snackbar {
		position: fixed;
		z-index: 10;
		right: 16px;
		bottom: max(16px, env(safe-area-inset-bottom));
		left: 16px;
		width: max-content;
		max-width: calc(100% - 32px);
		min-height: 48px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 22px;
		border: 1px solid #e2e8e3;
		border-radius: 10px;
		padding: 0 10px 0 16px;
		background: #263b2f;
		color: #fff;
		box-shadow: 0 8px 28px #1a342a30;
		font-size: 13px;
	}
	.undo-snackbar button {
		min-height: 36px;
		border: 0;
		border-radius: 7px;
		padding: 0 10px;
		background: transparent;
		color: #bde0c6;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}
	.undo-snackbar button:hover:not(:disabled) {
		background: #ffffff15;
		color: #fff;
	}
	.undo-snackbar button:disabled {
		opacity: 0.65;
		cursor: wait;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 600px) {
		.add-form {
			height: 44px;
			margin: 10px 0 16px;
			gap: 7px;
			padding-left: 10px;
		}
		.add-form input {
			font-size: 12px;
		}
		.add-button {
			padding: 0 11px;
			font-size: 11px;
		}
		.items-section {
			padding-bottom: 7px;
		}
		.section-heading {
			margin-bottom: 7px;
		}
		.section-heading h2 {
			font-size: 14px;
		}
		.table-head,
		.item-list li {
			grid-template-columns: 82px 1fr 72px 30px;
		}
		.table-head {
			padding: 0 7px 6px;
			font-size: 8px;
		}
		.item-list li {
			min-height: 48px;
			padding: 4px 5px;
		}
		.quantity-control {
			height: 29px;
		}
		.quantity-control button {
			width: 24px;
			height: 27px;
		}
		.quantity-control span {
			min-width: 20px;
		}
		.item-name {
			font-size: 13px;
		}
		.cart-and-reorder {
			gap: 4px;
		}
		.reorder-handle {
			width: 34px;
			height: 36px;
		}
		.cart-toggle {
			width: 20px;
			height: 20px;
		}
		.card-footer,
		.page-note {
			display: none;
		}
		.error-message {
			margin: -8px 0 12px;
		}
	}
	@media (prefers-color-scheme: dark) {
		.add-form {
			border-color: var(--control-border);
		}
		.add-form:focus-within {
			border-color: #5b9b70;
			box-shadow: 0 0 0 3px var(--accent-soft);
		}
		.add-form input {
			color: var(--text-body);
		}
		.add-form input::placeholder {
			color: #809687;
		}
		.input-plus {
			color: #8ab99a;
		}
		.add-button,
		.clear-button {
			background: var(--accent);
		}
		.add-button:hover:not(:disabled),
		.clear-button:hover:not(:disabled) {
			background: var(--accent-hover);
		}
		.section-heading h2 {
			color: #cfdfd3;
		}
		.table-head {
			color: #829889;
		}
		.item-list li,
		.empty-state {
			border-color: var(--border-row);
		}
		.item-list li:hover {
			background: var(--surface-hover);
		}
		.quantity-control {
			border-color: var(--control-border);
			background: var(--surface-muted);
		}
		.quantity-control button {
			color: #9abda3;
		}
		.quantity-control button:hover:not(:disabled) {
			background: #294835;
			color: #c7efd1;
		}
		.quantity-control button:disabled {
			color: #627568;
		}
		.quantity-control span,
		.item-name {
			color: var(--text-body);
		}
		.checked .item-name {
			color: #829889;
		}
		.custom-check {
			border-color: #607768;
			background: var(--surface-muted);
		}
		.cart-toggle input:checked + .custom-check {
			border-color: #3d9667;
			background: #3d9667;
		}
		.cart-toggle input:focus-visible + .custom-check {
			outline-color: #41694e;
		}
		.delete-button {
			color: #829889;
		}
		.delete-button:hover {
			background: #442b28;
			color: #ffaaa0;
		}
		.empty-state {
			color: var(--text-muted);
		}
		.error-message {
			background: var(--error-bg);
			color: var(--error-text);
		}
		.card-footer {
			color: #829889;
		}
		.page-note {
			color: #829889;
		}
		.undo-snackbar {
			border-color: #405449;
			background: #20372a;
			box-shadow: 0 8px 28px #0007;
		}
		.undo-snackbar button {
			color: #b7e4c3;
		}
	}
</style>
