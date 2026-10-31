// Servidor exclusivamente de teste visual: npm run build && node test/ui-server.cjs
// Respostas simuladas da Steam, isoladas da aplicação normal e sem chave real.
process.env.PORT = '3001';
process.env.HOST = '127.0.0.1';
process.env.STEAM_API_KEY = 'test-fixture-not-a-real-key';
const apps = [620, 230410, 1091500, 377160, 400, 500, 550, 570, 730];
global.fetch = async url => {
  const json = data => new Response(JSON.stringify(data));
  const appId = Number(url.searchParams.get('appid') || url.searchParams.get('gameid'));
  if (url.pathname.includes('GetOwnedGames')) return json({response:{game_count:apps.length,games:apps.map((appid,i)=>({appid,name:`Jogo de teste ${i+1}`,playtime_forever:6000-i*100}))}});
  if (url.pathname.includes('GetSchemaForGame')) return json({game:{gameName:`Jogo ${appId}`,availableGameStats:{achievements:Array.from({length:5},(_,i)=>({name:`A${i}`,displayName:`Conquista de teste ${i+1}`}))}}});
  if (url.pathname.includes('GetPlayerAchievements')) return json({playerstats:{success:true,achievements:Array.from({length:5},(_,i)=>({apiname:`A${i}`,achieved:i<4?1:0,unlocktime:1700000000}))}});
  if (url.pathname.includes('GetGlobalAchievement')) return json({achievementpercentages:{achievements:Array.from({length:5},(_,i)=>({name:`A${i}`,percent:(i+1)/(apps.indexOf(appId)+1)}))}});
  if (url.searchParams.get('xml') === '1') return new Response('<profile><steamID64>76561198119422053</steamID64><steamID>Perfil de teste — dados simulados</steamID><privacyState>public</privacyState></profile>');
  if (url.pathname.includes('screenshots')) return new Response('<div id="BG_bottom_sharedfiles"></div>');
  if (url.hostname === 'steamcommunity.com') return new Response(`<div class="profile_page">${[230410,620,1091500].map(appid=>`<div class="recent_game"><div class="game_name"><a href="https://steamcommunity.com/app/${appid}">Jogo de teste ${apps.indexOf(appid)+1}</a></div><img class="game_capsule" src="https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg"><div class="game_info_achievement_summary"><a>4 / 5 Achievements</a></div></div>`).join('')}</div>`);
  throw new Error('URL não prevista no teste');
};
require('../dist/main');
