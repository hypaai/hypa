import { user } from './generated/prisma/client';

export type UserType = Omit<user, 'password'>;
