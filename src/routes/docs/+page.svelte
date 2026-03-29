<script lang="ts">
	import SiteHeader from '$lib/SiteHeader.svelte';
	import Spec from '$docs/DSL-spec.md';
</script>

<div class="docs-page">
	<SiteHeader />
	<main class="prose">
		<Spec />
	</main>
</div>

<style>
	.docs-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 20px;
	}
</style>
