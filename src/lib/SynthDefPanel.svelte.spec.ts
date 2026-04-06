import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SynthDefPanel from './SynthDefPanel.svelte';

const kickMeta = {
	credit: 'Anders Eskildsen',
	description: 'A simple kick drum synthesizer.',
	source: 'kick.scd',
	type: 'instrument',
	url: 'https://example.com/kick'
};

describe('SynthDefPanel', () => {
	it('shows count 0 when no synthdefs are loaded', async () => {
		render(SynthDefPanel, { synthdefs: {} });
		await expect.element(page.getByText('synthdefs (0)')).toBeInTheDocument();
	});

	it('shows count matching the number of loaded synthdefs', async () => {
		render(SynthDefPanel, { synthdefs: { kick: kickMeta } });
		await expect.element(page.getByText('synthdefs (1)')).toBeInTheDocument();
	});

	it('renders the synthdef name', async () => {
		render(SynthDefPanel, { synthdefs: { kick: kickMeta } });
		await expect.element(page.getByText('kick', { exact: true }).first()).toBeInTheDocument();
	});

	it('renders the description', async () => {
		render(SynthDefPanel, { synthdefs: { kick: kickMeta } });
		await expect.element(page.getByText('A simple kick drum synthesizer.')).toBeInTheDocument();
	});

	it('renders the credit as a link', async () => {
		render(SynthDefPanel, { synthdefs: { kick: kickMeta } });
		const link = page.getByText('Anders Eskildsen');
		await expect.element(link).toBeInTheDocument();
		await expect.element(link).toHaveAttribute('href', 'https://example.com/kick');
	});

	it('renders a parameter table when specs are provided', async () => {
		render(SynthDefPanel, {
			synthdefs: {
				kick: {
					...kickMeta,
					specs: {
						amp: { min: 0, max: 1, default: 0.2, warp: 'lin', unit: '' },
						cutoff: { min: 20, max: 20000, default: 8000, warp: 'exp', unit: 'Hz' }
					}
				}
			}
		});
		await expect.element(page.getByText('amp')).toBeInTheDocument();
		await expect.element(page.getByText('cutoff')).toBeInTheDocument();
		await expect.element(page.getByText('Hz')).toBeInTheDocument();
	});

	it('shows range as min–max in the param table', async () => {
		render(SynthDefPanel, {
			synthdefs: {
				kick: {
					...kickMeta,
					specs: { amp: { min: 0, max: 1, default: 0.2 } }
				}
			}
		});
		await expect.element(page.getByText('0–1')).toBeInTheDocument();
	});

	it('renders multiple synthdefs', async () => {
		render(SynthDefPanel, {
			synthdefs: {
				kick: kickMeta,
				snare: { ...kickMeta }
			}
		});
		await expect.element(page.getByText('synthdefs (2)')).toBeInTheDocument();
		await expect.element(page.getByText('kick', { exact: true }).first()).toBeInTheDocument();
		await expect.element(page.getByText('snare', { exact: true })).toBeInTheDocument();
	});

	it('renders without specs gracefully', async () => {
		render(SynthDefPanel, { synthdefs: { kick: kickMeta } });
		await expect.element(page.getByText('kick', { exact: true }).first()).toBeInTheDocument();
		await expect.element(page.getByText('A simple kick drum synthesizer.')).toBeInTheDocument();
	});
});
