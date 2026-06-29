// src/handlers/postbackHandler.js
// เฟส 3: จัดการปุ่ม Approve / Reject

const { lineClient } = require("../utils/lineClient");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function handlePostback(event) {
  const params = new URLSearchParams(event.postback.data);
  const action = params.get("action");
  const taskId = params.get("taskId");
  const memberId = params.get("memberId");

  switch (action) {
    case "approve":
      return handleApprove(event, taskId, memberId);
    case "reject":
      return handleReject(event, taskId, memberId);
    case "submit":
      return handleSubmitPrompt(event, taskId);
  }
}

// ─── Approve ─────────────────────────────────────────────
async function handleApprove(event, taskId, memberId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { member: true } } },
  });
  if (!task) return;

  // อัพเดทสถานะ assignee คนนี้
  await prisma.taskAssignee.updateMany({
    where: { taskId, memberId },
    data: { submitStatus: "APPROVED" },
  });

  // เช็คว่าทุกคน approve แล้วหรือยัง
  const allApproved = task.assignees.every(
    (a) => a.memberId === memberId || a.submitStatus === "APPROVED"
  );

  if (allApproved) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "APPROVED" },
    });
  }

  // แจ้ง assignee ที่โดน approve
  const approvedMember = task.assignees.find((a) => a.memberId === memberId);
  if (approvedMember) {
    await lineClient.pushMessage(approvedMember.member.lineUserId, {
      type: "text",
      text: `🎉 งาน "${task.title}" ของคุณได้รับการอนุมัติแล้วครับ!\nยอดเยี่ยมมากๆ 🏆`,
    });
  }

  // ส่งข้อความฉลองลงกลุ่ม
  await lineClient.pushMessage(task.groupId, {
    type: "text",
    text:
      `✅ งาน "${task.title}" เสร็จสมบูรณ์แล้วครับ! 🎊\n` +
      `ขอบคุณ ${approvedMember?.member?.displayName || "ทุกคน"} ที่ส่งงานเรียบร้อยครับ 👏`,
  });

  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: "✅ Approve เรียบร้อยแล้วครับ!",
  });
}

// ─── Reject ──────────────────────────────────────────────
async function handleReject(event, taskId, memberId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { where: { memberId }, include: { member: true } } },
  });
  if (!task) return;

  // เด้งกลับเป็น PENDING
  await prisma.taskAssignee.updateMany({
    where: { taskId, memberId },
    data: { submitStatus: "PENDING", submittedAt: null, submitUrl: null },
  });

  const rejectedMember = task.assignees[0];
  if (rejectedMember) {
    await lineClient.pushMessage(rejectedMember.member.lineUserId, {
      type: "flex",
      altText: `งาน "${task.title}" ถูก Reject แล้วครับ`,
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#E53935",
          contents: [{ type: "text", text: "❌ งานถูกส่งคืนครับ", color: "#ffffff", weight: "bold" }],
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: task.title, weight: "bold", wrap: true },
            {
              type: "text",
              text: "กรุณาแก้ไขแล้วส่งใหม่อีกครั้งนะครับ 🙏",
              color: "#666666",
              size: "sm",
              wrap: true,
              margin: "sm",
            },
          ],
        },
      },
    });
  }

  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: "❌ Reject เรียบร้อย งานจะกลับไปที่คิวรอส่งครับ",
  });
}

// ─── Prompt ส่งงาน ────────────────────────────────────────
async function handleSubmitPrompt(event, taskId) {
  await lineClient.replyMessage(event.replyToken, {
    type: "text",
    text: "📎 กรุณาส่ง Link งาน หรือพิมพ์ \"done\" เพื่อยืนยันการส่งครับ",
  });
}

module.exports = { handlePostback };
