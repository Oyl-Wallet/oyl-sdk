# 🚀 OYL SDK 完整命令文档

本文档包含OYL SDK的所有可用命令，基于最新源码分析生成，确保命令及参数准确无误。

## 📋 目录

- [基础命令](#基础命令)
- [Alkane 命令](#alkane-命令)
- [自动打卡系统](#自动打卡系统)
- [BTC 命令](#btc-命令)
- [Rune 命令](#rune-命令)
- [BRC20 命令](#brc20-命令)
- [Collectible 命令](#collectible-命令)
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
# 部署新合约 (必需: -data, -c; 可选: -p, -feeRate, -s)
oyl alkane new-contract -data "3,77,100" -c ./contracts/contract.wasm -p bitcoin -feeRate 10 -s "metashrew-rpc-url"

# 部署新代币 (必需: -resNumber, -c, -name, -symbol, -amount; 可选: -pre, -i, -p, -feeRate, -s)
oyl alkane new-token -resNumber 77 -c 100000 -name "OYL" -symbol "OL" -amount 1000 -pre 5000 -i ./image.png -p bitcoin -feeRate 10

# 执行合约 (必需: -data, -alkaneReceiver; 可选: -e, -m, -p, -feeRate, -s)
oyl alkane execute -data "2,1,77" -alkaneReceiver "bc1p..." -e "2:1:333:1" -feeRate 10 -p bitcoin -m "your mnemonic" -s "metashrew-rpc-url"

# 批量执行 (必需: -data, -n, -alkaneReceiver; 可选: -e, -m, -p, -feeRate, -s)
oyl alkane batch-execute -data "2,1,77" -n 100 -alkaneReceiver "bc1p..." -feeRate 10 -p bitcoin -m "your mnemonic" -e "2:1:333:1"

# 精确费用估算 (必需: -data, -feeRate; 可选: -e, -p, -inputCount, -frontendFee, -feeAddress, -alkaneReceiver, -s)
oyl alkane estimate-fee -data "2,1,77" -feeRate 10 -inputCount 1 -frontendFee 1000 -feeAddress "bc1p..." -alkaneReceiver "bc1p..." -p bitcoin -e "2:1:333:1"

# 发送Alkane代币 (必需: -to, -amt, -blk, -tx; 可选: -m, -p, -feeRate, -s)
oyl alkane send -to "bc1p..." -amt 200 -blk 2 -tx 1 -feeRate 5 -p bitcoin -m "your mnemonic"

# 列出所有Alkane资产 (可选: -p, -d)
oyl alkane list -p bitcoin -d

# 追踪交易 (必需: -params; 可选: -p, -s)
oyl alkane trace -params '{"txid":"e6561c7a...", "vout":0}' -p bitcoin -s "metashrew-rpc-url"
```

### AMM 操作

```bash
# 创建流动性池 (必需: -data, -tokens; 可选: -m, -p, -feeRate, -s)
oyl alkane create-pool -data "2,1,1" -tokens "2:12:1500,2:29:1500" -feeRate 5 -p bitcoin -m "your mnemonic"

# 添加流动性 (必需: -data, -tokens; 可选: -m, -p, -feeRate, -s)
oyl alkane add-liquidity -data "2,1,1" -tokens "2:2:50000,2:3:50000" -feeRate 5 -p bitcoin -m "your mnemonic"

# 移除流动性 (必需: -data, -amt, -blk, -tx; 可选: -p, -feeRate, -s)
oyl alkane remove-liquidity -data "2,9,1" -amt 200 -blk 2 -tx 1 -feeRate 5 -p bitcoin

# 代币交换 (必需: -data, -amt, -blk, -tx; 可选: -p, -feeRate, -s)
oyl alkane swap -data "2,7,3,160" -amt 200 -blk 2 -tx 1 -feeRate 5 -p bitcoin

# 预览移除流动性 (必需: -token, -amount; 可选: -p, -s)
oyl alkane preview-remove-liquidity -token "2:1" -amount 1000000 -p bitcoin

# 获取所有池详情 (必需: -target; 可选: -p, -s)
oyl alkane get-all-pools-details -target "2:1" -p bitcoin

# 模拟操作 (必需: -target, -inputs; 可选: -tokens, -decoder, -p, -s)
oyl alkane simulate -target "2:1" -inputs "1,2,6,2,7" -tokens "2:6:1000,2:7:2000" -decoder "factory" -p bitcoin
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

# 检查打卡交易状态
npm run check-clock-status

# 测试RBF加速逻辑
npm run test-rbf-logic

# 查看RBF实现计划
npm run view-rbf-plan

# 费率详细分析
node lib/scripts/test-fee-rates.js
```

### ⚙️ 配置文件 (.env)

```bash
# === 必需配置 ===
CLOCK_IN_MNEMONIC="your mnemonic words here"
NETWORK_TYPE="bitcoin"
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
# 发送BTC (必需: -p, -amt, -t; 可选: -feeRate)
oyl btc send -p bitcoin -t "bc1p..." -amt 100000 -feeRate 10

# UTXO分割 - 自动生成模式 (必需: -p; 可选: -feeRate, -amt, -n)
oyl btc split -p bitcoin -amt 50000 -n 10 -feeRate 10

# UTXO分割 - 指定地址和金额模式 (必需: -p, -amounts, -addresses; 可选: -feeRate, -mode)
oyl btc split -p bitcoin -mode amounts_and_addresses -amounts "100000,200000,300000" -addresses "addr1,addr2,addr3" -feeRate 10
```

## Rune 命令

```bash
# 铸造Rune (必需: -p, -runeId; 可选: -feeRate)
oyl rune mint -p bitcoin -runeId "840000:3" -feeRate 10

# 发送Rune (必需: -p, -t, -runeId, -inscAdd, -amt; 可选: -feeRate)
oyl rune send -p bitcoin -t "bc1p..." -runeId "840000:3" -inscAdd "bc1p..." -amt 100 -feeRate 10

# Rune铭文提交 (必需: -p, -rune-name; 可选: -feeRate)
oyl rune etchCommit -p bitcoin -rune-name "TEST•RUNE" -feeRate 10

# Rune铭文揭示 (必需: -p, -commitId, -scrp, -symbol, -rune-name, -per-mint-amount; 可选: -feeRate, -turbo, -divisibility, -cap, -pre)
oyl rune etchReveal -p bitcoin -commitId "abc123..." -scrp "script_data" -symbol "T" -rune-name "TEST•RUNE" -per-mint-amount 500 -feeRate 10 -divisibility 3 -cap 100000 -pre 1000

# 查询Rune余额 (必需: -p; 可选: -a)
oyl rune balance -p bitcoin -a "bc1p..."
```

## BRC20 命令

```bash
# 发送BRC20代币 (必需: -p, -amt, -t, -tick; 可选: -legacy, -taproot, -nested, -native, -feeRate)
oyl brc20 send -p bitcoin -t "bc1p..." -tick "ordi" -amt 100 -feeRate 10
```

## Collectible 命令

```bash
# 发送Collectible/Inscription (必需: -p, -t, -inscId, -inscAdd; 可选: -feeRate)
oyl collectible send -p bitcoin -t "bc1p..." -inscId "d0c21b35f27ba6361acd5172fcfafe8f4f96d424c80c00b5793290387bcbcf44i0" -inscAdd "bc1p..." -feeRate 10

# 查询Collectible余额 (必需: -p; 可选: -a)
oyl collectible balance -p bitcoin -a "bc1p..."
```

## 账户管理

```bash
# 生成助记词 (无参数)
oyl account generateMnemonic

# 从助记词生成账户信息 (必需: -p; 可选: -i, -w)
oyl account mnemonicToAccount -p bitcoin -i 0 -w "wallet-standard"

# 生成私钥 (必需: -p; 可选: -i)
oyl account privateKeys -p bitcoin -i 0

# 生成多个地址 (必需: -p, -n; 可选: -w)
oyl account generateAddresses -p bitcoin -n 10 -w "wallet-standard"

# 签名PSBT (必需: -p, -f, -e)
oyl account sign -p bitcoin -f yes -e yes
```

## UTXO 管理

```bash
# 查询账户UTXO (必需: -p)
oyl utxo accountUtxos -p bitcoin

# 查询地址UTXO (必需: -p, -a)
oyl utxo addressUtxos -p bitcoin -a "bc1p..."

# 查询账户余额 (必需: -p; 可选: -d)
oyl utxo balance -p bitcoin -d

# 查询地址BRC20余额 (必需: -p, -a)
oyl utxo addressBRC20Balance -p bitcoin -a "bc1p..."

# 查询账户BRC20余额 (必需: -p)
oyl utxo accountBRC20Balance -p bitcoin

# 查询所有资产余额 (必需: -p)
oyl utxo allAssets -p bitcoin
```

## Provider 命令

```bash
# Alkanes Provider调用 (必需: -method; 可选: -params, -p, -s)
oyl provider alkanes -method "getAlkanesByAddress" -params '{"address":"bc1p..."}' -p bitcoin -s "metashrew-rpc-url"

# Ord Provider调用 (必需: -p, -method; 可选: -params)
oyl provider ord -p bitcoin -method "getInscription" -params '{"inscriptionId":"abc123..."}'

# 多调用Sandshrew Provider (必需: -p, -c)
oyl provider sandShrewMulticall -p bitcoin -c '[{"method":"esplora_tx","params":["688f5c239e4e114af461dc1331d02ad5702e795daf2dcf397815e0b05cd23dbc"]},{"method":"btc_getblockcount", "params":[]}]'
```

## Regtest 命令

```bash
# 初始化Regtest环境 (可选: -p, -m, -a)
oyl regtest init -p regtest -m "your mnemonic" -a "bcrt1p..."

# 生成区块 (可选: -p, -a, -c)
oyl regtest genBlocks -p regtest -a "bcrt1p..." -c 6

# 从水龙头发送资金 (必需: -t; 可选: -p, -s)
oyl regtest sendFromFaucet -p regtest -t "bcrt1p..." -s 100000000
```

## 🔧 全局选项

### 网络选择

```bash
-p, --provider <provider>    # 网络类型
# 可选值: bitcoin, regtest, alkanes, oylnet, signet
```

### 助记词选项

```bash
-m, --mnemonic <mnemonic>    # 自定义助记词
# 默认使用环境变量 MNEMONIC 或测试钱包
```

### 费率选项

```bash
-feeRate, --feeRate <feeRate>   # 费率 (sat/vB)
# 建议值: 1-100, 根据网络拥堵调整
```

### Metashrew RPC选项

```bash
-s, --metashrew-rpc-url <url>   # Metashrew JSON-RPC URL覆盖
# 用于alkane相关命令的自定义RPC端点
```

## 📱 环境变量

### 必需变量

```bash
MNEMONIC="your mnemonic here"           # 主助记词
SANDSHREW_PROJECT_ID="project_id"       # Sandshrew项目ID
NETWORK_TYPE="bitcoin"                  # 默认网络
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
oyl alkane new-contract -c ./contract.wasm -data "3,77,100" -p bitcoin

# 2. 部署代币
oyl alkane new-token -resNumber 77 -c 100000 -name "TEST" -symbol "T" -amount 1000 -p bitcoin

# 3. 执行打卡
oyl alkane execute -data "2,1,77" -alkaneReceiver "bc1p..." -feeRate 10 -p bitcoin

# 4. 启动自动打卡
npm run clock-in
```

### 费率优化策略

```bash
# 1. 查看当前费率
npm run test-fees

# 2. 估算精确费用
oyl alkane estimate-fee -data "2,1,77" -feeRate 15 -inputCount 1 -p bitcoin

# 3. 使用建议费率执行
oyl alkane execute -data "2,1,77" -alkaneReceiver "bc1p..." -feeRate 25 -p bitcoin
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
- 🔧 如遇到"Do not know how to serialize a BigInt"错误，运行 `npm run build` 重新编译
- 🚀 自动加速功能：当网络拥堵时会自动使用更高费率创建新交易
- ⚡ 加速限制：每个交易最多加速3次，间隔至少5分钟

---

## 📞 技术支持

如需帮助或反馈问题：
1. 查看详细文档: `scripts/README.md`
2. 运行诊断命令: `npm run test-config`
3. 查看GitHub Issues
4. 联系技术团队

---

🎉 **恭喜！您现在已经掌握了OYL SDK的完整功能！** 🎉