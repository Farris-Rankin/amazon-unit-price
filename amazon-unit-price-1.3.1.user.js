// ==UserScript==
// @name         Amazon Standard Unit Price
// @namespace    urn:amazon-standard-unit-price
// @version      1.3.1
// @description  Add standardized unit-price choices to Amazon's on-page Sort by menu.
// @match        https://www.amazon.com/s*
// @match        https://amazon.com/s*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

// Optional CommonJS export for local tests; Tampermonkey supplies the GM APIs.
/* global module: readonly, GM_getValue: readonly, GM_setValue: readonly, GM_registerMenuCommand: readonly */

(function () {
  'use strict';

  const GRAMS_PER_LB = 453.59237;
  const GRAMS_PER_OZ = GRAMS_PER_LB / 16;
  const ML_PER_FL_OZ = 29.5735295625;
  const MM_PER_INCH = 25.4;
  const MM_PER_FOOT = MM_PER_INCH * 12;
  const UNITS = {
    oz: { kind: 'mass', factor: GRAMS_PER_OZ, label: 'oz' },
    lb: { kind: 'mass', factor: GRAMS_PER_LB, label: 'lb' },
    g: { kind: 'mass', factor: 1, label: 'g' },
    '100g': { kind: 'mass', factor: 100, label: '100 g' },
    kg: { kind: 'mass', factor: 1000, label: 'kg' },
    count: { kind: 'count', factor: 1, label: 'count' },
    'fl-oz': { kind: 'volume', factor: ML_PER_FL_OZ, label: 'fl oz', option: 'US fl oz' },
    ml: { kind: 'volume', factor: 1, label: 'mL' },
    '100ml': { kind: 'volume', factor: 100, label: '100 mL' },
    l: { kind: 'volume', factor: 1000, label: 'L' },
    pt: { kind: 'volume', factor: ML_PER_FL_OZ * 16, label: 'pt', option: 'US pint' },
    qt: { kind: 'volume', factor: ML_PER_FL_OZ * 32, label: 'qt', option: 'US quart' },
    gal: { kind: 'volume', factor: ML_PER_FL_OZ * 128, label: 'gal', option: 'US gallon' },
    in: { kind: 'length', factor: MM_PER_INCH, label: 'in' },
    ft: { kind: 'length', factor: MM_PER_FOOT, label: 'ft' },
    yd: { kind: 'length', factor: MM_PER_FOOT * 3, label: 'yd' },
    mm: { kind: 'length', factor: 1, label: 'mm' },
    cm: { kind: 'length', factor: 10, label: 'cm' },
    m: { kind: 'length', factor: 1000, label: 'm' }
  };
  const NUMBER = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\.\d+)`;
  const MASS_UNIT = String.raw`(?:kilograms?|kgs?|grams?|g|pounds?|lbs?|ounces?|oz)`;
  const VOLUME_UNIT = String.raw`(?:fl\.?\s*oz|fluid\s+ounces?|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|gallons?|gals?|pints?|pts?|quarts?|qts?)`;
  const COUNT_UNIT = String.raw`(?:count|ct|each|pieces?|pcs|capsules?|tablets?|pods?|wipes?|sachets?)`;
  const LENGTH_UNIT = String.raw`(?:(?:linear\s+)?(?:millimet(?:er|re)s?|mm|centimet(?:er|re)s?|cm|met(?:er|re)s?|m|inches|inch|in|feet|foot|ft|yards?|yds?))`;
  const CARD_SELECTOR = '[data-component-type="s-search-result"][data-asin]:not([data-asin=""])';
  const SORT_SELECTOR = 'select#s-result-sort-select';
  const SORT_PREFIX = 'aup:';

  function normalize(text) {
    const fractions = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
    return String(text || '').toLowerCase()
      .replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2')
      .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, c => fractions[c])
      .replace(/[\u00a0\u202f]/g, ' ').replace(/[\u200b-\u200d]/g, '')
      .replace(/[–—]/g, '-').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '')
      .replace(/(?<=\d),(?=\d)/g, '.').replace(/(\d)\s*[x×]\s*(?=\d)/g, '$1 x ')
      .replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
  }

  function number(text) {
    const parts = text.trim().split(/\s+/);
    if (text.includes('/')) {
      const fraction = parts.pop().split('/').map(Number);
      return (parts.length ? Number(parts[0]) : 0) + fraction[0] / fraction[1];
    }
    return Number(text);
  }

  function unitGrams(unit) {
    if (/^(lb|pound)/.test(unit)) { return GRAMS_PER_LB; }
    if (/^(oz|ounce)/.test(unit)) { return GRAMS_PER_OZ; }
    if (/^(kg|kilogram)/.test(unit)) { return 1000; }
    if (/^(?:g|grams?)$/.test(unit)) { return 1; }
    return null;
  }

  function similar(a, b) {
    return Math.abs(a - b) <= Math.max(a, b) * 0.015;
  }

  function unitMilliliters(unit) {
    if (/^(fl|fluid)/.test(unit)) { return ML_PER_FL_OZ; }
    if (/^(ml|millilit)/.test(unit)) { return 1; }
    if (/^(?:l|lit(?:er|re)s?)$/.test(unit)) { return 1000; }
    if (/^(gal)/.test(unit)) { return ML_PER_FL_OZ * 128; }
    if (/^(pt|pint)/.test(unit)) { return ML_PER_FL_OZ * 16; }
    if (/^(qt|quart)/.test(unit)) { return ML_PER_FL_OZ * 32; }
    return null;
  }

  function unitMillimeters(unit) {
    const name = unit.replace(/^linear\s+/, '');
    if (/^(?:in|inch|inches)$/.test(name)) { return MM_PER_INCH; }
    if (/^(?:ft|foot|feet)$/.test(name)) { return MM_PER_FOOT; }
    if (/^(?:yds?|yards?)$/.test(name)) { return MM_PER_FOOT * 3; }
    if (/^(?:mm|millimet(?:er|re)s?)$/.test(name)) { return 1; }
    if (/^(?:cm|centimet(?:er|re)s?)$/.test(name)) { return 10; }
    if (/^(?:m|met(?:er|re)s?)$/.test(name)) { return 1000; }
    return null;
  }

  function normalizeLength(title) {
    const dimensionJoin = new RegExp(String.raw`(?<![\w./])(${NUMBER})\s*-?\s*(${LENGTH_UNIT})\s*[x×]\s*(?=\d)`, 'g');
    const text = normalize(title).replace(/(?<=\d)\s*['\u2032\u2019]/g, ' ft ')
      .replace(/(?<=\d)\s*["\u2033\u201d]/g, ' in ').replace(dimensionJoin, '$1 $2 x ');
    // Feet and inches written together describe one length, not two sizes.
    const compound = new RegExp(String.raw`(?<![\w./])(${NUMBER})\s*-?\s*(?:ft|foot|feet)\s*(?:and\s+)?(${NUMBER})\s*-?\s*(?:inches|inch|in)\b`, 'g');
    return text.replace(compound, (match, feet, inches) => number(inches) < 12
      ? `${number(feet) * MM_PER_FOOT + number(inches) * MM_PER_INCH} mm` : match);
  }

  function packCounts(text, kind) {
    const counts = [];
    const patterns = [
      /\b(?:packs?|case|set|bundle)\s+of\s+(\d+)\b/g,
      /\b(\d+)\s*[- ]\s*(?:packs?|bags?|bottles?|cans?|pouches?|jars?|boxes?)\b/g
    ];
    if (kind === 'length' || kind === 'count') { patterns.push(/\b(\d+)\s*[- ]\s*(?:rolls?|spools?|reels?)\b/g); }
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) { counts.push(Number(match[1])); }
    }
    return counts;
  }

  function materialLengthAxis(text, dimensions) {
    if (!/\b(?:rolls?|spools?|reels?|ribbon|tape|webbing|straps?|cords?|ropes?|wires?|cables?|tubing|hoses?|twine|chains?)\b/.test(text)
        || /\b(?:roll|spool|reel|tape|ribbon)\s+(?:holders?|dispensers?|cutters?|racks?|stands?)\b/.test(text)) { return null; }
    // Infer only one connected, long-and-narrow material tuple, not size choices.
    if (dimensions.length < 2 || dimensions.some((dimension, index) => index > 0
        && !/^\s*x\s*$/.test(text.slice(dimensions[index - 1].end, dimension.start)))) { return null; }
    const largest = [...dimensions].sort((a, b) => b.amount - a.amount);
    if (largest[0].amount < largest[1].amount * 10) { return null; }
    return largest[0];
  }

  function parseTitleMeasure(title, kind) {
    const text = kind === 'length' ? normalizeLength(title) : normalize(title);
    const noun = kind === 'mass' ? 'weight' : kind;
    const unknown = reason => ({ amount: null, kind, reason });
    if (kind === 'volume' && /\b(?:imperial|british|uk|dry\s+(?:gallon|quart|pint))\b/.test(text)) {
      return unknown('Volume uses an unsupported non-US measure.');
    }
    const measureUnit = { mass: MASS_UNIT, volume: VOLUME_UNIT, length: LENGTH_UNIT }[kind];
    const volumePrefix = kind === 'volume' ? String.raw`(?:(?:u\.?s\.?)\s+(?:liquid\s+)?)?` : '';
    const matches = [...text.matchAll(new RegExp(String.raw`(?<![\w./])(${NUMBER})\s*-?\s*${volumePrefix}(${measureUnit})\b`, 'g'))];
    if (!matches.length) {
      if (kind === 'mass' && new RegExp(String.raw`(?<![\w./])${NUMBER}\s*-?\s*(?:(?:u\.?s\.?)\s+(?:liquid\s+)?)?${VOLUME_UNIT}\b`).test(text)) {
        return unknown('Volume in title; weight cannot be inferred from volume.');
      }
      return unknown(`No package ${noun} in title.`);
    }
    const measures = [];
    let inferredLengthAxis = false;
    for (const match of matches) {
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 40);
      if (/\d(?:\.\d+)?\s*(?:-|to|or)\s*$/.test(before)) { return unknown(`A ${noun} range is not a single package ${noun}.`); }
      const lengthLabel = kind === 'length' && (/\blength(?:\s+of)?\s*[:=]?\s*$/.test(before)
        || /^\s*[- ]?\s*(?:long|length|l)\b/.test(after));
      if (kind === 'length' && (/\b(?:width|diameter|thickness|height|depth|o\.?d\.?|i\.?d\.?)\s*[:=]?\s*$/.test(before)
          || /^\s*-?\s*(?:wide|width|diameter|thick(?:ness)?|tall|height|deep|depth|o\.?d\.?|i\.?d\.?)\b/.test(after)
          || /^\s*(?:\^\s*[23]|[\u00b2\u00b3]|squared\b|cubed\b)/.test(after)
          || /\b(?:square|cubic|sq\.?|cu\.?)\s*$/.test(before))) { continue; }
      if (/(?:holds?|capacity(?:\s+of)?|fits?|supports?|up\s+to)\s*[:=]?\s*$/.test(before)
          || /^\s*(?:capacity|(?:weight|volume|length)\s+capacity|per\s+serving|(?:of\s+)?(?:protein|fiber|sugar|carbs))\b/.test(after)) {
        return unknown(`Title ${noun} appears to describe capacity or a serving.`);
      }
      const quantity = number(match[1]);
      if (!(quantity > 0) || !Number.isFinite(quantity)) { return unknown(`Invalid title ${noun}.`); }
      const prefixCount = before.match(/\b(\d+)\s*[x×]\s*$/);
      const axes = kind === 'length' && (new RegExp(String.raw`^\s*x\s*${NUMBER}\s*-?\s*${LENGTH_UNIT}\b`).test(after)
        || new RegExp(String.raw`${LENGTH_UNIT}\s*x\s*$`).test(before));
      const suffixCount = axes ? null : after.match(/^\s*[x×]\s*(\d+)\b/);
      measures.push({
        amount: quantity * (kind === 'mass' ? unitGrams(match[2]) : kind === 'volume' ? unitMilliliters(match[2]) : unitMillimeters(match[2])),
        total: /\b(?:total|combined)(?:\s+(?:net\s+)?(?:weight|volume|length))?\s*[:=]?\s*$/.test(before)
          || /^\s*[,;:(-]?\s*(?:total|in\s+total|combined)\b/.test(after),
        count: prefixCount ? Number(prefixCount[1]) : suffixCount ? Number(suffixCount[1]) : null,
        axes, lengthLabel, start: match.index, end: match.index + match[0].length,
        packLabel: /^\s*(?:each|rolls?|spools?|reels?|pieces?|lengths?|cables?|ropes?)\b/.test(after)
      });
    }
    if (!measures.length) { return unknown(`Title dimensions do not identify package ${noun}.`); }
    if (kind === 'length' && measures.filter(m => m.axes).length > 1) {
      const dimensions = measures.filter(m => m.axes);
      const labeled = dimensions.filter(m => m.lengthLabel);
      let chosen = labeled.length === 1 ? labeled[0] : null;
      if (!labeled.length) {
        chosen = materialLengthAxis(text, dimensions);
        inferredLengthAxis = Boolean(chosen);
      }
      if (!chosen) { return unknown('Multiple dimensions do not identify the package length.'); }
      // Keep other length labels for equivalent-unit and package-total checks.
      measures.splice(0, measures.length, ...measures.filter(m => !m.axes || m === chosen));
    }
    if (kind === 'length' && measures.some(m => m.count !== null && !m.packLabel)
        && !packCounts(text, kind).length && !measures.some(m => m.total)) {
      return unknown('Length multiplication does not identify a pack count.');
    }
    if (/\b(?:or|sizes?|options?|ranging)\b/.test(text) && measures.length > 1
        && !measures.every(m => similar(m.amount, measures[0].amount))) {
      return unknown('Multiple package sizes in title.');
    }
    const counts = packCounts(text, kind);
    for (const measure of measures) { if (measure.count !== null) { counts.push(measure.count); } }
    if (counts.some(c => !Number.isSafeInteger(c) || c < 1)
        || new Set(counts).size > 1) { return unknown('Conflicting pack counts in title.'); }
    const count = counts.length ? counts[0] : 1;
    // A count alone does not say that the printed measure is for each item.
    const countOnly = text.match(/\b(\d+)\s*[- ]?\s*(?:count|ct|pieces?|pcs)\b/);
    if (!counts.length && countOnly && Number(countOnly[1]) > 1) {
      if (!/\b(?:each|per\s+(?:bag|pack|piece|item))\b/.test(text)
          && !measures.some(m => m.total)) { return unknown(`Count and ${noun} do not identify total package ${noun}.`); }
      if (measures.some(m => m.total)) { counts.push(1); }
      else { counts.push(Number(countOnly[1])); }
    }
    const multiplier = counts.length ? counts[0] : count;
    const totals = measures.filter(m => m.total);
    let amount;
    if (totals.length) {
      amount = totals[0].amount;
      if (!totals.every(m => similar(m.amount, amount))
          || !measures.filter(m => !m.total).every(m => similar(m.amount * multiplier, amount) || similar(m.amount, amount))) {
        return unknown(`Conflicting total ${noun}s in title.`);
      }
    } else {
      amount = measures[0].amount * multiplier;
      if (!measures.every(m => similar(m.amount * multiplier, amount))) {
        // e.g. "2 x 5 lb (10 lb)"; the explicit multiplication identifies the total.
        const explicit = measures.find(m => m.count !== null);
        if (!explicit) { return unknown(`Conflicting ${noun}s in title.`); }
        amount = explicit.amount * explicit.count;
        if (!measures.every(m => similar(m.amount * multiplier, amount) || (m.count === null && similar(m.amount, amount)))) {
          return unknown(`Conflicting ${noun}s in title.`);
        }
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) { return unknown(`Invalid total package ${noun}.`); }
    return { amount, kind, reason: null,
      basis: totals.length ? `explicit total ${noun} in title` : multiplier > 1
        ? `${inferredLengthAxis ? 'material length axis in title' : `title ${noun}`} × ${multiplier} packs`
        : inferredLengthAxis ? 'long axis in roll/linear-material dimensions' : `${noun} in title` };
  }

  function parseTitleWeight(title) {
    const measure = parseTitleMeasure(title, 'mass');
    return { ...measure, grams: measure.amount, pounds: measure.amount === null ? null : measure.amount / GRAMS_PER_LB };
  }

  function parseTitleVolume(title) {
    const measure = parseTitleMeasure(title, 'volume');
    return { ...measure, milliliters: measure.amount };
  }

  function parseTitleLength(title) {
    const measure = parseTitleMeasure(title, 'length');
    return { ...measure, millimeters: measure.amount };
  }

  function parseTitleCount(title) {
    const text = normalize(title);
    const unknown = reason => ({ amount: null, kind: 'count', reason });
    const counts = packCounts(text, 'count');
    const items = [...text.matchAll(new RegExp(String.raw`(?<![\w./])(\d+)\s*-?\s*(total\s+)?(${COUNT_UNIT})\b`, 'g'))].map(match => {
      const before = text.slice(Math.max(0, match.index - 35), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 35);
      const prefix = before.match(/\b(\d+)\s*x\s*$/);
      return { amount: Number(match[1]), multiplier: prefix ? Number(prefix[1]) : null,
        invalid: /\d\s*(?:-|to|or)\s*$/.test(before) || /^\s*per\s+(?:serving|dose)\b/.test(after),
        total: Boolean(match[2]) || /\btotal(?:\s+count)?\s*[:=]?\s*$/.test(before) || /^\s*[,;:(-]?\s*(?:total|in\s+total)\b/.test(after) };
    });
    for (const match of text.matchAll(/\btotal(?:\s+item)?\s+count\s*[:=]?\s*(\d+)\b/g)) {
      items.push({ amount: Number(match[1]), multiplier: null, invalid: false, total: true });
    }
    for (const item of items) { if (item.multiplier !== null) { counts.push(item.multiplier); } }
    if (!items.length) {
      // "12 x 500 mL" or "2 x 10 lb" also identifies the number of packages.
      const multiple = new RegExp(String.raw`\b(\d+)\s*x\s*${NUMBER}\s*-?\s*(?:(?:u\.?s\.?)\s+)?(?:${MASS_UNIT}|${VOLUME_UNIT}|${LENGTH_UNIT})\b`, 'g');
      for (const match of text.matchAll(multiple)) { counts.push(Number(match[1])); }
      const suffix = new RegExp(String.raw`${NUMBER}\s*-?\s*(?:${MASS_UNIT}|${VOLUME_UNIT}|${LENGTH_UNIT})\s*x\s*(\d+)\b(?!\s*-?\s*${LENGTH_UNIT}\b)`, 'g');
      for (const match of text.matchAll(suffix)) { counts.push(Number(match[1])); }
    }
    if (counts.some(c => !Number.isSafeInteger(c) || c < 1) || new Set(counts).size > 1) { return unknown('Conflicting pack counts in title.'); }
    if (items.some(item => item.invalid || !Number.isSafeInteger(item.amount) || item.amount < 1)) { return unknown('Ambiguous count in title.'); }
    const multiplier = counts.length ? counts[0] : 1;
    if (items.length) {
      const totals = items.filter(item => item.total);
      const amount = totals.length ? totals[0].amount : items[0].amount * multiplier;
      if (!Number.isSafeInteger(amount)) { return unknown('Invalid total package count.'); }
      if (!items.every(item => item.total ? item.amount === amount : item.amount * multiplier === amount)) { return unknown('Conflicting item counts in title.'); }
      return { amount, kind: 'count', reason: null, basis: totals.length ? 'total item count in title' : multiplier > 1 ? `title item count × ${multiplier} packs` : 'item count in title' };
    }
    if (counts.length) { return { amount: multiplier, kind: 'count', reason: null, basis: 'pack count in title' }; }
    return unknown('No package count in title.');
  }

  function parseUnitPrice(text) {
    const normalized = normalize(text);
    const unit = String.raw`(?:${VOLUME_UNIT}|${COUNT_UNIT}|${MASS_UNIT}|${LENGTH_UNIT})`;
    const regex = new RegExp(String.raw`\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*(?:(${NUMBER})\s*)?(?:(?:u\.?s\.?)\s+)?(${unit})\b`, 'g');
    const rates = [...normalized.matchAll(regex)].filter(match => !unitMillimeters(match[3])
      || !/^\s*(?:\^\s*[23]|[\u00b2\u00b3]|squared\b|cubed\b)/.test(normalized.slice(match.index + match[0].length))).map(match => ({
      price: Number(match[1].replace(/,/g, '')),
      factor: unitGrams(match[3]) || unitMilliliters(match[3]) || unitMillimeters(match[3]) || 1,
      kind: unitGrams(match[3]) ? 'mass' : unitMilliliters(match[3]) ? 'volume' : unitMillimeters(match[3]) ? 'length' : 'count',
      quantity: match[2] ? number(match[2]) : 1,
      unit: match[3]
    }));
    if (rates.length !== 1) { return { perBaseUnit: null, perGram: null, reason: rates.length ? 'Multiple unit-price offers.' : 'No unit price.' }; }
    const rate = rates[0];
    if (!(rate.price > 0) || !(rate.quantity > 0)) { return { perBaseUnit: null, perGram: null, reason: 'Invalid unit price.' }; }
    const perBaseUnit = rate.price / (rate.factor * rate.quantity);
    return { perBaseUnit, perGram: rate.kind === 'mass' ? perBaseUnit : null, kind: rate.kind, unit: rate.unit, reason: null };
  }

  function compareListing({ title, price, unitText = '' }, unit = 'lb') {
    const kind = UNITS[unit].kind;
    const unknown = reason => ({ perBaseUnit: null, perGram: null, reason });
    if (!(price > 0) || !Number.isFinite(price)) { return unknown('No single current package price.'); }
    const quantity = kind === 'mass' ? parseTitleWeight(title) : kind === 'volume' ? parseTitleVolume(title)
      : kind === 'length' ? parseTitleLength(title) : parseTitleCount(title);
    if (quantity.amount) {
      const perBaseUnit = price / quantity.amount;
      return { perBaseUnit, perGram: kind === 'mass' ? perBaseUnit : null, price, quantity, weight: kind === 'mass' ? quantity : undefined, source: 'title', reason: null };
    }
    const noun = kind === 'mass' ? 'weight' : kind;
    if (quantity.reason !== `No package ${noun} in title.`) { return unknown(quantity.reason); }
    const rate = parseUnitPrice(unitText);
    if (rate.perBaseUnit && rate.kind === kind) { return { ...rate, price, source: 'amazon', reason: null }; }
    return unknown(quantity.reason);
  }

  function formatPrice(perBaseUnit, unit = 'lb') {
    const value = perBaseUnit * UNITS[unit].factor;
    return `$${value.toFixed(value < 0.1 ? 4 : value < 1 ? 3 : 2)}/${UNITS[unit].label}`;
  }

  function rank(entries) {
    return [...entries].sort((a, b) => {
      const left = a.result.perBaseUnit ?? a.result.perGram;
      const right = b.result.perBaseUnit ?? b.result.perGram;
      if (left === null && right === null) { return a.order - b.order; }
      if (left === null) { return 1; }
      if (right === null) { return -1; }
      return left - right || a.order - b.order;
    });
  }

  function readPrice(card, win) {
    if (card.querySelector('.a-price-range')) { return { price: null, anchor: null }; }
    const prices = [...card.querySelectorAll('.a-price:not(.a-text-price)')];
    for (const element of prices) {
      if (element.closest('[aria-hidden="true"], .aok-hidden') || win.getComputedStyle(element).display === 'none') { continue; }
      const text = element.querySelector('.a-offscreen')?.textContent
        || (element.querySelector('.a-price-whole') && element.querySelector('.a-price-fraction')
          ? `$${element.querySelector('.a-price-whole').textContent.replace(/[^\d,]/g, '')}.${element.querySelector('.a-price-fraction').textContent.trim()}` : '');
      const match = text.trim().match(/^(?:US\s*)?\$\s*([\d,]+(?:\.\d{1,2})?)$/);
      if (!match) { continue; }
      // Unit prices can themselves use a-price markup. They are not package prices.
      const parentText = element.parentElement.textContent.trim();
      const inUnitLabel = /^\s*\(/.test(parentText)
        || element.closest('.a-color-secondary, .unit-price');
      if (inUnitLabel && new RegExp(String.raw`(?:\/|per)\s*(?:${NUMBER}\s*)?(?:${MASS_UNIT}|${VOLUME_UNIT}|${COUNT_UNIT}|${LENGTH_UNIT})\b`, 'i').test(parentText)) { continue; }
      return { price: Number(match[1].replace(/,/g, '')), anchor: element };
    }
    return { price: null, anchor: null };
  }

  function readListing(card, win, unit = 'lb') {
    const title = (card.querySelector('h2') || card.querySelector('[data-cy="title-recipe"]'))?.textContent.trim() || '';
    const { price, anchor } = readPrice(card, win);
    const copy = card.cloneNode(true);
    copy.querySelectorAll('[data-aup]').forEach(element => element.remove());
    return { result: compareListing({ title, price, unitText: copy.textContent }, unit), anchor };
  }

  function install({ window: win, getValue = (_key, fallback) => fallback, setValue = () => {}, registerMenuCommand = () => {}, navigate = url => win.location.assign(url) }) {
    const doc = win.document;
    let enabled = getValue('enabled', true) !== false;
    let unit = getValue('unit', 'lb');
    if (!UNITS[unit]) { unit = 'lb'; }
    let nextOrder = 0;
    const original = new WeakMap();
    let timer = null;
    let destroyed = false;
    let toggle = null;
    let controls = null;
    let selector = null;
    let summary = { comparable: 0, unknown: 0, enabled, unit };
    const nativeSorts = new Map();
    const observer = new win.MutationObserver(() => schedule());
    const style = doc.createElement('style');
    style.dataset.aup = 'style';
    style.textContent = '#aup-controls{color-scheme:dark;position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;align-items:center;gap:6px;padding:5px;background:#131c26;border:1px solid #405b63;border-radius:8px;box-shadow:0 2px 12px #0006}#aup-unit{color-scheme:dark;background:#172630;color:#c5e5de;border:1px solid #405b63;border-radius:4px;height:34px;max-width:calc(100vw - 100px);width:145px;font:14px system-ui;padding:0 6px;cursor:pointer}#aup-unit option,#aup-unit optgroup{background:#172630;color:#c5e5de}#aup-toggle{color-scheme:dark;width:34px;height:34px;background:#18222e;color:#cde3ef;border:1px solid #557386;border-radius:50%;font:22px/1 system-ui;cursor:pointer}#aup-toggle[aria-pressed="false"]{color:#aab4be;background:#161a20}#aup-toggle:focus-visible,#aup-unit:focus-visible{outline:2px solid #97c8df;outline-offset:3px}';
    doc.head.append(style);
    // Use Amazon's actual select in place, exposing the browser's accessible
    // menu instead of Amazon's cached decorative popup. Original options and
    // their data-url destinations remain intact.
    style.textContent += `
      [data-aup-native-sort] { position:relative; display:inline-block; }
      [data-aup-native-sort] > .a-button-dropdown { display:none !important; }
      select[data-aup="native-sort"] {
        position:relative !important; opacity:1 !important; z-index:auto !important;
        display:inline-block !important; width:auto !important; max-width:100%;
        height:28px !important; margin:0; padding:0 6px; cursor:pointer;
        appearance:auto !important; color-scheme:dark; background:#172630; color:#c5e5de;
        border:1px solid #405b63; border-radius:8px; font:12px Arial,sans-serif;
        box-shadow:0 2px 5px #0f111126;
      }
      select[data-aup="native-sort"] option, select[data-aup="native-sort"] optgroup { background:#172630; color:#c5e5de; }
      select[data-aup="native-sort"]:focus-visible { outline:2px solid #97c8df; outline-offset:2px; }
      [data-aup-native-sort] > label.a-native-dropdown {
        display:inline !important; position:static !important; opacity:1 !important;
        width:auto !important; height:auto !important; margin-right:4px;
        font-size:12px; font-weight:normal;
      }
    `;

    function addUnitOptions(select, prefix = '', sortLabels = false) {
      for (const [kind, name] of [['mass', 'Weight'], ['count', 'Count'], ['volume', 'Liquid volume'], ['length', 'Length']]) {
        const group = doc.createElement('optgroup');
        group.dataset.aup = 'unit-options';
        group.label = sortLabels ? `Unit price · ${name.toLowerCase()} (this page)` : name;
        for (const [value, definition] of Object.entries(UNITS)) {
          if (definition.kind !== kind) { continue; }
          const option = doc.createElement('option');
          option.value = prefix + value;
          const label = `$/${definition.option || definition.label}`;
          option.textContent = sortLabels ? `${label}: Low to High` : label;
          group.append(option);
        }
        select.append(group);
      }
    }

    function restoreSort(select, saved) {
      select.querySelectorAll('[data-aup="unit-options"]').forEach(group => group.remove());
      select.value = saved.value;
      for (const [name, value] of Object.entries(saved.attributes)) {
        if (value === null) { select.removeAttribute(name); }
        else { select.setAttribute(name, value); }
      }
      saved.container.removeAttribute('data-aup-native-sort');
    }

    function syncNativeSorts() {
      for (const [select, saved] of nativeSorts) {
        if (select.isConnected && select.matches(SORT_SELECTOR)) { continue; }
        restoreSort(select, saved);
        nativeSorts.delete(select);
      }
      for (const select of doc.querySelectorAll(SORT_SELECTOR)) {
        let saved = nativeSorts.get(select);
        if (!saved) {
          const container = select.closest('.a-dropdown-container') || select.parentElement;
          saved = { container, value: select.value, attributes: Object.fromEntries(
            ['data-aup', 'data-action', 'title'].map(name => [name, select.getAttribute(name)])) };
          nativeSorts.set(select, saved);
        }
        // Amazon can refresh the select's children without replacing the node.
        if (select.querySelectorAll('[data-aup="unit-options"] option').length !== Object.keys(UNITS).length) {
          select.querySelectorAll('[data-aup="unit-options"]').forEach(group => group.remove());
          addUnitOptions(select, SORT_PREFIX, true);
        }
        if (!enabled && !select.value.startsWith(SORT_PREFIX)) { saved.value = select.value; }
        if (![...select.options].some(option => option.value === saved.value)) {
          saved.value = [...select.options].find(option => !option.closest('[data-aup="unit-options"]'))?.value || '';
        }
        select.dataset.aup = 'native-sort';
        select.removeAttribute('data-action');
        saved.container.setAttribute('data-aup-native-sort', '');
        select.value = enabled ? SORT_PREFIX + unit : saved.value;
        select.title = enabled
          ? `Sorted by $/${UNITS[unit].label}: ${summary.comparable} comparable, ${summary.unknown} not comparable. Low to high within each result container on this page. Choose an Amazon option to turn unit sorting off.`
          : 'Amazon sorting. Unit-price options sort only products loaded on this page.';
      }
      return nativeSorts.size > 0;
    }

    function handleSortEvent(event) {
      const select = event.target;
      const saved = nativeSorts.get(select);
      if (!saved) { return; }
      // Keep custom values out of Amazon's dropdown handlers. Stopping
      // propagation still allows the select's native mouse/keyboard behavior.
      event.stopImmediatePropagation();
      if (event.type !== 'change') { return; }
      const value = select.value;
      if (value.startsWith(SORT_PREFIX)) {
        const chosen = value.slice(SORT_PREFIX.length);
        if (!UNITS[chosen]) { return; }
        unit = chosen;
        enabled = true;
        setValue('unit', unit);
        setValue('enabled', true);
        refresh();
        return;
      }
      const option = select.selectedOptions[0];
      if (!option || option.disabled) { return; }
      const previous = saved.value;
      saved.value = value;
      enabled = false;
      setValue('enabled', false);
      // Choosing the underlying Amazon order only needs to undo local sorting.
      // Other built-in choices use the exact destination Amazon supplied.
      let destination = null;
      if (value !== previous) {
        destination = new URL(option.getAttribute('data-url') || win.location.href, win.location.href);
        if (!option.getAttribute('data-url')) {
          destination.searchParams.set('s', value);
          for (const key of ['page', 'qid', 'ref', 'ref_', 'ds']) { destination.searchParams.delete(key); }
        }
      }
      refresh();
      if (destination && destination.origin === win.location.origin) { navigate(destination.href); }
    }

    const sortEvents = ['input', 'change', 'click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup'];
    for (const type of sortEvents) { win.addEventListener(type, handleSortEvent, true); }

    function annotate(entry, showUnknown) {
      const card = entry.card;
      let badge = card.querySelector('[data-aup="badge"]');
      if (!enabled || (!entry.result.perBaseUnit && !showUnknown)) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = doc.createElement('span');
        badge.dataset.aup = 'badge';
        const shadow = badge.attachShadow({ mode: 'open' });
        const css = doc.createElement('style');
        css.textContent = ':host{display:inline-block;margin:4px 6px 4px 0;vertical-align:middle;color-scheme:dark}.value{display:inline-block;background:#172630;color:#c5e5de;border:1px solid #405b63;border-radius:4px;padding:3px 6px;font:600 13px/1.3 system-ui}.unknown{background:#22242a;color:#b9bec8;border-color:#4b4f59}';
        const value = doc.createElement('span');
        value.className = 'value';
        shadow.append(css, value);
        if (entry.anchor) { entry.anchor.insertAdjacentElement('afterend', badge); }
        else { (card.querySelector('h2') || card).append(badge); }
      }
      const value = badge.shadowRoot.querySelector('.value');
      const kind = UNITS[unit].kind;
      const missing = { mass: 'Weight?', volume: 'Volume?', count: 'Count?', length: 'Length?' }[kind];
      const text = entry.result.perBaseUnit ? formatPrice(entry.result.perBaseUnit, unit) : missing;
      if (value.textContent !== text) { value.textContent = text; }
      value.classList.toggle('unknown', !entry.result.perBaseUnit);
      badge.title = entry.result.perBaseUnit
        ? entry.result.source === 'title'
          ? `$${entry.result.price.toFixed(2)} ÷ ${(entry.result.quantity.amount / UNITS[unit].factor).toFixed(4)} ${UNITS[unit].label}; ${entry.result.quantity.basis}. Item price only; excludes shipping, tax and coupon/subscription adjustments.`
          : 'Converted from Amazon’s displayed unit price; may reflect rounding. Item price only; excludes shipping, tax and coupon/subscription adjustments.'
        : `Not ranked: ${entry.result.reason}`;
      badge.setAttribute('aria-label', `${text}. ${badge.title}`);
    }

    function reorder(parent, entries) {
      const desired = enabled ? rank(entries) : [...entries].sort((a, b) => a.order - b.order);
      if (desired.every((entry, index) => entry.card === entries[index].card)) { return; }
      // Fill only product slots; banners, headings and pagination keep their places.
      const slots = entries.map(entry => {
        const marker = doc.createComment('unit-price product slot');
        parent.replaceChild(marker, entry.card);
        return marker;
      });
      slots.forEach((marker, index) => parent.replaceChild(desired[index].card, marker));
    }

    function refresh() {
      if (destroyed) { return; }
      if (timer !== null) { win.clearTimeout(timer); timer = null; }
      observer.disconnect();
      try {
        const root = doc.querySelector('.s-main-slot');
        const cards = root ? [...root.querySelectorAll(CARD_SELECTOR)].filter(card => !card.parentElement.closest(CARD_SELECTOR)) : [];
        const entries = cards.map(card => {
          const asin = card.getAttribute('data-asin');
          let saved = original.get(card);
          if (!saved || saved.asin !== asin) {
            saved = { asin, order: nextOrder++ };
            original.set(card, saved);
          }
          return { card, order: saved.order, ...readListing(card, win, unit) };
        });
        const comparable = entries.filter(entry => entry.result.perBaseUnit !== null).length;
        summary = { comparable, unknown: entries.length - comparable, enabled, unit };
        const groups = new Map();
        for (const entry of entries) {
          const parent = entry.card.parentElement;
          if (!groups.has(parent)) { groups.set(parent, []); }
          groups.get(parent).push(entry);
          annotate(entry, comparable > 0);
        }
        for (const [parent, group] of groups) { reorder(parent, group); }
        const hasNativeSort = syncNativeSorts();
        if (hasNativeSort && controls) { controls.remove(); controls = null; toggle = null; selector = null; }
        // Keep the original compact control as a fallback for page variants
        // without Amazon's sort dropdown.
        if (!hasNativeSort && entries.length && !toggle) {
          controls = doc.createElement('div');
          controls.id = 'aup-controls';
          controls.dataset.aup = 'controls';
          controls.setAttribute('role', 'group');
          controls.setAttribute('aria-label', 'Unit-price controls');
          selector = doc.createElement('select');
          selector.id = 'aup-unit';
          selector.setAttribute('aria-label', 'Price unit');
          selector.title = 'Compare by this unit. Weight, count, volume and length are calculated separately.';
          addUnitOptions(selector);
          selector.value = unit;
          selector.addEventListener('change', () => { setUnit(selector.value); setEnabled(true); });
          toggle = doc.createElement('button');
          toggle.id = 'aup-toggle';
          toggle.dataset.aup = 'toggle';
          toggle.type = 'button';
          toggle.textContent = '⇅';
          toggle.addEventListener('click', () => setEnabled(!enabled));
          controls.append(selector, toggle);
          doc.body.append(controls);
        }
        if (!entries.length && controls) { controls.remove(); controls = null; toggle = null; selector = null; }
        if (toggle) {
          selector.value = unit;
          const label = `${enabled ? 'Sorted by' : 'Sort by'} $/${UNITS[unit].label}: ${comparable} comparable, ${summary.unknown} not comparable in this unit. ${enabled ? 'Click to restore Amazon order.' : 'Click to sort.'} Only products loaded on this page; separate result containers sort separately.`;
          toggle.title = label;
          toggle.setAttribute('aria-label', label);
          toggle.setAttribute('aria-pressed', String(enabled));
        }
      } finally {
        if (!destroyed) {
          observer.observe(doc.body, { childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ['data-asin', 'class', 'aria-hidden', 'style'] });
        }
      }
    }

    function schedule() {
      if (!destroyed && timer === null) { timer = win.setTimeout(refresh, 180); }
    }

    function setEnabled(value) {
      enabled = Boolean(value);
      setValue('enabled', enabled);
      refresh();
    }

    function setUnit(value) {
      if (!UNITS[value]) { return; }
      unit = value;
      setValue('unit', unit);
      refresh();
    }

    registerMenuCommand('Toggle standard unit-price sorting', () => setEnabled(!enabled));
    for (const [value, definition] of Object.entries(UNITS)) { registerMenuCommand(`Use $/${definition.option || definition.label}`, () => setUnit(value)); }
    win.addEventListener('pageshow', schedule);
    refresh();
    return { refresh, setEnabled, setUnit, getSummary: () => ({ ...summary }), destroy() {
      if (destroyed) { return; }
      // Restore the page without overwriting the user's saved preference.
      enabled = false;
      refresh();
      destroyed = true;
      observer.disconnect();
      if (timer !== null) { win.clearTimeout(timer); }
      win.removeEventListener('pageshow', schedule);
      for (const type of sortEvents) { win.removeEventListener(type, handleSortEvent, true); }
      for (const [select, saved] of nativeSorts) { restoreSort(select, saved); }
      nativeSorts.clear();
      controls?.remove();
      style.remove();
    } };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { parseTitleWeight, parseTitleVolume, parseTitleLength, parseTitleCount, parseUnitPrice, compareListing, formatPrice, rank, readListing, install, GRAMS_PER_LB, ML_PER_FL_OZ, MM_PER_INCH, MM_PER_FOOT, UNITS };
  } else if (typeof window !== 'undefined' && /^\/s(?:\/|$)/.test(window.location.pathname)) {
    install({ window,
      getValue: typeof GM_getValue === 'function' ? GM_getValue : undefined,
      setValue: typeof GM_setValue === 'function' ? GM_setValue : undefined,
      registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined });
  }
})();
