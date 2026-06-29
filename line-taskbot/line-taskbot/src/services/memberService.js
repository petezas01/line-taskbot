// src/services/memberService.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function getOrCreateMember(lineUserId, profile, groupId) {
  return prisma.member.upsert({
    where: { lineUserId },
    update: { displayName: profile.displayName, pictureUrl: profile.pictureUrl },
    create: {
      lineUserId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      groupId,
    },
  });
}

module.exports = { getOrCreateMember };
