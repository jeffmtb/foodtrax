<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
	import { doc, getDoc } from 'firebase/firestore';
	import { auth, db } from '../../lib/firebase';
	import AppNav from '#lib/components/AppNav.svelte';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
	let authError = $state('');
	let currentUser = $state<User | null>(null);
	let authState = $state<'loading' | 'checking' | 'not-member' | 'member' | 'error'>('loading');
	let copiedUid = $state(false);

	onMount(() => {
		if (!auth) {
			authState = 'error';
			authError = 'Firebase Authentication is available only in the browser.';
			return;
		}
		const firebaseAuth = auth;
		let authVersion = 0;

		const stopAuth = onAuthStateChanged(firebaseAuth, async (user) => {
			const version = ++authVersion;
			currentUser = user;
			if (user) authError = '';

			if (!user) {
				authState = 'loading';
				void goto(resolve('/login'));
				return;
			}

			authState = 'checking';
			try {
				const membership = await getDoc(doc(db, 'groceryListMembers', user.uid));
				if (version !== authVersion) return;
				if (!membership.exists()) {
					authState = 'not-member';
					return;
				}

				authState = 'member';
			} catch (error) {
				console.error('Unable to check grocery list membership', error);
				if (version !== authVersion) return;
				authState = 'error';
				authError =
					'Could not verify access. Check your Firebase Authentication and Firestore rules setup.';
			}
		});

		return () => {
			authVersion++;
			stopAuth();
		};
	});

	async function signOutUser() {
		if (!auth) return;
		authError = '';
		try {
			await signOut(auth);
		} catch (error) {
			console.error('Sign-out failed', error);
			authError = 'Could not sign out. Please try again.';
		}
	}

	async function copyUid() {
		if (!currentUser) return;
		try {
			await navigator.clipboard.writeText(currentUser.uid);
			copiedUid = true;
		} catch (error) {
			console.error('Could not copy user ID', error);
			authError = 'Could not copy the ID. You can select and copy it manually.';
		}
	}

	function refreshAccess() {
		window.location.reload();
	}
</script>

<main class="page-shell">
	<div class="list-card">
		<header class="topbar">
			<a class="brand" href={resolve('/(household)')} aria-label="Food Trax home">
				<span class="brand-mark" aria-hidden="true">ft</span>
				<span>food<span class="brand-light">trax</span></span>
			</a>
			{#if currentUser}
				<div class="account-actions">
					<span class="account-name">{currentUser.displayName ?? currentUser.email}</span>
					<button class="sign-out-button" type="button" onclick={signOutUser}>Sign out</button>
				</div>
			{/if}
		</header>

		{#if authState === 'loading' || authState === 'checking'}
			<div class="auth-message" role="status">
				{authState === 'loading' ? 'Checking sign-in…' : 'Checking list access…'}
			</div>
		{:else if authState === 'not-member'}
			<section class="auth-panel member-panel">
				<h1>You’re signed in</h1>
				<p>
					This Google account hasn’t been added to the grocery list yet. Copy your user ID and ask
					the list owner to add it in Firebase Console.
				</p>
				<div class="uid-row">
					<code>{currentUser?.uid}</code><button type="button" onclick={copyUid}
						>{copiedUid ? 'Copied' : 'Copy ID'}</button
					>
				</div>
				<p class="setup-hint">
					Add a document at <code>groceryListMembers/{currentUser?.uid}</code> with a
					<code>displayName</code>
					and <code>role</code> field.
				</p>
				<button class="refresh-button" type="button" onclick={refreshAccess}
					>I’ve been added — refresh</button
				>
				{#if authError}<p class="error-message" role="alert">{authError}</p>{/if}
			</section>
		{:else if authState === 'error'}
			<div class="auth-message error-message" role="alert">{authError}</div>
		{:else}
			<AppNav />
			{#if authError}<p class="error-message" role="alert">{authError}</p>{/if}
			{@render children()}
		{/if}
	</div>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		min-width: 320px;
		background: var(--app-bg);
		color: var(--text);
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}
	:global(button),
	:global(input) {
		font: inherit;
	}
	.page-shell {
		min-height: 100vh;
		min-height: 100dvh;
		padding: 54px 20px max(34px, env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		flex-direction: column;
		background: var(--app-bg);
	}
	.list-card {
		width: min(100%, 720px);
		background: #fff;
		border: 1px solid #e7ebe7;
		border-radius: 22px;
		box-shadow:
			0 24px 70px #34493c12,
			0 3px 10px #34493c08;
		padding: 0 42px;
	}
	.topbar {
		min-height: 58px;
		border-bottom: 1px solid #edf0ed;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		color: #25362d;
		font-size: 16px;
		font-weight: 750;
		letter-spacing: -0.5px;
		text-decoration: none;
	}
	.brand-mark {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		background: #1d6a4b;
		color: white;
		font-size: 11px;
		font-weight: 750;
		letter-spacing: -0.6px;
	}
	.brand-light {
		color: #72907e;
		font-weight: 500;
	}
	.account-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.account-name {
		max-width: 210px;
		overflow: hidden;
		color: #75847a;
		font-size: 11px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sign-out-button {
		border: 0;
		padding: 6px 0;
		background: transparent;
		color: #4e715b;
		font-size: 11px;
		cursor: pointer;
	}
	.sign-out-button:hover {
		color: #205c3e;
		text-decoration: underline;
	}
	.auth-panel {
		padding: 30px 0 36px;
	}
	.auth-panel h1 {
		margin: 0;
		color: #263b2f;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 27px;
		font-weight: 500;
		letter-spacing: -0.6px;
	}
	.auth-panel > p {
		max-width: 470px;
		margin: 10px 0 20px;
		color: #77867c;
		font-size: 13px;
		line-height: 1.55;
	}
	.auth-message {
		min-height: 140px;
		display: grid;
		place-content: center;
		color: #77867c;
		font-size: 13px;
		text-align: center;
	}
	.auth-message.error-message {
		display: block;
		min-height: 0;
		margin: 18px 0;
	}
	.member-panel {
		padding-bottom: 28px;
	}
	.uid-row {
		display: flex;
		align-items: center;
		gap: 9px;
		border: 1px solid #e4ebe5;
		border-radius: 8px;
		background: #f8faf8;
		padding: 7px;
	}
	.uid-row code {
		min-width: 0;
		flex: 1;
		overflow-wrap: anywhere;
		color: #45584a;
		font-size: 11px;
	}
	.uid-row button,
	.refresh-button {
		min-height: 34px;
		border: 1px solid #d8e4da;
		border-radius: 6px;
		padding: 0 11px;
		background: #fff;
		color: #286343;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}
	.uid-row button:hover,
	.refresh-button:hover {
		background: #f1f7f2;
	}
	.auth-panel > .setup-hint {
		margin: 12px 0;
		font-size: 11px;
	}
	.setup-hint code {
		color: #425c49;
		font-size: 10px;
	}
	.refresh-button {
		margin-top: 3px;
	}
	@media (max-width: 600px) {
		.page-shell {
			padding: 8px 8px max(8px, env(safe-area-inset-bottom));
		}
		.list-card {
			border-radius: 13px;
			padding: 0 12px;
		}
		.topbar {
			min-height: 48px;
		}
		.brand {
			gap: 7px;
			font-size: 14px;
		}
		.brand-mark {
			width: 24px;
			height: 24px;
			font-size: 10px;
		}
		.account-actions {
			gap: 8px;
		}
		.account-name {
			max-width: 105px;
			font-size: 10px;
		}
	}
	.error-message {
		border-radius: 8px;
		background: var(--error-bg);
		padding: 10px 12px;
		color: var(--error-text);
		font-size: 13px;
	}
	@media (prefers-color-scheme: dark) {
		.list-card {
			background: var(--surface);
			border-color: var(--border);
			box-shadow: 0 24px 70px #0005;
		}
		.topbar {
			border-color: var(--border-soft);
		}
		.brand,
		.auth-panel h1 {
			color: var(--text-strong);
		}
		.brand-light {
			color: #8ac49c;
		}
		.account-name,
		.auth-panel > p,
		.auth-message {
			color: var(--text-muted);
		}
		.sign-out-button {
			color: var(--accent-muted);
		}
		.uid-row {
			border-color: var(--control-border);
			background: var(--surface-muted);
		}
		.uid-row code,
		.setup-hint code {
			color: var(--text-body);
		}
		.uid-row button,
		.refresh-button {
			border-color: var(--control-border);
			background: var(--surface);
			color: var(--accent-muted);
		}
	}
</style>
