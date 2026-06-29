// src/utils/lineClient.js
const { Client } = require("@line/bot-sdk");

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

module.exports = { lineClient };
