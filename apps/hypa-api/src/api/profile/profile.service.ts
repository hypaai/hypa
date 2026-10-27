import { Injectable } from '@nestjs/common';
import { UserType } from 'src/db-types';
import { DbService } from 'src/libs/db/db.service';
import { GetReferralsDto } from './profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly db: DbService) {}

  getProfile(user: UserType) {
    return {
      message: 'Profile fetched successfully',
      data: user,
    };
  }

  async getReferrals(userId: string, query: GetReferralsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where = { referrerId: userId };

    const [count, referrals] = await this.db.$transaction([
      this.db.referral.count({ where }),
      this.db.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          status: true,
          points_awarded: true,
          source_app: true,
          created_at: true,
          referred: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              created_at: true,
            },
          },
        },
      }),
    ]);

    return {
      message: 'Referrals fetched successfully',
      data: referrals,
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }
}
