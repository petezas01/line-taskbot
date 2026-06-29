// src/handlers/apiHandler.js
// รับ POST จาก LIFF Form แล้วสร้าง Task

const { PrismaClient } = require("@prisma/client");
const { lineClient } = require("../utils/lineClient");
const { createTask } = require("../services/taskService");
const { getOrCreateMember } = require("../services/memberService");
const { buildTaskCard } = require("../utils/messageBuilder");

const prisma = new PrismaClient();

async function handleCreateTaskApi(req, res) {
  try {
    const { taskTitle, assigneeNames, deadline, description, groupId, userId } = req.body;

    if (!taskTitle || !assigneeNames?.length || !deadline || !groupId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ดึง profile ของคนสั่งงาน
    let creator;
    try {
      const profile = await lineClient.getGroupMemberProfile(groupId, userId);
      creator = await getOrCreateMember(userId, profile, groupId);
    } catch {
      creator = await prisma.member.findFirst({ where: { lineUserId: userId } })
        || await prisma.member.create({
          data: { lineUserId: userId, displayName: "Unknown", groupId }
        });
    }

    // สร้าง/ดึง assignee members
    const assigneeMembers = await Promise.all(
      assigneeNames.map(async (name) => {
        let member = await prisma.member.findFirst({
          where: { displayName: name, groupId }
        });
        if (!member) {
          member = await prisma.member.create({
            data: { lineUserId: `liff_${name}_${groupId}`, displayName: name, groupId }
          });
        }
        return member;
      })
    );

    // สร้าง Task
    const task = await createTask({
      groupId,
      title: taskTitle,
      description,
      deadline: new Date(deadline),
      creatorId: creator.id,
      assigneeIds: assigneeMembers.map((m) => m.id),
    });

    // ส่ง Task Card ลงกลุ่ม
    const card = buildTaskCard(task, assigneeMembers, creator);
    await lineClient.pushMessage(groupId, card);

    // แจ้ง assignee แต่ละคนใน DM
    for (const member of assigneeMembers) {
      if (!member.lineUserId.startsWith("liff_") && !member.lineUserId.startsWith("placeholder_")) {
        await lineClient.pushMessage(member.lineUserId, {
          type: "text",
          text: `📋 คุณได้รับมอบหมายงานใหม่ครับ!\nงาน: "${taskTitle}"\nกำหนดส่ง: ${new Date(deadline).toLocaleDateString("th-TH")} ${new Date(deadline).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`
        }).catch(() => {}); // ไม่ error ถ้า DM ส่งไม่ได้
      }
    }

    res.json({ success: true, taskId: task.id });
  } catch (err) {
    console.error("handleCreateTaskApi error:", err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { handleCreateTaskApi };
