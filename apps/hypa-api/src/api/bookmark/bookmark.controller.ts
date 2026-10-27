import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { User } from 'src/libs/shared/decorator/user.decorator';
import { BookmarkService } from './bookmark.service';
import { type UserType } from 'src/db-types';
import { AuthGuard } from '../auth/auth.guard';
import { CreateBookmarkDto, DeleteBookmarkDto } from './bookmark.dto';

@UseGuards(AuthGuard)
@Controller('profile/bookmarks')
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  @Get()
  getBookmarks(@User() user: UserType) {
    return this.bookmarkService.getBookmarks(user.id);
  }

  @Post()
  createBookmark(@User() user: UserType, @Body() body: CreateBookmarkDto) {
    return this.bookmarkService.createBookmark(user.id, body);
  }

  @Delete()
  deleteBookmark(@User() user: UserType, @Body() body: DeleteBookmarkDto) {
    return this.bookmarkService.deleteBookmark(user.id, body);
  }
}
