<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { db } from '../firebase';
	import {
		addRecipeIngredients,
		deleteRecipe,
		ingredientLines,
		updateRecipe,
		type Recipe,
		type RecipeInput
	} from '../recipes';
	import RecipeEditor from './RecipeEditor.svelte';

	let { id }: { id: string } = $props();
	let recipe = $state<Recipe | null>(null);
	let editing = $state<Recipe | null>(null);
	let loading = $state(true);
	let adding = $state(false);
	let deleting = $state(false);
	let error = $state('');
	let loadError = $state('');
	let message = $state('');
	let selected = $state<number[]>([]);
	const ingredients = $derived(ingredientLines(recipe?.ingredientsText ?? ''));

	onMount(() =>
		onSnapshot(
			doc(db, 'recipes', id),
			(snapshot) => {
				const next = snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as Recipe) : null;
				if (next?.ingredientsText !== recipe?.ingredientsText) {
					selected = ingredientLines(next?.ingredientsText ?? '').map((_, index) => index);
					message = '';
				}
				recipe = next;
				loading = false;
				loadError = '';
			},
			() => {
				loading = false;
				loadError = 'Could not load this recipe. Check your connection and try refreshing.';
			}
		)
	);

	async function save(input: RecipeInput) {
		if (!editing) return;
		await updateRecipe(db, id, input, editing.version);
	}

	async function remove() {
		if (
			!recipe ||
			adding ||
			deleting ||
			!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)
		)
			return;
		deleting = true;
		error = '';
		try {
			await deleteRecipe(db, id, recipe.version);
			void goto(resolve('/(household)/recipes'));
		} catch (cause) {
			error =
				cause instanceof Error && cause.name !== 'FirebaseError'
					? cause.message
					: 'Could not delete this recipe. Please try again.';
		} finally {
			deleting = false;
		}
	}

	async function addToGroceries() {
		if (adding || deleting || selected.length === 0) return;
		adding = true;
		error = '';
		message = '';
		try {
			const result = await addRecipeIngredients(
				db,
				ingredients.filter((_, index) => selected.includes(index))
			);
			message = `${result.added} ${result.added === 1 ? 'ingredient added' : 'ingredients added'} to groceries.${result.skipped ? ` ${result.skipped} already listed or repeated.` : ''}`;
			selected = [];
		} catch {
			error = 'Could not add ingredients. Check your connection and try again.';
		} finally {
			adding = false;
		}
	}
</script>

<svelte:head
	><title>{editing ? 'Edit recipe' : (recipe?.title ?? 'Recipe')} · Food Trax</title></svelte:head
>

<section class="recipe-page">
	{#if editing}
		<h1>Edit recipe</h1>
		<p class="recipe-subtitle">Update the ingredients, instructions, or name.</p>
		<RecipeEditor
			initial={editing}
			onsave={save}
			ondone={() => {
				editing = null;
			}}
			oncancel={() => {
				editing = null;
			}}
		/>
	{:else if loadError}
		<p class="recipe-error" role="alert">{loadError}</p>
		<a class="recipe-back" href={resolve('/(household)/recipes')}>← All recipes</a>
	{:else if loading}
		<p class="recipe-empty" role="status">Loading your recipe…</p>
	{:else if !recipe}
		<div class="recipe-empty">
			<h1>Recipe not found</h1>
			<p>It may have been deleted by someone in your household.</p>
			<a class="recipe-secondary" href={resolve('/(household)/recipes')}>All recipes</a>
		</div>
	{:else}
		<a class="recipe-back" href={resolve('/(household)/recipes')}>← All recipes</a>
		<div class="recipe-heading recipe-detail-heading">
			<h1>{recipe.title}</h1>
			<div class="recipe-actions">
				<button
					class="recipe-secondary"
					type="button"
					disabled={adding || deleting}
					onclick={() => {
						editing = recipe;
						error = '';
						message = '';
					}}>Edit</button
				>
				<button class="recipe-danger" type="button" disabled={adding || deleting} onclick={remove}
					>{deleting ? 'Deleting…' : 'Delete'}</button
				>
			</div>
		</div>
		{#if error}<p class="recipe-error" role="alert">{error}</p>{/if}
		<h2>Ingredients</h2>
		<p class="recipe-hint">
			Uncheck anything you already have. Measurements stay in the item text; each grocery quantity
			starts at 1. Matching items already on the list are skipped.
		</p>
		<div class="recipe-selection-actions">
			<button
				type="button"
				disabled={adding || deleting}
				onclick={() => {
					selected = ingredients.map((_, index) => index);
				}}>Select all</button
			>
			<button
				type="button"
				disabled={adding || deleting}
				onclick={() => {
					selected = [];
				}}>Clear selection</button
			>
		</div>
		<ul class="recipe-ingredients">
			{#each ingredients as ingredient, index (index)}
				<li>
					<label
						><input
							type="checkbox"
							bind:group={selected}
							value={index}
							disabled={adding || deleting}
						/><span>{ingredient}</span></label
					>
				</li>
			{/each}
		</ul>
		<div class="recipe-actions">
			<button
				class="recipe-primary"
				type="button"
				disabled={adding || deleting || !selected.length}
				onclick={addToGroceries}
				>{adding ? 'Adding…' : `Add to groceries (${selected.length})`}</button
			>
			<a class="recipe-text-link" href={resolve('/(household)')}>View groceries →</a>
		</div>
		{#if message}<p class="recipe-success" role="status">{message}</p>{/if}
		{#if recipe.instructions}
			<section class="recipe-instructions">
				<h2>Instructions and notes</h2>
				<p>{recipe.instructions}</p>
			</section>
		{/if}
	{/if}
</section>
