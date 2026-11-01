require('reflect-metadata');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { SteamService, profilePath, parseScreenshots, safeImage } = require('../dist/steam.service');
const { positive } = require('../dist/steam.controller');
const originalFetch = global.fetch;
const originalKey = process.env.STEAM_API_KEY;
const id = '76561197960435530';
const { parseRecentGames } = require('../dist/steam.service');

test('atividade preserva ordem do perfil, limita a três e associa conquistas ao jogo', () => {
  const html = '<div class="profile_page">' + [620, 230410, 1091500, 10].map((appId, i) => `<div class="recent_game"><div class="game_name"><a href="https://steamcommunity.com/app/${appId}">Jogo ${i}</a></div><img class="game_capsule" src="https://shared.steamstatic.com/${appId}.jpg"><div class="game_info_achievement_summary"><a>${i + 1} / 10 Achievements</a></div><div class="game_info_achievement" data-tooltip-text="Conquista ${appId}"><img src="https://shared.steamstatic.com/a.jpg"></div></div>`).join('') + '</div>';
  const result = parseRecentGames(html);
  assert.deepEqual(result.items.map(g => g.appId), [620, 230410, 1091500]);
  assert.equal(result.items[1].achievements.items[0].name, 'Conquista 230410');
  assert.equal(result.items[2].achievements.percentage, 30);
  assert.equal(result.items[0].achievements.partial, true);
});
test('atividade privada ou vazia não inventa jogos, estrutura inesperada gera erro', () => {
  assert.equal(parseRecentGames('<div class="profile_private_info">Private</div>').items.length, 0);
  assert.equal(parseRecentGames('<div class="profile_page"></div>').items.length, 0);
  assert.throws(() => parseRecentGames('<html>login</html>'));
});
test('capturas usam filtro de AppID, cache separado e excluem outros jogos', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(url.href); return new Response('<div id="BG_bottom_sharedfiles">' + [620, 230410].map(appId => `<a class="profile_media_item" data-publishedfileid="${appId}" data-appid="${appId}"><img src="https://images.steamusercontent.com/a.jpg"></a>`).join('') + '</div>'); };
  const service = new SteamService();
  assert.deepEqual((await service.screenshots(id, 1, 620)).items.map(g => g.appId), [620]);
  assert.deepEqual((await service.screenshots(id, 1, 230410)).items.map(g => g.appId), [230410]);
  assert.ok(calls[0].includes('appid=620')); assert.ok(calls[1].includes('appid=230410'));
});
afterEach(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.STEAM_API_KEY; else process.env.STEAM_API_KEY = originalKey; });
function mockResponses(...values) { process.env.STEAM_API_KEY = 'test-only'; let i = 0; global.fetch = async () => new Response(JSON.stringify(values[i++])); }

test('perfil usa avatar próprio e não concatena avatares de grupos', async () => {
  global.fetch = async () => new Response(`<profile><steamID64>${id}</steamID64><steamID>Jogador</steamID><privacyState>public</privacyState><avatarFull>https://avatars.steamstatic.com/player.jpg</avatarFull><groups><group><avatarFull>https://avatars.steamstatic.com/group.jpg</avatarFull></group></groups></profile>`);
  const data = await new SteamService().profile(id);
  assert.equal(data.avatar, 'https://avatars.steamstatic.com/player.jpg');
  assert.equal(data.name, 'Jogador');
});

test('acompanha redirecionamento de capturas somente dentro da Steam', async () => {
  let calls = 0;
  global.fetch = async () => ++calls === 1 ? new Response('', { status: 302, headers: { location: 'https://steamcommunity.com/id/robin/screenshots/?p=1' } }) : new Response('<div id="BG_bottom_sharedfiles"></div>');
  await new SteamService().screenshots(id, 1);
  assert.equal(calls, 2);
  calls = 0;
  global.fetch = async () => { calls++; return new Response('', { status: 302, headers: { location: 'http://localhost/secret' } }); };
  await assert.rejects(new SteamService().screenshots(id, 1), e => e.getStatus() === 502);
  assert.equal(calls, 1);
});

test('aceita os três formatos e impede consultas a hosts arbitrários', () => {
  assert.equal(profilePath(id), `profiles/${id}`);
  assert.equal(profilePath('robin'), 'id/robin');
  assert.equal(profilePath('https://steamcommunity.com/id/robin/'), 'id/robin');
  for (const value of ['http://localhost/id/robin', 'https://steamcommunity.com.evil.test/id/robin', 'https://steamcommunity.com@evil.test/id/robin', '../robin', '', undefined, ['robin']]) assert.throws(() => profilePath(value));
});
test('valida páginas, AppID e endereços das imagens', () => {
  for (const value of ['0', '-1', '1.5', 'abc', '1001']) assert.throws(() => positive(value, 1000));
  assert.equal(positive('2'), 2);
  assert.equal(safeImage('javascript:alert(1)'), null);
  assert.equal(safeImage('https://steamusercontent.com.evil.test/x'), null);
  const achievementIcon = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/730/icon.jpg';
  assert.equal(safeImage(achievementIcon), achievementIcon);
  for (const value of ['https://other.akamaihd.net/icon.jpg', 'https://steamcdn-a.akamaihd.net.evil.test/icon.jpg', 'http://steamcdn-a.akamaihd.net/icon.jpg', 'https://user@steamcdn-a.akamaihd.net/icon.jpg']) assert.equal(safeImage(value), null);
});
test('extrai capturas sem executar scripts e encontra próxima página', () => {
  const html = `<div id="BG_bottom_sharedfiles"><a class="profile_media_item" data-publishedfileid="123" data-appid="620"><div class="imgWallItem" style="background-image:url('https://images.steamusercontent.com/ugc/abc/');"></div></a><div class="pagingPageLinks"><a href="?p=2">2</a></div></div>`;
  const data = parseScreenshots(html, 1);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].imageUrl, 'https://images.steamusercontent.com/ugc/abc/');
  assert.equal(data.items[0].appId, 620);
  assert.equal(data.hasNext, true);
  assert.equal(parseScreenshots('<div class="profile_private_info">Private</div>', 1).items.length, 0);
  assert.throws(() => parseScreenshots('<html>Unexpected login page</html>', 1));
});
test('sem chave retorna instrução sem chamar a Steam', async () => {
  delete process.env.STEAM_API_KEY;
  global.fetch = () => { throw new Error('Não deve chamar fetch'); };
  await assert.rejects(new SteamService().games(id), e => e.getStatus() === 503 && /STEAM_API_KEY/.test(e.message));
});
test('biblioteca privada é diferente de biblioteca vazia', async () => {
  mockResponses({ response: {} }, { response: { game_count: 0 } });
  await assert.rejects(new SteamService().games(id), e => e.getStatus() === 403);
  assert.deepEqual(await new SteamService().games(id), { items: [], total: 0 });
});
test('combina conquistas com schema, mantém bloqueadas e calcula progresso', async () => {
  mockResponses({ playerstats: { success: true, gameName: 'Portal 2', achievements: [{ apiname: 'A', achieved: 1, unlocktime: 1600000000 }, { apiname: 'B', achieved: 0, unlocktime: 0 }] } }, { game: { availableGameStats: { achievements: [{ name: 'A', displayName: 'Primeiro passo', icon: 'https://cdn.steamstatic.com/a.jpg' }, { name: 'B', displayName: 'Desafio', icongray: 'https://cdn.steamstatic.com/b.jpg' }] } } });
  const data = await new SteamService().achievements(id, 620);
  assert.equal(data.percentage, 50); assert.equal(data.unlocked, 1); assert.equal(data.total, 2);
  assert.equal(data.items[0].name, 'Primeiro passo'); assert.equal(data.items[1].unlockedAt, null);
});
test('jogo indisponível é tratado sem inventar conquistas', async () => {
  mockResponses({ playerstats: { success: false } });
  await assert.rejects(new SteamService().achievements(id, 620), e => e.getStatus() === 422);
});
test('falha de schema preserva progresso e inclui aviso', async () => {
  process.env.STEAM_API_KEY = 'test-only'; let calls = 0;
  global.fetch = async () => { if (++calls === 2) throw new Error('offline'); return new Response(JSON.stringify({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1, unlocktime: 0 }] } })); };
  const data = await new SteamService().achievements(id, 620);
  assert.equal(data.percentage, 100); assert.ok(data.warning);
});
test('limitação da Steam é propagada sem expor credenciais', async () => {
  process.env.STEAM_API_KEY = 'secret-test'; global.fetch = async () => new Response('', { status: 429 });
  await assert.rejects(new SteamService().games(id), e => e.getStatus() === 429 && !e.message.includes('secret-test'));
});
test('cache evita consultas repetidas dentro do prazo', async () => {
  process.env.STEAM_API_KEY = 'test-only'; let calls = 0;
  global.fetch = async () => { calls++; return new Response(JSON.stringify({ response: { game_count: 0 } })); };
  const service = new SteamService(); await service.games(id); await service.games(id);
  assert.equal(calls, 1);
});

test('busca por nome aceita Unicode, preserva homônimos e pagina resultados', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    if (url.pathname === '/search/users/') return new Response('<script>g_sessionID = "abcdef123456";</script>', { headers: { 'set-cookie': 'sessionid=abcdef123456; Path=/' } });
    assert.equal(url.searchParams.get('text'), 'Ghost 鬼');
    assert.equal(url.searchParams.get('page'), '1');
    assert.match(options.headers.Cookie, /sessionid=/);
    return new Response(JSON.stringify({success:1,search_result_count:21,html:[id, '76561198119422053'].map(s => `<div class="search_row"><div class="avatarMedium"><img src="https://avatars.steamstatic.com/x.jpg"></div><a class="searchPersonaName" href="https://steamcommunity.com/profiles/${s}">Ghost 鬼</a></div>`).join('')}));
  };
  const service = new SteamService(); const data = await service.searchProfiles('Ghost 鬼', 1);
  assert.equal(data.items.length, 2); assert.equal(data.hasNext, true);
  assert.equal(data.items[0].name, 'Ghost 鬼');
  await service.searchProfiles('Ghost 鬼', 1); assert.equal(calls, 2);
});
test('busca rejeita entradas inválidas e diferencia resposta vazia de falha', async () => {
  const service = new SteamService();
  for (const value of ['', 'a', 'a'.repeat(65), undefined, ['Ghost'], 'ab\ncd']) assert.throws(() => service.searchProfiles(value, 1));
  global.fetch = async url => url.pathname === '/search/users/' ? new Response('g_sessionID = "abc123";') : new Response(JSON.stringify({success:1,search_result_count:0,html:''}));
  assert.equal((await service.searchProfiles('Nada', 1)).items.length, 0);
  global.fetch = async () => new Response('<html>Unexpected page</html>');
  await assert.rejects(service.searchProfiles('Falha', 1), e => e.getStatus() === 502);
});
test('busca ignora links externos e não interpreta falha de parser como resultado vazio', async () => {
  global.fetch = async url => url.pathname === '/search/users/' ? new Response('g_sessionID = "abc123";') : new Response(JSON.stringify({success:1,search_result_count:1,html:'<div class="search_row"><a class="searchPersonaName" href="https://evil.test/id/foo">Foo</a></div>'}));
  await assert.rejects(new SteamService().searchProfiles('Foo', 1), e => e.getStatus() === 502);
});
