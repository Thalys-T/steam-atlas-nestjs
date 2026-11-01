import { BadGatewayException, BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export interface LibraryGame { appId: number; name: string; hours: number; minutes: number; image: string; }
export interface RareAchievement { id: string; appId: number; gameName: string; name: string; icon: string | null; description: string; globalPercentage: number; unlockedAt: string | null; }
export function rarest(items: RareAchievement[]) {
  return [...new Map(items.map(item => [`${item.appId}:${item.id}`, item])).values()]
    .sort((a, b) => a.globalPercentage - b.globalPercentage || a.appId - b.appId || a.id.localeCompare(b.id)).slice(0, 10);
}

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
    const trusted = domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))
      || url.hostname === 'steamcdn-a.akamaihd.net';
    return url.protocol === 'https:' && trusted && !url.username && !url.password && !url.port ? url.href : null;
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
  private readonly pending = new Map<string, Promise<unknown>>();

  private async cached<T>(key: string, run: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.value as T;
    if (this.pending.has(key)) return this.pending.get(key) as Promise<T>;
    const promise = run().then(value => {
      if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: Date.now() + 120000, value });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private async request(url: URL, json = true, headers: Record<string, string> = {}, raw = false): Promise<any> {
    try {
      const options: RequestInit = { signal: AbortSignal.timeout(12000), redirect: 'manual', headers: { 'User-Agent': 'SteamProfileExplorer/1.0', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', ...headers } };
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
      return raw ? response : json ? await response.json() : await response.text();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException('A Steam não respondeu a tempo ou está indisponível. Tente novamente.');
    }
  }

  searchProfiles(query: string, page: number) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 64 || /[\u0000-\u001f\u007f]/.test(query)) throw new BadRequestException('Digite um nome com 2 a 64 caracteres.');
    const text = query.trim();
    return this.cached(`search:${text}:${page}`, async () => {
      // Sessão anônima emitida pela própria página pública, sem login do usuário.
      const landing: Response = await this.request(new URL('https://steamcommunity.com/search/users/'), false, {}, true);
      const html = await landing.text();
      const session = html.match(/g_sessionID\s*=\s*"([a-f0-9]+)"/)?.[1];
      if (!session) throw new BadGatewayException('A busca de nomes da Steam está indisponível. Tente novamente ou use o SteamID64.');
      const cookie = landing.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      const url = new URL('https://steamcommunity.com/search/SearchCommunityAjax');
      for (const [key, value] of Object.entries({ text, filter: 'users', sessionid: session, steamid_user: 'false', page: String(page) })) url.searchParams.set(key, value);
      const result = await this.request(url, true, { Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest' });
      if (result.success !== 1 || typeof result.html !== 'string' || !Number.isInteger(result.search_result_count) || result.search_result_count < 0) throw new BadGatewayException('A Steam não retornou resultados válidos. Tente novamente ou use o SteamID64.');
      const $ = load(result.html);
      const items: { name: string; url: string; avatar: string | null }[] = [];
      $('.search_row').each((_, el) => {
        const row = $(el), anchor = row.find('.searchPersonaName');
        try {
          const path = profilePath(anchor.attr('href') || '');
          const url = `https://steamcommunity.com/${path}`;
          if (!items.some(item => item.url === url)) items.push({ name: anchor.text().trim(), url, avatar: safeImage(row.find('.avatarMedium img').attr('src')) });
        } catch { /* Ignora links que não sejam perfis válidos da Steam. */ }
      });
      if (result.search_result_count > 0 && !items.length) throw new BadGatewayException('Não foi possível interpretar os perfis encontrados na Steam.');
      return { items, page, total: result.search_result_count, hasNext: page * 20 < result.search_result_count };
    });
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
      if (data.response.game_count !== (data.response.games || []).length) throw new BadGatewayException('A Steam retornou uma biblioteca incompleta. Tente novamente.');
      const items: LibraryGame[] = (data.response.games || []).map((g: any) => ({
        appId: g.appid, name: g.name || `Jogo ${g.appid}`,
        minutes: g.playtime_forever || 0, hours: Math.round((g.playtime_forever || 0) / 60 * 10) / 10,
        image: `https://shared.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
      })).sort((a: LibraryGame, b: LibraryGame) => a.name.localeCompare(b.name));
      return { items, total: data.response.game_count };
    });
  }

  async featuredGames(id: string) {
    steamId(id);
    const [library, recent] = await Promise.allSettled([this.games(id), this.recentGames(id)]);
    const notices: string[] = [];
    const recentItems = recent.status === 'fulfilled' ? recent.value.items : [];
    if (recent.status === 'rejected') notices.push('A atividade recente não pôde ser consultada.');
    else if (recent.value.notice) notices.push(recent.value.notice);
    const mostPlayed = library.status === 'fulfilled' ? [...library.value.items]
      .filter(game => game.minutes > 0).sort((a, b) => b.minutes - a.minutes || a.appId - b.appId)[0] : undefined;
    if (library.status === 'rejected') notices.push(`Não foi possível identificar o jogo com mais horas. ${library.reason instanceof HttpException ? library.reason.message : 'Tente novamente.'}`);
    else if (!mostPlayed) notices.push('A biblioteca não apresenta um jogo com tempo registrado.');
    const empty = { items: [], unlocked: null, total: null, percentage: null, partial: true };
    const items: any[] = [];
    if (mostPlayed) {
      const preview = recentItems.find(game => game.appId === mostPlayed.appId);
      items.push({ ...mostPlayed, image: preview?.image || mostPlayed.image, kind: 'most-played', achievements: preview?.achievements || empty });
    }
    for (const game of recentItems.filter(game => game.appId !== mostPlayed?.appId).slice(0, 2)) {
      const owned = library.status === 'fulfilled' ? library.value.items.find(item => item.appId === game.appId) : undefined;
      items.push({ ...game, kind: 'recent', hours: owned?.hours ?? null });
    }
    return { items, notice: notices.join(' ') || null, mostPlayedAvailable: !!mostPlayed };
  }

  private schema(appId: number): Promise<any> {
    return this.cached(`schema:${appId}`, async () => {
      const data = await this.api('ISteamUserStats/GetSchemaForGame/v2', { appid: appId, l: 'brazilian' });
      if (!data?.game || typeof data.game !== 'object') throw new BadGatewayException('A Steam não retornou a lista de conquistas deste jogo.');
      return data;
    });
  }

  private globalAchievements(appId: number): Promise<Map<string, number>> {
    return this.cached(`global:${appId}`, async () => {
      const data = await this.request(new URL(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`));
      if (!Array.isArray(data?.achievementpercentages?.achievements)) throw new BadGatewayException('Percentuais globais indisponíveis.');
      const percentages = new Map<string, number>();
      for (const item of data.achievementpercentages.achievements) {
        const value = typeof item.percent === 'number' || (typeof item.percent === 'string' && item.percent.trim()) ? Number(item.percent) : NaN;
        if (typeof item.name === 'string' && Number.isFinite(value) && value >= 0 && value <= 100) percentages.set(item.name, value);
      }
      return percentages;
    });
  }

  // Lotes independentes funcionam também em múltiplas instâncias serverless.
  async rareAchievements(id: string, page: number, snapshot?: string) {
    steamId(id);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BadRequestException('Página inválida.');
    const library = await this.games(id);
    const games = [...library.items].sort((a, b) => a.appId - b.appId);
    const token = createHash('sha256').update(`${id}:${games.map(game => game.appId).join(',')}`).digest('hex');
    if ((snapshot && snapshot !== token) || (page > 1 && !snapshot)) throw new HttpException('A biblioteca mudou durante a consulta. Reinicie a análise.', 409);
    const batchSize = 4, offset = (page - 1) * batchSize;
    if (page > 1 && offset >= games.length) throw new BadRequestException('Página fora da biblioteca.');
    const batch = games.slice(offset, offset + batchSize);
    const results = await Promise.all(batch.map(async game => {
      try {
        const schema = await this.schema(game.appId);
        const definitions = schema.game.availableGameStats?.achievements;
        if (definitions !== undefined && !Array.isArray(definitions)) throw new BadGatewayException('Lista de conquistas inválida.');
        // Uma resposta válida sem conquistas não é uma falha de consulta.
        if (!definitions?.length) {
          if (definitions === undefined && !schema.game.gameName) throw new BadGatewayException('A Steam não informou se este jogo possui conquistas.');
          return { items: [] as RareAchievement[], failed: null };
        }
        const [player, percentages] = await Promise.all([this.achievements(id, game.appId), this.globalAchievements(game.appId)]);
        const unlocked = player.items.filter((a: any) => a.unlocked);
        const missing = unlocked.some((a: any) => !percentages.has(a.id)) || definitions.some((a: any) => !player.items.some((p: any) => p.id === a.name));
        const items: RareAchievement[] = unlocked.filter((a: any) => percentages.has(a.id)).map((a: any) => ({
          id: a.id, appId: game.appId, gameName: game.name, name: a.name, icon: a.icon,
          description: a.description, unlockedAt: a.unlockedAt, globalPercentage: percentages.get(a.id)!,
        }));
        return { items, failed: missing ? { appId: game.appId, name: game.name, message: 'Algumas conquistas não têm estado pessoal ou percentual global disponível.' } : null };
      } catch (error) {
        return { items: [] as RareAchievement[], failed: { appId: game.appId, name: game.name, message: error instanceof HttpException ? error.message : 'Não foi possível consultar este jogo.' } };
      }
    }));
    return { items: rarest(results.flatMap(result => result.items)), snapshot: token, page,
      processed: Math.min(offset + batch.length, games.length), totalGames: games.length,
      nextPage: offset + batch.length < games.length ? page + 1 : null,
      failedGames: results.flatMap(result => result.failed ? [result.failed] : []),
      scope: 'owned-public-games',
    };
  }

  achievements(id: string, appId: number) {
    steamId(id);
    return this.cached(`achievements:${id}:${appId}`, async () => {
      const data = await this.api('ISteamUserStats/GetPlayerAchievements/v1', { steamid: id, appid: appId, l: 'brazilian' });
      const stats = data.playerstats;
      if (!stats?.success) throw new HttpException('Conquistas indisponíveis: o jogo pode não oferecer conquistas, não ter sido jogado ou os dados podem estar privados.', 422);
      let schema: any;
      let warning: string | null = null;
      try { schema = await this.schema(appId); }
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
