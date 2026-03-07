import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('renders the h1', async () => {
		render(Page);
		await expect.element(page.getByRole('heading', { level: 1 })).toBeInTheDocument();
	});

	it('renders a "boot engine" button', async () => {
		render(Page);
		await expect.element(page.getByRole('button', { name: 'boot engine' })).toBeInTheDocument();
	});

	it('renders a "play sound" button', async () => {
		render(Page);
		await expect.element(page.getByRole('button', { name: 'play sound' })).toBeInTheDocument();
	});

	it('"boot engine" is enabled before boot', async () => {
		render(Page);
		await expect.element(page.getByRole('button', { name: 'boot engine' })).not.toBeDisabled();
	});

	it('"play sound" is disabled before boot', async () => {
		render(Page);
		await expect.element(page.getByRole('button', { name: 'play sound' })).toBeDisabled();
	});

	it('shows the initial status message', async () => {
		render(Page);
		const status = page.getByText('waiting for boot…');
		await expect.element(status).toBeInTheDocument();
	});
});
