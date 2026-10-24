import type { SuperSonicInstance, SuperSonicConfig, StatusKind, EngineHealth } from './types.js';
import { setupGroups } from './groups.js';
import { createServer, type Server } from './osc.js';

const healthCheckInterval = 250;

// ── Reactive state (module-level singleton) ──────────────────────────────────
// _state is mutable internally; serverState is a read-only view for consumers.
const _state = $state({
	booted: false,
	booting: false,
	status: 'waiting for boot…',
	statusKind: '' as StatusKind,
	server: null as Server | null,
	health: {
		status: 'ok',
		audioContextState: '',
		messagesDropped: 0,
		inBufferPct: 0,
		outBufferPct: 0
	} as EngineHealth
});

// Exported for testing only — do not use in application code.
export { _state as _stateForTesting };

export const serverState = {
	get booted() {
		return _state.booted;
	},
	get booting() {
		return _state.booting;
	},
	get status() {
		return _state.status;
	},
	get statusKind() {
		return _state.statusKind;
	},
	get health() {
		return _state.health;
	}
} as const;

// ── SuperSonic instance ───────────────────────────────────────────────────────
// Module-private; accessed via getInstance() to keep callers from bypassing wrappers.
// The server object lives on _state so that $derived(getServer()) is reactive.
let _instance: SuperSonicInstance | null = null;

// The SuperSonic constructor class — captured during boot so callers can access
// static OSC utilities (e.g. SuperSonic.osc.encodeSingleBundle) without a re-import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _SuperSonicClass: any | null = null;

export function getInstance(): SuperSonicInstance | null {
	return _instance;
}

/** Returns the static `SuperSonic.osc` utility namespace, or null before boot. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOsc(): any | null {
	return _SuperSonicClass?.osc ?? null;
}

export function getServer(): Server | null {
	return _state.server;
}

// ── Internal helpers ─────────────────────────────────────────────────────────
function setStatus(msg: string, kind: StatusKind = ''): void {
	_state.status = msg;
	_state.statusKind = kind;
}

function tickHealth(): void {
	// getMetrics() is not on SuperSonicInstance by design — we cast here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const m = (_instance as any)?.getMetrics();
	if (!m) return;

	const dropped: number = m.scsynthMessagesDropped ?? 0;
	const audioCtx: string = m.audioContextState ?? '';
	const inPct: number = Math.round(m.inBufferUsed?.percentage ?? 0);
	const outPct: number = Math.round(m.outBufferUsed?.percentage ?? 0);

	let status: EngineHealth['status'] = 'ok';
	if (audioCtx && audioCtx !== 'running') status = 'error';
	else if (dropped > _state.health.messagesDropped) status = 'warn';

	_state.health = {
		status,
		audioContextState: audioCtx,
		messagesDropped: dropped,
		inBufferPct: inPct,
		outBufferPct: outPct
	};
}

const requiredLocationFields = ['baseURL', 'coreBaseURL', 'synthdefBaseURL'] as const;

function assertEngineLocation(config: Partial<SuperSonicConfig> | undefined): void {
	const missing = requiredLocationFields.filter((field) => !config?.[field]);
	if (missing.length > 0) {
		throw new Error(
			`boot() needs an engine location. Missing: ${missing.join(', ')}. ` +
				`Pass { ${requiredLocationFields.join(', ')} }.`
		);
	}
}

// ── Boot sequence ────────────────────────────────────────────────────────────
// MUST be called from a user interaction handler (click/keypress).
// Browser autoplay policy: audio context cannot start without a user gesture.
// The caller must supply the engine location (baseURL, coreBaseURL, synthdefBaseURL).
export async function boot(config: SuperSonicConfig): Promise<void> {
	assertEngineLocation(config);
	if (_state.booted || _state.booting) return;
	_state.booting = true;

	try {
		setStatus('importing SuperSonic…');
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore — CDN module has no type declarations
		const { SuperSonic } = await import(/* @vite-ignore */ `${config.baseURL}supersonic.js`);

		_SuperSonicClass = SuperSonic;
		_instance = new SuperSonic(config) as SuperSonicInstance;

		setStatus('calling init()…');
		await _instance.init();

		setupGroups(_instance.send.bind(_instance));
		_state.server = createServer(_instance);
		setInterval(tickHealth, healthCheckInterval);

		// Warn before page unload — reloading destroys the WASM engine and all synthesis state.
		window.addEventListener('beforeunload', (e) => {
			e.preventDefault();
		});

		setStatus('engine ready', 'ok');
		_state.booted = true;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[supersonic-lib] boot failed:', err);
		setStatus(`boot failed: ${msg}`, 'error');
	} finally {
		_state.booting = false;
	}
}
