<script lang="ts">
	// Master bus FX panel — UI-only, not DSL-accessible.
	// The DSL uses | fx(\name) for insert FX; the master chain is configured here.

	type ParamSpec = {
		min?: number;
		max?: number;
		default?: number;
		unit?: string;
	};

	type SlotMeta = {
		synthdef: string;
		label: string;
		specs: Record<string, ParamSpec>;
	};

	type SlotState = {
		enabled: boolean;
		params: Record<string, number>;
	};

	type Props = {
		slots: SlotMeta[];
		onEnable: (
			synthdef: string,
			allEnabledStates: Record<string, boolean>,
			allParams: Record<string, Record<string, number>>
		) => boolean;
		onDisable: (synthdef: string) => void;
		onParamChange: (synthdef: string, param: string, value: number) => void;
	};

	const { slots, onEnable, onDisable, onParamChange }: Props = $props();

	const STORAGE_KEY = 'flux:master-fx';

	function loadState(): Record<string, SlotState> {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed: unknown = JSON.parse(raw);
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					return parsed as Record<string, SlotState>;
				}
			}
		} catch (e) {
			if (e instanceof DOMException || e instanceof SyntaxError) {
				console.warn('[FxPanel] Could not restore state from localStorage:', e);
			} else {
				throw e;
			}
		}
		return {};
	}

	function defaultParams(specs: Record<string, ParamSpec>): Record<string, number> {
		return Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, s.default ?? 0]));
	}

	// Initialise chain state — restore from localStorage, falling back to defaults.
	// slots is stable after mount (page load data). We read it in a function to
	// avoid Svelte's reactive-capture warning at module init time.
	function initChain(): SlotState[] {
		const saved = loadState();
		return slots.map((slot) => {
			const stored = saved[slot.synthdef];
			// Only restore param values that are numbers to avoid passing bad types to sc.synth
			const storedParams = Object.fromEntries(
				Object.entries(stored?.params ?? {}).filter(([, v]) => typeof v === 'number')
			) as Record<string, number>;
			return {
				enabled: stored?.enabled ?? true,
				params: { ...defaultParams(slot.specs), ...storedParams }
			};
		});
	}
	let chain = $state<SlotState[]>(initChain());

	function persist() {
		const data: Record<string, SlotState> = {};
		slots.forEach((slot, i) => {
			data[slot.synthdef] = chain[i];
		});
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (e) {
			if (e instanceof DOMException) {
				// Storage quota exceeded — state will not be persisted
			} else {
				throw e;
			}
		}
	}

	function handleToggle(i: number) {
		const slot = slots[i];
		const state = chain[i];
		if (state.enabled) {
			onDisable(slot.synthdef);
			state.enabled = false;
		} else {
			// Build full chain snapshot for the page to rebuild in correct order.
			const allEnabledStates = Object.fromEntries(
				slots.map((s, j) => [s.synthdef, j === i ? true : chain[j].enabled])
			);
			const allParams = Object.fromEntries(slots.map((s, j) => [s.synthdef, chain[j].params]));
			const ok = onEnable(slot.synthdef, allEnabledStates, allParams);
			if (ok) state.enabled = true;
		}
		persist();
	}

	function handleParam(i: number, param: string, value: number) {
		chain[i].params[param] = value;
		persist();
		if (chain[i].enabled) {
			onParamChange(slots[i].synthdef, param, value);
		}
	}
</script>

<details>
	<summary>master bus FX</summary>

	<div class="chain">
		{#each slots as slot, i (slot.synthdef)}
			<div class="slot" class:disabled={!chain[i].enabled}>
				<label class="slot-header">
					<input
						type="checkbox"
						checked={chain[i].enabled}
						onclick={(e) => {
							e.preventDefault();
							handleToggle(i);
						}}
					/>
					<span class="fx-name">{slot.label}</span>
				</label>

				{#if Object.keys(slot.specs).length > 0}
					<div class="params">
						{#each Object.entries(slot.specs) as [param, spec] (param)}
							<label class="param-row">
								<span class="param-name">{param}</span>
								<input
									type="range"
									min={spec.min ?? 0}
									max={spec.max ?? 1}
									step={((spec.max ?? 1) - (spec.min ?? 0)) / 100}
									value={chain[i].params[param]}
									oninput={(e) =>
										handleParam(i, param, parseFloat((e.target as HTMLInputElement).value))}
								/>
								<span class="param-value"
									>{chain[i].params[param].toFixed(2)}{spec.unit ? ' ' + spec.unit : ''}</span
								>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
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
		padding: 4px 8px;
		background: var(--color-bg-dark);
		border: 1px solid var(--color-bg-border);
		border-radius: 3px;
	}

	.slot.disabled {
		opacity: 0.45;
	}

	.slot-header {
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

	.params {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-top: 6px;
		padding-top: 4px;
		border-top: 1px solid var(--color-bg-border);
	}

	.param-row {
		display: grid;
		grid-template-columns: 5rem 1fr 3.5rem;
		align-items: center;
		gap: 6px;
		cursor: default;
	}

	.param-name {
		font-size: 0.68rem;
		color: var(--color-text-hint);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	input[type='range'] {
		width: 100%;
		height: 2px;
		accent-color: var(--color-text-dim);
	}

	.param-value {
		font-size: 0.65rem;
		color: var(--color-text-hint);
		text-align: right;
		white-space: nowrap;
	}
</style>
