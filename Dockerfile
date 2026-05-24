FROM node:20-slim

# 安装 better-sqlite3 编译所需的构建工具
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 创建数据目录（用于持久化 SQLite 数据库）
RUN mkdir -p /app/data

EXPOSE 3000

# 判断 data 目录下是否有 chat.db，有则使用，没有则新建
CMD ["sh", "-c", "test -f /app/data/chat.db || cp -n /dev/null /app/data/chat.db 2>/dev/null; ln -sf /app/data/chat.db /app/chat.db && node server.js"]
