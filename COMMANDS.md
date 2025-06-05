# 🚀 OYL SDK 完整命令文档

本文档包含OYL SDK的所有可用命令，包括最新的自动打卡功能。

## 📋 目录

- [基础命令](#基础命令)
- [Alkane 命令](#alkane-命令)
- [自动打卡系统](#自动打卡系统)
- [BTC 命令](#btc-命令)
- [Rune 命令](#rune-命令)
- [BRC20 命令](#brc20-命令)
- [账户管理](#账户管理)
- [UTXO 管理](#utxo-管理)
- [Provider 命令](#provider-命令)
- [Regtest 命令](#regtest-命令)

## 基础命令

### 构建和测试

```bash
# 构建项目
npm run build

# 开发模式 (监听文件变化)
npm run dev

# 运行所有测试
npm test

# 代码格式化
npm run prettier
```

## Alkane 命令

### 部署和执行

```bash
# 部署新合约
oyl alkane new-contract \
  -c ./contracts/contract.wasm \
  -data "3,77,100" \
  -p mainnet \
  -feeRate 10

# 部署新代币
oyl alkane new-token \
  -resNumber 77 \
  -c 100000 \
  -name "OYL" \
  -symbol "OL" \
  -amount 1000 \
  -pre 5000 \
  -i ./image.png \
  -p mainnet

# 执行合约
oyl alkane execute \
  -data "2,1,77" \
  -e "2:1:333:1" \
  -feeRate 10 \
  -p mainnet

# 批量执行 (多钱包并发)
oyl alkane batch-execute \
  -data "2,1,77" \
  -n 100 \
  -feeRate 10 \
  -p mainnet
```

### 费用估算

```bash
# 精确费用估算 (用于UTXO分割)
oyl alkane estimate-fee \
  -data "2,1,77" \
  -feeRate 10 \
  -inputCount 1 \
  -frontendFee 1000 \
  -p mainnet
```

### Token 操作

```bash
# 发送Alkane代币
oyl alkane send \
  -to bc1p... \
  -amt 200 \
  -blk 2 \
  -tx 1 \
  -feeRate 5 \
  -p mainnet

# 列出所有Alkane资产
oyl alkane list -p mainnet
```

### AMM 操作

```bash
# 创建流动性池
oyl alkane create-pool \
  -data "2,1,1" \
  -tokens "2:12:1500,2:29:1500" \
  -feeRate 5 \
  -p mainnet

# 添加流动性
oyl alkane add-liquidity \
  -data "2,1,1" \
  -tokens "2:2:50000,2:3:50000" \
  -feeRate 5 \
  -p mainnet

# 移除流动性
oyl alkane remove-liquidity \
  -data "2,9,1" \
  -amt 200 \
  -blk 2 \
  -tx 1 \
  -feeRate 5 \
  -p mainnet

# 代币交换
oyl alkane swap \
  -data "2,7,3,160" \
  -amt 200 \
  -blk 2 \
  -tx 1 \
  -feeRate 5 \
  -p mainnet

# 预览移除流动性
oyl alkane preview-remove-liquidity \
  -token "2:1" \
  -amount 1000000 \
  -p mainnet

# 获取所有池详情
oyl alkane get-all-pools-details \
  -target "2:1" \
  -p mainnet
```

### 模拟和追踪

```bash
# 模拟操作
oyl alkane simulate \
  -target "2:1" \
  -inputs "1,2,6,2,7" \
  -tokens "2:6:1000,2:7:2000" \
  -decoder "factory" \
  -p mainnet

# 追踪交易
oyl alkane trace \
  -params '{"txid":"e6561c7a...", "vout":0}' \
  -p mainnet
```

## 自动打卡系统

### 🎯 核心命令

```bash
# 启动自动打卡服务
npm run clock-in

# 使用启动脚本
./scripts/start-clock-in.sh

# 直接运行
node lib/scripts/auto-clock-in.js
```

### 🧪 测试和诊断

```bash
# 测试完整配置
npm run test-config

# 测试费率查询
npm run test-fees

# 费率详细分析
node lib/scripts/test-fee-rates.js
```

### ⚙️ 配置文件 (.env)

```bash
# === 必需配置 ===
CLOCK_IN_MNEMONIC="your mnemonic words here"
NETWORK_TYPE="mainnet"
SANDSHREW_PROJECT_ID="your_project_id"

# === 打卡系统配置 ===
CLOCK_IN_WALLETS=20                    # 钱包数量
CLOCK_IN_CALLDATA="2,21568,103"        # 合约调用参数
CLOCK_IN_START_HEIGHT=899573           # 起始区块高度
CLOCK_IN_INTERVAL=144                  # 打卡间隔(区块数)

# === 费率策略 ===
INITIAL_FEE_MULTIPLIER=1.5             # 初始费率倍数
ACCELERATE_FEE_MULTIPLIER=1.2          # 加速费率倍数
MAX_FEE_INCREASE=2                     # 最大费率增幅
MAX_FEE_RATE=100                       # 最大费率限制

# === 监控配置 ===
BLOCK_CHECK_INTERVAL=10000             # 区块检查间隔(毫秒)
LOG_LEVEL="info"                       # 日志级别
WEBHOOK_URL="https://your-webhook.com" # 通知URL(可选)
```

### 📊 打卡时机计算

```bash
# 打卡公式
打卡区块 = 起始高度 + (轮次 × 间隔)

# 示例时间表
起始高度: 899573
间隔: 144区块 (~24小时)
打卡时机: 899573, 899717, 899861, 900005...
```

## BTC 命令

```bash
# 发送BTC
oyl btc send \
  -to bc1p... \
  -amount 100000 \
  -feeRate 10 \
  -p mainnet

# UTXO分割
oyl btc split \
  -amount 50000 \
  -count 10 \
  -feeRate 10 \
  -p mainnet

# 均匀分割模式
oyl btc split \
  -totalAmount 500000 \
  -count 10 \
  -feeRate 10 \
  -p mainnet
```

## Rune 命令

```bash
# 铸造Rune
oyl rune mint \
  -id "840000:3" \
  -to bc1p... \
  -feeRate 10 \
  -p mainnet

# 发送Rune
oyl rune send \
  -id "840000:3" \
  -to bc1p... \
  -amount 100 \
  -feeRate 10 \
  -p mainnet

# Rune铭文提交
oyl rune etch-commit \
  -name "TEST•RUNE" \
  -symbol "T" \
  -supply 21000000 \
  -feeRate 10 \
  -p mainnet

# Rune铭文揭示
oyl rune etch-reveal \
  -commitTxId "abc123..." \
  -feeRate 10 \
  -p mainnet
```

## BRC20 命令

```bash
# 发送BRC20代币
oyl brc20 send \
  -to bc1p... \
  -tick "ordi" \
  -amount 100 \
  -feeRate 10 \
  -p mainnet

# 查询BRC20余额
oyl utxo address-brc20-balance \
  -address bc1p... \
  -p mainnet
```

## 账户管理

```bash
# 生成助记词
oyl account generate-mnemonic

# 从助记词生成账户信息
oyl account mnemonic-to-account \
  -mnemonic "abandon abandon..." \
  -p mainnet

# 生成私钥
oyl account private-keys \
  -mnemonic "abandon abandon..." \
  -p mainnet

# 生成地址
oyl account generate-addresses \
  -mnemonic "abandon abandon..." \
  -count 10 \
  -p mainnet

# 签名PSBT
oyl account sign-psbt \
  -psbt "cHNidP8..." \
  -mnemonic "abandon abandon..." \
  -p mainnet
```

## UTXO 管理

```bash
# 查询账户UTXO
oyl utxo account-utxos-to-spend \
  -p mainnet

# 查询地址UTXO
oyl utxo address-utxos-to-spend \
  -address bc1p... \
  -p mainnet

# 查询账户余额
oyl utxo account-available-balance \
  -p mainnet
```

## Provider 命令

```bash
# Alkanes Provider调用
oyl provider alkanes \
  -method "getAlkanesByAddress" \
  -params '{"address":"bc1p..."}' \
  -p mainnet

# Ord Provider调用
oyl provider ord \
  -method "getInscription" \
  -params '{"inscriptionId":"abc123..."}' \
  -p mainnet

# 多调用Sandshrew Provider
oyl provider multicall-sandshrew \
  -method "getBlockHeight" \
  -p mainnet
```

## Regtest 命令

```bash
# 初始化Regtest环境
oyl regtest init

# 生成区块
oyl regtest gen-blocks -count 6

# 从水龙头发送资金
oyl regtest send-from-faucet \
  -to bcrt1p... \
  -amount 100000000
```

## 🔧 全局选项

### 网络选择
```bash
-p, --provider <provider>    # 网络类型
# 可选值: mainnet, testnet, signet, regtest, alkanes, oylnet
```

### 助记词选项
```bash
-m, --mnemonic <mnemonic>    # 自定义助记词
# 默认使用环境变量 MNEMONIC 或测试钱包
```

### 费率选项
```bash
-feeRate, --feeRate <rate>   # 费率 (sat/vB)
# 建议值: 1-100, 根据网络拥堵调整
```

## 📱 环境变量

### 必需变量
```bash
MNEMONIC="your mnemonic here"           # 主助记词
SANDSHREW_PROJECT_ID="project_id"       # Sandshrew项目ID
NETWORK_TYPE="mainnet"                  # 默认网络
```

### 自动打卡专用
```bash
CLOCK_IN_MNEMONIC="clock in mnemonic"   # 打卡专用助记词
CLOCK_IN_WALLETS=20                     # 打卡钱包数量
CLOCK_IN_CALLDATA="2,21568,103"         # 合约参数
CLOCK_IN_START_HEIGHT=899573            # 起始高度
CLOCK_IN_INTERVAL=144                   # 打卡间隔
```

## 🎯 使用示例

### 完整的Alkane工作流
```bash
# 1. 部署合约
oyl alkane new-contract -c ./contract.wasm -data "3,77,100" -p mainnet

# 2. 部署代币
oyl alkane new-token -resNumber 77 -c 100000 -name "TEST" -symbol "T" -amount 1000

# 3. 执行打卡
oyl alkane execute -data "2,1,77" -feeRate 10

# 4. 启动自动打卡
npm run clock-in
```

### 费率优化策略
```bash
# 1. 查看当前费率
npm run test-fees

# 2. 估算精确费用
oyl alkane estimate-fee -data "2,1,77" -feeRate 15 -inputCount 1

# 3. 使用建议费率执行
oyl alkane execute -data "2,1,77" -feeRate 25
```

## 🚨 注意事项

### 安全提醒
- 🔐 妥善保管助记词，切勿泄露
- 💰 确保钱包有足够余额支付手续费
- 🌐 主网操作需要有效的SANDSHREW_PROJECT_ID
- 📊 监控网络拥堵，适时调整费率

### 性能优化
- 🚀 使用批量操作提高效率
- 💎 合理管理UTXO，避免过度碎片化
- ⚡ 设置合适的费率，平衡速度和成本
- 📈 使用自动打卡减少手动操作

### 故障排除
- 📋 运行 `npm run test-config` 验证配置
- 🔍 查看日志文件排查问题
- 🌐 检查网络连接和API状态
- 💰 确认钱包余额充足

---

## 📞 技术支持

如需帮助或反馈问题：
1. 查看详细文档: `scripts/README.md`
2. 运行诊断命令: `npm run test-config`
3. 查看GitHub Issues
4. 联系技术团队

---

🎉 **恭喜！您现在已经掌握了OYL SDK的完整功能！** 🎉