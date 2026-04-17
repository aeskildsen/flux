import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SamplePanel from './SamplePanel.svelte';
import { _resetRegistry, registerBuffer } from './bufferRegistry.svelte.js';

beforeEach(() => {
	_resetRegistry();
});

describe('SamplePanel', () => {
	// -------------------------------------------------------------------------
	// Initial render
	// -------------------------------------------------------------------------

	it('renders the summary with count 0 when registry is empty', async () => {
		render(SamplePanel, {});
		await expect.element(page.getByText('samples (0)')).toBeInTheDocument();
	});

	it('shows empty-state message when no buffers are registered', async () => {
		render(SamplePanel, {});
		// Open the details first
		await page.getByText('samples (0)').click();
		await expect.element(page.getByText(/No buffers loaded/)).toBeInTheDocument();
	});

	it('renders count matching registered buffers', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		registerBuffer({ name: 'snare', origin: 'snare.wav', channels: 1, duration: 0.4 });
		render(SamplePanel, {});
		await expect.element(page.getByText('samples (2)')).toBeInTheDocument();
	});

	it('shows buffer name with backslash sigil', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('kick')).toBeInTheDocument();
	});

	it('shows origin filename in the meta row', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('kick.wav')).toBeInTheDocument();
	});

	it('shows "mono" for 1-channel buffers', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('mono')).toBeInTheDocument();
	});

	it('shows "stereo" for 2-channel buffers', async () => {
		registerBuffer({ name: 'amen', origin: 'amen.wav', channels: 2, duration: 4.0 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('stereo')).toBeInTheDocument();
	});

	it('formats duration under 1 second as milliseconds', async () => {
		registerBuffer({ name: 'clap', origin: 'clap.wav', channels: 1, duration: 0.25 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('250ms')).toBeInTheDocument();
	});

	it('formats duration of 1s+ in seconds', async () => {
		registerBuffer({ name: 'amen', origin: 'amen.wav', channels: 2, duration: 4.32 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('4.32s')).toBeInTheDocument();
	});

	it('shows "built-in" tag for built-in buffers', async () => {
		registerBuffer({
			name: 'default',
			origin: 'default.wav',
			channels: 1,
			duration: 1.0,
			isBuiltIn: true
		});
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByText('built-in')).toBeInTheDocument();
	});

	// -------------------------------------------------------------------------
	// Remove button
	// -------------------------------------------------------------------------

	it('renders a remove button for non-built-in entries', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await expect.element(page.getByRole('button', { name: /Remove kick/i })).toBeInTheDocument();
	});

	it('does NOT render a remove button for built-in entries', async () => {
		registerBuffer({
			name: 'default',
			origin: 'default.wav',
			channels: 1,
			duration: 1.0,
			isBuiltIn: true
		});
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		const removeBtn = page.getByRole('button', { name: /Remove default/i });
		await expect.element(removeBtn).not.toBeInTheDocument();
	});

	it('removes a buffer from the list when remove button is clicked', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Remove kick/i }).click();
		await expect.element(page.getByText('samples (0)')).toBeInTheDocument();
	});

	it('calls onRemove callback when remove button is clicked', async () => {
		const removed: number[] = [];
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, { onRemove: (id) => removed.push(id) });
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Remove kick/i }).click();
		expect(removed).toHaveLength(1);
	});

	// -------------------------------------------------------------------------
	// Rename
	// -------------------------------------------------------------------------

	it('clicking the name button enters rename mode', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Rename kick/i }).click();
		await expect.element(page.getByRole('textbox', { name: /Buffer name/i })).toBeInTheDocument();
	});

	it('rename input is pre-filled with current name', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Rename kick/i }).click();
		const input = page.getByRole('textbox', { name: /Buffer name/i });
		await expect.element(input).toHaveValue('kick');
	});

	it('pressing Enter commits a valid rename', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Rename kick/i }).click();
		const input = page.getByRole('textbox', { name: /Buffer name/i });
		await input.clear();
		await userEvent.fill(input, 'kick2');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('kick2')).toBeInTheDocument();
	});

	it('pressing Escape cancels rename', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Rename kick/i }).click();
		await userEvent.keyboard('{Escape}');
		// Rename input should be gone; name should still be kick
		await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
		await expect.element(page.getByText('kick')).toBeInTheDocument();
	});

	it('shows an error for an invalid name and does not commit', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		render(SamplePanel, {});
		await page.getByText('samples (1)').click();
		await page.getByRole('button', { name: /Rename kick/i }).click();
		const input = page.getByRole('textbox', { name: /Buffer name/i });
		await input.clear();
		await userEvent.fill(input, 'kick-drum');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText(/valid identifier/i)).toBeInTheDocument();
		// Name should not have changed
		await expect.element(page.getByRole('textbox', { name: /Buffer name/i })).toBeInTheDocument();
	});

	it('shows an error on name collision and does not commit', async () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		registerBuffer({ name: 'snare', origin: 'snare.wav', channels: 1, duration: 0.4 });
		render(SamplePanel, {});
		await page.getByText('samples (2)').click();
		await page.getByRole('button', { name: /Rename kick/i }).click();
		const input = page.getByRole('textbox', { name: /Buffer name/i });
		await input.clear();
		await userEvent.fill(input, 'snare');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText(/already in use/i)).toBeInTheDocument();
	});

	// -------------------------------------------------------------------------
	// Add button
	// -------------------------------------------------------------------------

	it('renders the add samples button', async () => {
		render(SamplePanel, {});
		await page.getByText('samples (0)').click();
		await expect.element(page.getByText('+ add samples')).toBeInTheDocument();
	});
});
