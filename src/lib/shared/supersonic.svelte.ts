import type { SuperSonicInstance, SuperSonicConfig, StatusKind } from './types.js';
import { defaultConfig } from './config.js';
import { setupGroups } from './groups.js';

// ── Reactive state (module-level singleton) ──────────────────────────────────
// Exported as an object — required for cross-module reactivity in Svelte 5.
// Property mutations (serverState.booted = true) are reactive at import sites;
// reassigning exported $state primitives across module boundaries is not.
export const serverState = $state({
	booted: false,
	booting: false,
	status: 'waiting for boot…',
	statusKind: '' as StatusKind
});

// ── SuperSonic instance ──────────────────────────────────────────────────────
// Module-private; accessed via getInstance() to keep callers from bypassing wrappers.
let _instance: SuperSonicInstance | null = null;

export function getInstance(): SuperSonicInstance | null {
	return _instance;
}

// ── Internal helper ──────────────────────────────────────────────────────────
function setStatus(msg: string, kind: StatusKind = ''): void {
	serverState.status = msg;
	serverState.statusKind = kind;
	console.log(`[supersonic-lib] ${msg}`);
}

// ── Boot sequence ────────────────────────────────────────────────────────────
// MUST be called from a user interaction handler (click/keypress).
// Browser autoplay policy: audio context cannot start without a user gesture.
export async function boot(overrides: Partial<SuperSonicConfig> = {}): Promise<void> {
	const config: SuperSonicConfig = { ...defaultConfig, ...overrides };
	if (serverState.booted || serverState.booting) return;
	serverState.booting = true;

	try {
		setStatus('importing SuperSonic…');
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore — CDN module has no type declarations
		const { SuperSonic } = await import(/* @vite-ignore */ `${config.baseURL}supersonic.js`);

		_instance = new SuperSonic(config) as SuperSonicInstance;
		console.log('[supersonic-lib] instance created', _instance);

		setStatus('calling init()…');
		await _instance.init();
		console.log('[supersonic-lib] init() resolved – engine running');

		setupGroups(_instance.send.bind(_instance));

		setStatus('engine ready', 'ok');
		serverState.booted = true;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[supersonic-lib] boot failed:', err);
		setStatus(`boot failed: ${msg}`, 'error');
	} finally {
		serverState.booting = false;
	}
}
