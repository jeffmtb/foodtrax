<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { collection, onSnapshot } from 'firebase/firestore';
	import { db } from '../../../lib/firebase';
	import { ingredientLines, type Recipe } from '../../../lib/recipes';
	import { recipeLoadErrorMessage } from '../../../lib/recipe-load-errors';

	let recipes = $state<Recipe[]>([]);
	let search = $state('');
	let loading = $state(true);
	let error = $state('');
	let online = $state(true);
	const filtered = $derived(
		recipes.filter((recipe) =>
			`${recipe.title}\n${recipe.ingredientsText}`
				.toLowerCase()
				.includes(search.trim().toLowerCase())
		)
	);

	onMount(() => {
		const updateOnline = () => {
			online = navigator.onLine;
		};
		updateOnline();
		window.addEventListener('online', updateOnline);
		window.addEventListener('offline', updateOnline);
		const unsubscribe = onSnapshot(
			collection(db, 'recipes'),
			{ includeMetadataChanges: true },
			(snapshot) => {
				recipes = snapshot.docs
					.map((item) => ({ ...item.data(), id: item.id }) as Recipe)
					.sort((a, b) => a.title.localeCompare(b.title));
				// An empty local snapshot does not establish that the server has no recipes.
				loading = snapshot.metadata.fromCache && snapshot.empty;
				error = '';
			},
			(cause) => {
				loading = false;
				console.error('Unable to load recipes', cause);
				error = recipeLoadErrorMessage(cause.code);
			}
		);
		return () => {
			unsubscribe();
			window.removeEventListener('online', updateOnline);
			window.removeEventListener('offline', updateOnline);
		};
	});
</script>

<svelte:head>
	<title>Recipes · Food Trax</title>
	<meta
		name="description"
		content="Your household recipes and ingredients, ready for the grocery list."
	/>
</svelte:head>

<section class="recipe-page">
	<div class="recipe-heading">
		<div>
			<h1>Recipes</h1>
			<p class="recipe-subtitle">Keep your favorites. Make the next grocery run easier.</p>
		</div>
		<a class="recipe-primary" href={resolve('/(household)/recipes/new')}>New recipe</a>
	</div>
	{#if error}
		<p class="recipe-error" role="alert">{error}</p>
		<button class="recipe-secondary" type="button" onclick={() => window.location.reload()}
			>Try again</button
		>
	{:else if loading}
		<p class="recipe-empty" role="status">
			{online
				? 'Connecting to check your recipes…'
				: 'You’re offline. Reconnect to load your recipes.'}
		</p>
	{:else if recipes.length === 0}
		<div class="recipe-empty">
			<h2>No recipes yet</h2>
			<p>
				Save a recipe and add its ingredients to your shared grocery list whenever you need them.
			</p>
		</div>
	{:else}
		<label class="recipe-search-label" for="recipe-search">Find a recipe or ingredient</label>
		<input
			class="recipe-search"
			id="recipe-search"
			type="search"
			bind:value={search}
			placeholder="Search recipes…"
		/>
		<p class="recipe-hint" role="status">
			{filtered.length}
			{filtered.length === 1 ? 'recipe' : 'recipes'}
		</p>
		{#if filtered.length === 0}<p class="recipe-empty">No recipes match your search.</p>{/if}
		<ul class="recipe-list">
			{#each filtered as recipe (recipe.id)}
				<li>
					<a href={resolve('/(household)/recipes/[id]', { id: recipe.id })}
						><div>
							<h2>{recipe.title}</h2>
							<p>{ingredientLines(recipe.ingredientsText).length} ingredients</p>
						</div>
						<span aria-hidden="true">→</span></a
					>
				</li>
			{/each}
		</ul>
	{/if}
</section>
