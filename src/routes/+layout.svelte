<script lang="ts">
	import '../lib/firebase';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/food-trax-192.png" />
	<meta name="theme-color" content="#1d6a4b" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#102018" media="(prefers-color-scheme: dark)" />
	<meta name="color-scheme" content="light dark" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content="Food Trax" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
</svelte:head>

{@render children()}
