// src/handlers/messageHandler.js
// เฟส 1: รับข้อความ สร้าง Task และส่ง Task Card ลงกลุ่ม

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

  if (!groupId) return; // ไม่รับ DM

  // @mention บอต — แสดงเมนูปุ่ม
  const mentionBot = event.message.mention?.mentionees?.some(m => m.type === "user" && m.isSelf);
  const textMention = text.toLowerCase().includes("@workbot");
  if (mentionBot || textMention) {
    return handleMention(event, groupId);
  }

  // คำสั่งสร้างงาน
  if (text.startsWith("/task")) {
    return handleCreateTask(event, text, groupId, userId);
  }

  // ส่งงาน — พิมพ์ "done" หรือ link
  if (text.toLowerCase() === "done" || text.startsWith("http")) {
    return handleSubmitByText(event, text, groupId, userId);
  }

  // ดูรายการงานในกลุ่ม
  if (text === "/tasks" || text === "/งาน") {
    return handleListTasks(event, groupId);
  }
}

// ─── แสดงเมนูปุ่มเมื่อถูก @mention ──────────────────────────
async function handleMention(event, groupId) {
  const LIFF_ID = process.env.LIFF_ID || "";
  await lineClient.replyMessage(event.replyToken, {
    type: "flex",
    altText: "WorkBot พร้อมช่วยเหลือครับ เลือกสิ่งที่ต้องการได้เลย",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#5B5FEF",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "WorkBot", color: "#ffffff", size: "xs", opacity: 0.8 },
          { type: "text", text: "จะทำอะไรดีครับ? 🤖", color: "#ffffff", size: "lg", weight: "bold", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "เลือกสิ่งที่ต้องการจากเมนูด้านล่างได้เลยครับ", size: "sm", color: "#666666", wrap: true },
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
            action: {
              type: "uri",
              label: "➕  สร้างงานใหม่",
              uri: `https://liff.line.me/${LIFF_ID}`,
            },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "📋  ดูงานทั้งหมด", text: "/tasks" },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "✅  งานของฉัน", text: "/mytasks" },
          },
        ],
      },
    },
  });
}

// ─── สร้าง Task ─────────────────────────────────────────────
async function handleCreateTask(event, text, groupId, userId) {
  try {
    // ดึง profile ของคนสั่งงาน
    const profile = await lineClient.getGroupMemberProfile(groupId, userId);
    const creator = await getOrCreateMember(userId, profile, groupId);

    // Parse คำสั่ง
    const parsed = parseTaskCommand(text);
    if (!parsed.valid) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `⚠️ รูปแบบคำสั่งไม่ถูกต้องครับ\n\nตัวอย่าง:\n/task งาน: ทำ Presentation\n@Arm @Po\nวันส่ง: พรุ่งนี้ 10:00`,
      });
    }

    // ดึง/สร้าง profile ของ assignees
    const assigneeMembers = await Promise.all(
      parsed.assigneeNames.map(async (name) => {
        // ในระบบจริงควรค้นหาจาก displayName ใน DB ก่อน
        // ที่นี่ใช้ name เป็น placeholder
        return getOrCreateMemberByName(name, groupId);
      })
    );

    // สร้าง Task ใน DB
    const task = await createTask({
      groupId,
      title: parsed.taskTitle,
      description: parsed.description,
      deadline: parsed.deadline,
      creatorId: creator.id,
      assigneeIds: assigneeMembers.map((m) => m.id),
    });

    // ส่ง Task Card ลงกลุ่ม
    const card = buildTaskCard(task, assigneeMembers, creator);
    await lineClient.replyMessage(event.replyToken, card);
  } catch (err) {
    console.error("handleCreateTask error:", err);
    await lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "❌ เกิดข้อผิดพลาด กรุณาลองใหม่ครับ",
    });
  }
}

// ─── ส่งงานผ่านข้อความ ────────────────────────────────────
async function handleSubmitByText(event, text, groupId, userId) {
  const member = await prisma.member.findFirst({
    where: { lineUserId: userId, groupId },
  });
  if (!member) return;

  // หางานที่ค้างอยู่ของคนนี้
  const pendingAssignment = await prisma.taskAssignee.findFirst({
    where: {
      memberId: member.id,
      submitStatus: "PENDING",
      task: { groupId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    },
    include: { task: true },
    orderBy: { task: { deadline: "asc" } },
  });

  if (!pendingAssignment) {
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "ไม่พบงานที่ค้างอยู่ครับ 🎉",
    });
  }

  const submitUrl = text.startsWith("http") ? text : null;

  // อัพเดทสถานะ
  await prisma.taskAssignee.update({
    where: { id: pendingAssignment.id },
    data: {
      submitStatus: "SUBMITTED",
      submittedAt: new Date(),
      submitUrl,
    },
  });

  // แจ้ง creator
  const creator = await prisma.member.findUnique({
    where: { id: pendingAssignment.task.creatorId },
  });

  if (creator) {
    await lineClient.pushMessage(creator.lineUserId, buildApproveMessage(pendingAssignment.task, member, submitUrl));
  }

  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: `✅ ส่งงานแล้วครับ!\nงาน: ${pendingAssignment.task.title}\nรอหัวหน้า Approve นะครับ 🙏`,
  });
}

// ─── ดูรายการงาน ──────────────────────────────────────────
async function handleListTasks(event, groupId) {
  const tasks = await prisma.task.findMany({
    where: { groupId, status: { in: ["PENDING", "IN_PROGRESS", "SUBMITTED"] } },
    include: { assignees: { include: { member: true } } },
    orderBy: { deadline: "asc" },
  });

  if (!tasks.length) {
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "🎉 ไม่มีงานค้างในกลุ่มนี้ครับ!",
    });
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

// ─── Helper: สร้าง Approve message ────────────────────────
function buildApproveMessage(task, submitter, submitUrl) {
  return {
    type: "flex",
    altText: `${submitter.displayName} ส่งงานแล้ว: ${task.title}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB954",
        contents: [{ type: "text", text: "📬 งานถูกส่งแล้ว!", color: "#ffffff", weight: "bold" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: task.title, weight: "bold", size: "lg", wrap: true },
          { type: "text", text: `ผู้ส่ง: ${submitter.displayName}`, color: "#666666", size: "sm" },
          submitUrl
            ? { type: "text", text: `🔗 ${submitUrl}`, color: "#0000EE", size: "sm", wrap: true, action: { type: "uri", label: "เปิดลิงก์", uri: submitUrl } }
            : { type: "text", text: "ส่งเป็น: Done", color: "#666666", size: "sm" },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#1DB954",
            action: { type: "postback", label: "✅ Approve", data: `action=approve&taskId=${task.id}&memberId=${submitter.id}` },
          },
          {
            type: "button",
            style: "primary",
            color: "#E53935",
            action: { type: "postback", label: "❌ Reject", data: `action=reject&taskId=${task.id}&memberId=${submitter.id}` },
          },
        ],
      },
    },
  };
}

async function getOrCreateMemberByName(name, groupId) {
  let member = await prisma.member.findFirst({ where: { displayName: name, groupId } });
  if (!member) {
    member = await prisma.member.create({
      data: { lineUserId: `placeholder_${name}_${groupId}`, displayName: name, groupId },
    });
  }
  return member;
}

module.exports = { handleMessage };
