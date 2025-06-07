# 🚀 RBF (Replace-By-Fee) 完整实现方案

## 📋 当前问题分析

### 1. **现有代码的限制**
- `alkanes.execute()` 没有设置RBF标志 (sequence < 0xfffffffe)
- 没有真正的交易替换逻辑
- 使用相同UTXO会导致双花冲突

### 2. **RBF的技术要求**
- 原始交易必须设置RBF信号 (`sequence < 0xfffffffe`)
- 替换交易必须使用相同的输入
- 替换交易必须支付更高的费用
- 替换交易必须包含RBF信号

## 🛠️ 完整实现方案

### 方案1: 修改alkanes.execute支持RBF (推荐)

#### 1.1 修改addInputForUtxo函数
```typescript
// 在 /src/alkanes/alkanes.ts 中修改
async function addInputForUtxo(
  psbt: bitcoin.Psbt,
  utxo: FormattedUtxo,
  account: Account,
  provider: Provider,
  enableRBF: boolean = false // 新增参数
) {
  const rbfSequence = enableRBF ? 0xfffffffd : 0xffffffff
  
  const type = getAddressType(utxo.address)
  switch (type) {
    case 0: {
      // legacy P2PKH
      const prevHex = await provider.esplora.getTxHex(utxo.txId)
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        nonWitnessUtxo: Buffer.from(prevHex, 'hex'),
        sequence: rbfSequence // 添加序列号
      })
      break
    }
    case 2: {
      // nested SegWit
      const redeem = bitcoin.script.compile([
        bitcoin.opcodes.OP_0,
        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
      ])
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        redeemScript: redeem,
        sequence: rbfSequence, // 添加序列号
        witnessUtxo: {
          value: utxo.satoshis,
          script: bitcoin.script.compile([
            bitcoin.opcodes.OP_HASH160,
            bitcoin.crypto.hash160(redeem),
            bitcoin.opcodes.OP_EQUAL,
          ]),
        },
      })
      break
    }
    case 1: // native P2WPKH
    case 3: // P2TR
    default: {
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        sequence: rbfSequence, // 添加序列号
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      })
    }
  }
}
```

#### 1.2 修改execute函数接口
```typescript
export const execute = async ({
  alkanesUtxos,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
  frontendFee,
  feeAddress,
  alkaneReceiverAddress,
  enableRBF = false // 新增参数
}: {
  alkanesUtxos?: FormattedUtxo[]
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
  frontendFee?: bigint
  feeAddress?: string
  alkaneReceiverAddress?: string
  enableRBF?: boolean // 新增参数
}) => {
  // ... 现有逻辑
  
  // 在添加输入时传递RBF标志
  for (const utxo of gatheredUtxos.utxos) {
    await addInputForUtxo(psbt, utxo, account, provider, enableRBF)
  }
  
  // ... 其余逻辑
}
```

### 方案2: 创建专用的RBF函数

#### 2.1 创建executeWithRBF函数
```typescript
export const executeWithRBF = async ({
  originalTxId,
  utxos,
  account,
  protostone,
  provider,
  newFeeRate,
  signer,
  alkaneReceiverAddress
}: {
  originalTxId: string
  utxos: FormattedUtxo[]
  account: Account
  protostone: Buffer
  provider: Provider
  newFeeRate: number
  signer: Signer
  alkaneReceiverAddress?: string
}) => {
  // 1. 获取原始交易信息
  const originalTx = await provider.esplora.getTx(originalTxId)
  
  // 2. 验证交易支持RBF
  const hasRBFSignal = originalTx.vin.some(input => input.sequence < 0xfffffffe)
  if (!hasRBFSignal) {
    throw new Error('Original transaction does not support RBF')
  }
  
  // 3. 使用相同输入但更高费率创建新交易
  const psbt = new bitcoin.Psbt({ network: provider.network })
  
  // 使用相同的输入
  for (const input of originalTx.vin) {
    const utxo = utxos.find(u => u.txId === input.txid && u.outputIndex === input.vout)
    if (utxo) {
      await addInputForUtxo(psbt, utxo, account, provider, true)
    }
  }
  
  // 添加输出 (调整费用)
  psbt.addOutput({ 
    address: alkaneReceiverAddress || account.taproot.address, 
    value: inscriptionSats 
  })
  psbt.addOutput({ script: protostone, value: 0 })
  
  // 计算并添加找零 (考虑新的费率)
  const totalInput = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)
  const totalOutput = psbt.txOutputs.reduce((sum, o) => sum + o.value, 0)
  const newFee = calculateFee(psbt, newFeeRate)
  const change = totalInput - totalOutput - newFee
  
  if (change >= 546) { // 最小粉尘限制
    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: change,
    })
  }
  
  // 签名并广播
  const formatted = await formatInputsToSign({
    _psbt: psbt,
    senderPublicKey: account.taproot.pubkey,
    network: provider.network,
  })
  
  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: formatted.toBase64(),
    finalize: true,
  })
  
  const pushResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })
  
  return pushResult
}
```

## 🔄 当前的实用解决方案

基于代码复杂性和风险考虑，当前实现了一个**实用的混合方案**：

### 1. **智能UTXO管理**
- 首先尝试使用新的UTXO创建新交易
- 只有在没有可用UTXO时才尝试真正的RBF
- 避免了双花冲突

### 2. **加速控制机制**
- 限制加速尝试次数 (最多3次)
- 防止频繁加速 (最少间隔5分钟)
- 渐进式费率增加

### 3. **详细的日志记录**
- 清楚标记加速尝试和结果
- 区分成功加速和失败情况
- 便于调试和监控

## 📈 建议的实施步骤

### 阶段1: 当前实现 (已完成)
- ✅ 智能UTXO选择加速
- ✅ 加速控制机制  
- ✅ 详细日志记录

### 阶段2: 完整RBF支持
- 🔄 修改alkanes.execute支持RBF标志
- 🔄 实现真正的RBF交易替换
- 🔄 添加RBF交易验证

### 阶段3: 高级功能
- ⏳ 动态费率调整算法
- ⏳ 交易池分析优化
- ⏳ 批量RBF操作

## 🚨 注意事项

### 1. **风险控制**
- RBF可能导致意外的双花
- 需要仔细处理UTXO状态
- 监控网络费率变化

### 2. **性能优化**
- 避免过度频繁的加速
- 合理设置费率上限
- 监控资金使用效率

### 3. **兼容性**
- 确保与现有alkanes系统兼容
- 不影响其他功能的稳定性
- 提供向后兼容的接口