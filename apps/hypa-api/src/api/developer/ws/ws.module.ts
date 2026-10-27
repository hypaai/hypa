import { Global, Module } from '@nestjs/common';
import { WSGateway } from './ws.gateway';
import { PodService } from './pod.service';

@Global()
@Module({
  providers: [WSGateway, PodService],
  exports: [WSGateway, PodService],
})
export class WSGatewayModule {}
