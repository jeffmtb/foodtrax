import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

const cachePrefix = 'food-trax-';
const cacheName = `${cachePrefix}${version}`;
const appShellPath = '/200.html';
const cachedAssetPaths = new Set(
	[...immutable.map(({ path }) => path), ...assets.map(({ path }) => path)].map(
		(path) => new URL(path, self.location.origin).pathname
	)
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(cacheName);
			await cache.addAll([...cachedAssetPaths, appShellPath]);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const oldCacheNames = (await caches.keys()).filter(
				(name) => name.startsWith(cachePrefix) && name !== cacheName
			);
			await Promise.all(oldCacheNames.map((name) => caches.delete(name)));
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (
		request.method !== 'GET' ||
		url.origin !== self.location.origin ||
		url.pathname.startsWith('/__/')
	) {
		return;
	}

	if (cachedAssetPaths.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(cacheName);
				return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
			})()
		);
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					return await fetch(request);
				} catch {
					const cache = await caches.open(cacheName);
					return (await cache.match(appShellPath)) ?? Response.error();
				}
			})()
		);
	}
});
