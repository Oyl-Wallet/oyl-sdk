# 自动打卡脚本 (Auto Clock-In Service)

这是一个自动监听区块高度并执行alkane合约打卡的服务脚本。

## 功能特性

- 🕐 **自动区块监听**: 持续监控比特币区块高度
- 📊 **多钱包并发**: 支持最多20个钱包同时打卡
- ⚡ **智能费率策略**: 动态费率调整和交易加速
- 🔔 **实时通知**: 支持Webhook通知
- 📝 **详细日志**: 完整的操作日志记录
- 🛡️ **错误处理**: 完善的异常处理和重试机制

## 配置说明

### 环境变量配置 (.env)

```bash
# 打卡助记词 (必需)
CLOCK_IN_MNEMONIC="your mnemonic words here"

# 网络类型 (必需)
NETWORK_TYPE="mainnet"

# Sandshrew项目ID (主网必需)
SANDSHREW_PROJECT_ID="your_project_id"

# 打卡系统配置
CLOCK_IN_WALLETS=20                    # 钱包数量
CLOCK_IN_CALLDATA="2,21568,103"        # 合约调用参数
CLOCK_IN_START_HEIGHT=899573           # 起始区块高度
CLOCK_IN_INTERVAL=144                  # 打卡间隔(区块数)

# 费率配置
INITIAL_FEE_MULTIPLIER=1.5             # 初始费率倍数
ACCELERATE_FEE_MULTIPLIER=1.2          # 加速费率倍数
MAX_FEE_INCREASE=2                     # 最大费率增幅
MAX_FEE_RATE=100                       # 最大费率限制

# 监控配置
BLOCK_CHECK_INTERVAL=10000             # 区块检查间隔(毫秒)
LOG_LEVEL="info"                       # 日志级别
WEBHOOK_URL="https://your-webhook.com" # 通知URL(可选)
```

## 使用方法

### 1. 安装依赖

```bash
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 配置环境变量

复制并编辑 `.env` 文件，填入您的配置。

### 4. 启动服务

#### 方法一：使用启动脚本 (推荐)

```bash
./scripts/start-clock-in.sh
```

#### 方法二：直接运行

```bash
node lib/scripts/auto-clock-in.js
```

#### 方法三：使用TypeScript直接运行

```bash
npx ts-node scripts/auto-clock-in.ts
```

## 工作原理

### 打卡时机计算

脚本会根据以下公式计算打卡区块：

```
打卡区块 = 起始高度 + (轮次 × 间隔)
```

例如：
- 起始高度：899573
- 间隔：144区块
- 第1次打卡：899573
- 第2次打卡：899717 (899573 + 144)
- 第3次打卡：899861 (899573 + 144×2)

### 费率策略

1. **初始费率**: 中位费率 × 1.5倍
2. **加速条件**: 当前中位费率 > 交易费率时触发
3. **加速公式**: `min(中位费率×1.2, 当前费率+2, 最大费率)`

### 执行流程

1. **准备阶段**: 在打卡区块前1个区块开始准备
2. **交易发送**: 20个钱包并发发送交易
3. **监控加速**: 持续监控费率并在需要时加速交易
4. **确认检查**: 确认交易是否在目标区块被打包
5. **下轮准备**: 清理状态，准备下一轮监听

## 监控和日志

### 日志级别

- `debug`: 详细调试信息
- `info`: 一般信息 (默认)
- `warn`: 警告信息
- `error`: 错误信息

### 关键日志示例

```
[2024-01-15T10:30:00.000Z] [INFO] Starting Auto Clock-In Service
[2024-01-15T10:30:01.000Z] [INFO] Successfully initialized 20 wallets
[2024-01-15T10:30:02.000Z] [INFO] Next clock-in target: block 899717 (current: 899715)
[2024-01-15T10:32:00.000Z] [INFO] Preparing for clock-in at block 899717
[2024-01-15T10:32:01.000Z] [INFO] Using initial fee rate: 15 sat/vB (median: 10)
[2024-01-15T10:32:05.000Z] [INFO] Clock-in transactions summary: 20 successful, 0 failed
[2024-01-15T10:34:00.000Z] [INFO] Target block 899717 reached (current: 899717)
[2024-01-15T10:34:10.000Z] [INFO] Clock-in round completed: 18/20 transactions confirmed
```

## Webhook通知

如果配置了 `WEBHOOK_URL`，服务会在以下事件发生时发送通知：

### 交易发送通知

```json
{
  "timestamp": "2024-01-15T10:32:05.000Z",
  "service": "auto-clock-in",
  "type": "clock_in_sent",
  "targetHeight": 899717,
  "successCount": 20,
  "failureCount": 0,
  "feeRate": 15
}
```

### 打卡完成通知

```json
{
  "timestamp": "2024-01-15T10:34:10.000Z",
  "service": "auto-clock-in",
  "type": "clock_in_completed",
  "targetHeight": 899717,
  "confirmedCount": 18,
  "totalWallets": 20
}
```

## 注意事项

### 资金管理

- 确保每个钱包都有足够的余额（建议至少10,000 sats）
- 定期检查钱包余额，及时补充资金
- 考虑UTXO管理，避免UTXO过度碎片化

### 网络配置

- 主网操作需要有效的 `SANDSHREW_PROJECT_ID`
- 确保网络连接稳定，避免API调用失败
- 建议在稳定的服务器环境中运行

### 费率策略

- 根据网络拥堵情况调整费率参数
- 设置合理的最大费率限制，避免过度消耗
- 监控交易确认情况，优化费率策略

## 故障排除

### 常见问题

1. **钱包余额不足**
   ```
   [WARN] Wallet 5 (bc1p...) has low balance: 5000 sats
   ```
   解决方案：向该钱包地址转入更多比特币

2. **API调用失败**
   ```
   [ERROR] Failed to get block height: Network error
   ```
   解决方案：检查网络连接和API配置

3. **交易发送失败**
   ```
   [ERROR] Failed to execute clock-in for wallet 10: Insufficient funds
   ```
   解决方案：检查钱包UTXOs和余额

### 停止服务

按 `Ctrl+C` 优雅停止服务，或发送 `SIGTERM` 信号：

```bash
kill -TERM <process_id>
```

## 开发和扩展

### 代码结构

```
scripts/
├── auto-clock-in.ts        # 主服务代码
├── start-clock-in.sh       # 启动脚本
└── README.md               # 文档
```

### 主要类和方法

- `AutoClockInService`: 主服务类
- `initializeWallets()`: 初始化钱包
- `calculateNextClockInHeight()`: 计算下次打卡高度
- `sendClockInTransactions()`: 发送打卡交易
- `monitorAndAccelerateTransactions()`: 监控和加速交易

### 扩展建议

1. 添加数据库支持，记录历史打卡数据
2. 实现更智能的费率预测算法
3. 支持多个不同的打卡合约
4. 添加Web管理界面
5. 集成更多通知渠道（邮件、Telegram等）

## 支持

如有问题或建议，请联系开发团队或提交Issue。