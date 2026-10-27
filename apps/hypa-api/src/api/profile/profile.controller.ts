import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from 'src/libs/shared/decorator/user.decorator';
import { ProfileService } from './profile.service';
import { type UserType } from 'src/db-types';
import { AuthGuard } from '../auth/auth.guard';
import { GetReferralsDto } from './profile.dto';

@UseGuards(AuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getProfile(@User() user: UserType) {
    return this.profileService.getProfile(user);
  }

  @Get('referrals')
  getReferrals(@User() user: UserType, @Query() query: GetReferralsDto) {
    return this.profileService.getReferrals(user.id, query);
  }
}
