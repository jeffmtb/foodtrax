<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import {
		MAX_RECIPE_TITLE,
		MAX_INSTRUCTIONS_LENGTH,
		validateRecipe,
		type RecipeInput
	} from '../recipes';

	let {
		initial = { title: '', ingredientsText: '', instructions: '' },
		onsave,
		ondone,
		oncancel
	}: {
		initial?: RecipeInput;
		onsave: (input: RecipeInput) => Promise<void>;
		ondone: () => void;
		oncancel: () => void;
	} = $props();
	const original = untrack(() => ({ ...initial }));
	let title = $state(original.title);
	let ingredientsText = $state(original.ingredientsText);
	let instructions = $state(original.instructions);
	let saving = $state(false);
	let error = $state('');
	let saved = $state(false);
	const dirty = $derived(
		!saved &&
			(title !== original.title ||
				ingredientsText !== original.ingredientsText ||
				instructions !== original.instructions)
	);

	beforeNavigate((navigation) => {
		if (navigation.willUnload) {
			if (dirty || saving) navigation.cancel();
		} else if (saving || (dirty && !window.confirm('Discard your unsaved recipe changes?'))) {
			navigation.cancel();
		}
	});

	function cancel() {
		if (!dirty || window.confirm('Discard your unsaved recipe changes?')) {
			saved = true;
			oncancel();
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		const input = { title, ingredientsText, instructions };
		error = validateRecipe(input) ?? '';
		if (error) return;
		saving = true;
		try {
			await onsave(input);
			saved = true;
			saving = false;
			ondone();
		} catch (cause) {
			error =
				cause instanceof Error && cause.name !== 'FirebaseError'
					? cause.message
					: 'Could not save your recipe. Check your connection and try again.';
		} finally {
			saving = false;
		}
	}
</script>

<form class="recipe-form" onsubmit={submit}>
	<fieldset disabled={saving}>
		<label for="recipe-title">Recipe name</label>
		<input
			id="recipe-title"
			bind:value={title}
			maxlength={MAX_RECIPE_TITLE}
			required
			placeholder="e.g. Weeknight vegetable soup"
		/>
		<label for="recipe-ingredients">Ingredients</label>
		<p class="recipe-hint" id="ingredients-hint">
			One ingredient per line, including measurements. Up to 100 ingredients, 80 characters each.
		</p>
		<textarea
			id="recipe-ingredients"
			bind:value={ingredientsText}
			rows="8"
			required
			aria-describedby="ingredients-hint"
			placeholder="½ cup flour&#10;2 eggs&#10;400 g chopped tomatoes"></textarea>
		<label for="recipe-instructions"
			>Instructions and notes <span class="recipe-optional">(optional)</span></label
		>
		<textarea
			id="recipe-instructions"
			bind:value={instructions}
			rows="6"
			maxlength={MAX_INSTRUCTIONS_LENGTH}
			placeholder="How to make it, serving suggestions, or a source to remember…"></textarea>
	</fieldset>
	{#if error}<p class="recipe-error" role="alert">{error}</p>{/if}
	<div class="recipe-actions">
		<button class="recipe-primary" type="submit" disabled={saving}
			>{saving ? 'Saving…' : 'Save recipe'}</button
		>
		<button class="recipe-secondary" type="button" disabled={saving} onclick={cancel}>Cancel</button
		>
	</div>
</form>
