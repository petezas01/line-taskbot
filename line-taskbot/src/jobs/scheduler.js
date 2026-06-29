// src/jobs/scheduler.js
// เฟส 2: ตามจิกอัตโนมัติ ด้วย node-cron

const cron = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const { lineClient } = require("../utils/lineClient");
const dayjs = require("dayjs");

const prisma = new PrismaClient();

function startScheduler() {
  console.log("⏰ Starting scheduler...");

  // ทุก 9:00 — Daily Summary (รายชื่อคนดองงาน)
  cron.schedule("0 9 * * *", dailySummary, { timezone: "Asia/Bangkok" });

  // ทุกชั่วโมง — เช็คงานที่ใกล้ถึงเดดไลน์ (24h / 3h)
  cron.schedule("0 * * * *", checkUpcomingDeadlines, { timezone: "Asia/Bangkok" });

  // ทุก 30 นาที — เช็คงาน Overdue
  cron.schedule("*/30 * * * *", checkOverdue, { timezone: "Asia/Bangkok" });

  console.log("✅ Scheduler started");
}

// ─── Daily Summary: สรุปงานค้างทุกเช้า ────────────────────
async function dailySummary() {
  console.log("📊 Running daily summary...");
  try {
    // รวมงานค้างแยกตาม groupId
    const overdueTasks = await prisma.task.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      include: {
        assignees: { where: { submitStatus: "PENDING" }, include: { member: true } },
      },
    });

    // Group by groupId
    const byGroup = {};
    for (const task of overdueTasks) {
      if (!byGroup[task.groupId]) byGroup[task.groupId] = [];
      byGroup[task.groupId].push(task);
    }

    for (const [groupId, tasks] of Object.entries(byGroup)) {
      if (!tasks.length) continue;

      // นับงานต่อคน
      const memberCount = {};
      for (const task of tasks) {
        for (const a of task.assignees) {
          const name = a.member.displayName;
          memberCount[name] = (memberCount[name] || 0) + 1;
        }
      }

      const lines = Object.entries(memberCount)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `• @${name}: ${count} งาน`);

      await lineClient.pushMessage(groupId, {
        type: "text",
        text:
          `🌅 Good morning! สรุปงานค้างวันนี้ครับ\n\n` +
          `📋 งานที่ยังไม่เสร็จ:\n${lines.join("\n")}\n\n` +
          `💪 วันนี้ทำให้เสร็จกันนะครับ!`,
      });
    }
  } catch (err) {
    console.error("dailySummary error:", err);
  }
}

// ─── เช็ค Deadline ที่ใกล้มาถึง ────────────────────────────
async function checkUpcomingDeadlines() {
  const now = dayjs();

  // งานที่จะหมดใน 24 ชั่วโมง
  const in24h = await getTasksDueBetween(now.toDate(), now.add(24, "hour").toDate(), "FRIENDLY_24H");
  // งานที่จะหมดใน 3 ชั่วโมง
  const in3h = await getTasksDueBetween(now.toDate(), now.add(3, "hour").toDate(), "FRIENDLY_3H");

  for (const task of [...in24h, ...in3h]) {
    const hoursLeft = dayjs(task.deadline).diff(now, "hour");
    const isFriendly = hoursLeft > 3;
    const emoji = isFriendly ? "⏰" : "🚨";
    const tone = isFriendly ? "อย่าลืมนะครับ" : "เหลือเวลาน้อยมากแล้วครับ!";

    for (const assignee of task.assignees) {
      if (assignee.submitStatus !== "PENDING") continue;
      await lineClient.pushMessage(task.groupId, {
        type: "text",
        text: `${emoji} @${assignee.member.displayName} ${tone}\nงาน: "${task.title}"\n⏳ เหลืออีก ${hoursLeft} ชั่วโมงครับ`,
      });

      // บันทึกว่าส่งแจ้งเตือนไปแล้ว
      await prisma.reminder.create({
        data: { taskId: task.id, type: hoursLeft > 3 ? "FRIENDLY_24H" : "FRIENDLY_3H" },
      });
    }
  }
}

// ─── เช็คงาน Overdue (เกินกำหนด) ────────────────────────
async function checkOverdue() {
  const overdueWithNoReminder = await prisma.task.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      deadline: { lt: new Date() },
    },
    include: {
      assignees: { where: { submitStatus: "PENDING" }, include: { member: true } },
      reminders: { where: { type: "OVERDUE_ALERT", sentAt: { gte: dayjs().subtract(4, "hour").toDate() } } },
    },
  });

  for (const task of overdueWithNoReminder) {
    // ส่งไม่เกินทุก 4 ชั่วโมง
    if (task.reminders.length > 0) continue;
    if (!task.assignees.length) continue;

    const names = task.assignees.map((a) => `@${a.member.displayName}`).join(" ");
    const overdueDays = Math.ceil((Date.now() - new Date(task.deadline).getTime()) / 86400000);

    await lineClient.pushMessage(task.groupId, {
      type: "text",
      text:
        `🔥🔥 ${names}\n` +
        `งาน "${task.title}" เลยกำหนดแล้ว ${overdueDays > 0 ? overdueDays + " วัน" : "แล้วครับ"}!\n\n` +
        `ขอให้ส่งงานโดยด่วนที่สุดครับ 🙏\n` +
        `(บอตรับหน้าที่ทวงงานแทนหัวหน้าครับ 😅)`,
    });

    await prisma.reminder.create({
      data: { taskId: task.id, type: "OVERDUE_ALERT" },
    });
  }
}

// ─── Helper ────────────────────────────────────────────────
async function getTasksDueBetween(from, to, reminderType) {
  return prisma.task.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      deadline: { gte: from, lte: to },
      // ยังไม่เคยส่งแจ้งเตือนประเภทนี้
      reminders: { none: { type: reminderType } },
    },
    include: {
      assignees: { where: { submitStatus: "PENDING" }, include: { member: true } },
    },
  });
}

module.exports = { startScheduler };
