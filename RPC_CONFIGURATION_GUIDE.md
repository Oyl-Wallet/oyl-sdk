# RPC配置指南

## 概述

OYL SDK现在支持通过`.env`文件配置自定义的比特币RPC提供者，让您可以使用自己的Bitcoin Core节点、Esplora API或其他自定义RPC服务来广播交易，而不仅限于Sandshrew服务。

## 🚀 快速开始

### 1. 配置.env文件

在项目根目录的`.env`文件中添加RPC配置：

```env
# RPC 提供者类型
# 选项: sandshrew | bitcoin-core | esplora | custom
RPC_PROVIDER="bitcoin-core"

# Bitcoin Core RPC 配置
BITCOIN_RPC_URL="http://127.0.0.1:8332"
BITCOIN_RPC_USERNAME="bitcoin"
BITCOIN_RPC_PASSWORD="your-password"
```

### 2. 测试配置

运行测试命令验证配置：

```bash
npm run test-rpc
```

### 3. 查看详细配置

```bash
npm run rpc-config
```

## 📝 支持的RPC提供者

### 1. Sandshrew (默认)

无需额外配置，使用现有的`SANDSHREW_PROJECT_ID`。

```env
RPC_PROVIDER="sandshrew"
SANDSHREW_PROJECT_ID="your-project-id"
```

### 2. Bitcoin Core

连接到本地或远程的Bitcoin Core节点。

```env
RPC_PROVIDER="bitcoin-core"
BITCOIN_RPC_URL="http://127.0.0.1:8332"
BITCOIN_RPC_USERNAME="bitcoin"
BITCOIN_RPC_PASSWORD="your-rpc-password"
BITCOIN_RPC_TIMEOUT=30000
```

### 3. Esplora API

使用Blockstream或其他Esplora兼容的API。

```env
RPC_PROVIDER="esplora"
ESPLORA_API_URL="https://blockstream.info/api"
# ESPLORA_API_KEY="your-api-key"  # 可选
```

### 4. 自定义RPC

连接到自定义的HTTP API。

```env
RPC_PROVIDER="custom"
CUSTOM_RPC_URL="https://your-rpc-service.com/api"
CUSTOM_RPC_API_KEY="your-api-key"
CUSTOM_RPC_TIMEOUT=30000
```

## 🌐 网络特定配置

您可以为不同的网络配置不同的RPC端点：

```env
# 主网RPC
MAINNET_RPC_URL="http://mainnet-node:8332"

# 测试网RPC  
TESTNET_RPC_URL="http://testnet-node:18332"

# 回归测试网RPC
REGTEST_RPC_URL="http://regtest-node:18443"

# Signet RPC
SIGNET_RPC_URL="http://signet-node:38332"
```

## 🔧 API使用

### 基础用法

```typescript
import { createRpcClient } from './src/rpclient/rpcFactory'

// 创建RPC客户端
const client = createRpcClient('mainnet')

// 广播交易
const txId = await client.sendRawTransaction(rawTx)
```

### 自定义RPC广播

```typescript
import { broadcastSingleTransactionWithRpc } from './src/alkanes/transactionBroadcaster'

// 使用自定义RPC广播交易
const result = await broadcastSingleTransactionWithRpc(
  psbtHex,
  expectedTxId,
  undefined, // 使用默认客户端
  'mainnet'
)
```

### 链式交易广播

```typescript
import { broadcastTransactionChainWithRpc } from './src/alkanes/transactionBroadcaster'

// 广播Project Snowball交易链
const result = await broadcastTransactionChainWithRpc({
  parentTransaction,
  childTransactions,
  networkType: 'mainnet'
})
```

## 🧪 测试和验证

### 运行完整测试

```bash
npm run test-rpc
```

测试包括：
- ✅ 配置读取验证
- ✅ RPC连接测试
- ✅ 网络特定连接测试
- ✅ 模拟交易测试
- ✅ 性能基准测试

### 查看配置详情

```bash
npm run rpc-config
```

### 手动测试

```bash
npx ts-node src/cli/rpc-test.ts help
```

## 🔒 安全最佳实践

### 1. 凭据保护

- ✅ 使用`.env`文件存储敏感信息
- ✅ 确保`.env`文件在`.gitignore`中
- ✅ 使用强密码和API密钥
- ❌ 不要在代码中硬编码凭据

### 2. 网络安全

- ✅ 使用HTTPS连接
- ✅ 启用RPC SSL/TLS（如果支持）
- ✅ 限制RPC访问IP
- ❌ 不要暴露RPC到公网

### 3. 权限控制

```bash
# Bitcoin Core节点建议配置
rpcallowip=127.0.0.1
rpcssl=true
rpcuser=bitcoin
rpcpassword=strong-random-password
```

## 🚨 故障排除

### 常见问题

#### 1. 连接被拒绝

```
Error: RPC请求失败: 401 Unauthorized
```

**解决方案：**
- 检查用户名和密码
- 确认RPC端口正确
- 验证节点RPC配置

#### 2. 网络超时

```
Error: Request timed out
```

**解决方案：**
- 增加超时时间：`BITCOIN_RPC_TIMEOUT=60000`
- 检查网络连接
- 确认节点运行状态

#### 3. 交易被拒绝

```
Error: Transaction rejected by mempool
```

**解决方案：**
- 检查交易费率
- 验证UTXO有效性
- 确认网络类型匹配

### 调试步骤

1. **验证配置**
   ```bash
   npm run rpc-config
   ```

2. **测试连接**
   ```bash
   npm run test-rpc
   ```

3. **查看日志**
   ```bash
   # 启用详细日志
   LOG_LEVEL="debug"
   ```

## 📈 性能优化

### 1. 连接池配置

```env
# 超时设置
BITCOIN_RPC_TIMEOUT=30000
ESPLORA_RPC_TIMEOUT=15000
```

### 2. 网络选择

- **本地节点**: 最快，最可靠
- **Esplora API**: 中等速度，无需维护节点
- **远程RPC**: 速度取决于网络延迟

### 3. 监控建议

```typescript
// 添加性能监控
const startTime = Date.now()
const result = await client.sendRawTransaction(rawTx)
const duration = Date.now() - startTime
console.log(`广播耗时: ${duration}ms`)
```

## 🛠️ 开发指南

### 添加新的RPC提供者

1. 实现`IRpcClient`接口
2. 在`rpcFactory.ts`中注册
3. 添加配置选项
4. 更新测试套件

### 自定义广播逻辑

```typescript
import { IRpcClient } from './src/rpclient/rpcConfig'

class MyCustomRpcClient implements IRpcClient {
  async sendRawTransaction(rawTx: string): Promise<string> {
    // 自定义实现
  }
}
```

## 📚 参考资料

- [Bitcoin Core RPC文档](https://bitcoincore.org/en/doc/)
- [Esplora API文档](https://github.com/Blockstream/esplora/blob/master/API.md)
- [Project Snowball技术文档](./CHAIN_MINT_USAGE.md)

## 🆘 获取帮助

如果遇到问题，请：

1. 查看本文档的故障排除部分
2. 运行诊断命令：`npm run test-rpc`
3. 查看项目Issues页面
4. 联系技术支持团队

---

**注意**: 使用自定义RPC配置前，请确保理解相关的安全风险和性能影响。建议在测试环境中充分验证后再用于生产环境。