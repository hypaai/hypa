import { Global, Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioStorageService } from 'src/libs/shared/audio-storage.service';
import { StorageService } from 'src/libs/shared/storage.service';

@Global()
@Module({
  controllers: [AudioController],
  providers: [AudioStorageService, StorageService],
  exports: [AudioStorageService, StorageService],
})
export class AudioModule {}
