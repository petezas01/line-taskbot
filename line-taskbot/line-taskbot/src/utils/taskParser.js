// src/utils/taskParser.js
// แปลงข้อความคำสั่งเป็น Task Object

const dayjs = require("dayjs");
const buddhistEra = require("dayjs/plugin/buddhistEra");
dayjs.extend(buddhistEra);

// วันในภาษาไทย
const THAI_DAYS = {
  จันทร์: 1, อังคาร: 2, พุธ: 3,
  พฤหัส: 4, พฤหัสบดี: 4, ศุกร์: 5,
  เสาร์: 6, อาทิตย์: 0,
};

/**
 * Parse คำสั่งจาก LINE
 * รูปแบบ:
 *   /task งาน: ชื่องาน
 *   @Arm @Po
 *   วันส่ง: อังคาร 10:00
 */
function parseTaskCommand(text) {
  const lines = text.split("\n").map((l) => l.trim());

  // ชื่องาน (บรรทัดแรก หลัง /task)
  const taskLine = lines[0].replace(/^\/task\s*/i, "");
  const taskMatch = taskLine.match(/งาน:\s*(.+)/i) || [null, taskLine];
  const taskTitle = taskMatch[1]?.trim();

  if (!taskTitle) return { valid: false };

  // หา @mentions
  const allText = lines.join(" ");
  const mentionMatches = allText.match(/@[\w\u0E00-\u0E7F]+/g) || [];
  const assigneeNames = mentionMatches.map((m) => m.replace("@", "").trim());

  if (!assigneeNames.length) return { valid: false, error: "ไม่พบ @ชื่อผู้รับผิดชอบ" };

  // หา deadline
  const deadlineLine = lines.find((l) => /วันส่ง|deadline|ภายใน/i.test(l)) || "";
  const deadline = parseDeadline(deadlineLine);

  if (!deadline) return { valid: false, error: "ไม่พบวันหมดเขต" };

  return { valid: true, taskTitle, assigneeNames, deadline };
}

function parseDeadline(text) {
  if (!text) return null;

  // รูปแบบ: "อังคาร 10:00" หรือ "พรุ่งนี้ 15:00"
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? parseInt(timeMatch[1]) : 23;
  const minute = timeMatch ? parseInt(timeMatch[2]) : 59;

  let target = dayjs();

  if (/พรุ่งนี้/.test(text)) {
    target = target.add(1, "day");
  } else if (/มะรืน/.test(text)) {
    target = target.add(2, "day");
  } else {
    // ค้นหาชื่อวัน
    for (const [thaiDay, dayNum] of Object.entries(THAI_DAYS)) {
      if (text.includes(thaiDay)) {
        const today = target.day();
        let diff = dayNum - today;
        if (diff <= 0) diff += 7; // สัปดาห์หน้า
        target = target.add(diff, "day");
        break;
      }
    }
  }

  return target.hour(hour).minute(minute).second(0).toDate();
}

module.exports = { parseTaskCommand };
