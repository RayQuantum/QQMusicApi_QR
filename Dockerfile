# deepseek生成
# 使用 Node.js 官方镜像作为基础镜像
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制包管理文件并安装依赖
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# 复制源代码
COPY . .

# （可选）构建步骤，如前端项目需要
# RUN yarn build

# 使用多阶段构建减小镜像体积
FROM node:18-alpine

WORKDIR /app

# 从构建阶段复制依赖和构建结果
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app ./

# 暴露端口（按实际需要修改）
EXPOSE 3300

# 启动命令
CMD ["yarn", "start"]
