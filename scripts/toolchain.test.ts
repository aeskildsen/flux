/**
 * Drift guard for the test toolchain.
 *
 * The CI test job runs in the official Playwright container image. The image
 * contains the browsers for one Playwright version only, so its tag must
 * equal the installed Playwright version. The Node version of the runtime
 * must agree with the pin in `.node-version`, which the CI build job also
 * reads.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));

function installedVersion(pkg: string): string {
	return require(`${pkg}/package.json`).version;
}

function imageTagVersion(): string | undefined {
	const workflow = readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
	return workflow.match(/mcr\.microsoft\.com\/playwright:v([0-9.]+)-noble/)?.[1];
}

describe('test toolchain', () => {
	it('CI workflow uses the Playwright container image', () => {
		expect(imageTagVersion()).toBeDefined();
	});

	it.each(['@playwright/test', 'playwright'])(
		'Playwright image tag equals the installed %s version',
		(pkg) => {
			expect(imageTagVersion()).toBe(installedVersion(pkg));
		}
	);

	it('Node major version equals the pin in .node-version', () => {
		const pinned = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
		expect(process.versions.node.split('.')[0]).toBe(pinned);
	});
});
