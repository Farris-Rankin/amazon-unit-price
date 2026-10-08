const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.AUP_JSDOM_PATH || 'jsdom');
const { install, readListing, UNITS } = require('../amazon-unit-price.user.js');

function card(asin, title, price, unit = '', extra = '') {
  return `<div data-component-type="s-search-result" data-asin="${asin}"><h2><a>${title}</a></h2><div class="offer">${extra}<span class="a-price"><span class="a-offscreen">$${price}</span></span><span>${unit}</span></div></div>`;
}
function fixture(html) {
  return new JSDOM(`<html><head></head><body><div class="s-main-slot">${html}</div></body></html>`, { url: 'https://www.amazon.com/s?k=seed', pretendToBeVisual: true });
}
function ids(dom) {
  return [...dom.window.document.querySelectorAll('[data-asin]')].map(x => x.dataset.asin);
}
function labels(dom) {
  return [...dom.window.document.querySelectorAll('[data-aup="badge"]')].map(x => x.shadowRoot.querySelector('.value').textContent);
}

test('per-ounce, per-count and absent unit prices sort together; banners stay in place', () => {
  const dom = fixture(card('A', 'Seeds 10 lb', '30.00', '$3 / pound') + '<div id="banner">Sponsored banner</div>'
    + card('B', 'Seeds 20 lb', '40.00', '$2 / count') + card('C', 'Seeds 2 x 10 lb', '20.00') + card('D', 'Seed feeder', '5.00'));
  const originalCards = [...dom.window.document.querySelectorAll('[data-asin]')];
  const app = install({ window: dom.window });
  assert.deepEqual(ids(dom), ['C', 'B', 'A', 'D']);
  assert.deepEqual(labels(dom), ['$1.00/lb', '$2.00/lb', '$3.00/lb', 'Weight?']);
  assert.equal(dom.window.document.querySelector('.s-main-slot').children[1].id, 'banner');
  assert.ok(originalCards.every(node => node.isConnected));
  app.setEnabled(false);
  assert.deepEqual(ids(dom), ['A', 'B', 'C', 'D']);
  assert.equal(labels(dom).length, 0);
  app.destroy(); dom.window.close();
});

test('original card links and event handlers survive sorting', () => {
  const dom = fixture(card('A', 'Seeds 1 lb', '10') + card('B', 'Seeds 2 lb', '2'));
  const anchor = dom.window.document.querySelector('[data-asin="A"] a');
  let clicked = false;
  anchor.addEventListener('click', () => { clicked = true; });
  const app = install({ window: dom.window });
  anchor.click();
  assert.equal(clicked, true);
  app.destroy(); dom.window.close();
});

test('list price is excluded and no-price/range offers stay unranked', () => {
  const dom = fixture(card('A', 'Seed 10 lb', '20', '$2 / pound', '<span class="a-price a-text-price"><span class="a-offscreen">$80.00</span></span>')
    + '<div data-component-type="s-search-result" data-asin="B"><h2>Seed 20 lb</h2><span class="a-price-range"><span class="a-price"><span class="a-offscreen">$20</span></span> - $40</span></div>');
  const app = install({ window: dom.window });
  assert.deepEqual(labels(dom), ['$2.00/lb', 'Weight?']);
  app.destroy(); dom.window.close();
});

test('changing units changes labels and preserves ranking', () => {
  const dom = fixture(card('A', 'Seeds 10 lb', '30') + card('B', 'Seeds 20 lb', '20'));
  const saved = {};
  const app = install({ window: dom.window, setValue: (key, value) => { saved[key] = value; } });
  app.setUnit('oz');
  assert.deepEqual(ids(dom), ['B', 'A']);
  assert.deepEqual(labels(dom), ['$0.0625/oz', '$0.188/oz']);
  assert.equal(saved.unit, 'oz');
  const toggle = dom.window.document.querySelector('#aup-toggle');
  toggle.click();
  assert.deepEqual(ids(dom), ['A', 'B']);
  assert.equal(saved.enabled, false);
  app.destroy(); dom.window.close();
});

test('a second subscription offer does not displace the main package price', () => {
  const dom = fixture(card('A', 'Seeds 20 lb', '40.00', '$2 / count')
    .replace('</div></div>', '<span class="a-price"><span class="a-offscreen">$38.00</span></span> with subscription</div></div>'));
  const app = install({ window: dom.window });
  assert.deepEqual(labels(dom), ['$2.00/lb']);
  app.destroy(); dom.window.close();
});

test('a unit-price a-price element is excluded from the package price', () => {
  const dom = fixture(card('A', 'Seeds 20 lb', '40.00')
    .replace('<div class="offer">', '<div class="a-color-secondary">(<span class="a-price"><span class="a-offscreen">$0.125</span></span> / ounce)</div><div class="offer">'));
  const app = install({ window: dom.window });
  assert.deepEqual(labels(dom), ['$2.00/lb']);
  app.destroy(); dom.window.close();
});

test('whole/fraction price markup works without an offscreen price', () => {
  const dom = fixture(card('A', 'Seeds 20 lb', '40.00')
    .replace('<span class="a-offscreen">$40.00</span>', '<span class="a-price-symbol">$</span><span class="a-price-whole">40.</span><span class="a-price-fraction">00</span>'));
  const app = install({ window: dom.window });
  assert.deepEqual(labels(dom), ['$2.00/lb']);
  app.destroy(); dom.window.close();
});

test('new cards and changed prices are recalculated without accumulating badges', async () => {
  const dom = fixture(card('A', 'Seeds 10 lb', '30') + card('B', 'Seeds 20 lb', '20'));
  const app = install({ window: dom.window });
  const root = dom.window.document.querySelector('.s-main-slot');
  root.insertAdjacentHTML('beforeend', card('C', 'Seeds 20 lb', '10', '$0.50 / count'));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(ids(dom), ['C', 'B', 'A']);
  dom.window.document.querySelector('[data-asin="A"] .a-offscreen').textContent = '$1.00';
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(ids(dom), ['A', 'C', 'B']);
  assert.equal(labels(dom).length, 3);
  app.setEnabled(false);
  assert.deepEqual(ids(dom), ['A', 'B', 'C']);
  app.destroy(); dom.window.close();
});

test('separate result containers remain intact', () => {
  const dom = fixture('<section id="one">' + card('A', 'Seeds 1 lb', '10') + card('B', 'Seeds 2 lb', '2') + '</section>'
    + '<section id="two">' + card('C', 'Seeds 1 lb', '20') + card('D', 'Seeds 2 lb', '4') + '</section>');
  const app = install({ window: dom.window });
  assert.deepEqual(ids(dom), ['B', 'A', 'D', 'C']);
  assert.equal(dom.window.document.querySelector('[data-asin="B"]').parentElement.id, 'one');
  assert.equal(dom.window.document.querySelector('[data-asin="D"]').parentElement.id, 'two');
  app.destroy(); dom.window.close();
});

test('script auto-starts with Tampermonkey globals and uses saved preferences', () => {
  const dom = fixture(card('A', 'Seeds 10 lb', '30') + card('B', 'Seeds 20 lb', '20'));
  const script = fs.readFileSync(path.join(__dirname, '../amazon-unit-price.user.js'), 'utf8');
  const sandbox = new JSDOM(dom.serialize(), { url: 'https://www.amazon.com/s?k=seed', runScripts: 'outside-only' });
  const menus = [];
  sandbox.window.GM_getValue = (key, fallback) => key === 'unit' ? 'kg' : fallback;
  sandbox.window.GM_setValue = () => {};
  sandbox.window.GM_registerMenuCommand = (name, fn) => menus.push({ name, fn });
  sandbox.window.eval(script);
  assert.deepEqual(ids(sandbox), ['B', 'A']);
  assert.equal(labels(sandbox).length, 2);
  assert.ok(labels(sandbox).every(x => x.endsWith('/kg')));
  assert.equal(menus.length, Object.keys(UNITS).length + 1);
  dom.window.close(); sandbox.window.close();
});

test('injected comparison labels never become input unit prices', () => {
  const dom = fixture(card('A', 'Bird food', '10', '$0.25 / ounce') + card('B', 'Seeds 20 lb', '20'));
  const app = install({ window: dom.window });
  for (let i = 0; i < 3; i++) app.refresh();
  assert.equal(readListing(dom.window.document.querySelector('[data-asin="A"]'), dom.window).result.source, 'amazon');
  assert.deepEqual(labels(dom), ['$1.00/lb', '$4.00/lb']);
  app.destroy(); dom.window.close();
});

test('visible dropdown changes count ranking, saves the choice, and leaves unknown counts last', () => {
  const dom = fixture(card('A', 'Seed, 1 lb (Pack of 2)', '10') + card('B', 'Seed, 20 lb (Pack of 1)', '40') + card('C', 'Seed 10 lb', '15'));
  const saved = {};
  const app = install({ window: dom.window, setValue: (key, value) => { saved[key] = value; } });
  assert.deepEqual(ids(dom), ['C', 'B', 'A']);
  const selector = dom.window.document.querySelector('#aup-unit');
  assert.equal(selector.getAttribute('aria-label'), 'Price unit');
  assert.equal(selector.value, 'lb');
  selector.value = 'count';
  selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(ids(dom), ['A', 'B', 'C']);
  assert.deepEqual(labels(dom), ['$5.00/count', '$40.00/count', 'Count?']);
  assert.equal(saved.unit, 'count');
  assert.deepEqual(app.getSummary(), { comparable: 2, unknown: 1, enabled: true, unit: 'count' });
  app.setUnit('lb');
  assert.equal(selector.value, 'lb');
  assert.deepEqual(ids(dom), ['C', 'B', 'A']);
  app.destroy();
  assert.equal(dom.window.document.querySelector('#aup-controls'), null);
  dom.window.close();
});

test('volume selection ranks only compatible liquid listings', () => {
  const dom = fixture(card('A', 'Seed 20 lb', '20') + card('B', 'Oil 16 fl oz', '8') + card('C', 'Oil 500 mL', '5'));
  const app = install({ window: dom.window });
  assert.deepEqual(ids(dom), ['A', 'B', 'C']);
  app.setUnit('l');
  assert.deepEqual(ids(dom), ['C', 'B', 'A']);
  assert.deepEqual(labels(dom), ['$10.00/L', '$16.91/L', 'Volume?']);
  assert.equal(app.getSummary().comparable, 2);
  app.destroy(); dom.window.close();
});

test('the remembered count unit populates the dropdown at startup', () => {
  const dom = fixture(card('A', 'Pods 10 count', '10') + card('B', 'Pods 20 count', '15'));
  const app = install({ window: dom.window, getValue: (key, fallback) => key === 'unit' ? 'count' : fallback });
  assert.equal(dom.window.document.querySelector('#aup-unit').value, 'count');
  assert.deepEqual(ids(dom), ['B', 'A']);
  assert.deepEqual(labels(dom), ['$0.750/count', '$1.00/count']);
  app.destroy(); dom.window.close();
});

test('changing units while off preserves restored order and saved off preference', () => {
  const dom = fixture(card('A', 'Pods 10 count', '10') + card('B', 'Pods 20 count', '15'));
  const app = install({ window: dom.window, getValue: (key, fallback) => key === 'enabled' ? false : fallback });
  app.setUnit('count');
  assert.deepEqual(ids(dom), ['A', 'B']);
  assert.equal(labels(dom).length, 0);
  app.setEnabled(true);
  assert.deepEqual(ids(dom), ['B', 'A']);
  app.destroy(); dom.window.close();
});

function nativeFixture(html) {
  const dom = fixture(html);
  dom.window.document.body.insertAdjacentHTML('afterbegin', `<div class="a-dropdown-container">
    <label for="s-result-sort-select" class="a-native-dropdown">Sort by:</label>
    <select id="s-result-sort-select" data-action="a-dropdown-select" title="Amazon sort">
      <option value="relevanceblender" selected>Featured</option>
      <option value="price-asc-rank" data-url="/s?k=rope&amp;s=price-asc-rank&amp;rh=n%3A123">Price: Low to High</option>
      <option value="price-desc-rank">Price: High to Low</option>
    </select><span class="a-button-dropdown">Amazon decorative button</span></div>`);
  return dom;
}

test('reported 100-sheet listings use title counts in the native Amazon sort menu', () => {
  const dom = nativeFixture(card('LASER', 'Laser Transparency Film 8.5 x 11" 100 Sheets 4mil PET Double-sided Overhead Projector Film', '14.02', '($14.02/100 Sheets)')
    + card('SAMSILL', 'Samsill Transparency Film for Laser Printers, 100 Sheets, Not for Inkjet', '13.80', 'List: $17.44 ($13.80/100 Sheets)')
    + card('UNSIZED', 'Transparency film', '5.00'));
  const nodes = [...dom.window.document.querySelectorAll('[data-asin]')];
  const app = install({ window: dom.window });
  const select = dom.window.document.querySelector('#s-result-sort-select');
  try {
    select.value = 'aup:count';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.deepEqual(ids(dom), ['SAMSILL', 'LASER', 'UNSIZED']);
    assert.deepEqual(labels(dom), ['$0.138/count', '$0.140/count', 'Count?']);
    assert.deepEqual(app.getSummary(), { comparable: 2, unknown: 1, enabled: true, unit: 'count' });
    for (const node of nodes.slice(0, 2)) {
      const result = readListing(node, dom.window, 'count').result;
      assert.equal(result.source, 'title');
      assert.equal(result.quantity.amount, 100);
    }
    assert.ok(nodes.every(node => node.isConnected));
    select.value = 'relevanceblender';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.deepEqual(ids(dom), ['LASER', 'SAMSILL', 'UNSIZED']);
  } finally { app.destroy(); dom.window.close(); }
});

test('an Amazon sheet unit-price element before the package price is not used as the package price', () => {
  const dom = fixture(card('SAMSILL', 'Transparency film 100 sheets', '13.80', '',
    '<span class="unit-price">(<span class="a-price"><span class="a-offscreen">$0.14</span></span>/sheet)</span>'));
  try {
    const result = readListing(dom.window.document.querySelector('[data-asin]'), dom.window, 'count').result;
    assert.equal(result.price, 13.80);
    assert.equal(result.source, 'title');
    assert.equal(result.quantity.amount, 100);
    assert.equal(result.perBaseUnit, 13.80 / 100);
  } finally { dom.window.close(); }
});

test('Amazon Sort by keeps its original choices and gains a length group without floating controls', () => {
  const dom = nativeFixture(card('A', 'Cord 50 ft', '30') + card('B', 'Cord 100 ft', '40'));
  const select = dom.window.document.querySelector('#s-result-sort-select');
  const originalOption = select.options[1];
  const saved = {};
  const app = install({ window: dom.window, setValue: (key, value) => { saved[key] = value; } });
  assert.equal(dom.window.document.querySelector('#aup-controls'), null);
  assert.equal(select.value, 'aup:lb');
  assert.equal(select.querySelectorAll('[data-aup="unit-options"] option').length, Object.keys(UNITS).length);
  assert.equal(select.options[1], originalOption);
  assert.equal(originalOption.getAttribute('data-url'), '/s?k=rope&s=price-asc-rank&rh=n%3A123');
  assert.equal(select.querySelector('option[value="aup:ft"]').textContent, '$/ft: Low to High');
  assert.equal(select.querySelector('option[value="aup:ft"]').parentElement.label, 'Unit price · length (this page)');
  let reachedAmazonHandler = false;
  select.addEventListener('change', () => { reachedAmazonHandler = true; });
  select.value = 'aup:ft';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(reachedAmazonHandler, false);
  assert.deepEqual(ids(dom), ['B', 'A']);
  assert.deepEqual(labels(dom), ['$0.400/ft', '$0.600/ft']);
  assert.equal(saved.unit, 'ft');
  assert.equal(saved.enabled, true);
  select.value = 'aup:yd';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(ids(dom), ['B', 'A']);
  assert.deepEqual(labels(dom), ['$1.20/yd', '$1.80/yd']);
  app.destroy();
  assert.equal(select.options.length, 3);
  assert.equal(select.value, 'relevanceblender');
  assert.equal(select.getAttribute('data-action'), 'a-dropdown-select');
  assert.equal(select.title, 'Amazon sort');
  assert.equal(select.hasAttribute('data-aup'), false);
  assert.deepEqual(ids(dom), ['A', 'B']);
  dom.window.close();
});

test('choosing the original Amazon sort restores order and disables unit sorting without navigation', () => {
  const dom = nativeFixture(card('A', 'Cord 50 ft', '30') + card('B', 'Cord 100 ft', '40'));
  const destinations = [];
  const app = install({ window: dom.window, getValue: (key, fallback) => key === 'unit' ? 'ft' : fallback,
    navigate: url => destinations.push(url) });
  const select = dom.window.document.querySelector('#s-result-sort-select');
  assert.equal(select.value, 'aup:ft');
  assert.deepEqual(ids(dom), ['B', 'A']);
  select.value = 'relevanceblender';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(ids(dom), ['A', 'B']);
  assert.equal(labels(dom).length, 0);
  assert.equal(app.getSummary().enabled, false);
  assert.deepEqual(destinations, []);
  app.destroy(); dom.window.close();
});

test('a built-in Amazon option retains its supplied destination and filters', () => {
  const dom = nativeFixture(card('A', 'Cord 50 ft', '30'));
  const destinations = [];
  const app = install({ window: dom.window, navigate: url => destinations.push(url) });
  const select = dom.window.document.querySelector('#s-result-sort-select');
  select.value = 'price-asc-rank';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(app.getSummary().enabled, false);
  assert.deepEqual(destinations, ['https://www.amazon.com/s?k=rope&s=price-asc-rank&rh=n%3A123']);
  app.destroy(); dom.window.close();
});

test('a built-in Amazon option without a supplied URL resets pagination and preserves filters', () => {
  const dom = nativeFixture(card('A', 'Cord 50 ft', '30'));
  dom.reconfigure({ url: 'https://www.amazon.com/s?k=rope&page=3&qid=123&rh=n%3A123' });
  const destinations = [];
  const app = install({ window: dom.window, navigate: url => destinations.push(url) });
  const select = dom.window.document.querySelector('#s-result-sort-select');
  select.value = 'price-desc-rank';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const destination = new URL(destinations[0]);
  assert.equal(destination.searchParams.get('s'), 'price-desc-rank');
  assert.equal(destination.searchParams.get('rh'), 'n:123');
  assert.equal(destination.searchParams.has('page'), false);
  assert.equal(destination.searchParams.has('qid'), false);
  app.destroy(); dom.window.close();
});

test('refreshed Amazon menu children receive one set of unit choices', () => {
  const dom = nativeFixture(card('A', 'Cord 50 ft', '30'));
  const app = install({ window: dom.window });
  const select = dom.window.document.querySelector('#s-result-sort-select');
  select.innerHTML = '<option value="relevanceblender">Featured</option>';
  app.refresh(); app.refresh();
  assert.equal(select.querySelectorAll('[data-aup="unit-options"] option').length, Object.keys(UNITS).length);
  assert.equal(select.querySelectorAll('[data-aup="unit-options"]').length, 4);
  app.destroy(); dom.window.close();
});

test('removing and replacing the Amazon sort swaps between native and fallback controls', () => {
  const dom = nativeFixture(card('A', 'Cord 50 ft', '30'));
  const app = install({ window: dom.window });
  const container = dom.window.document.querySelector('.a-dropdown-container');
  container.remove();
  app.refresh();
  assert.ok(dom.window.document.querySelector('#aup-unit option[value="ft"]'));
  dom.window.document.body.prepend(container);
  app.refresh();
  assert.equal(dom.window.document.querySelector('#aup-controls'), null);
  assert.ok(container.querySelector('option[value="aup:ft"]'));
  app.destroy(); dom.window.close();
});

test('fallback length selection places missing dimensions last and keeps saved off state on startup', () => {
  const dom = fixture(card('A', 'Cord, 50 ft', '30') + card('B', 'Cord, 100 ft', '40') + card('C', 'Cord, size unspecified', '5'));
  const app = install({ window: dom.window, getValue: (key, fallback) => key === 'unit' ? 'ft' : key === 'enabled' ? false : fallback });
  assert.deepEqual(ids(dom), ['A', 'B', 'C']);
  const select = dom.window.document.querySelector('#aup-unit');
  assert.equal(select.value, 'ft');
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(ids(dom), ['B', 'A', 'C']);
  assert.deepEqual(labels(dom), ['$0.400/ft', '$0.600/ft', 'Length?']);
  app.destroy(); dom.window.close();
});

test('an a-price length unit rate is not mistaken for the package price', () => {
  const dom = nativeFixture(card('A', 'Cord 100 ft', '40')
    .replace('<div class="offer">', '<div class="a-color-secondary">(<span class="a-price"><span class="a-offscreen">$0.40</span></span> / foot)</div><div class="offer">'));
  const app = install({ window: dom.window, getValue: (key, fallback) => key === 'unit' ? 'ft' : fallback });
  assert.deepEqual(labels(dom), ['$0.400/ft']);
  app.destroy(); dom.window.close();
});

test('the reported title gets a length badge and participates in the native Amazon sort', () => {
  const dom = nativeFixture(card('A', 'VELCRO Brand Cut-to-Length Straps Roll, 30ft x 1/2in, Black', '8.80')
    + card('B', 'Strap roll, 10 ft x 1/2 in', '5.00')
    + card('C', 'Strap roll, 20 ft x 1/2 in', '4.00'));
  const app = install({ window: dom.window, getValue: (key, fallback) => key === 'unit' ? 'ft' : fallback });
  assert.deepEqual(ids(dom), ['C', 'A', 'B']);
  assert.deepEqual(labels(dom), ['$0.200/ft', '$0.293/ft', '$0.500/ft']);
  const select = dom.window.document.querySelector('#s-result-sort-select');
  select.value = 'aup:yd';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(ids(dom), ['C', 'A', 'B']);
  assert.deepEqual(labels(dom), ['$0.600/yd', '$0.880/yd', '$1.50/yd']);
  app.destroy(); dom.window.close();
});
