// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="vite/client" />
declare global {
	// The base path of the site, from vite.config.ts.
	const __FLUX_BASE_PATH__: string;
	// The build identity, from scripts/build-info.ts (vite.config.ts).
	const __FLUX_BUILD__: import('#lib/build-info.js').BuildInfo;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
