#!/usr/bin/env node
/**
 * Mechanical scans for a hygiene sweep. Each check prints candidates — not
 * verdicts. A candidate is a place worth reading; the judgment about whether it
 * is actually cruft belongs to the agent, which can see intent that a scanner
 * cannot (a deliberately retained provider, a platform variant, a public API
 * kept for an imminent consumer).
 *
 * Usage:
 *   node scan.mjs <check> [options]
 *
 * Checks:
 *   dupes     Near-identical line blocks repeated across files
 *   exports   Exported symbols with no consumer outside their own file
 *   orphans   Source files nothing imports
 *   docrefs   Paths named in docs that no longer exist
 *   deps      package.json dependencies nothing references
 *   all       Every check, in the order above
 *
 * Options:
 *   --src <dirs>     Comma-separated source roots        (default: src,app,lib)
 *   --docs <dirs>    Comma-separated doc roots           (default: docs)
 *   --alias <map>    Import alias, e.g. "@/=src/"        (default: @/=src/)
 *   --ext <list>     Source extensions                   (default: ts,tsx,js,jsx,mjs)
 *   --entry <globs>  Comma-separated substrings marking framework entry points
 *                    that nothing imports by design      (default: none)
 *   --min <n>        Minimum block length for `dupes`    (default: 8)
 *   --json           Emit JSON instead of text
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , rawCheck, ...argv] = process.argv;

function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const flag = (name) => argv.includes(`--${name}`);

// No check named, or an explicit help request: print the header comment as usage
// rather than silently scanning the whole tree.
if (!rawCheck || rawCheck === '--help' || rawCheck === '-h' || flag('help')) {
  const self = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const doc = self.slice(self.indexOf('/**'), self.indexOf('*/') + 2);
  console.log(doc.replace(/^\/\*\*\n?|\n? \*\/$/g, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}

const check = rawCheck;
const SRC_DIRS = opt('src', 'src,app,lib').split(',').filter(Boolean);
const DOC_DIRS = opt('docs', 'docs').split(',').filter(Boolean);
const EXTS = opt('ext', 'ts,tsx,js,jsx,mjs').split(',').filter(Boolean);
const MIN_BLOCK = Number(opt('min', '8'));
const AS_JSON = flag('json');
const ENTRY_MARKS = opt('entry', '').split(',').filter(Boolean);
const ALIASES = opt('alias', '@/=src/')
  .split(',')
  .filter(Boolean)
  .map((pair) => {
    const [from, to] = pair.split('=');
    return { from, to };
  });

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.expo',
  'android',
  'ios',
  '.claude',
  'vendor',
  '__snapshots__',
]);

const isTest = (f) => /\.(test|spec)\.[^.]+$/.test(f);
const isDecl = (f) => /\.d\.ts$/.test(f);
const isPlatformVariant = (f) => /\.(web|native|ios|android|server|client)\.[^.]+$/.test(f);

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    if (IGNORE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function sourceFiles() {
  const out = [];
  for (const d of SRC_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of walk(d)) {
      if (EXTS.includes(path.extname(f).slice(1))) out.push(f);
    }
  }
  return out.sort();
}

function read(f) {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
}

const results = {};

// ---------------------------------------------------------------- dupes -----
// Hash sliding windows of normalized lines and report windows that appear in
// more than one file. Normalizing away whitespace is what lets a copied block
// match after a reformat; keeping the tokens is what stops it matching every
// closing brace. This is the check most likely to find the duplication a human
// reviewer would call "the same component twice".
function checkDupes() {
  const files = sourceFiles().filter((f) => !isTest(f));
  const norm = (l) => l.trim().replace(/\s+/g, ' ');
  // Lines too generic to anchor a match — a window made only of these is noise.
  const trivial = (l) => l.length < 4 || /^[}\]);,{]+$/.test(l) || /^(import|export)\b/.test(l);

  const windows = new Map(); // hash -> [{file, start, end, lines}]
  for (const f of files) {
    const lines = read(f).split('\n');
    const normed = lines.map(norm);
    for (let i = 0; i + MIN_BLOCK <= normed.length; i++) {
      const slice = normed.slice(i, i + MIN_BLOCK);
      if (slice.filter((l) => !trivial(l)).length < Math.ceil(MIN_BLOCK / 2)) continue;
      const key = slice.join('\n');
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key).push({ file: f, start: i + 1, end: i + MIN_BLOCK });
    }
  }

  // Keep only cross-file repeats, then merge overlapping windows per file pair
  // so one 40-line duplicate reports once instead of 33 times.
  const hits = [];
  for (const [key, locs] of windows) {
    const distinct = new Set(locs.map((l) => l.file));
    if (distinct.size < 2) continue;
    hits.push({ key, locs, lines: key.split('\n') });
  }

  const merged = [];
  const seen = new Set();
  hits.sort((a, b) => b.lines.length - a.lines.length);
  for (const h of hits) {
    const sig = h.locs.map((l) => l.file).sort().join('|');
    const spans = h.locs.map((l) => `${l.file}:${Math.floor(l.start / MIN_BLOCK)}`).join('|');
    if (seen.has(spans)) continue;
    seen.add(spans);
    const prev = merged.find(
      (m) =>
        m.files === sig &&
        m.locs.some((ml) => h.locs.some((hl) => hl.file === ml.file && hl.start <= ml.end + 2 && hl.end >= ml.start - 2)),
    );
    if (prev) {
      for (const l of h.locs) {
        const at = prev.locs.find((p) => p.file === l.file);
        if (at) {
          at.start = Math.min(at.start, l.start);
          at.end = Math.max(at.end, l.end);
        }
      }
      continue;
    }
    merged.push({ files: sig, locs: h.locs.map((l) => ({ ...l })), sample: h.lines[0] });
  }

  results.dupes = merged
    .map((m) => ({
      lines: Math.max(...m.locs.map((l) => l.end - l.start + 1)),
      locations: m.locs.map((l) => `${l.file}:${l.start}-${l.end}`),
      sample: m.sample.slice(0, 100),
    }))
    .sort((a, b) => b.lines - a.lines);
}

// -------------------------------------------------------------- exports -----
// A symbol nothing outside its own file mentions. `onlyBarrel` means the single
// consumer is an index/barrel re-export — the symbol is published but nobody
// imports it, which is the common shape of an over-broad public API.
function checkExports() {
  const files = sourceFiles();
  const bodies = new Map(files.map((f) => [f, read(f)]));
  const out = [];

  for (const f of files) {
    if (isTest(f) || isDecl(f)) continue;
    const src = bodies.get(f);
    const names = new Set();
    for (const m of src.matchAll(
      /^export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm,
    )) {
      names.add(m[1]);
    }
    for (const m of src.matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}/gm)) {
      for (let part of m[1].split(',')) {
        part = part.trim().replace(/^type\s+/, '');
        if (!part) continue;
        const as = part.split(/\s+as\s+/);
        names.add((as[1] ?? as[0]).trim());
      }
    }

    for (const name of names) {
      if (name === 'default') continue;
      const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
      const consumers = files.filter((o) => o !== f && re.test(bodies.get(o)));
      const nonTest = consumers.filter((c) => !isTest(c));
      if (nonTest.length === 0) {
        out.push({ name, file: f, status: 'no consumer', testOnly: consumers.length > 0 });
      } else if (nonTest.every((c) => /(^|\/)index\.[^.]+$/.test(c))) {
        out.push({ name, file: f, status: 'onlyBarrel', barrels: nonTest });
      }
    }
  }
  results.exports = out;
}

// -------------------------------------------------------------- orphans -----
function checkOrphans() {
  const files = sourceFiles();
  const bodies = new Map(files.map((f) => [f, read(f)]));
  const out = [];

  for (const f of files) {
    if (isTest(f) || isDecl(f)) continue;
    if (ENTRY_MARKS.some((m) => f.includes(m))) continue;
    if (isPlatformVariant(f)) {
      // Metro/webpack resolve these from the base specifier; if the base file
      // exists the variant is reachable even though no import names it.
      const base = f.replace(/\.(web|native|ios|android|server|client)(\.[^.]+)$/, '$2');
      if (files.includes(base)) continue;
    }

    const dir = path.dirname(f);
    const noExt = f.replace(/\.[^.]+$/, '');
    const specifiers = new Set();
    for (const { from, to } of ALIASES) {
      if (noExt.startsWith(to)) specifiers.add(from + noExt.slice(to.length));
    }
    const isIndex = path.basename(noExt) === 'index';

    let referenced = false;
    for (const o of files) {
      if (o === f) continue;
      const s = bodies.get(o);
      for (const spec of specifiers) {
        if (s.includes(`'${spec}'`) || s.includes(`"${spec}"`)) referenced = true;
      }
      if (isIndex) {
        for (const { from, to } of ALIASES) {
          if (dir.startsWith(to)) {
            const aliasDir = from + dir.slice(to.length);
            if (s.includes(`'${aliasDir}'`) || s.includes(`"${aliasDir}"`)) referenced = true;
          }
        }
      }
      let rel = path.relative(path.dirname(o), noExt);
      if (!rel.startsWith('.')) rel = './' + rel;
      if (s.includes(`'${rel}'`) || s.includes(`"${rel}"`)) referenced = true;
      if (isIndex) {
        let relDir = path.relative(path.dirname(o), dir) || '.';
        if (!relDir.startsWith('.')) relDir = './' + relDir;
        if (s.includes(`'${relDir}'`) || s.includes(`"${relDir}"`)) referenced = true;
      }
      if (referenced) break;
    }
    if (!referenced) out.push(f);
  }
  results.orphans = out;
}

// -------------------------------------------------------------- docrefs -----
// Docs rot in two directions: they name paths that were deleted, and they link
// to sibling docs that moved. Both are cheap to detect and both are strong hints
// that the surrounding prose is stale too.
function checkDocrefs() {
  const docs = [];
  for (const d of DOC_DIRS) {
    if (fs.existsSync(d)) docs.push(...walk(d).filter((f) => f.endsWith('.md')));
  }
  for (const extra of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
    if (fs.existsSync(extra)) docs.push(extra);
  }

  // Only treat a leading segment as a repo path if that directory really is at
  // the repo root. Without this, prose like `lib/foo` inside a table cell (a
  // fragment of a longer path, not a path) reads as a broken reference.
  const roots = [...SRC_DIRS, ...DOC_DIRS, 'scripts', 'assets', 'public', 'packages', 'apps'].filter(
    (r) => fs.existsSync(r),
  );
  const out = [];
  for (const d of docs) {
    const txt = read(d);
    const missing = new Set();

    for (const m of txt.matchAll(/`([^`\n]+)`/g)) {
      const t = m[1].trim().replace(/[),.;:]+$/, '');
      if (!roots.some((r) => t.startsWith(r + '/'))) continue;
      if (/[<>*?…]/.test(t)) continue; // placeholder like src/<page> or src/…
      const exists =
        fs.existsSync(t) || EXTS.some((e) => fs.existsSync(`${t}.${e}`)) || fs.existsSync(`${t}.md`);
      if (!exists) missing.add(t);
    }

    // Balance parentheses so a route group in a path — ](../src/app/(tabs)/x) —
    // is not truncated at its first ")" and then reported as missing.
    for (const m of txt.matchAll(/\]\(/g)) {
      let i = m.index + 2;
      let depth = 1;
      let target = '';
      while (i < txt.length && depth > 0) {
        const ch = txt[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth > 0) target += ch;
        i++;
      }
      target = target.split(/\s+/)[0].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const abs = path.normalize(path.join(path.dirname(d), target));
      if (!fs.existsSync(abs)) missing.add(`link → ${target}`);
    }

    if (missing.size) out.push({ doc: d, missing: [...missing] });
  }
  results.docrefs = out;
}

// ----------------------------------------------------------------- deps -----
// A dependency is only truly unused when the source never names it AND no other
// installed package requires it. Skipping the second half produces a list full
// of framework peers that must not be removed.
function checkDeps() {
  if (!fs.existsSync('package.json')) {
    results.deps = [];
    return;
  }
  const pkg = JSON.parse(read('package.json'));
  const deps = Object.keys(pkg.dependencies ?? {});
  const files = sourceFiles();
  const haystack = files.map(read).join('\n');
  // package.json is deliberately excluded: every dependency is named there by
  // definition, so including it would mark the whole list as "in use".
  const configs = [
    'app.json',
    'app.config.js',
    'app.config.ts',
    'next.config.js',
    'vite.config.ts',
    'metro.config.js',
    'babel.config.js',
    'tailwind.config.js',
  ]
    .filter((f) => fs.existsSync(f))
    .map((f) => read(f))
    .join('\n');

  const requiredBy = (target) => {
    const found = [];
    let scopes;
    try {
      scopes = fs.readdirSync('node_modules');
    } catch {
      return found;
    }
    for (const s of scopes) {
      const mods = s.startsWith('@')
        ? (() => {
            try {
              return fs.readdirSync(path.join('node_modules', s)).map((x) => `${s}/${x}`);
            } catch {
              return [];
            }
          })()
        : [s];
      for (const m of mods) {
        if (m === target) continue;
        try {
          const j = JSON.parse(read(path.join('node_modules', m, 'package.json')));
          const peerOptional = j.peerDependenciesMeta?.[target]?.optional;
          if (j.dependencies?.[target] || (j.peerDependencies?.[target] && !peerOptional)) {
            found.push(m);
            if (found.length >= 3) return found;
          }
        } catch {
          /* unreadable package.json — skip */
        }
      }
    }
    return found;
  };

  const out = [];
  for (const d of deps) {
    const inSource =
      haystack.includes(`'${d}'`) ||
      haystack.includes(`"${d}"`) ||
      haystack.includes(`'${d}/`) ||
      haystack.includes(`"${d}/`);
    if (inSource) continue;
    const inConfig = configs.includes(`"${d}"`);
    const needers = requiredBy(d);
    out.push({ name: d, inConfig, requiredBy: needers });
  }
  results.deps = out;
}

// ----------------------------------------------------------------- run ------
const CHECKS = { dupes: checkDupes, exports: checkExports, orphans: checkOrphans, docrefs: checkDocrefs, deps: checkDeps };
const toRun = check === 'all' ? Object.keys(CHECKS) : [check];

for (const c of toRun) {
  if (!CHECKS[c]) {
    console.error(`unknown check "${c}" — expected one of: ${Object.keys(CHECKS).join(', ')}, all`);
    process.exit(2);
  }
  CHECKS[c]();
}

if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);

if (results.dupes) {
  console.log(`\n## dupes — repeated blocks of >=${MIN_BLOCK} lines across files (${results.dupes.length})`);
  if (!results.dupes.length) console.log('   none');
  for (const d of results.dupes.slice(0, 40)) {
    console.log(`   ${pad(d.lines + 'L', 6)} ${d.locations.join('  ==  ')}`);
    console.log(`          ${d.sample}`);
  }
  if (results.dupes.length > 40) console.log(`   … ${results.dupes.length - 40} more`);
}

if (results.exports) {
  const dead = results.exports.filter((e) => e.status === 'no consumer');
  const barrel = results.exports.filter((e) => e.status === 'onlyBarrel');
  console.log(`\n## exports — no consumer (${dead.length})`);
  if (!dead.length) console.log('   none');
  for (const e of dead) console.log(`   ${pad(e.name, 34)} ${e.file}${e.testOnly ? '   [tests reference it]' : ''}`);
  console.log(`\n## exports — published but never imported (${barrel.length})`);
  if (!barrel.length) console.log('   none');
  for (const e of barrel) console.log(`   ${pad(e.name, 34)} ${e.file}`);
}

if (results.orphans) {
  console.log(`\n## orphans — files nothing imports (${results.orphans.length})`);
  if (!results.orphans.length) console.log('   none');
  for (const f of results.orphans) console.log(`   ${f}`);
}

if (results.docrefs) {
  const n = results.docrefs.reduce((a, d) => a + d.missing.length, 0);
  console.log(`\n## docrefs — paths named in docs that do not exist (${n})`);
  if (!n) console.log('   none');
  for (const d of results.docrefs) {
    console.log(`   ${d.doc}`);
    for (const m of d.missing) console.log(`      - ${m}`);
  }
}

if (results.deps) {
  console.log(`\n## deps — dependencies not referenced in source (${results.deps.length})`);
  if (!results.deps.length) console.log('   none');
  for (const d of results.deps) {
    const why = d.inConfig
      ? 'named in a config file'
      : d.requiredBy.length
        ? `required by ${d.requiredBy.join(', ')}`
        : 'NOTHING requires it';
    console.log(`   ${pad(d.name, 30)} ${why}`);
  }
}

console.log('');
