# PoW Alkane Miner

简化的PoW挖矿脚本，自动选择UTXO并执行alkanes合约。

## 文件说明

- `pow-alkane-miner.ts` - 主要挖矿脚本
- `demo-pow-alkane.ts` - 演示脚本
- `.env.pow-alkane.example` - 配置模板
- `POW_ALKANE_USAGE.md` - 详细使用说明
- `README_POW_ALKANE.md` - 完整技术文档

## 快速使用

### 1. 演示测试
```bash
npm run demo-pow-alkane
```

### 2. 实际使用
```bash
# 配置环境
cp scripts/.env.pow-alkane.example .env
nano .env  # 设置 POW_MINER_MNEMONIC

# 运行挖矿
npm run pow-alkane
```

## 功能说明

1. **自动选择UTXO** - 查询钱包并选择最大的UTXO
2. **PoW挖矿** - 寻找满足难度要求的随机数
3. **执行合约** - 使用calldata `[2, 26127, 77, 随机数]` 调用alkanes合约

## 配置参数

```bash
POW_MINER_MNEMONIC="your mnemonic"    # 必需：钱包助记词
POW_SYMBOL="TESTTOKEN"                # 挖矿符号
POW_DIFFICULTY=4                      # 难度(1-6)
NETWORK_TYPE=regtest                  # 网络类型
POW_FEE_RATE=10                       # 费率(sat/vB)
```

详细说明请查看 `POW_ALKANE_USAGE.md`