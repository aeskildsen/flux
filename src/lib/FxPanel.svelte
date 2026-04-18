<script lang="ts">
	// Master bus FX panel — UI-only, not DSL-accessible.
	// The DSL uses | fx(\name) for insert FX; the master chain is configured here.
	import { ChevronRight } from 'lucide-svelte';

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
	<summary><ChevronRight class="chevron" size={12} />master bus FX</summary>

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

	summary :global(.chevron) {
		display: inline-block;
		vertical-align: middle;
		margin-right: var(--space-1);
		transition: transform 0.18s ease-in-out;
	}

	details[open] summary :global(.chevron) {
		transform: rotate(90deg);
	}

	.chain {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.slot {
		padding: var(--space-1) var(--space-2);
		background: var(--surface-0);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-sm);
	}

	.slot.disabled {
		opacity: 0.45;
	}

	.slot-header {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		cursor: pointer;
		width: 100%;
	}

	.fx-name {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.params {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-top: var(--space-1);
		padding-top: var(--space-1);
		border-top: var(--border-width) solid var(--border-subtle);
	}

	.param-row {
		display: grid;
		grid-template-columns: 5rem 1fr 3.5rem;
		align-items: center;
		gap: var(--space-1);
		cursor: default;
	}

	.param-name {
		font-size: 11px;
		color: var(--text-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	input[type='range'] {
		width: 100%;
		height: 2px;
		accent-color: var(--text-secondary);
	}

	.param-value {
		font-size: 10px;
		color: var(--text-muted);
		text-align: right;
		white-space: nowrap;
	}
</style>
