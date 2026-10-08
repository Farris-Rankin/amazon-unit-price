const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTitleLength, parseTitleCount, parseUnitPrice, compareListing, formatPrice, MM_PER_FOOT } = require('../amazon-unit-price.user.js');

for (const [title, feet] of [
  ['Rope, 100 ft', 100],
  ['Cord, 100-foot spool', 100],
  ['Cable, 50 Feet', 50],
  ['Ribbon, 10 yards', 30],
  ['Ribbon, 10 yd', 30],
  ['Rope, 100 linear feet', 100],
  ['Trim, 120 inches', 10],
  ['Trim, 120 in.', 10],
  ['Wire, 3048 mm', 10],
  ['Cord, 304.8 cm', 10],
  ['Cord, 3.048 m', 10],
  ['Cord, 3.048 metres', 10],
  ['Cord, 3.048 meters', 10],
  ['Ribbon, 1½ yards', 4.5],
  ['Rope, 100 ft (30.48 m)', 100],
  ['Cable, 100\u2032', 100],
  ['Trim, 120\u2033', 10],
  ['Cord, 5 ft 6 in', 5.5],
  ['Cord, 5 feet and 6 inches', 5.5],
  ['Cord, 5\' 6"', 5.5],
  ['Rope, 50 ft (Pack of 2)', 100],
  ['Rope, 2 rolls, 50 ft each', 100],
  ['Wire, 2 spools, 50 ft per spool', 100],
  ['Rope, 2 x 50 ft rolls', 100],
  ['Rope, 2 x 50 ft (Pack of 2)', 100],
  ['Rope, 50 ft x 2 (Pack of 2)', 100],
  ['Rope, 2 x 50 ft (100 ft total)', 100],
  ['Rope, total length: 100 ft, 2 rolls', 100],
  ['Wire, 1/4 inch diameter, 100 ft', 100],
  ['Wire, diameter: 6 mm, length: 100 ft', 100],
  ['Tape, 2 inches wide x 25 yards long', 75],
  ['Tape, 2 in x 25 yd long', 75],
  ['Tape, 2 in wide x 25 yd', 75],
  ['Tape, 2 in x 25 yd', 75],
  ['VELCRO Brand Cut-to-Length Straps Roll, 30ft x 1/2in, Black', 30],
  ['Hook and loop strap roll, 30ftx1/2in, Black', 30],
  ['Hook and loop strap roll, 30ft\u00d71/2in, Black', 30],
  ['Hook and loop strap roll, 1/2in x 30ft, Black', 30],
  ['Hook and loop strap roll, 1/2inx30ft, Black', 30],
  ['Tape roll, 10 m x 20 mm', 10000 / MM_PER_FOOT],
  ['Tape roll, 20 mm x 10 m', 10000 / MM_PER_FOOT],
  ['Ribbon roll, 120 in x 1/2 in', 10],
  ['Rope, 1/4 in x 100 ft', 100],
  ['Webbing roll, 30 ft x 1/2 in x 1/8 in', 30],
  ['Strap roll, 30 ft x 1/2 in (9.144 m)', 30],
  ['Strap roll, 30 ft x 1/2 in wide (9.144 m)', 30],
  ['Strap roll, 1/2 in wide x 30 ft (9.144 m)', 30],
  ['Strap roll, 30 ft x 1/2 in (Pack of 2)', 60],
  ['Strap, 2 rolls, 30 ft x 1/2 in', 60],
  ['Strap, 2 rolls, 30 ft x 1/2 in (60 ft total)', 60]
]) test(`length: ${title}`, () => {
  const result = parseTitleLength(title);
  assert.ok(result.amount, `${title}: ${result.reason}`);
  assert.ok(Math.abs(result.millimeters / MM_PER_FOOT - feet) < 1e-8);
});

for (const title of [
  'Rope, family pack', 'Rope, 0 ft', 'Rope, 50 ft or 100 ft', 'Rope, 50-100 ft',
  'Rope, 50 to 100 ft', 'Rope, 50 or 100 ft', 'Rope, 50 ft + 100 ft',
  'Reel holds 100 ft', 'Reel, 100 ft capacity', 'Tape, 2 inches wide',
  'Wire diameter: 6 mm', 'Wire, 6 mm diameter', 'Panel, 20 in x 30 in',
  'Panel, 12 x 25 ft', 'Rope, 2 x 50 ft',
  'Rope, 50 ft (Pack of 2), 3 rolls', 'Rope, 2 x 50 ft (150 ft total)',
  'Panel, 100 ft\u00b2', 'Panel, 100 ft^2', 'Rope, 20 lb', 'Oil, 500 ml',
  'Panel, 30 ft x 1/2 in', 'Fabric roll, 1 m x 2 m',
  'Tape roll, 30 ft x 1/2 in or 50 ft x 1 in',
  'Tape roll, 30 ft x 1/2 in (20 m)',
  'Tape roll, 30 ft x 1/2 in wide (20 m)',
  'Strap, 2 rolls, 30 ft x 1/2 in (90 ft total)',
  'Tape holder, 30 ft x 1/2 in', 'Roll holder, 30 ft x 1/2 in'
]) test(`unknown length: ${title}`, () => assert.equal(parseTitleLength(title).amount, null));

test('all length display units use the same price and total length', () => {
  const result = compareListing({ title: 'Ribbon, 1 yard', price: 9 }, 'ft');
  assert.equal(result.source, 'title');
  assert.equal(formatPrice(result.perBaseUnit, 'in'), '$0.250/in');
  assert.equal(formatPrice(result.perBaseUnit, 'ft'), '$3.00/ft');
  assert.equal(formatPrice(result.perBaseUnit, 'yd'), '$9.00/yd');
  assert.equal(formatPrice(result.perBaseUnit, 'mm'), '$0.0098/mm');
  assert.equal(formatPrice(result.perBaseUnit, 'cm'), '$0.0984/cm');
  assert.equal(formatPrice(result.perBaseUnit, 'm'), '$9.84/m');
});

test('length titles override per-count labels, rounded length rates and missing rates', () => {
  for (const unitText of ['', '$15 / count', '$0.30 / foot']) {
    const result = compareListing({ title: 'Cord, 50 ft (Pack of 2)', price: 30, unitText }, 'ft');
    assert.equal(result.source, 'title');
    assert.equal(formatPrice(result.perBaseUnit, 'ft'), '$0.300/ft');
  }
});

for (const [text, label] of [
  ['$0.25 / foot', '$0.250/ft'], ['$0.25 per ft', '$0.250/ft'],
  ['$0.25 / linear foot', '$0.250/ft'], ['$0.75 / yard', '$0.250/ft'],
  ['$25 / 100 feet', '$0.250/ft'], ['$1 / meter', '$0.305/ft'],
  ['$1 / 100 cm', '$0.305/ft'], ['$0.01 / mm', '$3.05/ft'],
  ['$0.25 / inch', '$3.00/ft']
]) test(`length rate: ${text}`, () => {
  const result = compareListing({ title: 'Cord', price: 30, unitText: text }, 'ft');
  assert.equal(result.source, 'amazon');
  assert.equal(parseUnitPrice(text).kind, 'length');
  assert.equal(formatPrice(result.perBaseUnit, 'ft'), label);
});

test('an ambiguous dimension cannot be rescued by a printed length rate', () => {
  assert.equal(compareListing({ title: 'Panel, 20 in x 30 in', price: 30, unitText: '$1 / foot' }, 'ft').perBaseUnit, null);
});

test('length cannot cross into weight, volume, count or area', () => {
  for (const [title, unitText, unit] of [
    ['Cord', '$1 / pound', 'ft'], ['Cord', '$1 / liter', 'yd'],
    ['Cord', '$1 / count', 'ft'], ['Cord', '$1 / square foot', 'ft'],
    ['Cord', '$1 / ft\u00b2', 'ft'], ['Cord', '$1 / ft^2', 'ft'], ['Cord', '$1 / inch cubed', 'in'],
    ['Cord 100 ft', '$1 / foot', 'lb'], ['Cord 100 ft', '$1 / foot', 'l'],
    ['Cord 100 ft', '$1 / foot', 'count']
  ]) assert.equal(compareListing({ title, price: 30, unitText }, unit).perBaseUnit, null);
});

test('roll counts remain distinct from length and dimensions', () => {
  assert.equal(parseTitleCount('Cord 50 ft, 2 rolls').amount, 2);
  assert.equal(parseTitleCount('Ribbon 2 in x 25 yd').amount, null);
});

test('the reported VELCRO title divides the package price by length, preserving its width', () => {
  const title = 'VELCRO Brand Cut-to-Length Straps Roll, 30ft x 1/2in, Black';
  const result = compareListing({ title, price: 8.80 }, 'ft');
  assert.equal(result.source, 'title');
  assert.equal(result.quantity.millimeters, 30 * MM_PER_FOOT);
  assert.equal(result.quantity.basis, 'long axis in roll/linear-material dimensions');
  assert.equal(formatPrice(result.perBaseUnit, 'ft'), '$0.293/ft');
  assert.equal(formatPrice(result.perBaseUnit, 'yd'), '$0.880/yd');
});
