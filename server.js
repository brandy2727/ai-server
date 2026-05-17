const express = require("express");
const OpenAI = require("openai");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");
const path = require("path");

dotenv.config();

// 初始化 SQLite 数据库
const db = new Database(path.join(__dirname, "chat.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    plan_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});

app.post("/chat", async (req, res) => {
  try {
    // 保存用户消息
    db.prepare("INSERT INTO conversations (role, content) VALUES (?, ?)").run("user", req.body.message);

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "user",
          content: req.body.message
        }
      ]
    });

    const reply = completion.choices[0].message;

    // 保存 AI 回复
    db.prepare("INSERT INTO conversations (role, content) VALUES (?, ?)").run(reply.role, reply.content);

    res.json(reply);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI request failed" });
  }
});

// 查看聊天历史
app.get("/history", (req, res) => {
  const rows = db.prepare("SELECT * FROM conversations ORDER BY created_at DESC LIMIT 50").all();
  res.json(rows);
});

// AI 学习计划助手
app.post("/study-plan", async (req, res) => {
  try {
    const { topic, goal, hours } = req.body;

    const systemPrompt = `你是一个 AI 学习计划规划师。根据用户的学习主题、目标和可用时间，制定一份详细的学习计划。
要求：
- 按时间段排列（如 9:00-10:00）
- 每项任务包含：时间、学习内容、具体任务描述
- 计划要合理，劳逸结合
- 返回格式为 JSON 数组：[{ "time": "9:00-10:00", "title": "学习主题", "task": "具体做什么", "type": "study|break" }]
- 只返回 JSON，不要包含 markdown 格式或额外说明`;

    const userPrompt = `主题：${topic || "未指定"}
目标：${goal || "系统学习"}
可用时间：${hours || "全天"}`;

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const planData = JSON.parse(completion.choices[0].message.content);

    // 存入数据库
    db.prepare("INSERT INTO study_plans (topic, plan_data) VALUES (?, ?)").run(
      topic || "未指定",
      JSON.stringify(planData)
    );

    res.json(planData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Study plan generation failed" });
  }
});

// 查看历史学习计划
app.get("/study-plans", (req, res) => {
  const rows = db.prepare("SELECT * FROM study_plans ORDER BY created_at DESC LIMIT 20").all();
  res.json(rows.map(r => ({ ...r, plan_data: JSON.parse(r.plan_data) })));
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
