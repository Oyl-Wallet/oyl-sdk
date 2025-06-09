# Auto Clock-In 后台运行使用指南

## 🎯 功能概述

Auto Clock-In 服务现在支持完整的后台运行功能，提供了便捷的daemon管理和监控能力。

## 📋 前置要求

1. **环境配置**：确保 `.env` 文件已正确配置
2. **项目构建**：确保项目已编译 (`npm run build`)
3. **PM2安装**：daemon脚本会自动安装PM2（如果未安装）

## 🚀 快速开始

### 使用npm scripts（推荐）

```bash
# 启动后台服务
npm run clock-in:start

# 查看服务状态
npm run clock-in:status

# 查看实时日志
npm run clock-in:logs

# 重启服务
npm run clock-in:restart

# 停止服务
npm run clock-in:stop
```

### 直接使用daemon脚本

```bash
# 启动服务
./scripts/daemon.sh start

# 查看状态
./scripts/daemon.sh status

# 查看日志
./scripts/daemon.sh logs

# 重启服务
./scripts/daemon.sh restart

# 停止服务
./scripts/daemon.sh stop

# 安装PM2（如果需要）
./scripts/daemon.sh install-pm2
```

## 📊 服务监控

### 查看服务状态
```bash
npm run clock-in:status
```
显示内容：
- 服务运行状态
- 内存和CPU使用情况
- 启动时间和重启次数
- 进程ID和日志位置

### 实时日志监控
```bash
npm run clock-in:logs
```
- 显示最近50行日志
- 实时跟踪新日志输出
- 按 `Ctrl+C` 退出日志查看

## 📁 日志管理

日志文件位置：
- `logs/auto-clock-in.log` - 合并日志
- `logs/out.log` - 标准输出日志
- `logs/error.log` - 错误日志

## ⚙️ 高级配置

### PM2 配置 (ecosystem.config.js)

```javascript
module.exports = {
  apps: [{
    name: 'auto-clock-in',
    script: 'lib/scripts/auto-clock-in.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '30s'
  }]
}
```

### 环境变量配置

在 `.env` 文件中设置：
```bash
CLOCK_IN_MNEMONIC="your mnemonic here"
NETWORK_TYPE="mainnet"
SANDSHREW_PROJECT_ID="your project id"
CLOCK_IN_WALLETS=20
CLOCK_IN_INTERVAL=144
BLOCK_CHECK_INTERVAL=10000
```

## 🐧 系统级服务 (可选)

对于生产环境，可以使用systemd管理服务：

1. **安装服务文件**：
   ```bash
   sudo cp scripts/auto-clock-in.service /etc/systemd/system/
   ```

2. **编辑配置**：
   ```bash
   sudo nano /etc/systemd/system/auto-clock-in.service
   # 修改 User, WorkingDirectory, ExecStart 路径
   ```

3. **启用服务**：
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable auto-clock-in
   sudo systemctl start auto-clock-in
   ```

4. **管理服务**：
   ```bash
   sudo systemctl status auto-clock-in
   sudo systemctl restart auto-clock-in
   sudo systemctl stop auto-clock-in
   ```

## 🔧 故障排除

### 常见问题

1. **服务启动失败**：
   - 检查 `.env` 文件是否存在
   - 确认项目已编译 (`npm run build`)
   - 查看错误日志 (`npm run clock-in:logs`)

2. **PM2未安装**：
   - 脚本会自动尝试安装PM2
   - 手动安装：`npm install -g pm2`

3. **权限问题**：
   - 确保脚本有执行权限：`chmod +x scripts/daemon.sh`
   - 确保日志目录可写

4. **内存使用过高**：
   - 服务会在内存使用超过1GB时自动重启
   - 可通过修改 `ecosystem.config.js` 调整限制

### 日志分析

查看错误信息：
```bash
# 查看最近的错误
tail -50 logs/error.log

# 搜索特定错误
grep -i "error\|failed" logs/auto-clock-in.log

# 查看交易相关日志
grep -i "transaction\|clock-in" logs/auto-clock-in.log
```

## 📈 性能监控

### PM2监控命令
```bash
# 实时监控仪表板
pm2 monit

# 查看进程列表
pm2 list

# 查看详细信息
pm2 show auto-clock-in

# 重置统计信息
pm2 reset auto-clock-in
```

### 资源使用情况
- **内存限制**：1GB（可配置）
- **自动重启**：内存超限或异常退出
- **最小运行时间**：30秒
- **重启延迟**：5秒

## 🔄 更新和维护

### 代码更新流程
```bash
# 停止服务
npm run clock-in:stop

# 拉取代码
git pull

# 重新构建
npm run build

# 启动服务
npm run clock-in:start
```

### 定期维护
- 定期检查日志文件大小
- 监控服务运行状态
- 备份重要配置文件
- 更新环境变量配置

## 🆘 技术支持

如需帮助，请：
1. 查看日志文件获取详细错误信息
2. 确认配置文件正确性
3. 检查网络连接和API可用性
4. 联系技术支持团队