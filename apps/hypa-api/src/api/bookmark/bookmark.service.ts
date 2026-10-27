import { Injectable } from '@nestjs/common';
import { DbService } from 'src/libs/db/db.service';
import { CreateBookmarkDto, DeleteBookmarkDto } from './bookmark.dto';

@Injectable()
export class BookmarkService {
  constructor(private readonly db: DbService) {}

  async getBookmarks(userId: string) {
    const bookmarks = await this.db.bookmark.findMany({
      where: { userId },
      orderBy: { created_at: 'desc' },
    });

    return {
      message: 'Bookmarks fetched successfully',
      data: bookmarks,
    };
  }

  async createBookmark(userId: string, body: CreateBookmarkDto) {
    const bookmark = await this.db.bookmark.upsert({
      where: {
        userId_word_language: {
          userId,
          word: body.word,
          language: body.language,
        },
      },
      update: {
        result: JSON.parse(JSON.stringify(body.result)),
      },
      create: {
        userId,
        word: body.word,
        language: body.language,
        result: JSON.parse(JSON.stringify(body.result)),
      },
    });

    return {
      message: 'Bookmark saved successfully',
      data: bookmark,
    };
  }

  async deleteBookmark(userId: string, body: DeleteBookmarkDto) {
    await this.db.bookmark.deleteMany({
      where: {
        userId,
        word: body.word,
        language: body.language,
      },
    });

    return {
      message: 'Bookmark removed successfully',
    };
  }
}
