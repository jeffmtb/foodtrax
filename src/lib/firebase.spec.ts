import { describe, expect, it } from 'vitest';
import { analytics, app, firebaseConfig } from './firebase';

describe('Firebase setup', () => {
	it('initializes the app with the Food Trax project configuration', () => {
		expect(app.options.projectId).toBe(import.meta.env.VITE_FIREBASE_PROJECT_ID);
		expect(firebaseConfig.apiKey).toBe(import.meta.env.VITE_FIREBASE_API_KEY);
		expect(firebaseConfig.authDomain).toBe(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
		expect(firebaseConfig.storageBucket).toBe(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
		expect(firebaseConfig.measurementId).toBe(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID);
		expect(analytics).toBeNull();
	});
});
