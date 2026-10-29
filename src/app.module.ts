import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SteamController } from './steam.controller';
import { SteamService } from './steam.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])],
  controllers: [SteamController],
  providers: [SteamService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
