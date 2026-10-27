<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { db } from '../../../../lib/firebase';
	import { createRecipe, type RecipeInput } from '../../../../lib/recipes';
	import RecipeEditor from '#lib/components/RecipeEditor.svelte';
	let id = '';
	async function save(input: RecipeInput) {
		id = await createRecipe(db, input);
	}
</script>

<svelte:head><title>New recipe · Food Trax</title></svelte:head>

<section class="recipe-page">
	<h1>New recipe</h1>
	<p class="recipe-subtitle">Add your ingredients and any instructions you want to keep.</p>
	<RecipeEditor
		onsave={save}
		ondone={() => void goto(resolve('/(household)/recipes/[id]', { id }))}
		oncancel={() => void goto(resolve('/(household)/recipes'))}
	/>
</section>
