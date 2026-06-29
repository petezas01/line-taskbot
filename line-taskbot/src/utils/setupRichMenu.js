// src/utils/setupRichMenu.js
// รัน script นี้ครั้งเดียวเพื่อสร้าง Rich Menu
// node src/utils/setupRichMenu.js

require("dotenv").config();
const { lineClient } = require("./lineClient");

const LIFF_ID = process.env.LIFF_ID; // ใส่ LIFF ID หลังจากสร้างแล้ว

async function setup() {
  try {
    // 1. สร้าง Rich Menu
    const richMenuId = await lineClient.createRichMenu({
      size: { width: 2500, height: 843 },
      selected: true,
      name: "WorkBot Menu",
      chatBarText: "เมนู WorkBot",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: {
            type: "uri",
            label: "สร้างงาน",
            uri: `https://liff.line.me/${LIFF_ID}`,
          },
        },
        {
          bounds: { x: 833, y: 0, width: 833, height: 843 },
          action: {
            type: "message",
            label: "งานทั้งหมด",
            text: "/tasks",
          },
        },
        {
          bounds: { x: 1666, y: 0, width: 834, height: 843 },
          action: {
            type: "message",
            label: "งานของฉัน",
            text: "/mytasks",
          },
        },
      ],
    });

    console.log("✅ Rich Menu created:", richMenuId);

    // 2. Upload รูป Rich Menu (ถ้ามี)
    // await lineClient.setRichMenuImage(richMenuId, imageBuffer, 'image/png');

    // 3. Set เป็น default
    await lineClient.setDefaultRichMenu(richMenuId);
    console.log("✅ Set as default Rich Menu");

  } catch (err) {
    console.error("❌ Setup error:", err.message);
  }
}

setup();
