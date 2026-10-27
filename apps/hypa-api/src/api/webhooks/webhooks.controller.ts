import { Body, Controller, Post } from '@nestjs/common';
import type { RunpodWebhookPayload } from '../developer/ws/pod.service';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('runpod/status')
  runpodStatus(@Body() body: RunpodWebhookPayload) {
    this.webhooksService.runpodStatus(body);
    return { received: true };
  }
}
