// Собирает index.html из src/template.html, src/gen.js, src/main.js и контуров суши data/land-50m.json.
//   node build.js
const fs = require('fs');
const land = JSON.stringify(JSON.parse(fs.readFileSync('data/land-50m.json', 'utf8')));
let t = fs.readFileSync('src/template.html', 'utf8');
// boot loader (src/loader.*): its sprites (tools/loader/pack.py -> data/loader/sprites.json) go inline so it shows before the big scripts parse
const ldrSpr = fs.existsSync('data/loader/sprites.json') ? fs.readFileSync('data/loader/sprites.json', 'utf8') : 'null';
t = t.split('/*LOADER_CSS*/').join(fs.readFileSync('src/loader.css', 'utf8')).split('/*LOADER_JS*/').join(fs.readFileSync('src/loader.js', 'utf8').split('/*LOADER_SPR*/null').join(ldrSpr));
t = t.split('/*LAND*/').join(land).split('/*GEN*/').join(fs.readFileSync('src/schemas.js', 'utf8') + '\n' + fs.readFileSync('src/gen.js', 'utf8').split('/*STREET*/').join(fs.readFileSync('src/street.js', 'utf8'))).split('/*MAIN*/').join(fs.readFileSync('src/main.js', 'utf8'));
// sprite kit atlas (tools/ai/pack.py): data/kit.png + data/kit.json -> {w, h, g, png: base64}
// lossless WebP of the same atlas when present (less than half the PNG's size)
const kitImg = fs.existsSync('data/kit.webp') ? ['data/kit.webp', 'image/webp'] : ['data/kit.png', 'image/png'];
const spr = fs.existsSync('data/kit.json') ? JSON.stringify(Object.assign(JSON.parse(fs.readFileSync('data/kit.json', 'utf8')), { png: fs.readFileSync(kitImg[0]).toString('base64'), mime: kitImg[1] })) : 'null';
t = t.split('/*SPR*/').join(spr);
// dark page colour in <head>: the 3-4 MB file takes a moment to parse, and the default white would flash before the loader
fs.writeFileSync('index.html', '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><style>html{background:#0b1626}</style></head><body>' + t + '</body></html>');
console.log('index.html', (t.length / 1024 | 0) + 'KB');
