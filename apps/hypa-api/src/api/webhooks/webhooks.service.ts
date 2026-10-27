import { Injectable } from '@nestjs/common';
import { PodService, RunpodWebhookPayload } from '../developer/ws/pod.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly podService: PodService) {}

  runpodStatus(payload: RunpodWebhookPayload) {
    this.podService.updateJobFromWebhook(payload);
  }
}
