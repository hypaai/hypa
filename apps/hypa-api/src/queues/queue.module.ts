import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from './queue.constants';
import { UserQueue } from './users-queue/user.queue';
import { CompletedHistoryQueue } from './users-queue/completed-history.queue';
import { UserQueueProcessor } from './users-queue/user.queue.processor';
import { PodQueue } from './pod-queue/pod.queue';
import { PodQueueProcessor } from './pod-queue/pod.queue.processor';
import { WSGatewayModule } from '../api/developer/ws/ws.module';
import { DictionaryModule } from 'src/api/dictionary/dictionary.module';

@Global()
@Module({
  imports: [
    WSGatewayModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.USER_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: QUEUE_NAMES.POD_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),
    DictionaryModule,
  ],
  providers: [
    CompletedHistoryQueue,
    UserQueue,
    UserQueueProcessor,
    PodQueue,
    PodQueueProcessor,
  ],
  exports: [BullModule, UserQueue, PodQueue],
})
export class QueueModule {}
