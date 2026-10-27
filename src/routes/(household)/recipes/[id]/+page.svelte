<script lang="ts">
	import { page } from '$app/state';
	import RecipeDetail from '#lib/components/RecipeDetail.svelte';
</script>

{#key page.params.id}
	<RecipeDetail id={page.params.id!} />
{/key}
