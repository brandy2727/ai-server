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

// 生成学习计划
app.post("/study-plan", async (req, res) => {
  try {
    const { topic, goal, hours } = req.body;

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是一个学习规划助手。根据用户提供的学习主题、目标和可用时间，生成一份详细的学习计划。必须返回合法的 JSON 对象，不要包含 markdown 包裹。"
        },
        {
          role: "user",
          content: `主题：${topic}\n目标：${goal}\n可用时间：${hours}\n\n请生成一份学习计划，返回 JSON 对象格式：{"plan": [{"time": "09:00-10:00", "title": "标题", "task": "具体任务描述", "type": "study"}, ...]}，其中 type 为 "study" 或 "break"。只返回 JSON，不要任何额外文字。`
        }
      ]
    });

    let content = completion.choices[0].message.content.trim();

    // 去掉可能的 markdown 包裹
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();

    const planData = JSON.parse(content);

    // 提取数组：尝试常见 key，或取第一个数组值
    let items = null;
    if (Array.isArray(planData)) {
      items = planData;
    } else {
      const candidates = ["plan", "items", "schedule", "study_plan", "plans", "tasks"];
      for (const key of candidates) {
        if (Array.isArray(planData[key])) {
          items = planData[key];
          break;
        }
      }
      if (!items) {
        // 取第一个数组类型的值
        const vals = Object.values(planData);
        for (const v of vals) {
          if (Array.isArray(v)) { items = v; break; }
        }
      }
      if (!items) items = [];
    }

    // 存入数据库
    db.prepare("INSERT INTO study_plans (topic, plan_data) VALUES (?, ?)").run(topic, JSON.stringify(items));

    res.json(items);
  } catch (error) {
    console.error("Study plan error:", error);
    console.error("Raw response:", completion?.choices?.[0]?.message?.content);
    res.status(500).json({ error: "Failed to generate study plan", detail: error.message });
  }
});

// 获取历史学习计划
app.get("/study-plans", (req, res) => {
  const rows = db.prepare("SELECT * FROM study_plans ORDER BY created_at DESC LIMIT 20").all();
  res.json(rows.map(row => ({
    ...row,
    plan_data: JSON.parse(row.plan_data)
  })));
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
