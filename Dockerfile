# 1. Build 階段：安裝依賴、建立靜態資源
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# 安全地安裝依賴，不帶 devDependencies
COPY package*.json ./
RUN npm ci --omit=dev

# 複製原始碼並 build 前端／回測前端資源
COPY . .
RUN npm run build || echo "No build step defined (or front-end build failed)"

# 2. Runtime 階段：只帶必要檔案，使用非 root user，設好環境
FROM node:18-alpine AS runtime
WORKDIR /usr/src/app

# 建立非 root user（使用內建 node user）
USER node

# 設定為 production 模式
ENV NODE_ENV=production
# Cloud Run 預設會給 $PORT，避免格式問題這裡也設個預設值
ENV PORT=8080

# 複製從 builder 階段產出的內容
COPY --from=builder --chown=node:node /usr/src/app ./

# 暴露內部監聽端口（可選）
EXPOSE 8080

# 啟動伺服器（請 server.js 使用 process.env.PORT）
CMD ["node", "server.js"]
