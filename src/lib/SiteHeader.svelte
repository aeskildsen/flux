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
		padding-bottom: 12px;
		gap: 1.1em;
		font-size: 1rem;
	}

	.site-header-left {
		display: flex;
		gap: 1.1em;
		align-items: baseline;
	}

	.site-header-left h1 {
		font-size: 1.5rem;
		margin: 0 0 4px 0;
		letter-spacing: 0.05em;
		display: inline;
	}

	.site-header-left h1 a {
		color: inherit;
		text-decoration: none;
	}

	.site-header-left h1 a:hover {
		color: var(--color-text);
	}

	.site-header-left p {
		color: var(--color-text-faint);
		margin: 0;
		display: inline;
	}

	.site-nav {
		display: flex;
		gap: 16px;
		flex-shrink: 0;
	}

	.site-nav a {
		color: var(--color-text-dim);
		text-decoration: none;
	}

	.site-nav a:hover {
		color: var(--color-text);
	}
</style>
