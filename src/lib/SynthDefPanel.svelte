<script lang="ts">
	type ParamSpec = {
		min?: number;
		max?: number;
		default?: number;
		warp?: string;
		unit?: string;
	};

	type SynthDefMeta = {
		credit: string;
		description: string;
		source: string;
		type: string;
		fx_role?: string;
		url: string;
		specs?: Record<string, ParamSpec>;
	};

	let { synthdefs }: { synthdefs: Record<string, SynthDefMeta> } = $props();

	const count = $derived(Object.keys(synthdefs).length);
	const entries = $derived(Object.entries(synthdefs));

	function formatRange(spec: ParamSpec): string {
		if (spec.min !== undefined && spec.max !== undefined) return `${spec.min}–${spec.max}`;
		if (spec.min !== undefined) return `≥ ${spec.min}`;
		if (spec.max !== undefined) return `≤ ${spec.max}`;
		return '';
	}
</script>

<details>
	<summary>synthdefs ({count})</summary>

	{#each entries as [name, meta]}
		<div class="card">
			<div class="card-name">{name}</div>

			{#if meta.description}
				<p class="description">{meta.description}</p>
			{/if}

			{#if meta.specs && Object.keys(meta.specs).length > 0}
				<table class="params">
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
								<td class="param-name">{param}</td>
								<td>{spec.default ?? ''}</td>
								<td>{formatRange(spec)}</td>
								<td class="unit">{spec.unit ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			{#if meta.credit || meta.url}
				<div class="credit">
					{#if meta.url}
						<a href={meta.url} target="_blank" rel="noopener">{meta.credit || meta.url}</a>
					{:else}
						{meta.credit}
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</details>

<style>
	details {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	summary {
		cursor: pointer;
		user-select: none;
		color: var(--text-secondary);
		padding: var(--space-px) 0;
		list-style: none;
	}

	summary::before {
		content: '▶ ';
		font-size: 0.6em;
		vertical-align: middle;
	}

	details[open] summary::before {
		content: '▼ ';
	}

	.card {
		margin-top: var(--space-2);
		padding: var(--space-2);
		background: var(--surface-0);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.card-name {
		color: var(--text-secondary);
		font-weight: var(--weight-semibold);
		font-size: var(--text-sm);
	}

	.description {
		margin: 0;
		font-size: 11px;
		color: var(--text-secondary);
		line-height: var(--leading-normal);
	}

	.params {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}

	.params th {
		text-align: left;
		color: var(--text-muted);
		font-weight: var(--weight-normal);
		padding: 2px var(--space-1) 2px 0;
		border-bottom: var(--border-width) solid var(--border-subtle);
	}

	.params td {
		padding: 2px var(--space-1) 2px 0;
		color: var(--text-secondary);
		vertical-align: top;
	}

	.params .param-name {
		color: var(--text-secondary);
		font-style: italic;
	}

	.params .unit {
		color: var(--text-muted);
	}

	.credit {
		font-size: 10px;
		margin-top: var(--space-px);
	}

	.credit a {
		color: var(--interactive);
		text-decoration: none;
	}

	.credit a:hover {
		text-decoration: underline;
	}
</style>
