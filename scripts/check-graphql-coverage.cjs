#!/usr/bin/env node
// The codegen loader skips a file it cannot pluck from or parse, without an
// error. This fails the build naming any document in src it did not load.
const fs = require('fs');
const path = require('path');
const { loadCodegenConfig } = require('@graphql-codegen/cli');
const { loadDocuments } = require('@graphql-tools/load');
const { CodeFileLoader } = require('@graphql-tools/code-file-loader');
const { parse } = require('graphql');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = 'codegen.validate.ts';

function templateLiterals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      let buf = '';
      while (j < src.length) {
        if (src[j] === '\\') { buf += src[j] + src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { depth++; buf += '${'; j += 2; continue; }
        if (depth > 0 && src[j] === '}') { depth--; buf += '}'; j++; continue; }
        if (depth === 0 && src[j] === '`') break;
        buf += src[j];
        j++;
      }
      out.push({ content: buf, start: i });
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    i++;
  }
  return out;
}

// An interpolation is either an appended fragment, which parses once blanked,
// or a spliced selection set, which needs a placeholder field. Try both.
const SUBS = [
  (s) => s.replace(/\$\{[^}]*\}/g, ''),
  (s) => s.replace(/\$\{[^}]*\}/g, '__interp'),
  (s) => s.replace(/\.\.\.\$\{[^}]*\}/g, '...__interp').replace(/\$\{[^}]*\}/g, ''),
];

function definitionsIn(raw) {
  if (!/\b(query|mutation|subscription|fragment)\s+[A-Za-z_]/.test(raw)) return null;
  for (const sub of SUBS) {
    try {
      const defs = parse(sub(raw)).definitions.filter(
        (d) => d.kind === 'OperationDefinition' || d.kind === 'FragmentDefinition'
      );
      if (defs.length) return defs;
    } catch {
      /* try the next strategy */
    }
  }
  return null;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

(async () => {
  // Read the globs from the codegen config itself so the two cannot drift.
  const loaded = await loadCodegenConfig({ configFilePath: path.join(ROOT, CONFIG) });
  const globs = [].concat(loaded.config.documents || []);
  if (!globs.length) {
    console.error(`No documents globs in ${CONFIG}.`);
    process.exit(2);
  }

  const docs = await loadDocuments(globs, {
    cwd: ROOT,
    loaders: [new CodeFileLoader()],
    ignoreNoDocuments: true,
  });

  // Keyed by file, not just by name: six operation names are declared in two
  // places, so a name set alone still matches after one of them goes dark.
  const yielded = new Map();
  let loadedTotal = 0;
  for (const d of docs) {
    const file = path.relative(ROOT, d.location || '').replace(/\\/g, '/');
    if (!yielded.has(file)) yielded.set(file, new Set());
    for (const def of d.document ? d.document.definitions : []) {
      if (!def.name) continue;
      yielded.get(file).add(def.name.value);
      loadedTotal++;
    }
  }

  // A package glob supplies definitions; it does not need checking back.
  const scanRoots = globs
    .filter((g) => !g.includes('node_modules'))
    .map((g) => path.join(ROOT, g.split('*')[0]));

  const missing = [];
  let declared = 0;
  let anonymous = 0;

  for (const dir of scanRoots) {
    for (const file of walk(dir)) {
      const src = fs.readFileSync(file, 'utf8');
      const relFile = path.relative(ROOT, file).replace(/\\/g, '/');
      const fromThisFile = yielded.get(relFile) || new Set();
      for (const t of templateLiterals(src)) {
        const defs = definitionsIn(t.content);
        if (!defs) continue;
        for (const def of defs) {
          if (!def.name) { anonymous++; continue; }
          declared++;
          if (!fromThisFile.has(def.name.value)) {
            missing.push({
              file: relFile,
              line: lineOf(src, t.start),
              kind: def.kind === 'FragmentDefinition' ? 'fragment' : def.operation,
              name: def.name.value,
            });
          }
        }
      }
    }
  }

  if (missing.length) {
    console.error(
      `\n${missing.length} GraphQL document(s) exist in the source but were never loaded, ` +
        `so nothing validated them:\n`
    );
    for (const m of missing) {
      console.error(`  ${m.file}:${m.line}  ${m.kind} ${m.name}`);
    }
    console.error(
      `\nThe loader skips what it cannot pluck or parse, without an error. Add a\n` +
        `/* GraphQL */ marker before a plain backtick template, or replace an\n` +
        `interpolated fragment spread with the fragment's own name.\n`
    );
    process.exit(1);
  }

  console.log(
    `graphql coverage: ${declared} definitions written in ${scanRoots.length === 1 ? 'src' : 'the source'}, ` +
      `every one loaded from its own file (${loadedTotal} loaded in total, ` +
      `including package fragments)${anonymous ? `; ${anonymous} anonymous skipped` : ''}.`
  );
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
