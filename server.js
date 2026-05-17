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

const app = express();

app.use(express.json());

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

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
