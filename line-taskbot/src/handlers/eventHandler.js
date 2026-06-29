// src/handlers/eventHandler.js
// รับ Event จาก LINE แล้ว Route ไปยัง handler ที่ถูกต้อง

const { handleMessage } = require("./messageHandler");
const { handlePostback } = require("./postbackHandler");

async function handleEvent(event) {
  console.log(`📩 Event: ${event.type} from ${event.source?.userId}`);

  switch (event.type) {
    case "message":
      if (event.message.type === "text") {
        return handleMessage(event);
      }
      break;

    case "postback":
      // เมื่อกดปุ่ม Approve / Reject / ส่งงาน
      return handlePostback(event);

    case "join":
      // บอตถูกดึงเข้ากลุ่ม
      return onBotJoin(event);

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

async function onBotJoin(event) {
  const { lineClient } = require("../utils/lineClient");
  const groupId = event.source.groupId;
  await lineClient.pushMessage(groupId, {
    type: "text",
    text:
      "🤖 สวัสดีครับ! Task Bot พร้อมใช้งานแล้ว\n\n" +
      "📌 วิธีสร้างงาน:\n" +
      "พิมพ์ /task แล้วระบุ:\n" +
      "งาน: [ชื่องาน]\n" +
      "@[ชื่อคน]\n" +
      "วันส่ง: [วัน เวลา]\n\n" +
      "ตัวอย่าง:\n" +
      "/task งาน: ทำ Presentation\n@Arm @Po\nวันส่ง: อังคาร 10:00",
  });
}

module.exports = { handleEvent };
