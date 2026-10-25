<script lang="ts">
	import { staticAsset } from '#lib/static-asset.js';
	import { buildInfo, buildLabel, sourceURL } from '#lib/build-info.js';

	// Svelte removes white space at the end of an each block, so the
	// separator with its spaces is an expression.
	const separator = ' · ';
</script>

<p class="build-info">
	<!-- Each part stays on one line; the line breaks only between parts. -->
	{#each buildLabel(buildInfo).split(separator) as part, i (i)}<span>{part}</span>{separator}{/each}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
	<a href={sourceURL(buildInfo)}>source</a> ·
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static asset, not a route -->
	<a href={staticAsset('flux-engine/NOTICE.md')}>engine notice</a>
</p>

<style>
	.build-info {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
	}

	.build-info span,
	.build-info a {
		white-space: nowrap;
	}

	.build-info a {
		color: inherit;
	}

	.build-info a:hover {
		color: var(--text-primary);
	}
</style>
