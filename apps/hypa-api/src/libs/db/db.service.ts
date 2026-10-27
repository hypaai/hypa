import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { Debug } from 'src/utils/debug';

export class DbService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    try {
      this.$on('error' as never, (error) => {
        Debug.error('Database connection error', error);
      });
      await this.$connect();
      Debug.info('Database connected successfully');
    } catch {
      Debug.error('Error connecting to database');
      return null;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    Debug.warn('Database disconnected successfully');
  }
}
