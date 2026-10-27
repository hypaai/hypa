import { Module } from '@nestjs/common';
import { DictionaryController } from './dictionary.controller';
import { DictionaryService } from './dictionary.service';
import { WordOfTheDayController } from './word-of-the-day.controller';
import { WordOfTheDayService } from './word-of-the-day.service';

@Module({
  controllers: [DictionaryController, WordOfTheDayController],
  providers: [DictionaryService, WordOfTheDayService],
  exports: [WordOfTheDayService],
})
export class DictionaryModule {}
