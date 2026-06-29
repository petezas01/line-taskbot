// src/utils/messageBuilder.js
// สร้าง Flex Message สำหรับ Task Card

const dayjs = require("dayjs");

function buildTaskCard(task, assignees, creator) {
  const deadlineStr = dayjs(task.deadline).format("ddd D MMM HH:mm น.");
  const assigneeNames = assignees.map((a) => `@${a.displayName}`).join("  ");

  return {
    type: "flex",
    altText: `📋 งานใหม่: ${task.title}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#5B5FEF",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "📋 งานใหม่",
            color: "#ffffff",
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text: task.title,
            color: "#ffffff",
            size: "lg",
            weight: "bold",
            wrap: true,
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "👤 ผู้รับผิดชอบ", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: assigneeNames, size: "sm", weight: "bold", flex: 3, wrap: true },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "📅 กำหนดส่ง", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: deadlineStr, size: "sm", weight: "bold", flex: 3, color: "#E53935" },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "👨‍💼 สั่งโดย", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: creator.displayName, size: "sm", flex: 3 },
            ],
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "box",
                layout: "vertical",
                backgroundColor: "#FFF9C4",
                cornerRadius: "6px",
                paddingAll: "8px",
                contents: [{ type: "text", text: "⏳ รอดำเนินการ", size: "xs", color: "#F57F17", weight: "bold" }],
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#5B5FEF",
            action: {
              type: "postback",
              label: "📤 ส่งงาน",
              data: `action=submit&taskId=${task.id}`,
            },
          },
        ],
      },
    },
  };
}

module.exports = { buildTaskCard };
