import type { Prisma, User } from "@prisma/client";
import { getPrismaClient } from "../prismaClient.js";

export async function findOrCreateUser(params: {
  id: bigint;
  telegramUsername?: string;
  firstName?: string;
  languageCode?: string;
}): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.upsert({
    where: { id: params.id },
    update: {
      telegramUsername: params.telegramUsername,
      firstName: params.firstName,
      languageCode: params.languageCode,
    },
    create: {
      id: params.id,
      telegramUsername: params.telegramUsername,
      firstName: params.firstName,
      languageCode: params.languageCode,
    },
  });
}

export async function getUser(id: bigint): Promise<User | null> {
  return getPrismaClient().user.findUnique({ where: { id } });
}

export async function updateUser(id: bigint, data: Prisma.UserUpdateInput): Promise<User> {
  return getPrismaClient().user.update({ where: { id }, data });
}

export async function incrementTrialRecognitions(id: bigint): Promise<User> {
  return getPrismaClient().user.update({
    where: { id },
    data: { trialRecognitionsUsed: { increment: 1 } },
  });
}
