// src/handlers/messageHandler.js
const { lineClient } = require("../utils/lineClient");
const { parseTaskCommand } = require("../utils/taskParser");
const { createTask } = require("../services/taskService");
const { buildTaskCard } = require("../utils/messageBuilder");
const { getOrCreateMember } = require("../services/memberService");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function handleMessage(event) {
  const text = event.message.text?.trim() || "";
  const groupId = event.source.groupId;
  const userId = event.source.userId;

  if (!groupId) return;

  console.log(`📩 Message: "${text}" from ${userId} in ${groupId}`);

  // ตรวจ @mention ด้วยหลายวิธี
  const hasMention = event.message.mention?.mentionees?.some(m => m.isSelf);
  const hasTextMention = text.toLowerCase().includes("@workbot");

  if (hasMention || hasTextMention) {
    console.log("📣 Mention detected!");
    return handleMention(event, groupId);
  }

  if (text.startsWith("/task")) return handleCreateTask(event, text, groupId, userId);
  if (text.toLowerCase() === "done" || text.startsWith("http")) return handleSubmitByText(event, text, groupId, userId);
  if (text === "/tasks" || text === "/งาน") return handleListTasks(event, groupId);
  if (text === "/mytasks") return handleMyTasks(event, groupId, userId);
}

async function handleMention(event, groupId) {
  const LIFF_ID = process.env.LIFF_ID || "";
  console.log("🤖 Sending mention menu to group:", groupId);

  const menuMessage = {
    type: "flex",
    altText: "WorkBot พร้อมช่วยเหลือครับ!",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#5B5FEF",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "🤖 WorkBot", color: "#ffffff", size: "sm", weight: "bold" },
          { type: "text", text: "จะทำอะไรดีครับ?", color: "#ffffff", size: "lg", weight: "bold", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "เลือกสิ่งที่ต้องการด้านล่างได้เลยครับ", size: "sm", color: "#666666", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#5B5FEF",
            action: { type: "uri", label: "➕ สร้างงานใหม่", uri: `https://liff.line.me/${LIFF_ID}` },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "📋 ดูงานทั้งหมด", text: "/tasks" },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "✅ งานของฉัน", text: "/mytasks" },
          },
        ],
      },
    },
  };

  try {
    await lineClient.pushMessage(groupId, menuMessage);
    console.log("✅ Menu sent successfully");
  } catch (err) {
    console.error("❌ replyMessage failed:", err.message);
    // fallback: push
    try {
      await lineClient.pushMessage(groupId, menuMessage);
      console.log("✅ Menu sent via pushMessage");
    } catch (err2) {
      console.error("❌ pushMessage also failed:", err2.message);
    }
  }
}

async function handleCreateTask(event, text, groupId, userId) {
  try {
    const profile = await lineClient.getGroupMemberProfile(groupId, userId);
    const creator = await getOrCreateMember(userId, profile, groupId);
    const parsed = parseTaskCommand(text);
    if (!parsed.valid) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `⚠️ รูปแบบคำสั่งไม่ถูกต้องครับ\n\nตัวอย่าง:\n/task งาน: ทำ Presentation\n@Arm @Po\nวันส่ง: พรุ่งนี้ 10:00`,
      });
    }
    const assigneeMembers = await Promise.all(
      parsed.assigneeNames.map(async (name) => {
        let member = await prisma.member.findFirst({ where: { displayName: name, groupId } });
        if (!member) {
          member = await prisma.member.create({
            data: { lineUserId: `placeholder_${name}_${groupId}`, displayName: name, groupId },
          });
        }
        return member;
      })
    );
    const task = await createTask({
      groupId, title: parsed.taskTitle, description: parsed.description,
      deadline: parsed.deadline, creatorId: creator.id,
      assigneeIds: assigneeMembers.map((m) => m.id),
    });
    const card = buildTaskCard(task, assigneeMembers, creator);
    await lineClient.replyMessage(event.replyToken, card);
  } catch (err) {
    console.error("handleCreateTask error:", err);
    await lineClient.replyMessage(event.replyToken, { type: "text", text: "❌ เกิดข้อผิดพลาด กรุณาลองใหม่ครับ" });
  }
}

async function handleSubmitByText(event, text, groupId, userId) {
  const member = await prisma.member.findFirst({ where: { lineUserId: userId, groupId } });
  if (!member) return;
  const pendingAssignment = await prisma.taskAssignee.findFirst({
    where: { memberId: member.id, submitStatus: "PENDING", task: { groupId, status: { in: ["PENDING", "IN_PROGRESS"] } } },
    include: { task: true },
    orderBy: { task: { deadline: "asc" } },
  });
  if (!pendingAssignment) {
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "ไม่พบงานที่ค้างอยู่ครับ 🎉" });
  }
  const submitUrl = text.startsWith("http") ? text : null;
  await prisma.taskAssignee.update({
    where: { id: pendingAssignment.id },
    data: { submitStatus: "SUBMITTED", submittedAt: new Date(), submitUrl },
  });
  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: `✅ ส่งงานแล้วครับ!\nงาน: ${pendingAssignment.task.title}\nรอหัวหน้า Approve นะครับ 🙏`,
  });
}

async function handleListTasks(event, groupId) {
  const tasks = await prisma.task.findMany({
    where: { groupId, status: { in: ["PENDING", "IN_PROGRESS", "SUBMITTED"] } },
    include: { assignees: { include: { member: true } } },
    orderBy: { deadline: "asc" },
  });
  if (!tasks.length) {
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "🎉 ไม่มีงานค้างในกลุ่มนี้ครับ!" });
  }
  const lines = tasks.map((t, i) => {
    const names = t.assignees.map((a) => a.member.displayName).join(", ");
    const deadline = new Date(t.deadline).toLocaleDateString("th-TH");
    const statusEmoji = { PENDING: "⏳", IN_PROGRESS: "🔄", SUBMITTED: "📬" };
    return `${i + 1}. ${statusEmoji[t.status] || "•"} ${t.title}\n   👤 ${names} | 📅 ${deadline}`;
  });
  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: `📋 งานที่ค้างอยู่ (${tasks.length} งาน)\n\n${lines.join("\n\n")}`,
  });
}

async function handleMyTasks(event, groupId, userId) {
  const member = await prisma.member.findFirst({ where: { lineUserId: userId, groupId } });
  if (!member) return lineClient.replyMessage(event.replyToken, { type: "text", text: "ไม่พบข้อมูลของคุณในกลุ่มนี้ครับ" });
  const assignments = await prisma.taskAssignee.findMany({
    where: { memberId: member.id, submitStatus: "PENDING", task: { groupId, status: { in: ["PENDING", "IN_PROGRESS"] } } },
    include: { task: true },
    orderBy: { task: { deadline: "asc" } },
  });
  if (!assignments.length) return lineClient.replyMessage(event.replyToken, { type: "text", text: "🎉 ไม่มีงานค้างอยู่ครับ!" });
  const lines = assignments.map((a, i) => {
    const deadline = new Date(a.task.deadline).toLocaleDateString("th-TH");
    return `${i + 1}. ⏳ ${a.task.title}\n   📅 ${deadline}`;
  });
  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: `📋 งานของคุณ (${assignments.length} งาน)\n\n${lines.join("\n\n")}`,
  });
}

module.exports = { handleMessage };
