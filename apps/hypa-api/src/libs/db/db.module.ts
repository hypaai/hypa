import { Module } from '@nestjs/common';
import { DbService } from './db.service';
import { Global } from '@nestjs/common';

@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
