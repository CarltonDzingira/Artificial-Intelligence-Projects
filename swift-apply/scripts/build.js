#!/usr/bin/env node
// Bundles PizZip and pdfmake as ESM modules for the Chrome extension
// Run: node scripts/build.js  (after npm install)

import { build } from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('lib', { recursive: true });

await build({
  entryPoints: ['scripts/docx-bundle-entry.js'],
  bundle: true,
  format: 'esm',
  outfile: 'lib/docx.bundle.mjs',
  platform: 'browser',
  target: 'chrome120',
  minify: false,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});

console.log('✓ Built lib/docx.bundle.mjs — DOCX processing is ready');

await build({
  entryPoints: ['scripts/jspdf-bundle-entry.js'],
  bundle: true,
  format: 'esm',
  outfile: 'lib/jspdf.bundle.mjs',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});

console.log('✓ Built lib/jspdf.bundle.mjs — PDF generation is ready');
