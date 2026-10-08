'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { version, license } = require('../package.json');
const sourcePath = path.join(root, 'amazon-unit-price.user.js');
const source = fs.readFileSync(sourcePath);
const scriptVersion = source.toString('utf8').match(/^\/\/\s*@version\s+(\S+)\s*$/m)?.[1];
const scriptLicense = source.toString('utf8').match(/^\/\/\s*@license\s+(\S+)\s*$/m)?.[1];

if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version) || scriptVersion !== version) {
  throw new Error('Userscript metadata and package.json must have the same valid version.');
}
if (!license || scriptLicense !== license) {
  throw new Error('Userscript metadata and package.json must declare the same license.');
}

const outputPath = path.join(root, `amazon-unit-price-${version}.user.js`);
fs.writeFileSync(outputPath, source);
if (!fs.readFileSync(outputPath).equals(source)) {
  throw new Error('The versioned release does not match the development source.');
}
const sourceTime = fs.statSync(sourcePath).mtime;
fs.utimesSync(outputPath, sourceTime, sourceTime);
console.log(path.basename(outputPath));
