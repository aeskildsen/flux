<script lang="ts">
	import { resolve } from '$app/paths';

	interface Props {
		active?: string;
	}

	const { active = '' }: Props = $props();

	const sections = [
		{ id: 'get-started', label: 'Get Started', href: resolve('/docs/get-started') },
		{ id: 'content-types', label: 'Content Types', href: resolve('/docs/content-types') },
		{ id: 'generators', label: 'Generators', href: resolve('/docs/generators') },
		{ id: 'modifiers', label: 'Modifiers', href: resolve('/docs/modifiers') },
		{ id: 'params', label: 'Params', href: resolve('/docs/params') },
		{ id: 'decorators', label: 'Decorators', href: resolve('/docs/decorators') },
		{ id: 'synthdefs', label: 'SynthDefs', href: resolve('/docs/synthdefs') },
		{ id: 'buffers', label: 'Buffers', href: resolve('/docs/buffers') }
	];
</script>

<nav class="docs-sidebar">
	<p class="sidebar-heading">Reference</p>
	<ul>
		{#each sections as section (section.id)}
			<li>
				<a href={section.href} class:active={active === section.id}>
					{section.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.docs-sidebar {
		width: 160px;
		flex-shrink: 0;
		position: sticky;
		top: var(--space-5);
	}

	.sidebar-heading {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin: 0 0 var(--space-2) 0;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	a {
		display: block;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		text-decoration: none;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		transition: color var(--duration-fast) var(--ease-smooth);
	}

	a:hover {
		color: var(--text-primary);
		background: var(--surface-1);
	}

	a.active {
		color: var(--text-primary);
		background: var(--surface-2);
	}
</style>
