require('reflect-metadata');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { SteamService, rarest } = require('../dist/steam.service');
const id = '76561198119422053', originalFetch = global.fetch, originalKey = process.env.STEAM_API_KEY;
afterEach(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.STEAM_API_KEY; else process.env.STEAM_API_KEY = originalKey; });
const json = data => new Response(JSON.stringify(data));
const library = games => ({ response: { game_count: games.length, games } });
const recent = ids => `<div class="profile_page">${ids.map(appId => `<div class="recent_game"><div class="game_name"><a href="https://steamcommunity.com/app/${appId}">Game ${appId}</a></div><div class="game_info_achievement_summary"><a>2 / 5 Achievements</a></div></div>`).join('')}</div>`;

test('seleciona o maior tempo em minutos, sem arredondar para escolher, e remove duplicata recente', async () => {
  process.env.STEAM_API_KEY = 'test';
  global.fetch = async url => url.hostname === 'steamcommunity.com' ? new Response(recent([2,3,1])) : json(library([{appid:1,name:'A',playtime_forever:61},{appid:2,name:'B',playtime_forever:62},{appid:3,name:'C',playtime_forever:12}]));
  const data = await new SteamService().featuredGames(id);
  assert.deepEqual(data.items.map(g => g.appId), [2,3,1]);
  assert.deepEqual(data.items.map(g => g.kind), ['most-played','recent','recent']);
  assert.equal(data.items[0].minutes, 62); assert.equal(data.items[0].achievements.total, 5);
});

test('jogo mais jogado fora dos recentes aparece primeiro e conserva dois recentes na ordem', async () => {
  process.env.STEAM_API_KEY = 'test';
  global.fetch = async url => url.hostname === 'steamcommunity.com' ? new Response(recent([9,8,7])) : json(library([{appid:1,name:'A',playtime_forever:600}]));
  const data = await new SteamService().featuredGames(id);
  assert.deepEqual(data.items.map(g => g.appId), [1,9,8]);
  assert.equal(data.items[0].achievements.total, null);
  assert.match(data.items[0].image, /\/1\/header.jpg$/);
});

test('sem chave preserva somente dois recentes e não inventa o jogo mais jogado', async () => {
  delete process.env.STEAM_API_KEY;
  global.fetch = async () => new Response(recent([3,2,1]));
  const data = await new SteamService().featuredGames(id);
  assert.equal(data.mostPlayedAvailable, false); assert.match(data.notice, /STEAM_API_KEY/);
  assert.deepEqual(data.items.map(g => g.appId), [3,2]);
  await assert.rejects(new SteamService().rareAchievements(id,1), e => e.getStatus() === 503);
});

test('biblioteca sem horas não escolhe jogo aleatório; falha de atividade preserva mais jogado', async () => {
  process.env.STEAM_API_KEY = 'test';
  global.fetch = async url => url.hostname === 'steamcommunity.com' ? new Response(recent([])) : json(library([{appid:1,name:'A',playtime_forever:0}]));
  assert.equal((await new SteamService().featuredGames(id)).items.length, 0);
  global.fetch = async url => { if (url.hostname === 'steamcommunity.com') throw new Error('offline'); return json(library([{appid:1,playtime_forever:10}])); };
  const data = await new SteamService().featuredGames(id);
  assert.equal(data.items[0].appId,1); assert.match(data.notice,/atividade recente/);
});

function mockAccount({apps=5,failApp,missingPercent=false,changeLibrary=false}={}) {
  process.env.STEAM_API_KEY = 'test';
  const calls=[];
  global.fetch = async url => {
    calls.push(url.pathname);
    const app=Number(url.searchParams.get('appid') || url.searchParams.get('gameid'));
    if(url.pathname.includes('GetOwnedGames')) return json(library(Array.from({length:apps},(_,i)=>({appid:i+1,name:`Game ${i+1}`,playtime_forever:i*60}))));
    if(app===failApp) return new Response('',{status:429});
    if(url.pathname.includes('GetSchemaForGame')) return json({game:{gameName:`Game ${app}`,availableGameStats:{achievements: ['A','B'].map(name=>({name,displayName:`Conquista ${name}`,icon:'https://cdn.steamstatic.com/a.png'}))}}});
    if(url.pathname.includes('GetPlayerAchievements')) return json({playerstats:{success:true,achievements:[{apiname:'A',achieved:1},{apiname:'B',achieved:0}]}});
    if(url.pathname.includes('GetGlobalAchievement')) return json({achievementpercentages:{achievements:[{name:'A',percent:missingPercent ? null : String(app===5 ? 0 : 10/app)},{name:'B',percent:0.0001}]}});
    throw new Error('Unexpected request');
  };
  return calls;
}

test('ranking percorre biblioteca além dos destaques, exclui bloqueadas e preserva raridade zero', async () => {
  const calls=mockAccount(); const service=new SteamService();
  const first=await service.rareAchievements(id,1);
  assert.equal(first.nextPage,2); assert.equal(first.processed,4); assert.equal(first.totalGames,5);
  assert.ok(first.items.every(a=>a.id==='A'));
  const second=await service.rareAchievements(id,2,first.snapshot);
  assert.equal(second.nextPage,null); assert.equal(second.processed,5);
  const ranked=rarest([...first.items,...second.items]);
  assert.equal(ranked[0].appId,5); assert.equal(ranked[0].globalPercentage,0);
  assert.equal(calls.filter(p=>p.includes('GetSchemaForGame')).length,5);
});

test('top 10 é global, estável, sem duplicatas e com menos de dez quando necessário', () => {
  const items=Array.from({length:15},(_,i)=>({id:'A',appId:i+1,globalPercentage:15-i}));
  assert.deepEqual(rarest([...items,...items]).map(a=>a.appId),[15,14,13,12,11,10,9,8,7,6]);
  assert.equal(rarest(items.slice(0,2)).length,2);
});

test('falha de um jogo não apaga os demais; percentuais ausentes não viram 0%', async () => {
  mockAccount({apps:4,failApp:2});
  let result=await new SteamService().rareAchievements(id,1);
  assert.equal(result.failedGames.length,1); assert.equal(result.failedGames[0].appId,2); assert.equal(result.items.length,3);
  mockAccount({apps:1,missingPercent:true}); result=await new SteamService().rareAchievements(id,1);
  assert.equal(result.items.length,0); assert.equal(result.failedGames.length,1);
});

test('jogos sem conquistas são distintos de falha de schema ou biblioteca privada', async () => {
  process.env.STEAM_API_KEY='test';
  global.fetch=async url=>url.pathname.includes('GetOwnedGames') ? json(library([{appid:1}])) : json({game:{gameName:'Sem conquistas'}});
  const result=await new SteamService().rareAchievements(id,1);
  assert.equal(result.items.length,0); assert.equal(result.failedGames.length,0);
  global.fetch=async url=>url.pathname.includes('GetOwnedGames') ? json(library([{appid:1}])) : json({game:{}});
  assert.equal((await new SteamService().rareAchievements(id,1)).failedGames.length,1);
  global.fetch=async()=>json({response:{}});
  await assert.rejects(new SteamService().rareAchievements(id,1),e=>e.getStatus()===403);
});

test('paginação rejeita biblioteca alterada, token ausente e página fora do intervalo', async () => {
  mockAccount(); const service=new SteamService(); const first=await service.rareAchievements(id,1);
  await assert.rejects(service.rareAchievements(id,2),e=>e.getStatus()===409);
  await assert.rejects(service.rareAchievements(id,2,'a'.repeat(64)),e=>e.getStatus()===409);
  await assert.rejects(service.rareAchievements(id,3,first.snapshot),e=>e.getStatus()===400);
  mockAccount({apps:6});
  await assert.rejects(new SteamService().rareAchievements(id,2,first.snapshot),e=>e.getStatus()===409);
});
