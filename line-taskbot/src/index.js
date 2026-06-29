// src/index.js — Entry Point
require("dotenv").config();
const express = require("express");
const { middleware } = require("@line/bot-sdk");
const { handleEvent } = require("./handlers/eventHandler");
const { startScheduler } = require("./jobs/scheduler");

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// LINE Webhook endpoint
app.post("/webhook", middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => res.send("LINE Task Bot is running 🤖"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  startScheduler(); // เริ่ม cron jobs
});
