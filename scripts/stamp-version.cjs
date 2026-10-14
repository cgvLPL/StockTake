const fs = require('node:fs');
const file = process.argv[2];
const sha = process.env.GITHUB_SHA;
if (!file || !/^[a-f0-9]{40}$/i.test(sha || '')) throw Error('Expected a file and valid GITHUB_SHA');
const source = fs.readFileSync(file, 'utf8');
if (!/^const CACHE = [^;]+;/m.test(source)) throw Error('Missing service worker cache identifier');
fs.writeFileSync(file, source.replace(/^const CACHE = [^;]+;/m, `const CACHE = ${JSON.stringify('stocktake-app-' + sha)};`));
