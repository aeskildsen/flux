import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FxPanel from './FxPanel.svelte';

// Range inputs don't accept fill() — set value and dispatch 'input' directly.
function setSliderValue(locator: ReturnType<typeof page.getByRole>, value: number) {
	const el = locator.element() as HTMLInputElement;
	el.value = String(value);
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

const eqSlot = {
	synthdef: 'master_eq',
	label: 'EQ',
	specs: {
		lo_db: { min: -12, max: 12, default: 0, unit: 'dB' },
		hi_db: { min: -12, max: 12, default: 0, unit: 'dB' }
	}
};

const reverbSlot = {
	synthdef: 'master_reverb',
	label: 'Reverb',
	specs: {
		mix: { min: 0, max: 1, default: 0.2 }
	}
};

function makeProps(overrides: Partial<Parameters<typeof render<typeof FxPanel>>[1]> = {}) {
	return {
		slots: [eqSlot, reverbSlot],
		onEnable: vi.fn(() => true),
		onDisable: vi.fn(),
		onParamChange: vi.fn(),
		...overrides
	};
}

describe('FxPanel', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	// --- Rendering ---

	it('renders a slot for each entry', async () => {
		render(FxPanel, makeProps());
		// Open the details element so content is visible
		await page.getByText('master bus FX').click();
		await expect.element(page.getByText('EQ')).toBeInTheDocument();
		await expect.element(page.getByText('Reverb')).toBeInTheDocument();
	});

	it('renders param sliders for each spec', async () => {
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		await expect.element(page.getByText('lo_db')).toBeInTheDocument();
		await expect.element(page.getByText('hi_db')).toBeInTheDocument();
	});

	it('renders without crashing when specs is empty', async () => {
		render(FxPanel, makeProps({ slots: [{ synthdef: 'master_eq', label: 'EQ', specs: {} }] }));
		await page.getByText('master bus FX').click();
		await expect.element(page.getByText('EQ')).toBeInTheDocument();
	});

	// --- Toggle: correct callback direction ---

	it('calls onDisable when an enabled slot is toggled off', async () => {
		const props = makeProps();
		render(FxPanel, props);
		await page.getByText('master bus FX').click();
		// EQ starts enabled — first checkbox belongs to EQ
		const checkboxes = page.getByRole('checkbox');
		await checkboxes.first().click();
		expect(props.onDisable).toHaveBeenCalledWith('master_eq');
		expect(props.onEnable).not.toHaveBeenCalled();
	});

	it('calls onEnable when a disabled slot is toggled on', async () => {
		// Start with EQ disabled
		localStorage.setItem(
			'flux:master-fx',
			JSON.stringify({ master_eq: { enabled: false, params: { lo_db: 0, hi_db: 0 } } })
		);
		const props = makeProps();
		render(FxPanel, props);
		await page.getByText('master bus FX').click();
		const checkboxes = page.getByRole('checkbox');
		await checkboxes.first().click();
		expect(props.onEnable).toHaveBeenCalled();
		expect(props.onDisable).not.toHaveBeenCalled();
		// First arg is the synthdef being enabled
		expect(vi.mocked(props.onEnable).mock.calls[0][0]).toBe('master_eq');
	});

	it('does not flip the checkbox when onEnable returns false (pre-boot guard)', async () => {
		localStorage.setItem(
			'flux:master-fx',
			JSON.stringify({ master_eq: { enabled: false, params: {} } })
		);
		const props = makeProps({ onEnable: vi.fn(() => false) });
		render(FxPanel, props);
		await page.getByText('master bus FX').click();
		const checkbox = page.getByRole('checkbox').first();
		// Slot starts disabled
		await expect.element(checkbox).not.toBeChecked();
		await checkbox.click();
		// onEnable returned false — checkbox should remain unchecked
		await expect.element(checkbox).not.toBeChecked();
	});

	// --- onEnable receives full chain snapshot ---

	it('passes allEnabledStates with the toggled slot set to true', async () => {
		localStorage.setItem(
			'flux:master-fx',
			JSON.stringify({ master_eq: { enabled: false, params: {} } })
		);
		const props = makeProps();
		render(FxPanel, props);
		await page.getByText('master bus FX').click();
		await page.getByRole('checkbox').first().click();
		const allEnabledStates = vi.mocked(props.onEnable).mock.calls[0][1] as Record<string, boolean>;
		expect(allEnabledStates['master_eq']).toBe(true);
		// Reverb was already enabled
		expect(allEnabledStates['master_reverb']).toBe(true);
	});

	// --- Param changes: suppress when slot disabled ---

	it('calls onParamChange when the slot is enabled', async () => {
		const props = makeProps();
		render(FxPanel, props);
		await page.getByText('master bus FX').click();
		setSliderValue(page.getByRole('slider').first(), 3);
		expect(props.onParamChange).toHaveBeenCalled();
	});

	it('does not call onParamChange when the slot is disabled', async () => {
		localStorage.setItem(
			'flux:master-fx',
			JSON.stringify({ master_eq: { enabled: false, params: { lo_db: 0, hi_db: 0 } } })
		);
		const props = makeProps();
		render(FxPanel, props);
		await page.getByText('master bus FX').click();
		setSliderValue(page.getByRole('slider').first(), 3);
		expect(props.onParamChange).not.toHaveBeenCalled();
	});

	// --- localStorage fallback ---

	it('uses spec defaults when localStorage is empty', async () => {
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		// lo_db default is 0 — slider value should be "0"
		const slider = page.getByRole('slider').first();
		await expect.element(slider).toHaveValue('0');
	});

	it('restores persisted param values on mount', async () => {
		localStorage.setItem(
			'flux:master-fx',
			JSON.stringify({
				// Use values that land exactly on a step (step = 24/100 = 0.24, 0 is always on-step)
				master_eq: { enabled: true, params: { lo_db: 0, hi_db: -12 } }
			})
		);
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		const sliders = page.getByRole('slider');
		await expect.element(sliders.nth(0)).toHaveValue('0');
		await expect.element(sliders.nth(1)).toHaveValue('-12');
	});

	it('falls back to spec defaults when localStorage contains non-object JSON', async () => {
		localStorage.setItem('flux:master-fx', '"corrupted"');
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		const slider = page.getByRole('slider').first();
		await expect.element(slider).toHaveValue('0');
	});

	it('falls back to spec defaults when stored params contain non-number values', async () => {
		localStorage.setItem(
			'flux:master-fx',
			JSON.stringify({ master_eq: { enabled: true, params: { lo_db: 'bad', hi_db: 0 } } })
		);
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		const sliders = page.getByRole('slider');
		// lo_db "bad" is discarded — falls back to spec default 0
		await expect.element(sliders.nth(0)).toHaveValue('0');
		// hi_db 0 is valid
		await expect.element(sliders.nth(1)).toHaveValue('0');
	});

	// --- Persistence round-trip ---

	it('persists param changes to localStorage', async () => {
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		setSliderValue(page.getByRole('slider').first(), 6);
		const saved = JSON.parse(localStorage.getItem('flux:master-fx') ?? '{}');
		expect(saved['master_eq'].params['lo_db']).toBe(6);
	});

	it('persists enabled state changes to localStorage', async () => {
		render(FxPanel, makeProps());
		await page.getByText('master bus FX').click();
		await page.getByRole('checkbox').first().click();
		const saved = JSON.parse(localStorage.getItem('flux:master-fx') ?? '{}');
		expect(saved['master_eq'].enabled).toBe(false);
	});
});
