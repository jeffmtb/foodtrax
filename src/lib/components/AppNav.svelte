<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<nav aria-label="Main navigation">
	<a href={resolve('/(household)')} aria-current={page.url.pathname === '/' ? 'page' : undefined}
		>Groceries</a
	>
	<a
		href={resolve('/(household)/recipes')}
		aria-current={page.url.pathname.startsWith('/recipes') ? 'page' : undefined}>Recipes</a
	>
</nav>

<style>
	nav {
		display: flex;
		gap: 6px;
		padding: 12px 0;
		border-bottom: 1px solid var(--border-soft);
	}
	a {
		padding: 8px 16px;
		border-radius: 8px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 13px;
		font-weight: 650;
	}
	a:hover {
		background: var(--surface-muted);
		color: var(--text-strong);
	}
	a[aria-current='page'] {
		background: var(--accent-soft);
		color: var(--accent-muted);
	}
</style>
