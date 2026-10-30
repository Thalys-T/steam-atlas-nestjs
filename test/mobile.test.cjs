const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');

function worker(fetch) {
  const listeners = {}, saved = new Map();
  const cache = { addAll: async urls => { for (const url of urls) { assert.ok(fs.existsSync(path.join(root, url === '/' ? 'index.html' : url))); saved.set(url, new Response('shell')); } }, put: async (key, value) => saved.set(key, value), match: async key => saved.get(key) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), { self: { location: { origin: 'https://atlas.example' }, addEventListener: (name, fn) => listeners[name] = fn, clients: { claim: async () => {} } }, caches: { open: async () => cache, keys: async () => [], delete: async () => {} }, fetch, URL, Response });
  return { listeners, saved };
}

test('manifest possui ícones PNG nas dimensões exigidas e abertura standalone', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const file = fs.readFileSync(path.join(root, icon.src));
    assert.equal(file.toString('ascii', 1, 4), 'PNG');
    assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`, icon.sizes);
  }
});
test('service worker instala a interface e a entrega sem rede', async () => {
  const { listeners } = worker(async () => { throw new Error('offline'); });
  let installing; listeners.install({ waitUntil: value => installing = value }); await installing;
  let result; listeners.fetch({ request: { url: 'https://atlas.example/', method: 'GET' }, respondWith: value => result = value });
  assert.equal(await (await result).text(), 'shell');
});
test('cache não intercepta API, dados externos, Swagger ou requisições de escrita', () => {
  const { listeners } = worker(() => { throw new Error('Não deve consultar'); });
  for (const [url, method] of [['https://atlas.example/api/profiles/search?name=GhostTl', 'GET'], ['https://steamcommunity.com/id/GhostTl', 'GET'], ['https://atlas.example/api/docs', 'GET'], ['https://atlas.example/', 'POST']]) {
    listeners.fetch({ request: { url, method }, respondWith: () => assert.fail('Requisição não deve usar cache da interface') });
  }
});
