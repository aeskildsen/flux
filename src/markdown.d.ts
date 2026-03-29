declare module '*.md' {
	import type { SvelteComponent } from 'svelte';
	export default class extends SvelteComponent {}
}
