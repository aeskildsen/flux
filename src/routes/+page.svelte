<script lang="ts">
	// SuperSonic instance — typed loosely as the CDN module has no TS declarations
	let supersonic: { send: (...args: unknown[]) => void; init: () => Promise<void>; loadSynthDef: (name: string) => Promise<void> } | null = null;
	let booted = $state(false);
	let booting = $state(false);
	let status = $state('waiting for boot…');
	let statusKind = $state('');

	function setStatus(msg: string, kind = '') {
		status = msg;
		statusKind = kind;
		console.log(`[flux] ${msg}`);
	}

	async function boot() {
		booting = true;
		try {
			setStatus('importing SuperSonic…');
			console.log('[flux] dynamic import: supersonic-scsynth');
			const { SuperSonic } = await import(
				// @ts-expect-error — CDN module, no types available
				'https://cdn.jsdelivr.net/npm/supersonic-scsynth@0.57.0/dist/supersonic.js'
			);
			supersonic = new SuperSonic({
				baseURL: 'https://cdn.jsdelivr.net/npm/supersonic-scsynth@0.57.0/dist/',
				coreBaseURL: 'https://cdn.jsdelivr.net/npm/supersonic-scsynth-core@0.57.0/',
				synthdefBaseURL:
					'https://cdn.jsdelivr.net/npm/supersonic-scsynth-synthdefs@latest/synthdefs/',
				debug: true
			});

      if (supersonic) {
        console.log('[flux] SuperSonic instance created', supersonic);

        setStatus('calling supersonic.init()…');
        await supersonic.init();
        console.log('[flux] supersonic.init() resolved – engine running');

        setStatus("loading synthdef 'sonic-pi-prophet'…");
        await supersonic.loadSynthDef('sonic-pi-prophet');
        console.log('[flux] synthdef loaded successfully');

        setStatus("engine ready – click 'play sound'", 'ok');
        booted = true;
      }
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error('[flux] boot failed:', err);
			setStatus(`boot failed: ${msg}`, 'error');
		} finally {
			booting = false;
		}
	}

	function play() {
		console.log('[flux] sending OSC: /s_new sonic-pi-prophet note=52 release=4 cutoff=90');
		supersonic!.send('/s_new', 'sonic-pi-prophet', -1, 0, 0, 'note', 52, 'release', 4, 'cutoff', 90);
		console.log('[flux] /s_new sent');
		setStatus('♪ playing…', 'ok');
		setTimeout(() => setStatus("engine ready – click 'play sound'", 'ok'), 1200);
	}
</script>

<h1>flux</h1>
<p>Open DevTools console to see debug output.</p>

<div class="buttons">
	<button onclick={boot} disabled={booting || booted}>boot engine</button>
	<button onclick={play} disabled={!booted}>play sound</button>
</div>

<div class="status" class:ok={statusKind === 'ok'} class:error={statusKind === 'error'}>
	{status}
</div>

<style>
	h1 {
		font-size: 1.2rem;
		margin-bottom: 4px;
	}

	p {
		font-size: 0.85rem;
		color: #888;
		margin-top: 0;
	}

	.buttons {
		display: flex;
		gap: 12px;
		margin-top: 32px;
	}

	button {
		padding: 10px 22px;
		font-family: monospace;
		font-size: 1rem;
		background: #222;
		color: #eee;
		border: 1px solid #444;
		border-radius: 4px;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: #333;
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.status {
		margin-top: 24px;
		font-size: 0.85rem;
		font-family: monospace;
		color: #aaa;
		min-height: 1.4em;
	}

	.status.ok {
		color: #6f6;
	}

	.status.error {
		color: #f66;
	}
</style>
