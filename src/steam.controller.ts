import { Controller, Get, Inject, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SteamService } from './steam.service';

export function positive(value: string, max = 4294967295): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new BadRequestException('Informe um número inteiro positivo válido.');
  }
  return Number(value);
}
@ApiTags('Steam')
@Controller()
export class SteamController {
  constructor(@Inject(SteamService) private readonly steam: SteamService) {}

  @Get('health') health() { return { status: 'ok', steamApiConfigured: !!process.env.STEAM_API_KEY?.trim() }; }

  @Get('profiles/resolve')
  @ApiOperation({ summary: 'Busca perfil por URL, SteamID64 ou identificador personalizado' })
  @ApiQuery({ name: 'profile', example: 'https://steamcommunity.com/id/robin' })
  resolve(@Query('profile') profile: string) { return this.steam.profile(profile); }

  @Get('profiles/search')
  @ApiOperation({ summary: 'Busca nomes públicos na comunidade Steam para escolher um perfil' })
  @ApiQuery({ name: 'name', example: 'GhostTl' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  search(@Query('name') name: string, @Query('page') page = '1') {
    return this.steam.searchProfiles(name, positive(page, 100));
  }

  @Get('profiles/:steamId/screenshots')
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'appId', required: false, example: 230410 })
  screenshots(@Param('steamId') id: string, @Query('page') page = '1', @Query('appId') appId?: string) {
    return this.steam.screenshots(id, positive(page, 1000), appId === undefined ? undefined : positive(appId));
  }

  @Get('profiles/:steamId/recent-games')
  @ApiOperation({ summary: 'Os três últimos jogos exibidos na atividade pública, com miniaturas e resumo de conquistas' })
  recentGames(@Param('steamId') id: string) { return this.steam.recentGames(id); }

  @Get('profiles/:steamId/featured-games')
  @ApiOperation({ summary: 'Jogo com mais minutos acumulados e dois recentes distintos, com resumo de conquistas' })
  featuredGames(@Param('steamId') id: string) { return this.steam.featuredGames(id); }

  @Get('profiles/:steamId/rarest-achievements')
  @ApiOperation({ summary: 'Lote das conquistas desbloqueadas mais raras; percorra todas as páginas e combine o top 10' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'snapshot', required: false, description: 'Identificador da biblioteca retornado na primeira página' })
  rarest(@Param('steamId') id: string, @Query('page') page = '1', @Query('snapshot') snapshot?: string) {
    if (snapshot !== undefined && (typeof snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot))) throw new BadRequestException('Identificador da biblioteca inválido.');
    return this.steam.rareAchievements(id, positive(page, 10000), snapshot);
  }

  @Get('profiles/:steamId/games')
  games(@Param('steamId') id: string) { return this.steam.games(id); }

  @Get('profiles/:steamId/achievements/:appId')
  achievements(@Param('steamId') id: string, @Param('appId') appId: string) {
    return this.steam.achievements(id, positive(appId));
  }
}
