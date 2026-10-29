import { BadGatewayException, BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { load } from 'cheerio';

export function steamId(id: string) {
  if (!/^7656119\d{10}$/.test(id || '')) throw new BadRequestException('SteamID64 inválido.');
  return id;
}
export function profilePath(input: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 250) throw new BadRequestException('Informe o link do perfil, SteamID64 ou identificador personalizado.');
  const value = input.trim();
  if (/^\d{17}$/.test(value)) return `profiles/${steamId(value)}`;
  if (/^(https?:\/\/|steamcommunity\.)/i.test(value)) {
    let url: URL;
    try { url = new URL(value.startsWith('steamcommunity.') ? `https://${value}` : value); }
    catch { throw new BadRequestException('Link inválido.'); }
    const match = url.pathname.match(/^\/(id|profiles)\/([a-zA-Z0-9_-]+)\/?$/);
    if (url.hostname !== 'steamcommunity.com' || url.port || url.username || url.password || !match) throw new BadRequestException('Use um link steamcommunity.com/id/nome ou steamcommunity.com/profiles/SteamID64.');
    if (match[1] === 'profiles') steamId(match[2]);
    return `${match[1]}/${match[2]}`;
  }
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(value)) throw new BadRequestException('Use o identificador do link do perfil, não o nome de exibição.');
  return `id/${value}`;
}
export function safeImage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const domains = ['steamusercontent.com', 'steamstatic.com', 'steamcommunity.com'];
    return url.protocol === 'https:' && domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`)) ? url.href : null;
  } catch { return null; }
}
export function parseScreenshots(html: string, page: number) {
  const $ = load(html);
  const items: { id: string; appId: number; imageUrl: string; url: string; title: string }[] = [];
  $('.profile_media_item').each((_, el) => {
    const node = $(el);
    const id = node.attr('data-publishedfileid') || node.attr('href')?.match(/[?&]id=(\d+)/)?.[1];
    const style = node.find('.imgWallItem').attr('style') || '';
    const imageUrl = safeImage(node.find('img').attr('src') || style.match(/url\(['"]?(.*?)['"]?\)/)?.[1]);
    if (id && /^\d+$/.test(id) && imageUrl && !items.some(item => item.id === id)) items.push({
      id, appId: Number(node.attr('data-appid')) || 0, imageUrl,
      url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
      title: node.find('img').attr('alt') || `Captura #${id}`,
    });
  });
  const hasNext = $('.pagingPageLinks a').toArray().some(el => {
    try { return Number(new URL($(el).attr('href') || '', 'https://steamcommunity.com').searchParams.get('p')) > page; }
    catch { return false; }
  });
  if (!items.length && !$('#BG_bottom_sharedfiles, .profile_private_info, .profile_fatalerror').length) {
    throw new BadGatewayException('A Steam retornou uma página inesperada. Tente novamente mais tarde.');
  }
  return { items, page, hasNext, notice: items.length ? null : 'Nenhuma captura pública nesta página. O perfil pode estar privado ou não ter capturas compartilhadas.' };
}

export function parseRecentGames(html: string) {
  const $ = load(html);
  const items: any[] = [];
  $('.recent_game').each((_, el) => {
    const game = $(el);
    const appId = Number(game.find('.game_name a').attr('href')?.match(/\/app\/(\d+)/)?.[1]);
    if (!appId || items.some(g => g.appId === appId) || items.length >= 3) return;
    const counts = game.find('.game_info_achievement_summary a').text().match(/([\d,]+)\s*\/\s*([\d,]+)/);
    const unlocked = counts ? Number(counts[1].replace(/,/g, '')) : null;
    const total = counts ? Number(counts[2].replace(/,/g, '')) : null;
    const achievements = game.find('.game_info_achievement').toArray().filter(e => $(e).find('img').length).map((e, i) => ({
      id: `public-${i}`, name: $(e).attr('data-tooltip-text') || 'Conquista do jogo',
      icon: safeImage($(e).find('img').attr('src')), unlocked: true,
      description: '', unlockedAt: null,
    }));
    items.push({ appId, name: game.find('.game_name').text().trim(),
      image: safeImage(game.find('.game_capsule').attr('src')),
      achievements: { items: achievements, unlocked, total, percentage: total ? Math.round(unlocked! / total * 100) : null, partial: true },
    });
  });
  if (!items.length && !$('.profile_page, .profile_private_info, .no_recent_activity').length) throw new BadGatewayException('Não foi possível interpretar a atividade recente da Steam.');
  return { items, source: 'steam-community', notice: items.length ? null : 'Nenhum jogo recente público disponível. A atividade pode estar privada ou vazia.' };
}

@Injectable()
export class SteamService {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();

  private async cached<T>(key: string, run: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.value as T;
    const value = await run();
    if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { expires: Date.now() + 120000, value });
    return value;
  }

  private async request(url: URL, json = true): Promise<any> {
    try {
      const options: RequestInit = { signal: AbortSignal.timeout(12000), redirect: 'manual', headers: { 'User-Agent': 'SteamProfileExplorer/1.0', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' } };
      let response = await fetch(url, options);
      // A comunidade redireciona SteamID64 para o identificador personalizado.
      for (let hop = 0; response.status >= 300 && response.status < 400 && hop < 3; hop++) {
        const location = response.headers.get('location');
        if (!location) break;
        const next = new URL(location, url);
        if (url.hostname !== 'steamcommunity.com' || next.hostname !== 'steamcommunity.com' || next.protocol !== 'https:' || next.port || next.username || next.password) break;
        await response.body?.cancel();
        url = next;
        response = await fetch(url, options);
      }
      if (response.status === 429) throw new HttpException('A Steam limitou as consultas. Aguarde um minuto.', 429);
      if ([401, 403].includes(response.status)) throw new HttpException('A Steam recusou o acesso. Confira a chave de API e a privacidade do perfil e dos detalhes de jogos.', 403);
      if (!response.ok) throw new BadGatewayException('Não foi possível consultar a Steam. Tente novamente mais tarde.');
      return json ? await response.json() : await response.text();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException('A Steam não respondeu a tempo ou está indisponível. Tente novamente.');
    }
  }

  private api(path: string, params: Record<string, string | number>) {
    const key = process.env.STEAM_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException('Configure STEAM_API_KEY no arquivo .env do servidor para consultar jogos e conquistas.');
    const url = new URL(`https://api.steampowered.com/${path}/`);
    url.searchParams.set('key', key);
    for (const [k, value] of Object.entries(params)) url.searchParams.set(k, String(value));
    return this.request(url);
  }

  profile(input: string) {
    const path = profilePath(input);
    return this.cached(`profile:${path}`, async () => {
      const xml = await this.request(new URL(`https://steamcommunity.com/${path}/?xml=1`), false);
      const $ = load(xml, { xmlMode: true });
      if ($('error').length) throw new NotFoundException('Perfil não encontrado. Confira o endereço ou identificador.');
      const field = (name: string) => $('profile').children(name).first().text().trim();
      const id = field('steamID64');
      if (!id) throw new BadGatewayException('A Steam não retornou os dados do perfil. Tente novamente.');
      steamId(id);
      return { steamId: id, name: field('steamID') || id,
        avatar: safeImage(field('avatarFull')),
        url: `https://steamcommunity.com/profiles/${id}`,
        visibility: field('privacyState') === 'public' ? 'public' : 'private',
        status: field('onlineState') || 'offline',
      };
    });
  }

  recentGames(id: string) {
    steamId(id);
    return this.cached(`recent:${id}`, async () => {
      const html = await this.request(new URL(`https://steamcommunity.com/profiles/${id}/?l=english`), false);
      return parseRecentGames(html);
    });
  }

  screenshots(id: string, page: number, appId?: number) {
    steamId(id);
    return this.cached(`screenshots:${id}:${page}:${appId || 'all'}`, async () => {
      const url = new URL(`https://steamcommunity.com/profiles/${id}/screenshots/?p=${page}&view=grid&l=english`);
      if (appId) url.searchParams.set('appid', String(appId));
      const html = await this.request(url, false);
      const data = parseScreenshots(html, page);
      if (appId) data.items = data.items.filter(item => item.appId === appId);
      return data;
    });
  }

  games(id: string) {
    steamId(id);
    return this.cached(`games:${id}`, async () => {
      const data = await this.api('IPlayerService/GetOwnedGames/v1', { steamid: id, include_appinfo: 1, include_played_free_games: 1 });
      if (!data.response || typeof data.response.game_count !== 'number') throw new HttpException('A biblioteca não está pública. Verifique a privacidade dos detalhes de jogos na Steam.', 403);
      return { items: (data.response.games || []).map((g: any) => ({ appId: g.appid, name: g.name || `Jogo ${g.appid}`, hours: Math.round((g.playtime_forever || 0) / 60 * 10) / 10 })).sort((a: any, b: any) => a.name.localeCompare(b.name)), total: data.response.game_count };
    });
  }

  achievements(id: string, appId: number) {
    steamId(id);
    return this.cached(`achievements:${id}:${appId}`, async () => {
      const data = await this.api('ISteamUserStats/GetPlayerAchievements/v1', { steamid: id, appid: appId, l: 'brazilian' });
      const stats = data.playerstats;
      if (!stats?.success) throw new HttpException('Conquistas indisponíveis: o jogo pode não oferecer conquistas, não ter sido jogado ou os dados podem estar privados.', 422);
      let schema: any;
      let warning: string | null = null;
      try { schema = await this.api('ISteamUserStats/GetSchemaForGame/v2', { appid: appId, l: 'brazilian' }); }
      catch { warning = 'O progresso foi carregado, mas os ícones e descrições completos estão indisponíveis.'; }
      const definitions = new Map<string, any>((schema?.game?.availableGameStats?.achievements || []).map((a: any) => [a.name, a]));
      const items = (stats.achievements || []).map((a: any) => {
        const detail = definitions.get(a.apiname);
        return { id: a.apiname, name: detail?.displayName || a.name || a.apiname,
          description: detail?.description || a.description || (detail?.hidden ? 'Conquista oculta' : ''),
          unlocked: a.achieved === 1,
          unlockedAt: a.achieved === 1 && a.unlocktime > 0 ? new Date(a.unlocktime * 1000).toISOString() : null,
          icon: safeImage(a.achieved === 1 ? detail?.icon : detail?.icongray),
        };
      });
      const unlocked = items.filter((a: any) => a.unlocked).length;
      return { appId, gameName: stats.gameName || schema?.game?.gameName || `Jogo ${appId}`, items, total: items.length, unlocked, percentage: items.length ? Math.round(unlocked / items.length * 100) : 0, warning };
    });
  }
}
