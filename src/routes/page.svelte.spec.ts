import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const emptyData = { synthdefs: {}, examples: [] };
const loadedData = {
	synthdefs: {
		kick: {
			credit: 'Anders Eskildsen',
			description: 'A kick drum.',
			source: 'kick.scd',
			type: 'instrument',
			url: 'https://example.com'
		}
	},
	examples: []
};
const withExamples = {
	synthdefs: {},
	examples: [
		{ id: 'note', label: 'note — FM melody', description: 'FM synth', file: 'note.flux' },
		{ id: 'mono', label: 'mono — gliding bass', description: 'Mono bass', file: 'mono.flux' }
	]
};

describe('/+page.svelte', () => {
	it('renders the h1', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByRole('heading', { level: 1 })).toBeInTheDocument();
	});

	it('renders a "boot engine" button', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByRole('button', { name: 'boot engine' })).toBeInTheDocument();
	});

	it('renders a "stop" button', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByRole('button', { name: 'stop' })).toBeInTheDocument();
	});

	it('"boot engine" is enabled before boot', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByRole('button', { name: 'boot engine' })).not.toBeDisabled();
	});

	it('"stop" is disabled before boot', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByRole('button', { name: 'stop' })).toBeDisabled();
	});

	it('shows the initial status message', async () => {
		render(Page, { props: { data: emptyData } });
		const status = page.getByText('waiting for boot…');
		await expect.element(status).toBeInTheDocument();
	});

	it('shows synthdefs count 0 when no metadata is loaded', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByText('synthdefs (0)')).toBeInTheDocument();
	});

	it('shows synthdefs count from loaded metadata before boot', async () => {
		render(Page, { props: { data: loadedData } });
		await expect.element(page.getByText('synthdefs (1)')).toBeInTheDocument();
	});

	it('hides "examples" button when no examples are provided', async () => {
		render(Page, { props: { data: emptyData } });
		await expect.element(page.getByRole('button', { name: /examples/i })).not.toBeInTheDocument();
	});

	it('shows "examples" button when examples are provided', async () => {
		render(Page, { props: { data: withExamples } });
		await expect.element(page.getByRole('button', { name: /examples/i })).toBeInTheDocument();
	});
});
