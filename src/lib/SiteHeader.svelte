<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<header class="site-header">
	<div class="site-header-left">
		<h1><a href={resolve('/')}>flux</a></h1>
		<p>live coding with stochastic cyclicity</p>
	</div>
	<nav class="site-nav">
		<a href={resolve('/')}>play</a>
		<a href={resolve('/docs')}>docs</a>
		<a href="https://github.com/aeskildsen/flux">github</a>
	</nav>
</header>

<style>
	.site-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding-bottom: var(--space-3);
		gap: 1.1em;
		font-size: var(--text-base);
	}

	.site-header-left {
		display: flex;
		gap: 1.1em;
		align-items: baseline;
	}

	.site-header-left h1 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-1) 0;
		letter-spacing: 0.05em;
		display: inline;
	}

	.site-header-left h1 a {
		color: inherit;
		text-decoration: none;
	}

	.site-header-left h1 a:hover {
		color: var(--text-primary);
	}

	.site-header-left p {
		color: var(--text-muted);
		margin: 0;
		display: inline;
	}

	.site-nav {
		display: flex;
		gap: var(--space-4);
		flex-shrink: 0;
	}

	.site-nav a {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.site-nav a:hover {
		color: var(--text-primary);
	}
</style>
