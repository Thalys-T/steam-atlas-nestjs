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

  @Get('profiles/:steamId/screenshots')
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'appId', required: false, example: 230410 })
  screenshots(@Param('steamId') id: string, @Query('page') page = '1', @Query('appId') appId?: string) {
    return this.steam.screenshots(id, positive(page, 1000), appId === undefined ? undefined : positive(appId));
  }

  @Get('profiles/:steamId/recent-games')
  @ApiOperation({ summary: 'Os três últimos jogos exibidos na atividade pública, com miniaturas e resumo de conquistas' })
  recentGames(@Param('steamId') id: string) { return this.steam.recentGames(id); }

  @Get('profiles/:steamId/games')
  games(@Param('steamId') id: string) { return this.steam.games(id); }

  @Get('profiles/:steamId/achievements/:appId')
  achievements(@Param('steamId') id: string, @Param('appId') appId: string) {
    return this.steam.achievements(id, positive(appId));
  }
}
