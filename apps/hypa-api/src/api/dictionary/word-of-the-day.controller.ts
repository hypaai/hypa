import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WordOfTheDayService } from './word-of-the-day.service';

@UseGuards(AuthGuard)
@Controller('labs')
export class WordOfTheDayController {
  constructor(private readonly wordOfTheDay: WordOfTheDayService) {}

  @Get('wotd')
  async getWotd() {
    const cached = await this.wordOfTheDay.getWordOfTheDay();
    return { data: cached };
  }
}
