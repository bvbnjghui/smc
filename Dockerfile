# 使用 Node.js 20 作為基礎映像
FROM node:20-slim

# 設定工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝依賴套件
RUN npm install

# 複製所有應用程式檔案到容器中
COPY . .

# Cloud Run 會自動將流量導向這個 port，所以我們需要公開它
EXPOSE 8080

# 定義容器啟動時執行的命令
CMD [ "node", "server.js" ]
