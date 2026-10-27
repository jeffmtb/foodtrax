<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		GoogleAuthProvider,
		getRedirectResult,
		onAuthStateChanged,
		signInWithPopup,
		signInWithRedirect
	} from 'firebase/auth';
	import { auth } from '../../lib/firebase';

	const googleProvider = new GoogleAuthProvider();
	googleProvider.setCustomParameters({ prompt: 'select_account' });
	let loading = $state(true);
	let signingIn = $state(false);
	let authError = $state('');
	const googleAuthErrorMessages: Record<string, string> = {
		'auth/operation-not-allowed':
			'Google sign-in is disabled for this Firebase project. Enable Google under Firebase Console → Authentication → Sign-in method.',
		'auth/popup-blocked':
			'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
		'auth/popup-closed-by-user':
			'The Google sign-in window was closed before sign-in finished. Please try again.',
		'auth/cancelled-popup-request':
			'The Google sign-in window was closed before sign-in finished. Please try again.',
		'auth/network-request-failed':
			'Google sign-in could not reach Firebase. Check your connection and try again.',
		'auth/invalid-api-key':
			'Firebase rejected this app’s API key. Check the Firebase configuration used by the app.'
	};

	function googleSignInErrorMessage(error: unknown) {
		const code =
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof error.code === 'string'
				? error.code
				: '';

		if (code === 'auth/unauthorized-domain' || code === 'auth/unauthorized-continue-uri') {
			return `This app’s domain (${window.location.hostname}) is not authorized for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
		}

		return (
			googleAuthErrorMessages[code] ??
			(code
				? `Google sign-in failed (${code}). Please try again or check the browser console for details.`
				: 'Google sign-in did not finish. Please try again.')
		);
	}

	onMount(() => {
		if (!auth) {
			authError = 'Firebase Authentication is available only in the browser.';
			loading = false;
			return;
		}

		let authResolved = false;
		let redirectResolved = false;
		const finishInitialCheck = () => {
			if (authResolved && redirectResolved) loading = false;
		};

		void getRedirectResult(auth)
			.catch((error: unknown) => {
				console.error('Google redirect sign-in failed', error);
				authError = googleSignInErrorMessage(error);
			})
			.finally(() => {
				redirectResolved = true;
				finishInitialCheck();
			});

		const stopAuth = onAuthStateChanged(auth, (user) => {
			if (user) {
				void goto(resolve('/(household)'));
				return;
			}
			authResolved = true;
			finishInitialCheck();
		});

		return stopAuth;
	});

	async function signInWithGoogle() {
		if (!auth) return;
		authError = '';
		signingIn = true;
		try {
			const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
			if (!isLocalhost && window.matchMedia('(pointer: coarse)').matches) {
				await signInWithRedirect(auth, googleProvider);
			} else {
				await signInWithPopup(auth, googleProvider);
			}
		} catch (error) {
			console.error('Google sign-in failed', error);
			authError = googleSignInErrorMessage(error);
			signingIn = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · Food Trax</title>
	<meta name="description" content="Sign in to your shared grocery list." />
</svelte:head>

<main class="page-shell">
	<div class="login-card">
		<header class="topbar">
			<a class="brand" href={resolve('/(household)')} aria-label="Food Trax home">
				<span class="brand-mark" aria-hidden="true">ft</span>
				<span>food<span class="brand-light">trax</span></span>
			</a>
		</header>

		{#if loading}
			<div class="auth-message" role="status">Checking sign-in…</div>
		{:else}
			<section class="auth-panel">
				<h1>Sign in to your grocery list</h1>
				<p>Use your Google account to open the shared list.</p>
				<button class="google-button" type="button" onclick={signInWithGoogle} disabled={signingIn}>
					<svg viewBox="0 0 48 48" aria-hidden="true"
						><path
							fill="#4285F4"
							d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z"
						/><path
							fill="#34A853"
							d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z"
						/><path
							fill="#FBBC05"
							d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 17.9l6.8-5.1Z"
						/><path
							fill="#EA4335"
							d="M24 11.8c3 0 5.6 1 7.7 3.1l5.8-5.8A19 19 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"
						/></svg
					>
					{signingIn ? 'Connecting…' : 'Continue with Google'}
				</button>
				{#if authError}<p class="error-message" role="alert">{authError}</p>{/if}
			</section>
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
	:global(button) {
		font: inherit;
	}
	.page-shell {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 16px 16px max(16px, env(safe-area-inset-bottom));
		background: var(--app-bg);
	}
	.login-card {
		width: min(100%, 640px);
		border: 0;
		border-radius: 0;
		background: var(--app-bg);
		padding: 0 32px;
		box-shadow: none;
	}
	.topbar {
		min-height: 66px;
		border-bottom: 1px solid #edf0ed;
		display: flex;
		align-items: center;
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
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: #1d6a4b;
		color: white;
		font-size: 12px;
		font-weight: 750;
		letter-spacing: -0.6px;
	}
	.brand-light {
		color: #72907e;
		font-weight: 500;
	}
	.auth-panel {
		padding: 36px 0 42px;
	}
	.auth-panel h1 {
		margin: 0;
		color: #263b2f;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(25px, 5vw, 34px);
		font-weight: 500;
		letter-spacing: -0.6px;
	}
	.auth-panel > p {
		max-width: 470px;
		margin: 12px 0 24px;
		color: #77867c;
		font-size: 15px;
		line-height: 1.55;
	}
	.google-button {
		min-height: 48px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 11px;
		border: 1px solid #d9e1db;
		border-radius: 9px;
		padding: 0 18px;
		background: #fff;
		color: #37483d;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 1px 2px #20352a0c;
	}
	.google-button:hover:not(:disabled) {
		background: #f8faf8;
		border-color: #bdcfc1;
	}
	.google-button:disabled {
		opacity: 0.65;
		cursor: wait;
	}
	.google-button svg {
		width: 20px;
		height: 20px;
	}
	.auth-message {
		min-height: 190px;
		display: grid;
		place-content: center;
		color: #77867c;
		font-size: 14px;
		text-align: center;
	}
	.error-message {
		margin: 18px 0 0;
		border-radius: 8px;
		background: #fff1ef;
		padding: 10px 12px;
		color: #a84036;
		font-size: 12px;
		line-height: 1.5;
	}
	@media (max-width: 600px) {
		.page-shell {
			min-height: 100dvh;
			padding: 8px 8px max(8px, env(safe-area-inset-bottom));
		}
		.login-card {
			padding: 0 12px;
		}
		.topbar {
			min-height: 52px;
		}
		.brand-mark {
			width: 28px;
			height: 28px;
		}
		.auth-panel {
			padding: 28px 0 32px;
		}
		.auth-panel > p {
			font-size: 14px;
		}
	}
	@media (prefers-color-scheme: dark) {
		.topbar {
			border-color: var(--border-soft);
		}
		.brand,
		.auth-panel h1 {
			color: var(--text-strong);
		}
		.brand-light {
			color: #8db89a;
		}
		.auth-panel > p,
		.auth-message {
			color: var(--text-muted);
		}
		.google-button {
			border-color: var(--control-border);
			background: var(--surface);
			color: var(--text-body);
			box-shadow: 0 1px 2px #0004;
		}
		.google-button:hover:not(:disabled) {
			border-color: #557963;
			background: var(--surface-hover);
		}
		.error-message {
			background: var(--error-bg);
			color: var(--error-text);
		}
	}
</style>
