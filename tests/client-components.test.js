import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ---------------------------------------------------------------------------
 * Client Component render-safety
 *
 * A `'use client'` component still renders on the server for the initial HTML.
 * Touching a browser-only global (`window`, `document`, `navigator`,
 * `localStorage`) *during that render* throws `ReferenceError: window is not
 * defined` and turns the page into a 500.
 *
 * This suite walks every client component and fails the build when such a
 * reference sits at the body depth of a component - i.e. it runs on render
 * instead of inside an event handler, effect or callback (which are always one
 * brace level deeper).
 *
 * Regression: `VoidTransactionButton` called `window.prompt(...)` in its render
 * body, which both 500'd the Treasury ledger page and rendered no button at
 * all, so voiding a transaction was impossible.
 * ---------------------------------------------------------------------------
 */

const ROOT = process.cwd();
const COMPONENTS_DIR = path.join(ROOT, 'components');

/** Browser-only globals that only exist in a real browser. */
const BROWSER_GLOBALS = /\b(?:window|document|navigator|localStorage|sessionStorage)\s*[.[(]/g;

/** Strips comments and string/template literals so brace counting stays honest. */
function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/**
 * Depth of each character offset in the cleaned source.
 * Returns a function offset -> brace depth (before that character).
 */
function depthMap(cleaned) {
  const depthAt = new Array(cleaned.length);
  let depth = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    depthAt[i] = depth;
    if (cleaned[i] === '{') depth += 1;
    else if (cleaned[i] === '}') depth -= 1;
  }
  depthAt[cleaned.length] = depth;
  return depthAt;
}

/**
 * Body depth of every top-level component declaration, e.g.
 * `export function Foo(...) {` at file scope -> the depth just inside its body.
 */
function componentBodyDepths(cleaned, depthAt) {
  const depths = [];
  const declaration = /(?:^|\n)\s*(?:export\s+)?function\s+[A-Z][A-Za-z0-9_]*\s*\(/g;
  let match;
  while ((match = declaration.exec(cleaned)) !== null) {
    // Walk forward from the parameter list to the `{` that opens the body.
    let i = match.index + match[0].length - 1;
    let parens = 0;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (ch === '(') parens += 1;
      else if (ch === ')') {
        parens -= 1;
        if (parens === 0) break;
      }
      i += 1;
    }
    while (i < cleaned.length && cleaned[i] !== '{') i += 1;
    // `depthAt[i]` is the depth *before* the opening brace, so the statements in
    // the body live one level deeper.
    if (i < cleaned.length) depths.push(depthAt[i] + 1);
  }
  return depths;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(COMPONENTS_DIR);
const clientFiles = files.filter(
  (file) => /^\s*['"]use client['"]/.test(fs.readFileSync(file, 'utf8')),
);

describe('client components render safely on the server', () => {
  it('finds the client component files to check', () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it.each(clientFiles.map((f) => [path.relative(ROOT, f), f]))(
    '%s uses no browser-only global at render depth',
    (_label, file) => {
      const cleaned = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
      const depthAt = depthMap(cleaned);
      const bodyDepths = componentBodyDepths(cleaned, depthAt);

      const offenders = [];
      BROWSER_GLOBALS.lastIndex = 0;
      let match;
      while ((match = BROWSER_GLOBALS.exec(cleaned)) !== null) {
        const depth = depthAt[match.index];
        if (bodyDepths.includes(depth)) {
          const line = cleaned.slice(0, match.index).split('\n').length;
          offenders.push(`line ${line}: ${match[0].trim()}`);
        }
      }

      expect(
        offenders,
        `${path.relative(ROOT, file)} touches a browser global while rendering. ` +
          'Move it into an event handler, an effect, or a callback.',
      ).toEqual([]);
    },
  );
});
