<script lang="ts">
	// Master bus FX panel — UI-only, not DSL-accessible.
	// The DSL uses | fx(\name) for insert FX; the master chain is configured here.
	// Audio wiring is not yet implemented — this is the UI scaffold.

	type FxSlot = {
		name: string;
		enabled: boolean;
	};

	// TODO: persist slot enabled/disabled state (and parameter values) once audio wiring is implemented.
	let chain = $state<FxSlot[]>([
		{ name: 'EQ', enabled: true },
		{ name: 'Reverb', enabled: true },
		{ name: 'Compressor', enabled: true },
		{ name: 'Limiter', enabled: true }
	]);
</script>

<details>
	<summary>master bus FX</summary>

	<div class="chain">
		{#each chain as slot, i (i)}
			<div class="slot" class:disabled={!slot.enabled}>
				<label>
					<input type="checkbox" bind:checked={slot.enabled} />
					<span class="fx-name">{slot.name}</span>
				</label>
			</div>
		{/each}
	</div>

	<p class="note">audio wiring not yet implemented</p>
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

	.chain {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
	}

	.slot {
		display: flex;
		align-items: center;
		padding: 4px 8px;
		background: var(--color-bg-dark);
		border: 1px solid var(--color-bg-border);
		border-radius: 3px;
	}

	.slot.disabled {
		opacity: 0.45;
	}

	label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		width: 100%;
	}

	.fx-name {
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	.note {
		margin: 6px 0 0;
		font-size: 0.68rem;
		color: var(--color-text-hint);
		font-style: italic;
	}
</style>
