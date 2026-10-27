export function recipeLoadErrorMessage(code: string): string {
	switch (code) {
		case 'permission-denied':
			return 'Your account cannot access recipes right now. Ask the list owner to check recipe access.';
		case 'unauthenticated':
			return 'Your sign-in has expired. Sign out and sign in again to load recipes.';
		case 'unavailable':
		case 'deadline-exceeded':
			return 'Could not connect to recipes. Check your internet connection and try again.';
		case 'resource-exhausted':
			return 'Recipes are temporarily unavailable. Please try again later.';
		default:
			return 'Could not load recipes. Please try again.';
	}
}
