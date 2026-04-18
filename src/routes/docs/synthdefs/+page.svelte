<script lang="ts">
	import SiteHeader from '$lib/SiteHeader.svelte';
	import DocsSidebar from '$lib/DocsSidebar.svelte';
	import Content from '$docs/synthdefs.md';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const entries = $derived(Object.entries(data.synthdefs));

	function formatRange(spec: { min?: number; max?: number }): string {
		if (spec.min !== undefined && spec.max !== undefined) return `${spec.min}–${spec.max}`;
		if (spec.min !== undefined) return `≥ ${spec.min}`;
		if (spec.max !== undefined) return `≤ ${spec.max}`;
		return '';
	}
</script>

<div class="docs-page">
	<SiteHeader />
	<div class="docs-layout">
		<DocsSidebar active="synthdefs" />
		<main class="prose">
			<Content />

			{#if entries.length > 0}
				<h2>Loaded SynthDefs</h2>
				{#each entries as [name, meta]}
					<div class="synthdef-card">
						<h3 class="synthdef-name"><code>{name}</code></h3>

						{#if meta.description}
							<p class="synthdef-desc">{meta.description}</p>
						{/if}

						{#if meta.contentTypes && meta.contentTypes.length > 0}
							<p class="synthdef-meta">
								Content types:
								{#each meta.contentTypes as ct, i}
									<code>{ct}</code>{#if i < meta.contentTypes.length - 1}{', '}{/if}
								{/each}
							</p>
						{/if}

						{#if meta.specs && Object.keys(meta.specs).length > 0}
							<table>
								<thead>
									<tr>
										<th>param</th>
										<th>default</th>
										<th>range</th>
										<th>unit</th>
									</tr>
								</thead>
								<tbody>
									{#each Object.entries(meta.specs) as [param, spec]}
										<tr>
											<td><code>{param}</code></td>
											<td>{spec.default ?? ''}</td>
											<td>{formatRange(spec)}</td>
											<td>{spec.unit ?? ''}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}

						{#if meta.credit || meta.url}
							<p class="synthdef-credit">
								{#if meta.url}
									<a href={meta.url} target="_blank" rel="noopener">{meta.credit || meta.url}</a>
								{:else}
									{meta.credit}
								{/if}
							</p>
						{/if}
					</div>
				{/each}
			{/if}
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

	.synthdef-card {
		margin-bottom: var(--space-8);
		padding: var(--space-4);
		background: var(--surface-1);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-md);
	}

	.synthdef-name {
		margin: 0 0 var(--space-2) 0;
		font-size: var(--text-base);
	}

	.synthdef-desc {
		margin: 0 0 var(--space-3) 0;
		color: var(--text-secondary);
	}

	.synthdef-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0 0 var(--space-3) 0;
	}

	.synthdef-credit {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: var(--space-3) 0 0 0;
	}

	.synthdef-credit a {
		color: var(--interactive);
		text-decoration: none;
	}

	.synthdef-credit a:hover {
		text-decoration: underline;
	}
</style>
