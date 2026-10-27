import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  COMPLETED_JOB_RETENTION,
  POD_FAILED_JOB_RETENTION,
  QUEUE_NAMES,
} from '../queue.constants';
import { POD_QUEUE_JOBS } from './pod.queue';
import { PodService } from 'src/api/developer/ws/pod.service';

@Processor(QUEUE_NAMES.POD_QUEUE, {
  removeOnComplete: COMPLETED_JOB_RETENTION,
  removeOnFail: POD_FAILED_JOB_RETENTION,
})
export class PodQueueProcessor extends WorkerHost {
  constructor(private readonly podService: PodService) {
    super();
  }

  async process(job: Job<Record<string, never>>): Promise<void> {
    if (job.name === POD_QUEUE_JOBS.CLEANUP_IDLE) {
      await this.podService.cleanupIdlePods();
    }
  }
}
