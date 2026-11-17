// Static regression checks over every regional page of the website repository (read-only).
// Guards the frontend fixes of 2026-11: region attribute (switcher on inner pages), shared fixes stylesheet
// (CLS), versioned region switcher, newsletter guard + accessible subscribe form, one <h1> per page, and
// consistent cache-busting versions for the CMS listing modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const WEBSITE_ROOT = process.env.WEBSITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal';
const REGIONS = ['hk', 'in', 'ph'];
// Pages whose fixes are intentionally pending (owner's uncommitted change must not be touched).
const PENDING = new Set(['regions/in/luxury-beverage.html']);
const ERROR_OR_PLACEHOLDER = /(?:^|\/)(?:[45]\d\d|coming-soon)\.html$/;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.html') ? [p] : []);
});
const pages = REGIONS.flatMap((region) => walk(join(WEBSITE_ROOT, 'regions', region))
  .map((abs) => ({ region, rel: relative(WEBSITE_ROOT, abs).split(sep).join('/'), html: readFileSync(abs, 'utf8') })));
const checked = pages.filter((p) => !PENDING.has(p.rel));
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

const failures = (predicate) => checked.filter((p) => !predicate(p)).map((p) => p.rel);

test('the website repository has regional pages to check', () => {
  assert.ok(checked.length >= 80, `found ${checked.length} pages`);
});

test('every page declares the region it is served for (region switcher source of truth)', () => {
  assert.deepEqual(failures((p) => new RegExp(`<html\\b[^>]*\\sdata-velza-region="${p.region}"`).test(p.html)), []);
});

test('every page loads the shared fixes stylesheet once, versioned, inside <head>', () => {
  assert.deepEqual(failures((p) => {
    const head = p.html.split('</head>')[0];
    return (p.html.match(/\/shared\/css\/frontend-fixes\.css\?v=\d+/g) || []).length === 1 && /frontend-fixes\.css\?v=\d+/.test(head);
  }), []);
});

test('every page loads the versioned region switcher followed by the newsletter guard', () => {
  assert.deepEqual(failures((p) => /<script src="\/routing\/region-switcher\.js\?v=\d+"><\/script>\s*<script src="\/shared\/js\/newsletter-form\.js\?v=\d+"><\/script>/.test(p.html)), []);
});

test('subscribe forms have an accessible email field and no positive tabindex', () => {
  const bad = [];
  for (const p of checked) {
    for (const form of stripComments(p.html).match(/<form\s+class="sk__form sk__subscribe-form[^"]*"[\s\S]*?<\/form>/g) || []) {
      if (/tabindex="[1-9]/.test(form)) bad.push(`${p.rel}: positive tabindex`);
      if (!/name="the_email"[\s\S]*?aria-label="Email address"/.test(form)) bad.push(`${p.rel}: email field without accessible name`);
      if (/\saction=/.test(form)) bad.push(`${p.rel}: form unexpectedly wired to an action (update the guard)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every indexable page has exactly one <h1>', () => {
  const bad = checked.filter((p) => !ERROR_OR_PLACEHOLDER.test(p.rel))
    .map((p) => [p.rel, (stripComments(p.html).match(/<h1\b/g) || []).length])
    .filter(([, n]) => n !== 1)
    .map(([rel, n]) => `${rel}: ${n}`);
  assert.deepEqual(bad, []);
});

test('CMS listing modules use one cache-busting version everywhere', () => {
  const listing = readFileSync(join(WEBSITE_ROOT, 'shared/js/velza-cms/content-listing.js'), 'utf8');
  const versions = new Set((listing.match(/from '\.\/[\w-]+\.js\?v=(\d+)'/g) || []).map((s) => s.match(/v=(\d+)/)[1]));
  for (const p of pages) {
    for (const m of p.html.matchAll(/content-listing\.js\?v=(\d+)/g)) versions.add(m[1]);
  }
  assert.equal(versions.size, 1, `versions found: ${[...versions].join(', ')}`);
});

test('pending page: regions/in/luxury-beverage.html', { todo: 'owner change uncommitted; apply the same edits after it is committed' }, () => {
  const p = pages.find((x) => x.rel === 'regions/in/luxury-beverage.html');
  assert.ok(p && /data-velza-region="in"/.test(p.html));
});
