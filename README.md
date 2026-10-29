# Food Trax

Food Trax is a small, mobile-friendly grocery list for a household. People sign in with Google and see the same Firestore-backed list. The interface is designed to keep the rows compact on a phone, with quantity controls, an in-cart checkbox, and quick item removal.

## Features

- Google sign-in and sign-out through Firebase Authentication.
- A shared grocery list that updates live for signed-in members.
- A shared recipe collection with search, editable ingredients, instructions, and notes.
- Add selected recipe ingredients to groceries, keeping measurements in the item text.
- Add an item, change its quantity from 1 to 9, or mark it as in the cart.
- Delete one item and restore it from the undo message for a short time.
- Clear the whole list after confirming the action.
- Responsive layout for phone and desktop screens.
- Installable as a Progressive Web App (PWA), with the app shell available offline after first load.

## Technology

- SvelteKit and Svelte 5 with TypeScript
- Vite and Tailwind CSS
- Firebase Authentication with Google sign-in
- Cloud Firestore and Firebase Security Rules
- Firebase Hosting for the static single-page app
- Vitest for unit tests and Firestore Rules Unit Testing for security-rule tests

The app uses Firebase from the browser; it does not require a Cloud Function or a separate application server. Copy `.env.example` to `.env.local` and fill in the Firebase web app configuration to run the app. Vite's `VITE_` variables are included in the browser bundle, so these Firebase values remain public in a production build. They identify the project; they do not authorize database access. Authentication and Firestore Security Rules control access to grocery and recipe data. Never place a Firebase Admin SDK key, Gemini API key, or other private credential in a `VITE_` variable.

For public hosting, consider enabling Firebase App Check for the web app after registering your app's hosting domains. App Check helps reduce requests from unauthorized clients; keep the Firestore rules in place because App Check does not replace data authorization.

## How shared access works

This Firebase project currently has one shared list. A person can read or change it only when a membership document exists at `groceryListMembers/{firebase-auth-uid}`. The document contains `displayName` and `role` fields. The app shows the display name; membership is currently managed manually by the list owner in the Firebase Console.

To add someone:

1. Have them sign in with Google and copy the user ID shown on the access-needed screen.
2. In Firebase Console, open **Firestore Database** and create a document in `groceryListMembers` whose document ID is exactly that user ID.
3. Add string fields such as `displayName` and `role` (for example, `member`).
4. Ask them to return to the app and select **I've been added — refresh**.

The `role` field is informational in the current rules: every listed member has the same grocery-list permissions. Users cannot change membership documents from the app. To support multiple separate lists, the data model and rules would need a list identifier and membership per list.

## Recipes

Use the **Groceries** and **Recipes** tabs to switch pages. In Recipes, choose
**New recipe**, enter a name, and type or paste ingredients with one ingredient
per line. Include measurements directly in the text, for example `½ cup flour`
or `400 g tomatoes`. Instructions and notes are optional. Recipes are shared
with the same members as the grocery list.

Open a saved recipe to edit or delete it, or select ingredients and choose
**Add to groceries**. Each ingredient becomes a grocery item with quantity 1.
Existing items with matching full text are skipped (ignoring case and repeated
whitespace), including items already marked in the cart. Different measurements
remain separate items. Existing item quantities and cart status are preserved.
Duplicate detection uses a read before the batch write; simultaneous imports
from different devices can still create duplicates.

Recipes allow up to 100 ingredients, with at most 80 characters per ingredient
to fit the grocery item limit. Names allow 100 characters and notes allow
10,000. The editor warns before leaving unsaved changes, and checks recipe
versions to prevent silently overwriting another member's changes. Copy your
changes before canceling an edit if someone else has updated the recipe.

This version supports manual entry and pasting text. Image extraction and
image storage are not configured and require no AI account for this release.

The updated Firestore rules must be deployed along with the app; the previous
rules deny all recipe access. After checking the app and running the rules
tests with Java installed, deploy with:

```sh
firebase login --reauth
npm run build
firebase deploy --only firestore:rules,hosting
```

The new recipe Security Rules are a prototype: they require existing household
membership and validate recipe fields, timestamps, and version changes. Review
and verify them before broadly sharing the app.

## Firestore data

Grocery items live in `groceryItems/{item-id}`:

| Field       | Type      | Description                     |
| ----------- | --------- | ------------------------------- |
| `name`      | string    | Item name, 1–80 characters      |
| `count`     | integer   | Quantity from 1 to 9            |
| `inCart`    | boolean   | Whether the item is in the cart |
| `createdAt` | timestamp | Creation time                   |
| `sortOrder` | integer   | Optional manual list position   |

Membership records live in `groceryListMembers/{uid}` and contain `displayName` and `role`. The rules allow a signed-in user to read only their own membership record. Grocery-list reads and writes are allowed only when that record exists. Item creation and updates are also checked for valid fields and values in `firestore.rules`.

Recipes live in `recipes/{recipe-id}`:

| Field             | Type      | Description                                                           |
| ----------------- | --------- | --------------------------------------------------------------------- |
| `title`           | string    | Recipe name, 1–100 characters                                         |
| `ingredientsText` | string    | 1–100 newline-separated ingredients, 1–80 characters each             |
| `instructions`    | string    | Instructions/notes, up to 10,000 characters; empty string when absent |
| `version`         | integer   | Starts at 1 and increments on each edit                               |
| `createdAt`       | timestamp | Server creation time; immutable                                       |
| `updatedAt`       | timestamp | Server time of the most recent save                                   |

## Run locally

### Requirements

- Node.js supported by the installed SvelteKit and Vite versions
- Yarn
- A Firebase project with Authentication and Cloud Firestore configured

Install dependencies and start the development server:

```sh
yarn install
cp .env.example .env.local
# Fill .env.local with the Firebase web app configuration from Firebase Console.
yarn dev
```

The ignored `.env.local` file keeps configuration values out of Git history for convenience. Since these are web app values, moving them to environment variables does not make them secret.

Vite prints the local address, usually `http://localhost:5173`. If you use another port or hostname, add that host to **Firebase Console → Authentication → Settings → Authorized domains** before testing Google sign-in.

The Firebase project configuration is in `src/lib/firebase.ts`. For a fork, replace it with the configuration for your Firebase web app. Enable **Google** as a sign-in provider, create the Firestore database, and publish `firestore.rules` before using the live project.

## Checks and tests

Run the Svelte and TypeScript checks:

```sh
yarn run check
```

Run the unit tests, including the quantity boundary tests:

```sh
yarn test:unit --run --project server
```

Run Firestore Security Rules tests against the local Firestore Emulator:

```sh
yarn test:rules
```

The rules test command starts the Firestore Emulator on port `8080`. It requires the Firebase CLI and a Java runtime supported by the Emulator Suite. These tests cover signed-out and non-member access, member permissions, document validation, and deletion/undo restoration.

Recipe rules tests also cover non-member access, schema limits on both create
and update, shared editing, conflicts, immutable timestamps, and ingredient
imports. Run browser component tests, including the recipe editor (requires
Playwright Chromium):

```sh
yarn test:unit --run --project client
```

Create and inspect a production build locally:

```sh
yarn build
yarn preview
```

## Install on a phone

Open `https://food-trax-339db.firebaseapp.com` in the phone's browser. On Android, use the browser menu and choose **Install app** or **Add to Home screen**. On iPhone, use Safari's **Share** menu and choose **Add to Home Screen**. The app includes a web manifest, home-screen icons, and a service worker that caches the application shell and built assets. Google sign-in and live grocery-list updates still need an internet connection; grocery data is not stored in the service-worker cache.

## Deploy to Firebase Hosting

The project is configured for Firebase Hosting. `yarn build` creates the static app in `build/`, including the `200.html` fallback used for client-side routes such as `/login`. `.firebaserc` selects the `food-trax-339db` Firebase project by default.

To deploy the Hosting site after signing in to Firebase CLI:

```sh
yarn build
firebase deploy --only hosting
```

The project is available at both `https://food-trax-339db.web.app` and `https://food-trax-339db.firebaseapp.com`. Use the `firebaseapp.com` URL for mobile redirect sign-in: it matches the `authDomain` in `src/lib/firebase.ts`, avoiding cross-site storage restrictions in browsers. If you want to use the `web.app` URL for redirect sign-in, follow Firebase's [redirect sign-in best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) to configure the app domain as `authDomain` and authorize its OAuth redirect URI. This command deploys only the website; Firestore rules and indexes are deployed separately, for example with `firebase deploy --only firestore:rules,firestore:indexes`.

## Project files

- `src/routes/(household)/+layout.svelte` — shared membership check, header, and navigation.
- `src/routes/(household)/+page.svelte` — grocery list and list actions.
- `src/routes/(household)/recipes/` — recipe collection, creation, and detail routes.
- `src/routes/login/+page.svelte` — Google sign-in and access-needed screen.
- `src/lib/firebase.ts` — Firebase app, Authentication, Firestore, and Analytics setup.
- `src/lib/grocery-items.ts` — quantity bounds and item delete/restore helpers.
- `src/lib/grocery-items.spec.ts` — quantity boundary unit tests.
- `src/lib/recipes.ts` — recipe validation, saves, conflict detection, and ingredient importing.
- `src/lib/components/RecipeEditor.svelte` — editable recipe form with unsaved-change protection.
- `src/lib/components/RecipeDetail.svelte` — recipe display, editing, deletion, and ingredient selection.
- `src/lib/recipes.spec.ts` — ingredient text, duplicate handling, and validation tests.
- `src/lib/firestore.rules.spec.ts` — Firestore rules and delete/undo tests.
- `src/service-worker/index.ts` — versioned app-shell and asset caching for offline launch.
- `static/manifest.webmanifest` and `static/icons/` — PWA metadata and install icons.
- `firestore.rules` — authorization and grocery-item validation.
- `firebase.json` — Firestore, emulator, and Hosting configuration.
