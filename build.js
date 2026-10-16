// Собирает index.html из src/template.html, src/gen.js, src/main.js и контуров суши data/land-50m.json.
//   node build.js
const fs = require('fs');
const land = JSON.stringify(JSON.parse(fs.readFileSync('data/land-50m.json', 'utf8')));
let t = fs.readFileSync('src/template.html', 'utf8');
t = t.split('/*LAND*/').join(land).split('/*GEN*/').join(fs.readFileSync('src/schemas.js', 'utf8') + '\n' + fs.readFileSync('src/gen.js', 'utf8').split('/*STREET*/').join(fs.readFileSync('src/street.js', 'utf8'))).split('/*MAIN*/').join(fs.readFileSync('src/main.js', 'utf8'));
// sprite kit atlas (tools/ai/pack.py): data/kit.png + data/kit.json -> {w, h, g, png: base64}
const spr = fs.existsSync('data/kit.json') ? JSON.stringify(Object.assign(JSON.parse(fs.readFileSync('data/kit.json', 'utf8')), { png: fs.readFileSync('data/kit.png').toString('base64') })) : 'null';
t = t.split('/*SPR*/').join(spr);
fs.writeFileSync('index.html', '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + t + '</body></html>');
console.log('index.html', (t.length / 1024 | 0) + 'KB');
