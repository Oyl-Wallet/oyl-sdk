# 🕐 自动打卡系统使用指南

恭喜！您的自动alkane打卡系统已经完成实现。这是一个智能化的区块监听和多钱包并发打卡解决方案。

## ✅ 系统已实现的功能

### 🎯 核心功能
- ✅ **智能区块监听**: 自动监控比特币区块高度，精确计算打卡时机
- ✅ **多钱包并发**: 支持20个钱包同时执行打卡交易
- ✅ **动态费率策略**: 1.5倍初始费率 + 智能加速机制
- ✅ **完整错误处理**: 网络异常、余额不足等异常处理
- ✅ **详细日志记录**: 操作过程全程可追踪
- ✅ **Webhook通知**: 支持外部系统集成

### 📊 打卡算法
```
起始高度: 899573
打卡间隔: 144区块
打卡时机: 899573, 899717, 899861, 900005...
当前状态: 距离下次打卡 ~980分钟 (98个区块)
```

## 🚀 快速开始

### 1. 测试配置 (推荐第一步)
```bash
npm run test-config
```
验证助记词、网络连接和API状态。

### 2. 启动自动打卡服务
```bash
# 方法一：使用npm命令
npm run clock-in

# 方法二：使用启动脚本
./scripts/start-clock-in.sh

# 方法三：直接运行
node lib/scripts/auto-clock-in.js
```

### 3. 停止服务
按 `Ctrl+C` 或发送 `SIGTERM` 信号优雅停止。

## ⚙️ 配置说明

您的 `.env` 文件已配置如下关键参数：

```bash
# 打卡系统配置
CLOCK_IN_MNEMONIC="stage ordinary..."  # 您的助记词
CLOCK_IN_WALLETS=20                    # 20个钱包并发
CLOCK_IN_CALLDATA="2,21568,103"        # 合约参数
CLOCK_IN_START_HEIGHT=899573           # 起始区块
CLOCK_IN_INTERVAL=144                  # 间隔144区块

# 费率策略 
INITIAL_FEE_MULTIPLIER=1.5             # 初始费率1.5倍
ACCELERATE_FEE_MULTIPLIER=1.2          # 加速费率1.2倍
MAX_FEE_INCREASE=2                     # 最大增幅2 sat/vB
MAX_FEE_RATE=100                       # 费率上限100 sat/vB

# 监控设置
BLOCK_CHECK_INTERVAL=10000             # 10秒检查一次
LOG_LEVEL="info"                       # 日志级别
```

## 📋 运行监控

### 关键日志示例
```
[INFO] Starting Auto Clock-In Service
[INFO] Successfully initialized 20 wallets  
[INFO] Next clock-in target: block 900005 (current: 899907)
[INFO] Preparing for clock-in at block 900005
[INFO] Using initial fee rate: 3 sat/vB (median: 2)
[INFO] Clock-in transactions summary: 20 successful, 0 failed
[INFO] Clock-in round completed: 18/20 transactions confirmed
```

### 钱包地址
系统已初始化20个钱包，主钱包地址：
`bc1p6sh58vjltvyjydedk8aymcfzsm3pxmx2q9mxfp6mfc0zppc2w6eq6jx3qv`

## 💡 工作原理

### 执行流程
1. **准备阶段**: 打卡区块前1个区块开始准备
2. **并发发送**: 20个钱包同时发送打卡交易
3. **智能监控**: 持续监控费率变化和交易状态
4. **动态加速**: 当网络费率上升时自动加速交易
5. **确认检查**: 验证交易是否在目标区块确认
6. **下轮准备**: 清理状态，等待下一轮

### 费率策略
- **初始费率**: 中位费率 × 1.5倍
- **加速条件**: 网络中位费率 > 当前交易费率  
- **加速公式**: `min(中位费率×1.2, 当前费率+2, 100)`

## 🛡️ 安全建议

### 资金管理
- ✅ 确保每个钱包有足够余额（建议≥10,000 sats）
- ✅ 定期检查钱包余额，及时补充资金
- ✅ 监控UTXO状态，避免过度碎片化

### 运行环境
- ✅ 在稳定的服务器环境中运行
- ✅ 确保网络连接稳定
- ✅ 定期备份日志文件

## 🔧 故障排除

### 常见问题

**1. 钱包余额不足**
```bash
[WARN] Wallet 5 has low balance: 5000 sats
```
解决：向该钱包地址转入更多比特币

**2. 网络连接问题**  
```bash
[ERROR] Failed to get block height: Network error
```
解决：检查网络连接和API配置

**3. 交易发送失败**
```bash
[ERROR] Failed to execute clock-in: Insufficient funds
```
解决：检查钱包UTXOs和手续费设置

## 📈 监控和优化

### 性能指标
- 交易成功率：目标 >95%
- 确认及时性：在目标区块确认
- 费率效率：避免过度支付手续费

### 优化建议
1. 根据网络状况调整费率参数
2. 监控钱包余额，自动补充资金
3. 定期清理小额UTXO，优化交易效率

## 🚨 重要提醒

1. **助记词安全**: 妥善保管CLOCK_IN_MNEMONIC，切勿泄露
2. **费率监控**: 关注网络拥堵情况，适时调整费率策略
3. **余额管理**: 保持充足的钱包余额，避免错过打卡
4. **日志监控**: 定期查看日志，及时发现和解决问题

## 📞 支持

如需技术支持或遇到问题，请：
1. 检查日志输出中的错误信息
2. 运行 `npm run test-config` 验证配置
3. 查看 `scripts/README.md` 获取详细文档

---

🎉 **恭喜您！自动打卡系统已就绪，祝您打卡顺利！** 🎉