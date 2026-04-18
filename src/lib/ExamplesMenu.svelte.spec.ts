/**
 * ExamplesMenu — browser tests.
 *
 * Verifies that the component renders a "Load example" button,
 * opens a menu on click, and fires the onSelect callback with the
 * correct text content when an item is selected.
 */

import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ExamplesMenu from './ExamplesMenu.svelte';

const EXAMPLES = [
	{ id: 'note', label: 'note — FM melody', description: 'Polyphonic FM synth', file: 'note.flux' },
	{
		id: 'mono',
		label: 'mono — gliding bass',
		description: 'Monophonic bass line',
		file: 'mono.flux'
	},
	{
		id: 'sample',
		label: 'sample — drum kit',
		description: 'One-shot buffer playback',
		file: 'sample.flux'
	}
];

describe('ExamplesMenu', () => {
	it('renders a button labelled "examples"', async () => {
		render(ExamplesMenu, { examples: EXAMPLES, onSelect: vi.fn() });
		await expect.element(page.getByRole('button', { name: /examples/i })).toBeInTheDocument();
	});

	it('the menu is not visible initially', async () => {
		render(ExamplesMenu, { examples: EXAMPLES, onSelect: vi.fn() });
		// Menu list should not be visible before clicking
		await expect.element(page.getByRole('menu')).not.toBeVisible();
	});

	it('opens menu on button click', async () => {
		render(ExamplesMenu, { examples: EXAMPLES, onSelect: vi.fn() });
		await page.getByRole('button', { name: /examples/i }).click();
		await expect.element(page.getByRole('menu')).toBeVisible();
	});

	it('shows all example labels in the open menu', async () => {
		render(ExamplesMenu, { examples: EXAMPLES, onSelect: vi.fn() });
		await page.getByRole('button', { name: /examples/i }).click();
		for (const ex of EXAMPLES) {
			await expect.element(page.getByText(ex.label)).toBeVisible();
		}
	});

	it('calls onSelect with example id when an item is clicked', async () => {
		const onSelect = vi.fn();
		render(ExamplesMenu, { examples: EXAMPLES, onSelect });
		await page.getByRole('button', { name: /examples/i }).click();
		await page.getByText('note — FM melody').click();
		expect(onSelect).toHaveBeenCalledWith('note');
	});

	it('closes the menu after selecting an item', async () => {
		render(ExamplesMenu, { examples: EXAMPLES, onSelect: vi.fn() });
		await page.getByRole('button', { name: /examples/i }).click();
		await page.getByText('note — FM melody').click();
		await expect.element(page.getByRole('menu')).not.toBeVisible();
	});
});
