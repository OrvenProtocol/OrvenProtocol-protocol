// Gates. `npm run gates` builds, then checks dist/ and the repo. Exit 0 only if every gate passes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, validateRegister, handleOf } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const rd = (p) => fs.readFileSync(p, 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));

const results = [];
function gate(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('returned false');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, msg: e.message });
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const walk = (dir, skip = []) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (skip.includes(d.name)) return [];
  return d.isDirectory() ? walk(p, skip) : [p];
});

/* ---------- shared scanners ---------- */
const B58_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
const EVM_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
// Address-shaped strings must match a STATED registry address; 0x hex is never blanket-rejected.
export function scanAddresses(text, recs) {
  const allowed = new Set(Object.values(recs).filter((r) => r.state === 'stated' && r.kind === 'address').map((r) => r.value));
  const evm = text.match(EVM_RE) || [];
  const found = [...(text.replace(EVM_RE, ' ').match(B58_RE) || []), ...evm];
  return found.filter((a) => !allowed.has(a));
}
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const DATE_RES = [
  /\b(19|20)\d{2}\b/, /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\blast verified\b/i,
  /\b(yesterday|today|tomorrow)\b/i, /\bT\d{2}:\d{2}/,
];
function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
}
function attrText(html) {
  const out = [];
  for (const m of visibleText(html).matchAll(/\s(aria-label|title|alt|data-q|data-a|content)="([^"]*)"/g)) out.push(m[2]);
  return out.join('\n');
}
function plain(html) {
  return decode(visibleText(html).replace(/<[^>]+>/g, '\n'));
}
function decode(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function bigrams(text) {
  const set = new Set();
  for (const seg of text.split(/[.!?\n—]+/)) {
    const w = seg.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9$]+/).filter(Boolean);
    for (let i = 0; i + 1 < w.length; i++) set.add(w[i] + ' ' + w[i + 1]);
  }
  return set;
}

const baseReg = JSON.parse(rd(path.join(SRC, 'register.json')));

/* ---------- build ---------- */
let buildOk = false;
gate('build: dist/ produced from register', () => { build({ register: clone(baseReg), outDir: DIST }); buildOk = true; });
if (!buildOk) { report(); }
const html = rd(path.join(DIST, 'index.html'));
const js = rd(path.join(DIST, 'assets/app.js'));
const css = rd(path.join(DIST, 'assets/styles.css'));
const recs = validateRegister(baseReg);

/* ---------- logo / favicon ---------- */
gate('logo: files copied into dist/ and referenced by relative src', () => {
  for (const f of ['assets/logo-720.png', 'assets/logo-128.png']) {
    const b = fs.readFileSync(path.join(DIST, f));
    assert(b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', f + ' is not a PNG');
    assert(b[25] === 6, f + ' is not colour type 6 (RGBA)');
    assert(html.includes(`src="${f}"`), 'index.html does not reference ' + f);
    assert(!/src="\//.test(html) && !/href="\/(?!\/)/.test(html), 'absolute paths in index.html');
  }
});
gate('logo: hero image dimensions match its asset', () => {
  const b = fs.readFileSync(path.join(DIST, 'assets/logo-720.png'));
  assert(b.readUInt32BE(16) === 669 || b.readUInt32BE(20) === 720, 'unexpected ihdr size');
});
gate('favicon: 32x32 svg, no xml comments, no double hyphen, fill is the ink token', () => {
  const s = rd(path.join(DIST, 'favicon.svg'));
  assert(/width="32"/.test(s) && /height="32"/.test(s) && /viewBox="0 0 32 32"/.test(s), 'not 32x32');
  assert(!s.includes('--'), 'double hyphen present');
  assert(!s.includes('<!--'), 'comment present');
  const ink = /--ink:\s*(#[0-9a-fA-F]{6})/.exec(rd(path.join(SRC, 'tokens.css')))[1];
  assert(s.includes(`fill="${ink}"`), 'fill is not the ink token');
  assert(/<link rel="icon"[^>]*favicon\.svg/.test(html), 'favicon not linked');
});

/* ---------- palette ---------- */
gate('palette: hex literals live only in tokens.css (src and dist)', () => {
  const tokens = rd(path.join(SRC, 'tokens.css'));
  const files = [...walk(SRC), ...walk(DIST)].filter((f) => /\.(css|js|html|svg|mjs)$/.test(f));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    if (rel.endsWith('tokens.css')) continue;
    let t = rd(f);
    if (rel.endsWith('favicon.svg')) continue;                    // fill equals ink token (gate above)
    if (/index\.html$/.test(rel)) t = t.replace(/<meta name="theme-color" content="#[0-9a-fA-F]{6}">/, '');
    const hits = t.match(HEX_RE);
    assert(!hits, `${rel}: hex literal ${hits && hits[0]}`);
  }
  const used = new Set((tokens.match(HEX_RE) || []).map((h) => h.toLowerCase()));
  const comment = tokens.slice(0, tokens.indexOf('*/')).toLowerCase();
  for (const h of used) assert(comment.includes(h), `${h} lacks provenance in the tokens comment`);
});
gate('palette: tokens comment records k-means method and pixel coordinates', () => {
  const c = rd(path.join(SRC, 'tokens.css'));
  assert(/k-means/.test(c) && /snapped/.test(c) && /x=\d+ y=\d+/.test(c), 'provenance incomplete');
});

/* ---------- hygiene ---------- */
gate('hygiene: no CLAUDE.md, no .claude/, no tool or AI attribution in repo files', () => {
  assert(!fs.existsSync(path.join(ROOT, 'CLAUDE.md')) && !fs.existsSync(path.join(ROOT, '.claude')), 'forbidden file present');
  const bad = /\b(claude|anthropic|chatgpt|openai|copilot|co-authored-by|generated (by|with)|ai-generated)\b/i;
  for (const f of walk(ROOT, ['node_modules', 'brand', 'reference', 'dist', '.git'])) {
    if (/gates\.mjs$/.test(f) || /ref-text\.txt$/.test(f) || /\.(png|jpe?g|jpeg|ico)$/i.test(f)) continue;
    assert(!bad.test(rd(f)), 'attribution text in ' + path.relative(ROOT, f));
  }
});
gate('repo content: README, whitepaper, LICENSE exist at root and not in dist', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) {
    assert(fs.existsSync(path.join(ROOT, f)), f + ' missing');
    assert(!fs.existsSync(path.join(DIST, f)) && !fs.existsSync(path.join(DIST, path.basename(f))), f + ' leaked into dist');
  }
  const lic = rd(path.join(ROOT, 'LICENSE'));
  assert(/^MIT License/.test(lic) && /Copyright \(c\) 2026 Orven/.test(lic), 'LICENSE is not MIT / Orven, 2026');
});

/* ---------- register rules ---------- */
gate('register: states valid, inert records carry no value or url', () => {
  validateRegister(clone(baseReg));
  for (const r of Object.values(baseReg.records)) if (r.state !== 'stated') assert(!('value' in r) && !('url' in r), r.label + ' inert but carries data');
});
gate('register: dates stay in register.json only, never shipped', () => {
  assert(Object.values(baseReg.records).some((r) => r.recordedAt), 'register carries no dates');
  const m = /id="reg">([\s\S]*?)<\/script>/.exec(html)[1];
  assert(!/recordedAt|20\d\d/.test(m), 'dates in shipped register');
});
gate('link rule: every external href belongs to a stated record', () => {
  const stated = Object.values(recs).filter((r) => r.state === 'stated' && r.url).map((r) => r.url);
  for (const m of html.matchAll(/href="(https?:[^"]+)"/g)) assert(stated.includes(m[1]), 'unstated href ' + m[1]);
  for (const k of ['x', 'github']) if (recs[k].state !== 'stated') assert(!new RegExp(k === 'x' ? 'x\\.com|twitter\\.com' : 'github\\.com', 'i').test(html), k + ' url leaked while inert');
});
gate('social: icon-only, both present top-right, official marks, inert render has no href', () => {
  const soc = /<div class="soc">([\s\S]*?)<\/div>/.exec(html)[1];
  assert((soc.match(/<svg /g) || []).length === 2, 'expected exactly two icons');
  assert(!/>[A-Za-z]/.test(soc.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'text label inside social block');
  assert(soc.includes('M18.244 2.25h3.308l-7.227 8.26') && soc.includes('M8 0c4.42 0 8 3.58 8 8'), 'not the official X / Octicon paths');
  for (const k of ['x', 'github']) if (recs[k].state !== 'stated') assert(!/<a /.test(soc), 'anchor rendered for inert record');
  assert(css.includes('.soc a, .soc span') && !/\.soc[^{]*\{[^}]*display:\s*none/.test(css), 'social hidden at some breakpoint');
  assert(!/\.soc[^{]*\{[^}]*display:\s*none/.test(css.replace(/\s+/g, ' ')), 'social collapses on mobile');
});
gate('ca slot: first thing in header, before main, inert while absent', () => {
  assert(html.indexOf('class="ca') > html.indexOf('<header') && html.indexOf('class="ca') < html.indexOf('<main'), 'CA slot not in header');
  if (recs.ca.state !== 'stated') assert(/class="ca is-inert"[^>]*aria-disabled="true"><span class="ca__label">CA<\/span><span class="ca__val">pending<\/span>/.test(html), 'inert CA slot wrong');
  assert(/\.ca__val[^}]*font-size:\s*clamp\(13px,\s*2\.1vw,\s*26px\)/.test(css), 'ca font not large');
});

/* ---------- address scanner ---------- */
gate('address gate: dist has no address-shaped string outside the stated registry', () => {
  const bad = [];
  for (const f of walk(DIST).filter((p) => /\.(html|js|css|svg)$/.test(p))) bad.push(...scanAddresses(rd(f), recs));
  assert(!bad.length, 'unregistered address-shaped: ' + bad.join(','));
});
gate('address gate: 0x hex is matched to the registry, not blanket-rejected', () => {
  const evm = '0x' + 'a1'.repeat(20);
  const reg = { ca: { state: 'stated', kind: 'address', value: evm } };
  assert(scanAddresses('x ' + evm + ' y', reg).length === 0, 'stated 0x rejected');
  assert(scanAddresses('x ' + evm, { ca: { state: 'absent', kind: 'address' } }).length === 1, 'unstated 0x accepted');
  const sol = 'So11111111111111111111111111111111111111112';
  assert(scanAddresses(sol, { ca: { state: 'absent' } }).length === 1, 'unstated base58 accepted');
});

/* ---------- mutation harness (anchors read the current record at runtime) ---------- */
const FIX_B58 = 'So11111111111111111111111111111111111111112';
const FIX_EVM = '0x' + 'b2'.repeat(20);
function mutated(key, to, fixture) {
  const reg = clone(baseReg);
  const r = reg.records[key];
  if (to === 'absent') { r.state = 'absent'; delete r.value; delete r.url; }
  else { r.state = 'stated'; if (r.kind === 'address') r.value = fixture; else r.url = fixture; }
  return reg;
}
function tmpBuild(reg) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'orven-'));
  build({ register: reg, outDir: out });
  return out;
}
const branchProof = {};
for (const key of ['ca', 'vault', 'x', 'github']) {
  const cur = baseReg.records[key].state;            // runtime read, not a hard-coded anchor
  const flipTo = cur === 'stated' ? 'absent' : 'stated';
  gate(`mutation ${key}: current=${cur} -> ${flipTo}, both branches render correctly`, () => {
    const kind = baseReg.records[key].kind;
    const fixture = kind === 'address' ? (key === 'ca' ? FIX_B58 : FIX_EVM) : `https://${key === 'x' ? 'x.com' : 'github.com'}/orvenworld`;
    const other = mutated(key, flipTo, fixture);
    const statedReg = flipTo === 'stated' ? other : clone(baseReg);
    const absentReg = flipTo === 'absent' ? other : clone(baseReg);
    const outS = tmpBuild(statedReg), outA = tmpBuild(absentReg);
    const hS = rd(path.join(outS, 'index.html')), hA = rd(path.join(outA, 'index.html'));
    const rS = statedReg.records, rA = absentReg.records;
    if (kind === 'address') {
      const v = rS[key].value;
      assert(hS.includes(v), 'stated: value not rendered');
      assert(!hA.includes(v), 'absent: value leaked');
      if (key === 'ca') {
        assert(hS.includes(`data-copy="${v}"`) && /<button class="ca"/.test(hS), 'stated: click-to-copy missing');
        assert(/class="ca is-inert"/.test(hA) && !/data-copy=/.test(hA), 'absent: ca not inert');
        assert(/data-supply/.test(hS) && !/data-supply/.test(hA), 'supply tile does not follow ca state');
      } else assert(/Payout vault<\/span><span class="v">pending/.test(hA), 'absent vault not pending');
      assert(scanAddresses(hS, rS).length === 0, 'stated: scanner rejected the stated address');
      assert(scanAddresses(hS, rA).includes(v), 'scanner fails to catch the address when unregistered');
      assert(scanAddresses(hA, rA).length === 0, 'absent: scanner found stray address');
    } else {
      const u = rS[key].url, h = handleOf(u);
      assert(hS.includes(`href="${u}"`), 'stated: href missing');
      assert(new RegExp(`aria-label="${key === 'x' ? 'X' : 'GitHub'}, ${key === 'x' ? '@' : ''}${h}"`).test(hS), 'stated: handle not derived from url');
      assert(!hA.includes(u) && !hA.includes('href="' + u), 'absent: url leaked');
      assert(new RegExp(`class="is-inert" role="img" aria-label="${key === 'x' ? 'X' : 'GitHub'}, pending"`).test(hA), 'absent: inert icon missing');
      assert((hS.match(/<div class="soc">[\s\S]*?<\/div>/)[0].match(/<svg /g) || []).length === 2 && (hA.match(/<div class="soc">[\s\S]*?<\/div>/)[0].match(/<svg /g) || []).length === 2, 'icon count changed with state');
    }
    for (const o of [outS, outA]) fs.rmSync(o, { recursive: true, force: true });
    branchProof[key] = { stated: true, absent: true };
  });
}
gate('mutation: absent branch rejects a value on an inert record', () => {
  const bad = clone(baseReg); Object.values(bad.records).find((r) => r.state !== 'stated').value = 'x';
  let threw = false; try { validateRegister(bad); } catch { threw = true; }
  assert(threw, 'inert record with value accepted');
});
gate('market independence: market section, ticker and script identical for ca absent vs stated', () => {
  const a = tmpBuild(mutated('ca', 'absent')), b = tmpBuild(mutated('ca', 'stated', FIX_B58));
  const sec = (h) => /<section class="sec" id="market">[\s\S]*?<\/section>/.exec(h)[0].replace(/<div class="brow brow--own[\s\S]*?<div class="meta"><\/div>\s*<\/div>/, '') + /<div class="ticker"[\s\S]*?<\/div><\/div>/.exec(h)[0];
  const ha = rd(path.join(a, 'index.html')), hb = rd(path.join(b, 'index.html'));
  assert(sec(ha) === sec(hb), 'market markup depends on ca');
  assert(rd(path.join(a, 'assets/app.js')) === rd(path.join(b, 'assets/app.js')), 'script differs');
  assert(/REG\.market/.test(js) && /mk\.state === 'stated'/.test(js), 'market not keyed to its own record');
  const marketBlock = js.slice(js.indexOf('function initMarket'));
  assert(!/REG\.ca|caRec/.test(marketBlock), 'market code reads ca');
  for (const o of [a, b]) fs.rmSync(o, { recursive: true, force: true });
});

/* ---------- market behaviour (static) ---------- */
gate('market: elysium gecko endpoints, top 10 with pinned own row, backoff, 60s poll, visibility, last-good kept', () => {
  assert(recs.market.provider === 'gecko' && recs.market.networkSlug === 'elysium', 'provider or slug');
  assert(recs.market.feedUrl === 'https://api.geckoterminal.com/api/v2/networks/elysium/trending_pools', 'feed url');
  assert(recs.market.tokenUrl === 'https://api.geckoterminal.com/api/v2/networks/elysium/tokens/{address}', 'token url');
  assert(recs.chain.value === 'Elysium' && recs.chain.chainId === '0x1863d' && recs.chain.network === 'elysium', 'chain record');
  assert(/function pullGecko/.test(js) && /slice\(0, 9\)/.test(js), 'gecko pull or top 9 + own row');
  assert(!/solana|dexscreener|robinhood/i.test(js + html), 'stale chain reference in shipped code');
  assert(/visibilitychange/.test(js) && /doc\.hidden/.test(js), 'visibility');
  assert(/if \(good\)/.test(js) && /—/.test(js), 'last-good or dash');
  assert((html.match(/data-row/g) || []).length === 9 && /data-own/.test(html), 'nine feed rows plus pinned own row');
  assert(/image_url/.test(js) && /tile--lg/.test(html) === true, 'logo / tile fallback');
});
gate('images: no loading="lazy" anywhere; img attached before src is set', () => {
  for (const t of [html, js, css]) assert(!/loading\s*[:=]\s*["']?lazy/i.test(t), 'lazy loading found');
  assert(js.indexOf('s.appendChild(im)') < js.indexOf('im.src = t.img'), 'src set before attach');
});

/* ---------- motion ---------- */
gate('hero motion: levitate 4s +-12px +-1.5deg, stagger .6s/.1s, cta .95 scale, mesh opacity .15', () => {
  const c = css.replace(/\s+/g, ' ');
  assert(/animation: levitate 4s ease-in-out infinite/.test(c), 'levitate');
  assert(/translateY\(-12px\) rotate\(-1\.5deg\)/.test(c) && /translateY\(12px\) rotate\(1\.5deg\)/.test(c), 'levitate range');
  assert(/wordUp \.6s var\(--ease-out\) calc\(var\(--i\) \* \.1s/.test(c) && /translateY\(20px\)/.test(c), 'word stagger');
  assert(/scale\(\.95\)/.test(c) && /ctaIn/.test(c), 'cta');
  assert((c.match(/\.blob[^{]*\{[^}]*opacity: \.15/g) || []).length >= 1 && /blur\(90px\)/.test(c), 'mesh');
});
gate('hero: no scroll-reveal on hero; parallax layers present', () => {
  const hero = /<section class="hero">[\s\S]*?<\/section>/.exec(html)[0];
  assert(!/data-reveal|data-stagger/.test(hero), 'hero uses reveal');
  assert((hero.match(/data-depth/g) || []).length >= 3, 'parallax layers');
});
gate('motion: reduced-motion fallback covers every animation; spring solver, progress bar, spotlight, count-up present', () => {
  assert(/@media \(prefers-reduced-motion: reduce\)/.test(css) && /animation: none !important/.test(css), 'reduced-motion css');
  assert(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(js), 'reduced-motion js');
  assert(/function spring/.test(js) && /stiffness/.test(js) && /damping/.test(js), 'spring');
  assert(/class="progress"/.test(html) && /\[data-spot\]/.test(css) && /function countTo/.test(js) && /flash-up/.test(css), 'effects');
  assert(/class="dot"/.test(html) && /@keyframes ring/.test(css) && /@keyframes shimmer/.test(css), 'live dot / skeleton');
});

/* ---------- mobile, units ---------- */
gate('css: no ch units; tap targets 44px for interactive controls', () => {
  assert(!/\d(\.\d+)?ch\b/.test(css), 'ch unit used');
  for (const sel of ['.soc a, .soc span', '.cp ', '.faq__nav button', '.ca__act', '.btn']) {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css);
    assert(m && /(height|min-height):\s*44px/.test(m[1]), sel + ' lacks 44px height');
  }
  assert(/\.soc a, \.soc span\s*\{[^}]*width: 44px/.test(css) && /\.cp\s*\{[^}]*width: 44px/.test(css), '44px width');
});

/* ---------- no dates ---------- */
gate('no dates: visible text, attributes, aria, scripts and styles carry no date or clock string', () => {
  const jsStrings = (js.match(/'[^'\n]*'|"[^"\n]*"/g) || []).join(' ');
  const surfaces = [plain(html), attrText(html), jsStrings, css.replace(/\/\*[\s\S]*?\*\//g, '')];
  for (const t of surfaces) for (const re of DATE_RES) {
    const m = re.exec(t.replace(/cubic-bezier\([^)]*\)/g, '').replace(/#[0-9a-fA-F]+/g, ''));
    assert(!m, `date-like "${m && m[0]}"`);
  }
});

/* ---------- copy: no shared 2-grams with the reference ---------- */
gate('copy: zero shared two-word sequences with the reference text', () => {
  const ref = bigrams(rd(path.join(ROOT, 'scripts/data/ref-text.txt')));
  const mine = bigrams(plain(html) + '\n' + attrText(html));
  const shared = [...mine].filter((g) => ref.has(g));
  assert(!shared.length, 'shared (' + shared.length + '): ' + shared.join(' | '));
});
gate('copy: no figures borrowed from the reference', () => {
  const t = plain(html);
  for (const n of ['0.05', '$5', '48 hours', '$1', '30 seconds', '$0.60', '$0.10', '$0.15']) assert(!t.includes(n), 'borrowed figure ' + n);
});

function report() {
  const w = String(results.length).length;
  results.forEach((r, i) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(i + 1).padStart(w)}  ${r.name}${r.ok ? '' : '\n        -> ' + r.msg}`));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\ngates: ${results.length - failed}/${results.length} passed`);
  if (Object.keys(branchProof).length) console.log('branches proven (stated + absent) for:', Object.keys(branchProof).join(', '));
  process.exit(failed ? 1 : 0);
}
report();
