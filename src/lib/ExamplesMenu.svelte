<script lang="ts">
	export type ExampleEntry = {
		id: string;
		label: string;
		description: string;
		file: string;
	};

	interface Props {
		examples: ExampleEntry[];
		onSelect?: (id: string) => void;
	}

	let { examples, onSelect }: Props = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function select(id: string) {
		open = false;
		onSelect?.(id);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="examples-menu" class:open>
	<button class="toggle-btn" onclick={toggle} aria-haspopup="menu" aria-expanded={open}>
		examples ▾
	</button>

	<ul role="menu" class="menu-list" hidden={!open}>
		{#each examples as ex (ex.id)}
			<li role="none">
				<button role="menuitem" class="menu-item" onclick={() => select(ex.id)}>
					<span class="item-label">{ex.label}</span>
					<span class="item-desc">{ex.description}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	.examples-menu {
		position: relative;
		display: inline-block;
	}

	.toggle-btn {
		/* inherit from global button but allow auto width */
		width: auto;
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		background: var(--surface-1);
		color: var(--text-secondary);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-smooth),
			color var(--duration-fast) var(--ease-smooth),
			border-color var(--duration-fast) var(--ease-smooth);
	}

	.toggle-btn:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text-primary);
		border-color: var(--interactive);
	}

	.open .toggle-btn {
		border-color: var(--interactive);
		color: var(--text-primary);
	}

	.menu-list {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		z-index: 100;
		min-width: 220px;
		margin: 0;
		padding: var(--space-1) 0;
		list-style: none;
		background: var(--surface-1);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}

	.menu-list[hidden] {
		display: none;
	}

	.menu-item {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: none;
		border: none;
		border-radius: 0;
		text-align: left;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-smooth);
	}

	.menu-item:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.item-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-primary);
	}

	.item-desc {
		font-size: 10px;
		color: var(--text-muted);
		margin-top: 1px;
	}
</style>
