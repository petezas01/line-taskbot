# 🤖 LINE Task Bot
> มอบหมาย → ตามจิก → ตรวจรับ | ระบบบริหารงานในกลุ่ม LINE

## โครงสร้างโปรเจกต์

```
line-taskbot/
├── prisma/
│   └── schema.prisma          # Database Schema
├── src/
│   ├── index.js               # Entry Point + Express Server
│   ├── handlers/
│   │   ├── eventHandler.js    # Route LINE Events
│   │   ├── messageHandler.js  # เฟส 1: รับคำสั่ง + สร้าง Task
│   │   └── postbackHandler.js # เฟส 3: Approve / Reject
│   ├── jobs/
│   │   └── scheduler.js       # เฟส 2: Auto-Remind (cron)
│   ├── services/
│   │   ├── taskService.js     # CRUD Task
│   │   └── memberService.js   # CRUD Member
│   └── utils/
│       ├── lineClient.js      # LINE SDK Client
│       ├── taskParser.js      # แปลงข้อความเป็น Task
│       └── messageBuilder.js  # สร้าง Flex Message
├── .env.example
└── package.json
```

## วิธี Setup

### 1. สร้าง LINE Bot Channel
1. ไปที่ [LINE Developers Console](https://developers.line.biz/)
2. Create Provider → Create Channel → Messaging API
3. Copy **Channel Access Token** และ **Channel Secret**
4. เปิด **Allow bot to join group chats**

### 2. Setup Database (Railway)
```bash
# สมัคร Railway ที่ railway.app
# New Project → Add PostgreSQL
# Copy DATABASE_URL จาก Variables tab
```

### 3. ติดตั้งและ Run

```bash
# Clone และติดตั้ง dependencies
npm install

# Copy config
cp .env.example .env
# แก้ไขค่าใน .env

# Push schema ไป Database
npx prisma db push

# Run development
npm run dev
```

### 4. Deploy ไป Railway

```bash
# ติดตั้ง Railway CLI
npm install -g @railway/cli

# Login และ deploy
railway login
railway init
railway up

# ดู URL ของ webhook
railway open
```

### 5. ตั้ง Webhook ใน LINE Console
```
Webhook URL: https://your-app.railway.app/webhook
```

---

## วิธีใช้งานในกลุ่ม LINE

### สร้างงาน (เฟส 1)
```
/task งาน: เคลียร์แบบ Presentation
@Arm @Po
วันส่ง: อังคาร 10:00
```

### ดูรายการงาน
```
/tasks
```

### ส่งงาน (เฟส 3)
```
https://drive.google.com/...
```
หรือพิมพ์ `done`

---

## ตาราง Cron Schedule

| เวลา | งาน |
|------|-----|
| ทุก 9:00 | Daily Summary — รายชื่อคนดองงาน |
| ทุกชั่วโมง | เช็คงานที่ใกล้ถึงเดดไลน์ (24h / 3h) |
| ทุก 30 นาที | เช็คงาน Overdue — โหมดโหด 🔥 |

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Runtime | Node.js 20 + Express |
| LINE SDK | @line/bot-sdk v9 |
| Database | PostgreSQL + Prisma |
| Scheduler | node-cron |
| Deploy | Railway |
