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
		font-size: 0.78rem;
		color: var(--color-text-dim);
	}

	summary {
		cursor: pointer;
		user-select: none;
		color: var(--color-text-dim);
		padding: 2px 0;
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
		margin-top: 8px;
		padding: 8px;
		background: var(--color-bg-dark);
		border: 1px solid var(--color-bg-border);
		border-radius: 3px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.card-name {
		color: var(--color-text-muted);
		font-weight: bold;
		font-size: 0.8rem;
	}

	.description {
		margin: 0;
		font-size: 0.72rem;
		color: var(--color-text-muted);
		line-height: 1.45;
	}

	.params {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.7rem;
	}

	.params th {
		text-align: left;
		color: var(--color-text-hint);
		font-weight: normal;
		padding: 2px 4px 2px 0;
		border-bottom: 1px solid var(--color-bg-border);
	}

	.params td {
		padding: 2px 4px 2px 0;
		color: var(--color-text-dim);
		vertical-align: top;
	}

	.params .param-name {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.params .unit {
		color: var(--color-text-hint);
	}

	.credit {
		font-size: 0.68rem;
		margin-top: 2px;
	}

	.credit a {
		color: var(--color-link);
		text-decoration: none;
	}

	.credit a:hover {
		text-decoration: underline;
	}
</style>
