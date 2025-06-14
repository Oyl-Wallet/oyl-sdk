# PoW Alkane Miner 使用指南

## 概述

这是一个简化的PoW挖矿脚本，专门用于执行alkanes合约。它会：

1. 🔍 **自动选择UTXO**: 从钱包中自动选择最大的UTXO进行挖矿
2. ⚡ **PoW挖矿**: 寻找满足难度要求的随机数
3. 🔗 **执行合约**: 使用找到的随机数调用alkanes合约

## 快速开始

### 1. 配置环境

```bash
# 复制配置模板
cp scripts/.env.pow-alkane.example .env

# 编辑配置文件
nano .env
```

### 2. 设置必要参数

```bash
# 在 .env 文件中设置
POW_MINER_MNEMONIC="your twelve word mnemonic phrase"
POW_SYMBOL="TESTTOKEN"
POW_DIFFICULTY=4
NETWORK_TYPE=regtest
```

### 3. 运行挖矿

```bash
npm run pow-alkane
```

## 工作流程

```
1. 初始化钱包 → 2. 查询UTXOs → 3. 选择最优UTXO → 4. PoW挖矿 → 5. 执行合约
```

### 详细步骤

1. **钱包初始化**: 使用助记词初始化钱包和签名器
2. **UTXO选择**: 自动查询并选择价值最大的UTXO
3. **PoW挖矿**: 寻找满足难度要求的nonce（随机数）
4. **合约执行**: 使用calldata `[2, 26127, 77, nonce]` 执行alkanes合约

## 配置参数

| 参数 | 说明 | 默认值 | 示例 |
|-----|------|--------|------|
| `POW_MINER_MNEMONIC` | 钱包助记词 | - | `"word1 word2 ..."` |
| `POW_SYMBOL` | 挖矿符号 | `TESTTOKEN` | `"MYTOKEN"` |
| `POW_DIFFICULTY` | 挖矿难度 | `4` | `1-6` |
| `POW_MAX_ATTEMPTS` | 最大尝试次数 | `10000000` | `1000000` |
| `POW_FEE_RATE` | 交易费率 | `10` | `5-50` |
| `NETWORK_TYPE` | 网络类型 | `regtest` | `testnet`, `mainnet` |
| `POW_ALKANE_RECEIVER` | 接收地址 | 挖矿地址 | `bc1p...` |

## 输出示例

```
[2024-01-01T12:00:00.000Z] [INFO] 🚀 Starting PoW Alkane Miner...
[2024-01-01T12:00:00.100Z] [INFO] 🔐 Initializing wallet...
[2024-01-01T12:00:00.200Z] [INFO] ✅ Wallet: bc1p...
[2024-01-01T12:00:00.300Z] [INFO] 🔍 Querying UTXOs...
[2024-01-01T12:00:00.500Z] [INFO] ✅ Selected UTXO: abc123...def:0 (50,000 sats)
[2024-01-01T12:00:00.600Z] [INFO] 🚀 Starting PoW mining for symbol: TESTTOKEN
[2024-01-01T12:00:00.700Z] [INFO]    Difficulty: 4 (Target: 0000...)
[2024-01-01T12:00:30.800Z] [INFO] 🎉 Valid hash found!
[2024-01-01T12:00:30.900Z] [INFO]    Hash: 0000a1b2c3d4...
[2024-01-01T12:00:31.000Z] [INFO]    Nonce: 123456
[2024-01-01T12:00:31.100Z] [INFO]    Attempts: 87543
[2024-01-01T12:00:31.200Z] [INFO] 🔗 Executing alkane contract...
[2024-01-01T12:00:31.300Z] [INFO]    Calldata: [2, 26127, 77, 123456]
[2024-01-01T12:00:35.400Z] [INFO] ✅ Contract executed successfully!
[2024-01-01T12:00:35.500Z] [INFO]    Transaction ID: def456...abc
[2024-01-01T12:00:35.600Z] [INFO] 🎉 PoW Alkane mining completed successfully!
```

## 合约调用详情

脚本会自动构建并执行以下alkanes合约调用：

- **Calldata**: `[2, 26127, 77, nonce]`
- **Protocol Tag**: `1`
- **Edicts**: `[]` (空)
- **Pointer**: `0`
- **Refund Pointer**: `0`

其中 `nonce` 是通过PoW挖矿找到的有效随机数。

## 故障排除

### 常见问题

1. **"POW_MINER_MNEMONIC not found"**
   ```bash
   # 确保.env文件存在且包含助记词
   cp scripts/.env.pow-alkane.example .env
   nano .env
   ```

2. **"No UTXOs found in wallet"**
   ```bash
   # 确保钱包有余额
   # 检查网络配置是否正确
   ```

3. **"Maximum attempts reached"**
   ```bash
   # 降低难度或增加最大尝试次数
   POW_DIFFICULTY=3
   POW_MAX_ATTEMPTS=50000000
   ```

### 调试模式

```bash
# 启用详细日志
LOG_LEVEL=debug npm run pow-alkane
```

## 安全提示

⚠️ **重要安全提醒**:

1. **助记词安全**: 绝不要将助记词提交到版本控制
2. **网络选择**: 开发测试使用regtest，生产使用mainnet时请谨慎
3. **费用设置**: 注意设置合理的费率，避免过高费用

## 性能参考

- **算力**: 约20kH/s (现代CPU)
- **难度4**: 通常需要1-5分钟
- **内存使用**: <50MB
- **网络调用**: 最少2次 (查询UTXO + 广播交易)

---

**版本**: 1.0.0  
**更新**: 2024年  
**许可**: MIT License