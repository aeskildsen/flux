<script lang="ts">
	import SiteHeader from '$lib/SiteHeader.svelte';
	import DocsSidebar from '$lib/DocsSidebar.svelte';
	import Content from '$docs/buffers.md';
</script>

<div class="docs-page">
	<SiteHeader />
	<div class="docs-layout">
		<DocsSidebar active="buffers" />
		<main class="prose">
			<Content />
		</main>
	</div>
</div>

<style>
	.docs-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px;
	}

	.docs-layout {
		display: flex;
		gap: var(--space-8);
		align-items: flex-start;
	}
</style>
