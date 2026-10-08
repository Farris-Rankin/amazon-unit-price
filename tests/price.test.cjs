const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTitleWeight, parseTitleVolume, parseTitleCount, parseUnitPrice, compareListing, formatPrice, rank, GRAMS_PER_LB, ML_PER_FL_OZ } = require('../amazon-unit-price.user.js');

function pounds(title, expected) {
  const actual = parseTitleWeight(title);
  assert.ok(actual.grams, `${title}: ${actual.reason}`);
  assert.ok(Math.abs(actual.pounds - expected) < 0.0001, `${title}: ${actual.pounds} != ${expected}`);
}

const weights = [
  ['Black Oil Sunflower Seed, 20 lb', 20],
  ['Sunflower Seeds - 40-Pound Bag', 40],
  ['Bird Food, 160 Ounce (Pack of 1)', 10],
  ['Bird seed, 2 × 10 lb', 20],
  ['Bird seed, 2x10lb', 20],
  ['Bird seed, 10 lb x 2', 20],
  ['Bird seed, 10 lb (Pack of 2)', 20],
  ['Coffee, 12 oz, 3-pack', 2.25],
  ['Coffee, 6 bags, 8 ounces each', 3],
  ['Coffee, 2 x 5 lb (Pack of 2)', 10],
  ['Coffee, 2 x 5 lb (10 lb total)', 10],
  ['Coffee, 2 x 5 lb (10 lb)', 10],
  ['Coffee, 10 lb total, 2 bags', 10],
  ['Coffee, total weight: 10 lbs', 10],
  ['Coffee, 1 1/2 lb', 1.5],
  ['Coffee, 1½ lb', 1.5],
  ['Coffee, ½ pound', 0.5],
  ['Coffee, 1 / 2 lb', 0.5],
  ['Rice, 1,000 g', 1000 / GRAMS_PER_LB],
  ['Rice, 1.5 kg', 1500 / GRAMS_PER_LB],
  ['Rice, 1,5 kg', 1500 / GRAMS_PER_LB],
  ['Coffee, 1 lb (16 oz)', 1],
  ['Coffee, 1 lb (454 g)', 1],
  ['Snack bars, 12 count, 2 oz each', 1.5],
  ['Snack bars, 12 count, 24 oz total', 1.5]
];
for (const [title, weight] of weights) test(`weight: ${title}`, () => pounds(title, weight));

for (const title of [
  'Sunflower Seeds, Pack of 2',
  'Bird feeder holds 20 lb',
  'Bird feeder, 20 lb capacity',
  'Coffee, 2 lb or 5 lb',
  'Coffee, 2 lb + 5 lb',
  'Coffee, 2-5 lb',
  'Coffee, 2 to 5 lb',
  'Coffee, 2 or 5 lb',
  'Coffee, 10 lb, pack of 2, 3 bags',
  'Coffee, 2 x 5 lb, 20 lb total',
  'Coffee, 0 lb',
  'Snack bars, 12 count, 2 oz',
  'Oil, 16 fl oz',
  'Oil, 16 fluid ounces',
  'Oil, 500 ml',
  'Protein powder, 25 g protein per serving'
]) test(`unranked: ${title}`, () => assert.equal(parseTitleWeight(title).grams, null));

test('all three requested price-label cases calculate the same $/lb from title', () => {
  for (const unitText of ['$0.125 / ounce', '$1.00 / count', '']) {
    const result = compareListing({ title: 'Sunflower seeds 20 lb', price: 40, unitText });
    assert.equal(result.source, 'title');
    assert.equal(formatPrice(result.perGram), '$2.00/lb');
  }
});

test('multipack uses the package price once and the total weight', () => {
  const result = compareListing({ title: 'Seed, 10 lb (Pack of 2)', price: 30, unitText: '$15 / count' });
  assert.equal(formatPrice(result.perGram), '$1.50/lb');
});

test('rounded Amazon unit labels do not replace exact price/weight math', () => {
  const result = compareListing({ title: 'Seed 40 lb', price: 39.99, unitText: '$0.06 / ounce' });
  assert.ok(Math.abs(result.perGram * GRAMS_PER_LB - 0.99975) < 1e-12);
});

test('mass unit label can be converted when a title has no size', () => {
  const result = compareListing({ title: 'Bird food', price: 10, unitText: '$0.25 / ounce' });
  assert.equal(result.source, 'amazon');
  assert.equal(formatPrice(result.perGram), '$4.00/lb');
});

test('price per 100 g converts the denominator as well', () => {
  const result = parseUnitPrice('$2.00 / 100 g');
  assert.equal(result.perGram, 0.02);
  assert.equal(formatPrice(result.perGram, 'kg'), '$20.00/kg');
});

test('count, volume and conflicting offers cannot be ranked without title weight', () => {
  for (const unitText of ['$1 / count', '$0.25 / fl oz', '$0.25 / fluid ounce', '$1 / pound $0.08 / ounce']) {
    assert.equal(compareListing({ title: 'Food', price: 10, unitText }).perGram, null);
  }
});

test('ambiguous title cannot be rescued by an unrelated seller unit rate', () => {
  assert.equal(compareListing({ title: '2 lb or 5 lb', price: 10, unitText: '$1 / pound' }).perGram, null);
});

test('missing/invalid package prices are unranked', () => {
  for (const price of [null, undefined, 0, -1, Infinity, NaN]) {
    assert.equal(compareListing({ title: 'Seed 20 lb', price, unitText: '$2 / pound' }).perGram, null);
  }
});

test('sort uses unrounded numbers, retains ties, and puts unknowns last', () => {
  const entries = [
    { id: 'unknown', order: 0, result: { perGram: null } },
    { id: 'higher', order: 1, result: { perGram: 2.00002 } },
    { id: 'lower', order: 2, result: { perGram: 2.00001 } },
    { id: 'tie', order: 3, result: { perGram: 2.00001 } }
  ];
  assert.deepEqual(rank(entries).map(x => x.id), ['lower', 'tie', 'higher', 'unknown']);
  assert.equal(entries[0].id, 'unknown');
});

for (const [title, expected] of [
  ['Olive oil, 16 fl oz', 16 * ML_PER_FL_OZ],
  ['Olive oil, 16 fluid ounces', 16 * ML_PER_FL_OZ],
  ['Olive oil, 500 mL', 500],
  ['Olive oil, 0.5 L', 500],
  ['Olive oil, 1 litre', 1000],
  ['Olive oil, 1 gallon', 128 * ML_PER_FL_OZ],
  ['Olive oil, 1 US gallon', 128 * ML_PER_FL_OZ],
  ['Olive oil, 1 U.S. liquid gallon', 128 * ML_PER_FL_OZ],
  ['Olive oil, 1 pint', 16 * ML_PER_FL_OZ],
  ['Olive oil, 1 qt', 32 * ML_PER_FL_OZ],
  ['Olive oil, 2 x 500 mL', 1000],
  ['Olive oil, 16 fl oz (Pack of 2)', 32 * ML_PER_FL_OZ],
  ['Olive oil, 2 x 500 mL (1 L total)', 1000],
  ['Olive oil, 1 gallon (128 fl oz)', 128 * ML_PER_FL_OZ]
]) test(`volume: ${title}`, () => assert.ok(Math.abs(parseTitleVolume(title).milliliters - expected) < 1e-7));

for (const title of ['Seed 20 lb', 'Oil 16 oz', 'Oil 1-2 L', 'Oil 1 or 2 L', 'Jug 1 gallon capacity', 'Jug holds 1 L', 'Oil 1 imperial gallon', 'Oil 500 mL or 1 L']) {
  test(`no volume: ${title}`, () => assert.equal(parseTitleVolume(title).amount, null));
}

for (const [title, expected] of [
  ['Coffee pods, 24 count', 24],
  ['Coffee pods, 24 ct (Pack of 2)', 48],
  ['Coffee pods, 2 x 12 count', 24],
  ['Coffee pods, 24 total pieces, Pack of 2', 24],
  ['Coffee pods, total count: 24, Pack of 2', 24],
  ['Coffee pods, 12 count (24 total count), Pack of 2', 24],
  ['Bird seed, 10 lb (Pack of 2)', 2],
  ['Bird seed, 2 x 10 lb', 2],
  ['Bird seed, 10 lb x 2', 2],
  ['Oil, 2 x 1 US gallon', 2],
  ['Milk, 12 x 500 mL', 12],
  ['Seed, 3 bags', 3],
  ['Vitamins 200 capsules', 200],
  ['Samsill Transparency Film for Laser Printers, 100 Sheets, Not for Inkjet', 100],
  ['Laser Transparency Film 8.5 x 11" 100 Sheets 4mil PET Double-sided Overhead Projector Film', 100],
  ['Transparency film 100-sheet pack', 100],
  ['Transparency film 100Sheets', 100],
  ['Transparency film 1 sheet', 1],
  ['Transparency film 100 sheets (Pack of 2)', 200],
  ['Transparency film 2 x 100 sheets', 200],
  ['Transparency film 100 sheets (200 total sheets), Pack of 2', 200],
  ['Transparency film 200 total sheets (Pack of 2)', 200]
]) test(`count: ${title}`, () => assert.equal(parseTitleCount(title).amount, expected));

for (const title of ['Seed 20 lb', 'Pods 12 or 24 count', 'Pods 12-24 count', 'Seed Pack of 0', 'Seed Pack of 2, 3 bags', 'Pods 2 count per serving', 'Pods 999999999999999999999999999999 count']) {
  test(`no count: ${title}`, () => assert.equal(parseTitleCount(title).amount, null));
}

for (const title of [
  'Transparency film 50 or 100 sheets',
  'Transparency film 50-100 sheets',
  'Transparency film 100 sheets or 200 sheets',
  'Transparency film 100 sheets (150 total sheets), Pack of 2',
  'Transparency film 0 sheets',
  'Printer 100 sheet capacity',
  'Paper shredder 12 sheets per pass',
  'Paper tray holds 100 sheets'
]) test(`no sheet count: ${title}`, () => {
  assert.equal(parseTitleCount(title).amount, null);
  assert.equal(compareListing({ title, price: 20, unitText: '$1 / sheet' }, 'count').perBaseUnit, null);
});

for (const [title, price, expected] of [
  ['Samsill Transparency Film for Laser Printers, 100 Sheets, Not for Inkjet', 13.80, '$0.138/count'],
  ['Laser Transparency Film 8.5 x 11" 100 Sheets 4mil PET Double-sided Overhead Projector Film', 14.02, '$0.140/count']
]) test(`reported sheet listing: ${price}`, () => {
  for (const unitText of ['', `$${price.toFixed(2)}/100 Sheets`, '$5/count']) {
    const result = compareListing({ title, price, unitText }, 'count');
    assert.equal(result.source, 'title');
    assert.equal(result.quantity.amount, 100);
    assert.equal(result.perBaseUnit, price / 100);
    assert.equal(formatPrice(result.perBaseUnit, 'count'), expected);
  }
});

test('sheet unit-price labels use their stated denominator when the title has no count', () => {
  for (const [unitText, expected] of [
    ['$13.80/100 Sheets', 0.138],
    ['$0.14 per sheet', 0.14]
  ]) {
    const result = compareListing({ title: 'Transparency film', price: 13.80, unitText }, 'count');
    assert.equal(result.source, 'amazon');
    assert.ok(Math.abs(result.perBaseUnit - expected) < 1e-12);
    assert.equal(result.kind, 'count');
    assert.equal(compareListing({ title: 'Transparency film', price: 13.80, unitText }, 'lb').perBaseUnit, null);
  }
});

test('metric weight options calculate per g, 100 g and kg', () => {
  const result = compareListing({ title: 'Rice 500 g', price: 10 });
  assert.equal(formatPrice(result.perBaseUnit, 'g'), '$0.0200/g');
  assert.equal(formatPrice(result.perBaseUnit, '100g'), '$2.00/100 g');
  assert.equal(formatPrice(result.perBaseUnit, 'kg'), '$20.00/kg');
});

test('count uses title quantity with an absent or incorrect Amazon label', () => {
  for (const unitText of ['', '$10 / count']) {
    const result = compareListing({ title: 'Pods 24 count (Pack of 2)', price: 24, unitText }, 'count');
    assert.equal(result.source, 'title');
    assert.equal(formatPrice(result.perBaseUnit, 'count'), '$0.500/count');
  }
});

test('count can use an Amazon count rate when the title has no count', () => {
  const result = compareListing({ title: 'Seed 20 lb', price: 40, unitText: '$40 / count' }, 'count');
  assert.equal(result.source, 'amazon');
  assert.equal(formatPrice(result.perBaseUnit, 'count'), '$40.00/count');
});

test('all liquid display units share the same compatible base measurement', () => {
  const result = compareListing({ title: 'Oil 1 US gallon', price: 16 }, 'gal');
  assert.equal(formatPrice(result.perBaseUnit, 'gal'), '$16.00/gal');
  assert.equal(formatPrice(result.perBaseUnit, 'qt'), '$4.00/qt');
  assert.equal(formatPrice(result.perBaseUnit, 'pt'), '$2.00/pt');
  assert.equal(formatPrice(result.perBaseUnit, 'fl-oz'), '$0.125/fl oz');
  assert.equal(formatPrice(result.perBaseUnit, 'ml'), '$0.0042/mL');
  assert.equal(formatPrice(result.perBaseUnit, '100ml'), '$0.423/100 mL');
  assert.equal(formatPrice(result.perBaseUnit, 'l'), '$4.23/L');
});

test('Amazon volume labels convert without title volumes', () => {
  const result = compareListing({ title: 'Olive oil', price: 16, unitText: '$0.125 / fluid ounce' }, 'gal');
  assert.equal(result.source, 'amazon');
  assert.equal(formatPrice(result.perBaseUnit, 'gal'), '$16.00/gal');
  const metric = compareListing({ title: 'Olive oil', price: 16, unitText: '$1 / 100 ml' }, 'l');
  assert.equal(formatPrice(metric.perBaseUnit, 'l'), '$10.00/L');
});

test('gallon unit rates are volume, not grams', () => {
  const result = parseUnitPrice('$16 / gallon');
  assert.equal(result.kind, 'volume');
  assert.equal(result.perGram, null);
  assert.equal(formatPrice(result.perBaseUnit, 'gal'), '$16.00/gal');
});

test('no conversion crosses mass, liquid volume or count', () => {
  for (const [listing, unit] of [
    [{ title: 'Seed 20 lb', price: 20, unitText: '$1 / pound' }, 'l'],
    [{ title: 'Oil 1 L', price: 20, unitText: '$20 / liter' }, 'lb'],
    [{ title: 'Seed 20 lb', price: 20, unitText: '$1 / pound' }, 'count'],
    [{ title: 'Food', price: 20, unitText: '$1 / count' }, 'fl-oz']
  ]) assert.equal(compareListing(listing, unit).perBaseUnit, null);
});
