// src/services/taskService.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function createTask({ groupId, title, description, deadline, creatorId, assigneeIds }) {
  return prisma.task.create({
    data: {
      groupId,
      title,
      description,
      deadline,
      creatorId,
      assignees: {
        create: assigneeIds.map((memberId) => ({ memberId })),
      },
    },
    include: {
      assignees: { include: { member: true } },
      creator: true,
    },
  });
}

module.exports = { createTask };
