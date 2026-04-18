<script lang="ts">
	/**
	 * SamplePanel — collapsible sidebar panel for managing the buffer registry.
	 *
	 * Displays loaded audio buffers, allows adding new ones via file picker,
	 * inline rename, and removal. Follows the FxPanel/SynthDefPanel design
	 * language: <details>/<summary> pattern, tokens.css variables throughout.
	 */

	import {
		bufferRegistry,
		registerBuffer,
		renameBuffer,
		unregisterBuffer,
		deriveNameFromFilename,
		isValidIdentifier
	} from '$lib/bufferRegistry.svelte.js';
	import type { BufferEntry } from '$lib/bufferRegistry.svelte.js';

	type Props = {
		/**
		 * Called after a buffer is successfully loaded, with the buffer ID
		 * allocated by the registry and the decoded AudioBuffer.
		 * The page component should call sc.loadSample(bufferId, ...) here.
		 */
		onLoad?: (bufferId: number, wavBytes: ArrayBuffer) => void;
		/**
		 * Called when a buffer is removed, with the buffer ID.
		 * The page component should call sc.free or b_free OSC message here.
		 */
		onRemove?: (bufferId: number) => void;
	};

	const { onLoad, onRemove }: Props = $props();

	const entries = $derived(bufferRegistry.entries);
	const count = $derived(entries.length);

	// -------------------------------------------------------------------------
	// Inline rename state
	// -------------------------------------------------------------------------

	/** bufferId of the entry currently in rename mode, or null. */
	let renamingId = $state<number | null>(null);
	/** Draft name while editing. */
	let draftName = $state('');
	/** Inline error message shown under the input. */
	let renameError = $state('');

	function startRename(entry: BufferEntry) {
		renamingId = entry.bufferId;
		draftName = entry.name;
		renameError = '';
	}

	function commitRename() {
		if (renamingId === null) return;
		const err = renameBuffer(renamingId, draftName.trim());
		if (err) {
			renameError = err;
			// Input stays focused so user can correct — do not close
			return;
		}
		renamingId = null;
		draftName = '';
		renameError = '';
	}

	function cancelRename() {
		renamingId = null;
		draftName = '';
		renameError = '';
	}

	function handleRenameKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitRename();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelRename();
		}
	}

	// -------------------------------------------------------------------------
	// Add samples via file picker
	// -------------------------------------------------------------------------

	let isLoading = $state(false);
	let loadError = $state('');

	async function handleAddFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		isLoading = true;
		loadError = '';

		// Create a temporary AudioContext for decoding. One context is shared
		// across all files in this batch and closed when we are done — browsers
		// impose a hard limit on the number of concurrent AudioContext instances,
		// so we must close it rather than letting it leak.
		const ctx: AudioContext = new AudioContext();
		try {
			for (const file of Array.from(files)) {
				try {
					const arrayBuffer = await file.arrayBuffer();
					// decodeAudioData detaches its input, so clone the raw bytes first —
					// we need them intact to pass to scsynth, which decodes WAV natively.
					const wavBytes = arrayBuffer.slice(0);
					const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

					// Derive a unique default name from the filename
					let baseName = deriveNameFromFilename(file.name);
					let candidate = baseName;
					let suffix = 2;
					while (bufferRegistry.hasName(candidate)) {
						candidate = `${baseName}_${suffix}`;
						suffix++;
					}

					const channels = audioBuffer.numberOfChannels >= 2 ? 2 : 1;
					const bufferId = registerBuffer({
						name: candidate,
						origin: file.name,
						channels: channels as 1 | 2,
						duration: audioBuffer.duration
					});

					onLoad?.(bufferId, wavBytes);

					// Focus the rename field immediately for the new entry
					renamingId = bufferId;
					draftName = candidate;
					renameError = '';
				} catch (fileErr) {
					const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
					loadError = `Could not load "${file.name}": ${msg}`;
					console.error('[SamplePanel] decodeAudioData failed:', fileErr);
				}
			}
		} finally {
			isLoading = false;
			// Reset the file input so the same file can be re-added
			input.value = '';
			// Close the temporary decode context to release browser resources
			ctx.close().catch(() => {
				// ignore — close errors are non-fatal
			});
		}
	}

	// -------------------------------------------------------------------------
	// Remove
	// -------------------------------------------------------------------------

	function handleRemove(entry: BufferEntry) {
		if (renamingId === entry.bufferId) {
			cancelRename();
		}
		onRemove?.(entry.bufferId);
		unregisterBuffer(entry.bufferId);
	}

	// -------------------------------------------------------------------------
	// Duration formatting
	// -------------------------------------------------------------------------

	function formatDuration(seconds: number): string {
		if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
		return `${seconds.toFixed(2)}s`;
	}

	// -------------------------------------------------------------------------
	// Validation indicator
	// -------------------------------------------------------------------------

	const draftValid = $derived(isValidIdentifier(draftName.trim()));
</script>

<details>
	<summary>samples ({count})</summary>

	<div class="panel-body">
		{#if entries.length === 0}
			<p class="empty">No buffers loaded. Add audio files below.</p>
		{:else}
			<ul class="buffer-list">
				{#each entries as entry (entry.bufferId)}
					<li class="buffer-entry" class:renaming={renamingId === entry.bufferId}>
						{#if renamingId === entry.bufferId}
							<!-- Inline rename mode -->
							<div class="rename-row">
								<span class="sigil">&#92;</span>
								<input
									class="rename-input"
									class:invalid={!draftValid}
									type="text"
									bind:value={draftName}
									onkeydown={handleRenameKeyDown}
									onblur={commitRename}
									aria-label="Buffer name"
									spellcheck={false}
									autocomplete="off"
									{@attach (el: HTMLInputElement) => {
										el.focus();
										el.select();
									}}
								/>
							</div>
							{#if renameError}
								<p class="rename-error">{renameError}</p>
							{/if}
						{:else}
							<!-- Display mode -->
							<div class="name-row">
								<button
									class="name-btn"
									onclick={() => startRename(entry)}
									title="Click to rename"
									aria-label="Rename {entry.name}"
								>
									<span class="sigil">&#92;</span><span class="buf-name">{entry.name}</span>
								</button>

								{#if !entry.isBuiltIn}
									<button
										class="remove-btn"
										onclick={() => handleRemove(entry)}
										title="Remove buffer"
										aria-label="Remove {entry.name}"
									>
										&times;
									</button>
								{/if}
							</div>
						{/if}

						<div class="meta-row">
							<span class="origin" title={entry.origin}>{entry.origin}</span>
							<span class="meta-tags">
								<span class="tag">{entry.channels === 1 ? 'mono' : 'stereo'}</span>
								<span class="tag">{formatDuration(entry.duration)}</span>
								{#if entry.isBuiltIn}
									<span class="tag built-in">built-in</span>
								{/if}
							</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<!-- Add button -->
		<label class="add-label" class:loading={isLoading} title="Add audio files">
			<input
				type="file"
				accept="audio/*,.wav,.aiff,.flac,.ogg,.mp3"
				multiple
				onchange={handleAddFiles}
				aria-label="Add audio files"
				disabled={isLoading}
			/>
			{isLoading ? 'loading…' : '+ add samples'}
		</label>

		{#if loadError}
			<p class="load-error">{loadError}</p>
		{/if}
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

	summary::before {
		content: '▶ ';
		font-size: 0.6em;
		vertical-align: middle;
	}

	details[open] summary::before {
		content: '▼ ';
	}

	/* -------------------------------------------------------------------------
	   Panel body
	   ------------------------------------------------------------------------- */

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.empty {
		margin: 0;
		font-size: 11px;
		color: var(--text-muted);
		font-style: italic;
	}

	/* -------------------------------------------------------------------------
	   Buffer list
	   ------------------------------------------------------------------------- */

	.buffer-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.buffer-entry {
		padding: var(--space-1) var(--space-2);
		background: var(--surface-0);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* -------------------------------------------------------------------------
	   Name row (display mode)
	   ------------------------------------------------------------------------- */

	.name-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1);
	}

	.name-btn {
		/* Override global button styles */
		width: auto;
		padding: 0;
		background: none;
		border: none;
		border-radius: 0;
		font-size: inherit;
		color: var(--color-sample);
		cursor: pointer;
		text-align: left;
		font-family: var(--font-mono);
		transition: color var(--duration-fast) var(--ease-smooth);
		/* Prevent overflow */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name-btn:hover:not(:disabled) {
		background: none;
		color: var(--color-sample-hover);
	}

	.sigil {
		color: var(--text-muted);
		font-family: var(--font-mono);
	}

	.buf-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-sample);
	}

	.remove-btn {
		width: auto;
		flex-shrink: 0;
		padding: 0 var(--space-1);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		line-height: 1;
		color: var(--text-muted);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-smooth);
	}

	.remove-btn:hover:not(:disabled) {
		background: none;
		color: var(--color-error);
	}

	/* -------------------------------------------------------------------------
	   Rename row (editing mode)
	   ------------------------------------------------------------------------- */

	.rename-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.rename-input {
		flex: 1;
		min-width: 0;
		background: var(--surface-1);
		border: var(--border-focus-width) solid var(--interactive);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		padding: 1px var(--space-1);
		outline: none;
		transition: border-color var(--duration-fast) var(--ease-smooth);
	}

	.rename-input.invalid {
		border-color: var(--color-error);
	}

	.rename-input:focus {
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.rename-error {
		margin: 0;
		font-size: 10px;
		color: var(--color-error);
		line-height: var(--leading-normal);
	}

	/* -------------------------------------------------------------------------
	   Metadata row
	   ------------------------------------------------------------------------- */

	.meta-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1);
		min-width: 0;
	}

	.origin {
		font-size: 10px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}

	.meta-tags {
		display: flex;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	.tag {
		font-size: 10px;
		color: var(--text-muted);
		font-family: var(--font-mono);
	}

	.tag.built-in {
		color: var(--text-muted);
		font-style: italic;
	}

	/* -------------------------------------------------------------------------
	   Add button
	   ------------------------------------------------------------------------- */

	.add-label {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		background: var(--surface-1);
		color: var(--text-secondary);
		border: var(--border-width) dashed var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: center;
		transition:
			background var(--duration-fast) var(--ease-smooth),
			color var(--duration-fast) var(--ease-smooth),
			border-color var(--duration-fast) var(--ease-smooth);
	}

	.add-label:hover:not(.loading) {
		background: var(--surface-2);
		color: var(--text-primary);
		border-color: var(--interactive);
	}

	.add-label.loading {
		opacity: 0.5;
		cursor: wait;
	}

	.add-label input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.load-error {
		margin: 0;
		font-size: 10px;
		color: var(--color-error);
	}
</style>
