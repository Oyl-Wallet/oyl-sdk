# ⚡ OYL SDK 快速参考

## 🔥 最常用命令

### 自动打卡系统
```bash
npm run clock-in          # 启动自动打卡
npm run test-config       # 测试配置
npm run test-fees         # 查看费率
```

### Alkane 核心操作
```bash
# 执行打卡
oyl alkane execute -data "2,21568,103" -feeRate 25 -p mainnet

# 费用估算
oyl alkane estimate-fee -data "2,21568,103" -feeRate 15 -p mainnet

# 批量执行
oyl alkane batch-execute -data "2,21568,103" -n 20 -feeRate 25 -p mainnet

# 查看资产
oyl alkane list -p mainnet
```

### 基础操作
```bash
npm run build            # 构建项目
npm test                 # 运行测试
oyl account generate-mnemonic  # 生成助记词
```

## 📊 费率建议

| 优先级 | 费率范围 | 确认时间 | 使用场景 |
|--------|----------|----------|-----------|
| 🚀 快速 | 20-30 sat/vB | 1-3 区块 | 紧急打卡 |
| ⚡ 标准 | 10-20 sat/vB | 3-6 区块 | 正常操作 |
| 💰 经济 | 2-10 sat/vB | 6-24 区块 | 不急操作 |

## 🎯 打卡时间表

```
起始: 899573 (已完成)
间隔: 144 区块 (~24小时)
下次: 900005 (约16小时后)
```

## 🚨 紧急命令

```bash
# 检查配置
npm run test-config

# 查看当前费率
npm run test-fees

# 停止服务
Ctrl+C

# 检查余额
oyl alkane list -p mainnet
```

## 📱 环境配置

```bash
# 必需设置
CLOCK_IN_MNEMONIC="your mnemonic"
NETWORK_TYPE="mainnet" 
SANDSHREW_PROJECT_ID="your_id"
```

---
📖 **完整文档**: 查看 `COMMANDS.md` 获取详细说明