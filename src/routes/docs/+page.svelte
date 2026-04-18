<script lang="ts">
	import { resolve } from '$app/paths';
	import SiteHeader from '$lib/SiteHeader.svelte';
	import DocsSidebar from '$lib/DocsSidebar.svelte';

	const sections = [
		{
			href: resolve('/docs/get-started'),
			label: 'Get Started',
			description: 'Boot the engine, evaluate your first pattern, and learn the keyboard shortcuts.'
		},
		{
			href: resolve('/docs/content-types'),
			label: 'Content Types',
			description:
				'note, mono, sample, slice, cloud — what kind of events each type generates and how timing works.'
		},
		{
			href: resolve('/docs/generators'),
			label: 'Generators',
			description:
				'Sequence lists, random noise, deterministic series, UTF-8 byte encoding, and arithmetic operators.'
		},
		{
			href: resolve('/docs/modifiers'),
			label: 'Modifiers',
			description:
				"'stut, 'pick, 'shuf, 'arp, 'rev, 'mirror, 'bounce, 'spread, 'legato, 'lock, 'eager — shape and control your event stream."
		},
		{
			href: resolve('/docs/params'),
			label: 'Params',
			description: '"param — direct SynthDef argument access, bypassing musical abstractions.'
		},
		{
			href: resolve('/docs/decorators'),
			label: 'Decorators',
			description:
				'@key, @scale, @root, @oct, @cent, @buf — pitch context and buffer selection for scoped blocks.'
		},
		{
			href: resolve('/docs/synthdefs'),
			label: 'SynthDefs',
			description:
				'Selecting synthesis engines, insert FX, master bus FX, and writing custom SynthDefs.'
		},
		{
			href: resolve('/docs/buffers'),
			label: 'Buffers',
			description: 'Loading audio files, referencing by name, beat slicing, and granular synthesis.'
		}
	];
</script>

<div class="docs-page">
	<SiteHeader />
	<div class="docs-layout">
		<DocsSidebar active="" />
		<main class="prose">
			<h1>Flux DSL Reference</h1>
			<p>
				Complete reference documentation for the Flux live coding language. Each section covers
				syntax, semantics, and examples for one area of the DSL.
			</p>

			<div class="toc-grid">
				{#each sections as section (section.href)}
					<a class="toc-card" href={section.href}>
						<h2>{section.label}</h2>
						<p>{section.description}</p>
					</a>
				{/each}
			</div>

			<h2>Quick reference</h2>

			<h3>Sigils</h3>
			<table>
				<thead>
					<tr>
						<th>Sigil</th>
						<th>Role</th>
						<th>What it does</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td><code>@</code></td>
						<td>Decorator</td>
						<td>Pitch context — sets root, scale, octave, cent; or selects a buffer with @buf</td>
					</tr>
					<tr>
						<td><code>'</code></td>
						<td>Modifier</td>
						<td>Transforms the event stream or controls generator behaviour</td>
					</tr>
					<tr>
						<td><code>"</code></td>
						<td>Param</td>
						<td>Direct SynthDef argument passthrough</td>
					</tr>
				</tbody>
			</table>

			<h3>Content types</h3>
			<table>
				<thead>
					<tr>
						<th>Keyword</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr><td><code>note</code></td><td>Polyphonic pitched events — new synth per event</td></tr
					>
					<tr
						><td><code>mono</code></td><td
							>Monophonic — single persistent node, pitch updated via .set</td
						></tr
					>
					<tr
						><td><code>sample</code></td><td
							>Buffer playback by name — per-event buffer selection</td
						></tr
					>
					<tr
						><td><code>slice</code></td><td>Beat-sliced buffer playback — integer slice indices</td
						></tr
					>
					<tr
						><td><code>cloud</code></td><td
							>Granular synthesis — persistent node, modulated via .set</td
						></tr
					>
				</tbody>
			</table>

			<h3>Random generators</h3>
			<table>
				<thead>
					<tr>
						<th>Syntax</th>
						<th>Distribution</th>
						<th>Example</th>
					</tr>
				</thead>
				<tbody>
					<tr
						><td><code>min rand max</code></td><td>Uniform random</td><td><code>0rand4</code></td
						></tr
					>
					<tr
						><td><code>min ~ max</code></td><td>Uniform random (shorthand)</td><td
							><code>0~4</code></td
						></tr
					>
					<tr><td><code>mean gau sdev</code></td><td>Gaussian</td><td><code>0gau4</code></td></tr>
					<tr><td><code>min exp max</code></td><td>Exponential</td><td><code>1exp7</code></td></tr>
					<tr
						><td><code>min bro max m step</code></td><td>Brownian walk</td><td
							><code>0bro10m2</code></td
						></tr
					>
				</tbody>
			</table>

			<h3>Deterministic generators</h3>
			<table>
				<thead>
					<tr>
						<th>Syntax</th>
						<th>Type</th>
						<th>Example</th>
					</tr>
				</thead>
				<tbody>
					<tr
						><td><code>start step size x len</code></td><td>Arithmetic series</td><td
							><code>0step2x4</code></td
						></tr
					>
					<tr
						><td><code>start mul factor x len</code></td><td>Geometric series</td><td
							><code>1mul2x4</code></td
						></tr
					>
					<tr
						><td><code>first lin last x len</code></td><td>Linear interpolation</td><td
							><code>2lin7x8</code></td
						></tr
					>
					<tr
						><td><code>first geo last x len</code></td><td>Geometric interpolation</td><td
							><code>2geo7x8</code></td
						></tr
					>
					<tr
						><td><code>utf8{'{'}word{'}'}</code></td><td>UTF-8 bytes, cycling</td><td
							><code>utf8{'{'}coffee{'}'} % 14</code></td
						></tr
					>
				</tbody>
			</table>
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

	.toc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
		margin: var(--space-6) 0 var(--space-8);
	}

	.toc-card {
		display: block;
		padding: var(--space-4) var(--space-5);
		background: var(--surface-1);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition:
			background var(--duration-fast) var(--ease-smooth),
			border-color var(--duration-fast) var(--ease-smooth);
	}

	.toc-card:hover {
		background: var(--surface-2);
		border-color: var(--interactive);
		color: inherit;
	}

	.toc-card h2 {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		color: var(--text-primary);
		margin: 0 0 var(--space-1) 0;
	}

	.toc-card p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
		line-height: var(--leading-relaxed);
	}
</style>
