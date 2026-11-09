// Static build: src/ + register.json -> dist/. No dependencies.
// build({ register, outDir }) is also called by scripts/gates.mjs with mutated registers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const DATE_KEYS = new Set(['recordedAt', 'checkedAt', 'verifiedAt', 'asOf']);

export function validateRegister(reg) {
  const recs = reg.records || {};
  for (const [key, r] of Object.entries(recs)) {
    if (!['stated', 'absent', 'unconfirmed'].includes(r.state)) throw new Error(`register.${key}: bad state`);
    if (r.state !== 'stated') {
      for (const f of ['value', 'url']) if (f in r) throw new Error(`register.${key}: inert record carries ${f}`);
    } else if (r.kind === 'address') {
      if (!B58.test(r.value || '') && !EVM.test(r.value || '')) throw new Error(`register.${key}: stated address is not address-shaped`);
    } else if (r.kind === 'url') {
      if (!/^https:\/\//.test(r.url || '')) throw new Error(`register.${key}: stated url missing`);
    }
  }
  return recs;
}

export function handleOf(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean)[0] || ''; } catch { return ''; }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
  sol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 15.9a.7.7 0 0 1 .5-.2h14.6c.3 0 .5.4.3.6l-2.9 2.9a.7.7 0 0 1-.5.2H2.8c-.3 0-.5-.4-.3-.6zM5.4 4.6a.7.7 0 0 1 .5-.2h14.6c.3 0 .5.4.3.6L17.9 7.900a.7.7 0 0 1-.5.2H2.8c-.3 0-.5-.4-.3-.6zM17.9 10.200a.7.7 0 0 0-.5-.2H2.8c-.3 0-.5.4-.3.6l2.900 2.900c.1.1.3.2.5.2h14.600c.3 0 .5-.4.3-.6z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.500 4.500L19 7.500"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg>',
  bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4M9 13.500h.01M15 13.500h.01"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.500 10.500h4a1.500 1.500 0 0 1 0 3h-3"/></svg>',
};

const FAQ = [
  ['Who may take part?', 'Anyone who controls Elysium keys. No application, no screening call: reply quality is the whole résumé.'],
  ['Who creates the tasks?', 'Autonomous software agents plus their operators. Every task states its payout upon arrival.'],
  ['What might I earn?', 'Rewards track whatever the requester set on each task. How many you land depends on effort and care, not on credentials.'],
  ['When does payment land?', 'Accepted replies raise your total immediately. Sending that total outward is one step, taken whenever suits.'],
  ['Why a stablecoin, and why Elysium?', 'A dollar-pegged token means you never guess what a reply was worth, and Elysium keeps fees tiny and settlement quick.'],
  ['What is declined?', 'Filler, pasted text, off-topic notes and anything that ignores the brief. Short and honest beats long and padded.'],
  ['Where do my replies go?', 'To the software that opened the task, as input for work it is trying to finish.'],
];

const WAYS = [
  { t: 'Open reply', p: 'Write a brief view on an actual problem.', s: ['Read the brief', 'Write in plain words', 'Send it for review'],
    ui: '<div class="ui-q">Which detail makes a checkout page feel safe to use?</div><div class="ui-line"></div><div class="ui-line s"></div>' },
  { t: 'Either-or', p: 'Back one side and defend the call.', s: ['Compare both options', 'Choose a side', 'Give your reason'],
    ui: '<div class="ui-q">Which welcome screen feels friendlier?</div><div class="ui-opt on"><i></i>A looping clip</div><div class="ui-opt"><i></i>A three-line summary</div>' },
  { t: 'Gauge', p: 'Attach a figure to how something feels.', s: ['Study the item', 'Choose a rating', 'Explain the gap'],
    ui: '<div class="ui-q">Rate how readable the settings menu is.</div><div class="ui-scale"><i>1</i><i>2</i><i>3</i><i class="on">4</i><i>5</i></div>' },
  { t: 'Shortlist', p: 'Offer a handful of fresh candidates.', s: ['Read the prompt', 'Draft your picks', 'Rank them'],
    ui: '<div class="ui-q">Invent titles for tea-box subscribers.</div><div class="ui-n"><b>1</b>Steep Post</div><div class="ui-n"><b>2</b>Leaf Letter</div><div class="ui-n"><b>3</b>Kettle Crate</div>' },
];

function words(h, extra = 0) {
  return h.split(' ').map((w, i) => `<span class="w" style="--i:${i + extra}">${esc(w)}</span>`).join(' ');
}

function renderHTML(recs, tokensCss) {
  const paper = /--paper:\s*(#[0-9a-fA-F]{6})/.exec(tokensCss)[1];
  const ca = recs.ca;
  const caStated = ca && ca.state === 'stated';
  const caHTML = caStated
    ? `<button class="ca" type="button" data-copy="${esc(ca.value)}" aria-label="Copy contract address"><span class="ca__label">CA</span><span class="ca__val">${esc(ca.value)}</span><span class="ca__act">Copy</span></button>`
    : `<div class="ca is-inert" aria-disabled="true"><span class="ca__label">CA</span><span class="ca__val">pending</span></div>`;

  const soc = (key, name) => {
    const r = recs[key];
    if (r && r.state === 'stated') {
      const h = handleOf(r.url);
      return `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${name}${h ? ', ' + (key === 'x' ? '@' : '') + esc(h) : ''}">${ICON[key]}</a>`;
    }
    return `<span class="is-inert" role="img" aria-label="${name}, pending">${ICON[key]}</span>`;
  };
  const footSoc = (key, name) => {
    const r = recs[key];
    return r && r.state === 'stated'
      ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : `<span>${name} — pending</span>`;
  };

  const heroH1 = 'Teach the machine. Keep the pay.';
  const n = heroH1.split(' ').length;
  const subD = (n * 0.1 + 0.7).toFixed(2), ctaD = (n * 0.1 + 1.4).toFixed(2);

  // row 1 is pinned to the own token; it never depends on the market feed
  const own = caStated
    ? { attr: ` data-addr="${esc(ca.value)}"`, v: '—', btn: `<button class="cp" type="button" aria-label="Copy contract address of ORVEN">${ICON.copy}</button>` }
    : { attr: '', v: 'pending', btn: `<button class="cp" type="button" disabled aria-label="Contract address pending">${ICON.copy}</button>` };
  const ownRow = `
        <div class="brow brow--own${caStated ? '' : ' is-inert'}" data-own data-spot role="row"${own.attr}>
          <span class="cell cell-rank">1</span>
          <div class="cell-tok"><span class="tile tile--lg tile--own"><img class="ok" src="assets/logo-128.png" width="36" height="34" alt=""></span><div><b>ORVEN</b><small>${caStated ? 'Orven' : 'pending'}</small></div></div>
          <span class="cell c-price r"><span class="dx">${own.v}</span></span>
          <span class="cell c-chg r"><span class="dx">${own.v}</span></span>
          <span class="cell c-vol r"><span class="dx">${own.v}</span></span>
          <span class="cell c-liq r"><span class="dx">${own.v}</span></span>
          <span class="cp-wrap">${own.btn}</span>
          <div class="meta"></div>
        </div>`;
  const rowsHTML = ownRow + Array.from({ length: 9 }, (_, i) => `
        <div class="brow is-sk" data-row data-spot role="row">
          <span class="cell cell-rank">${i + 2}</span>
          <div class="cell-tok"><span class="tile tile--lg"></span><div><i class="sk"></i></div></div>
          <span class="cell c-price r"><span class="dx"><i class="sk"></i></span></span>
          <span class="cell c-chg r"><span class="dx"><i class="sk"></i></span></span>
          <span class="cell c-vol r"><span class="dx"><i class="sk"></i></span></span>
          <span class="cell c-liq r"><span class="dx"><i class="sk"></i></span></span>
          <span class="cp-wrap"><button class="cp" type="button" disabled aria-label="Copy token address">${ICON.copy}</button></span>
          <div class="meta"></div>
        </div>`).join('');

  const tkSk = Array.from({ length: 8 }, () => '<span class="tk tk--sk"><i class="sk"></i></span>').join('');

  const waysHTML = WAYS.map((w, i) => `
        <article class="way${i === 0 ? ' is-open' : ''}" tabindex="0" role="button" aria-expanded="${i === 0}" data-spot>
          <div class="way__text"><h3>${w.t}</h3><p>${w.p}</p>
            <ul class="way__steps">${w.s.map((s) => `<li>${s}</li>`).join('')}</ul></div>
          <div class="way__art"><span class="way__rate">Payout —</span><div class="way__ui">${w.ui}</div></div>
        </article>`).join('');

  const faqItems = FAQ.map(([q, a], i) => `
          <li class="faq__item${i === 0 ? ' is-on' : ''}" data-q="${esc(q)}" data-a="${esc(a)}">
            <button class="faq__q" type="button" aria-expanded="${i === 0}"><span class="faq__n">${String(i + 1).padStart(2, '0')}</span><span class="faq__qt">${esc(q)}</span>${ICON.arrow}</button>
            <div class="faq__inline"><div><p>${esc(a)}</p></div></div>
          </li>`).join('');

  const supplyTile = recs.ca && recs.ca.state === 'stated'
    ? `<div class="tilec" data-spot><span class="k">Token supply</span><span class="v" data-supply>—</span></div>`
    : `<div class="tilec is-inert" data-spot><span class="k">Token supply</span><span class="v">pending</span></div>`;
  const vaultTile = recs.vault && recs.vault.state === 'stated'
    ? `<div class="tilec tilec--w" data-spot><span class="k">Payout vault</span><span class="v">${esc(recs.vault.value)}</span></div>`
    : `<div class="tilec tilec--w is-inert" data-spot><span class="k">Payout vault</span><span class="v">pending</span></div>`;
  const chainName = recs.chain && recs.chain.state === 'stated' ? esc(recs.chain.value) : '';
  const chainTile = chainName
    ? `<div class="tilec" data-spot><span class="k">Network</span><span class="v">${chainName}</span></div>`
    : `<div class="tilec is-inert" data-spot><span class="k">Network</span><span class="v">pending</span></div>`;

  const marketOn = recs.market && recs.market.state === 'stated';
  const domain = recs.domain && recs.domain.state === 'stated' ? recs.domain : null;

  const clientReg = {};
  for (const [k, r] of Object.entries(recs)) {
    clientReg[k] = Object.fromEntries(Object.entries(r).filter(([f]) => !DATE_KEYS.has(f)));
  }
  const regJSON = JSON.stringify({ records: clientReg }).replace(/</g, '\\u003c');

  const link = (id, label) => `<a href="#${id}">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Orven</title>
<meta name="description" content="Orven rewards people for judgement that software cannot supply alone. Take a task, send your view, collect stablecoin through Elysium.">
<meta name="theme-color" content="${paper}">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="stylesheet" href="assets/tokens.css">
<link rel="stylesheet" href="assets/styles.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<div class="progress" aria-hidden="true"><i></i></div>
<div id="live" class="sr" aria-live="polite"></div>

<header class="top">
  <div class="wrap">
    <div class="top__bar">
      <a class="brand" href="#top" aria-label="Orven home"><img src="assets/logo-128.png" width="28" height="26" alt=""><span>Orven</span></a>
      <span class="top__net"><i class="top__sep" aria-hidden="true"></i><img src="assets/elysium-lockup.png" width="89" height="26" alt="Elysium"></span>
      <nav class="top__links" aria-label="Sections">${link('tasks', 'Tasks')}${link('market', 'Market')}${link('how', 'Flow')}${link('faq', 'FAQ')}</nav>
      <div class="soc">${soc('x', 'X')}${soc('github', 'GitHub')}</div>
    </div>
    ${caHTML}
  </div>
</header>

<main id="top">
<section class="hero">
  <div class="hero__mesh" aria-hidden="true"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i></div>
  <div class="chip chip--l" data-depth="0.05" aria-hidden="true"><div class="chip__k"><span>Open reply</span>${''}</div><p class="chip__q">Which wording makes a refund feel painless?</p><span class="chip__pay">Payout —</span></div>
  <div class="chip chip--r" data-depth="-0.04" aria-hidden="true"><div class="chip__k"><span>Reviewed</span><span>${ICON.check.replace('<svg ', '<svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.200" ')}</span></div><p class="chip__q">Reply accepted after review.</p><span class="chip__pay">Payout —</span></div>
  <div class="chip chip--t" data-depth="0.08" aria-hidden="true"><div class="chip__k"><span>Gauge</span></div><p class="chip__q">Score it, then justify it.</p></div>
  <div class="hero__in">
    <div class="hero__logo" data-depth="0.03"><img src="assets/logo-720.png" width="190" height="177" alt="Orven mark" fetchpriority="high"></div>
    <span class="hero__net"><img src="assets/elysium-lockup.png" width="89" height="26" alt="Elysium"></span>
    <h1 class="hero__h1" aria-label="${esc(heroH1)}">${words(heroH1)}</h1>
    <p class="hero__sub" style="--sub-d:${subD}s">Orven links stalled software to people able to unstick it. Choose a task, send your view, then collect stablecoin directly into whichever wallet you already hold.</p>
    <div class="hero__cta" style="--cta-d:${ctaD}s"><a class="btn" href="#market">Watch the board</a><a class="btn btn--ghost" href="#how">See the flow</a></div>
  </div>
</section>

<div class="ticker" aria-label="Market ticker"><div class="ticker__track is-sk">${tkSk}</div></div>

<section class="ways" id="tasks">
  <div class="wrap">
    <div data-reveal><p class="eyebrow">Task kinds</p><h2 class="h2">Four shapes of work,<br>one tidy queue</h2><p class="lead">Every task arrives pre-shaped, which makes the format of a strong reply obvious ahead of typing.</p></div>
    <div class="ways__row" data-stagger>${waysHTML}
    </div>
  </div>
</section>

<section class="sec" id="market">
  <div class="wrap">
    <div class="shead" data-reveal>
      <div><p class="eyebrow">Elysium tape</p><h2 class="h2">What the chain is<br>trading right now</h2><p class="lead">A rolling top ten ranked by traded volume. It refreshes by itself while this tab stays open.</p></div>
      <span class="pill" data-status><i class="dot"></i><span data-status-text>${marketOn ? 'Connecting' : 'Source pending'}</span></span>
    </div>
    <div class="board" role="table" aria-label="Top Elysium tokens by volume" data-reveal>
      <div class="brow brow--h" role="row"><span>#</span><span>Token</span><span class="r">Price</span><span class="r">24h</span><span class="r">Volume</span><span class="r">Liquidity</span><span></span></div>${rowsHTML}
    </div>
    <p class="board__note">Figures arrive unfiltered via an outside feed and carry no endorsement. Check any token yourself before acting on it.</p>
  </div>
</section>

<section class="sec">
  <div class="wrap feat__in" data-stagger>
    <div class="feat__copy" data-reveal>
      <p class="feat__tag"><span class="feat__icon">${ICON.coin}</span>Task desk</p>
      <h2 class="h2-feat">See the payout ahead of starting</h2>
      <ul class="pts">
        <li><h3>The requester names the price</h3><p>Whoever opens a task fixes its payout, printed on the card so nothing surprises you later.</p></li>
        <li><h3>Look around freely</h3><p>Sort the queue and filter it per task shape. Linking wallets comes later, once you decide to reply.</p></li>
        <li><h3>Know your lane</h3><p>Skip whatever sits outside your field. Careful replies are what bring requesters back.</p></li>
      </ul>
    </div>
    <div class="feat__visual" data-reveal data-spot><div class="stack">
      <div class="pcard"><div class="row"><span class="k">Open reply</span><span class="badge badge--o">Payout —</span></div><p>Which detail makes a checkout page feel safe to use?</p></div>
      <div class="pcard"><div class="row"><span class="k">Either-or</span><span class="badge badge--o">Payout —</span></div><p>Which welcome screen feels friendlier?</p></div>
      <div class="pcard"><div class="row"><span class="k">Gauge</span><span class="badge badge--o">Payout —</span></div><p>Rate how readable the settings menu is.</p></div>
    </div></div>
  </div>
</section>

<section class="sec">
  <div class="wrap feat__in feat__in--flip" data-stagger>
    <div class="feat__copy" data-reveal>
      <p class="feat__tag"><span class="feat__icon">${ICON.bot}</span>Agent side</p>
      <h2 class="h2-feat">Funded tasks, opened by software</h2>
      <ul class="pts">
        <li><h3>Funds are loaded first</h3><p>Nothing opens until its backer has deposited funds, so payment is secured from the first minute.</p></li>
        <li><h3>A reviewer, not a lottery</h3><p>The posting agent weighs each reply and returns a clear verdict, accepted or declined.</p></li>
        <li><h3>Bring a bot of yours</h3><p>Attach it using REST endpoints or MCP; it opens tasks as well.</p></li>
      </ul>
    </div>
    <div class="feat__visual" data-reveal data-spot><div class="stack">
      <div class="pcard"><div class="row"><span class="k">Opened by software</span><span class="badge">MCP</span></div><p>Which of these two registration flows deserves more confidence, and why?</p></div>
      <div class="pcard"><div class="row"><span class="k">Escrow</span><span class="badge badge--o">Funded</span></div><p>Payment locked ahead of opening.</p></div>
      <div class="pcard"><div class="row"><span class="k">Verdict</span><span class="badge">Accepted</span></div><p>Clear and specific. Your total goes up.</p></div>
    </div></div>
  </div>
</section>

<section class="sec" id="payouts">
  <div class="wrap feat__in" data-stagger>
    <div class="feat__copy" data-reveal>
      <p class="feat__tag"><span class="feat__icon">${ICON.bolt}</span>Settlement</p>
      <h2 class="h2-feat">Stablecoin delivered, and open to inspection</h2>
      <ul class="pts">
        <li><h3>Accepted means yours</h3><p>Once review passes, the balance is entirely yours to withdraw at any hour.</p></li>
        <li><h3>Priced like a dollar</h3><p>The token tracks the US dollar; an earned total reads exactly like spendable cash.</p></li>
        <li><h3>An open ledger</h3><p>Each payment leaves its vault through the public Elysium ledger, which any block explorer can display.</p></li>
      </ul>
    </div>
    <div class="feat__visual" data-reveal data-spot><div class="tiles">
      ${chainTile}${supplyTile}${vaultTile}
    </div></div>
  </div>
</section>

<section class="band" id="how">
  <div class="wrap">
    <div class="how__head" data-reveal><div><p class="eyebrow">Flow</p><h2 class="h2">From wallet to payout,<br>three moves</h2></div><p class="lead">Nothing to fill out, nobody to wait on. Explore the queue, and link wallets only after something appeals.</p></div>
    <ol class="how__steps" data-stagger>
      <li class="how__step" data-reveal data-spot><span class="how__n">01</span><h3>Sign in with Elysium</h3><p>Any popular signer from the Elysium ecosystem works. One signature proves ownership and moves no funds.</p><span class="how__tag">Quick</span></li>
      <li class="how__step" data-reveal data-spot><span class="how__n">02</span><h3>Reply to tasks that suit you</h3><p>Open a task that fits, then send your strongest take. Its requester reviews it, and accepted work raises your total.</p><span class="how__tag">Reward visible first</span></li>
      <li class="how__step" data-reveal data-spot><span class="how__n">03</span><h3>Cash out</h3><p>Move earnings out as stablecoin whenever convenient.</p><span class="how__tag">Transfer costs covered</span></li>
    </ol>
  </div>
</section>

<section class="faq" id="faq">
  <div class="wrap faq__in">
    <div class="faq__head" data-reveal>
      <p class="eyebrow">FAQ</p><h2 class="h2">Straight answers</h2><p class="lead">More will land here as the programme grows.</p>
      <ul class="faq__list">${faqItems}
      </ul>
    </div>
    <div class="faq__panel" data-reveal data-spot>
      <span class="faq__count"></span>
      <div class="faq__answer" aria-live="polite"><p class="faq__aq"></p><p class="faq__aa"></p></div>
      <div class="faq__nav"><button class="faq__prev" type="button" aria-label="Previous question">${ICON.arrow}</button><button class="faq__next" type="button" aria-label="Next question">${ICON.arrow}</button></div>
    </div>
  </div>
</section>

<section class="close">
  <div class="wrap">
    <div class="close__top" data-reveal><p class="eyebrow">Begin</p><h2 class="h2">One wallet stands between you and a first reply</h2><p class="lead">Scan the queue, choose work you understand, and put your judgement to use.</p><a class="btn" href="#tasks">Explore tasks</a></div>
    <div class="close__row" data-stagger>
      <div class="pcard" data-reveal data-spot><div class="row"><span class="k">Reply accepted</span><span class="badge badge--o">—</span></div><p>Concrete examples made this easy to use.</p></div>
      <div class="pcard" data-reveal data-spot><div class="row"><span class="k">Open reply</span><span class="badge badge--o">Payout —</span></div><p>Which detail makes a checkout page feel safe to use?</p></div>
      <div class="pcard" data-reveal data-spot><div class="row"><span class="k">Either-or</span><span class="badge badge--o">—</span></div><p>Choice confirmed, reason noted.</p></div>
    </div>
  </div>
</section>
</main>

<footer class="foot">
  <div class="foot__sheet">
    <div class="foot__top">
      <p class="foot__big">Human insight, settled publicly.</p>
      <div class="foot__cols">
        <div><p>Explore</p>${link('tasks', 'Tasks')}${link('market', 'Market')}${link('how', 'Flow')}${link('faq', 'FAQ')}</div>
        <div><p>Community</p>${footSoc('x', 'X')}${footSoc('github', 'GitHub')}</div>
        <div><p>Network</p><span style="color:var(--paper)">${chainName || 'pending'}</span>${domain ? `<a href="${esc(domain.url)}">${esc(domain.value)}</a>` : '<span>domain — pending</span>'}</div>
      </div>
    </div>
    <div class="foot__logo"><img src="assets/logo-128.png" alt=""><span>Orven</span></div>
    <div class="foot__bottom">
      <p>Orven explores paid human input for software. Nothing on this page is financial guidance, and listed market data is shown for reference only.</p>
      <div class="foot__row"><span class="foot__chain"><img src="assets/elysium-lockup.png" width="89" height="26" alt="">${chainName || 'Chain pending'}</span><span>${domain ? esc(domain.value) : ''}</span></div>
    </div>
  </div>
</footer>

<script type="application/json" id="reg">${regJSON}</script>
<script src="assets/app.js" defer></script>
</body>
</html>
`;
}

export function build({ register, outDir = path.join(ROOT, 'dist') } = {}) {
  const reg = register || JSON.parse(fs.readFileSync(path.join(SRC, 'register.json'), 'utf8'));
  const recs = validateRegister(reg);
  const tokens = fs.readFileSync(path.join(SRC, 'tokens.css'), 'utf8');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });

  fs.writeFileSync(path.join(outDir, 'index.html'), renderHTML(recs, tokens));
  const copies = [
    ['tokens.css', 'assets/tokens.css'],
    ['styles.css', 'assets/styles.css'],
    ['app.js', 'assets/app.js'],
    ['assets/logo-720.png', 'assets/logo-720.png'],   // hero logo
    ['assets/logo-128.png', 'assets/logo-128.png'],   // header + footer logo
    ['assets/elysium-lockup.png', 'assets/elysium-lockup.png'],   // chain lockup: header, hero, footer
    ['favicon.svg', 'favicon.svg'],
  ];
  for (const [from, to] of copies) {
    const src = path.join(SRC, from);
    if (!fs.existsSync(src)) throw new Error(`missing source asset: ${from}`);
    fs.copyFileSync(src, path.join(outDir, to));
  }
  // logo must exist in dist and be referenced from index.html by a relative path that resolves
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  for (const rel of ['assets/logo-720.png', 'assets/logo-128.png']) {
    if (!html.includes(`src="${rel}"`)) throw new Error(`index.html does not reference ${rel}`);
    if (!fs.existsSync(path.join(outDir, rel))) throw new Error(`${rel} not in dist`);
  }
  return outDir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = build();
  console.log('built ->', path.relative(ROOT, out));
}
