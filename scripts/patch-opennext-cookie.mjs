#!/usr/bin/env node
// Cloudflare OpenNext 1.20.18 may bundle the CommonJS "cookie" module with
// named exports only while its edge converter calls default.parse. This is
// the precise runtime failure that caused Cloudflare Error 1101.
//
// Run AFTER OpenNext has generated .open-next/worker.js and BEFORE deployment.
// Abort deployment if the generated bundle is missing or has an unrecognised
// converter layout. Never modify application logic or environment bindings.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filename = resolve(process.cwd(), '.open-next/worker.js');
const source = readFileSync(filename, 'utf8');
const broken = 'cookieHeader ? import_cookie.default.parse(cookieHeader) : {}';
const fixed = 'cookieHeader ? import_cookie.parse(cookieHeader) : {}';
const occurrences = source.split(broken).length - 1;

if (occurrences === 0 && source.includes(fixed)) {
  console.log('OpenNext cookie converter already corrected');
  process.exit(0);
}
if (occurrences !== 1) {
  throw new Error(
    `Unexpected OpenNext cookie converter: found ${occurrences} broken instances; refusing to deploy`,
  );
}
writeFileSync(filename, source.replace(broken, fixed), 'utf8');
const verified = readFileSync(filename, 'utf8');
if (!verified.includes(fixed) || verified.includes(broken)) {
  throw new Error('OpenNext cookie converter correction failed verification');
}
console.log('Verified Cloudflare OpenNext cookie converter correction');
