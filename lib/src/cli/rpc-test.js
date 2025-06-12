#!/usr/bin/env ts-node
"use strict";
/**
 * RPC配置测试工具
 *
 * 用于测试和验证.env文件中配置的RPC设置
 * 支持连接测试、配置验证、性能测试等功能
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.showDetailedConfig = exports.runAllTests = void 0;
const tslib_1 = require("tslib");
const rpcConfig_1 = require("../rpclient/rpcConfig");
const rpcFactory_1 = require("../rpclient/rpcFactory");
const dotenv = tslib_1.__importStar(require("dotenv"));
// 加载环境变量
dotenv.config();
// ============================================================================
// 测试函数
// ============================================================================
/**
 * 测试RPC配置读取
 */
async function testConfigLoading() {
    const startTime = Date.now();
    try {
        const config = (0, rpcConfig_1.loadRpcConfig)();
        const validation = (0, rpcConfig_1.validateRpcConfig)(config);
        if (!validation.isValid) {
            return {
                testName: '配置读取',
                success: false,
                message: `配置无效: ${validation.errors.join(', ')}`,
                duration: Date.now() - startTime
            };
        }
        return {
            testName: '配置读取',
            success: true,
            message: `配置读取成功，提供者: ${config.provider}`,
            duration: Date.now() - startTime
        };
    }
    catch (error) {
        return {
            testName: '配置读取',
            success: false,
            message: '配置读取失败',
            duration: Date.now() - startTime,
            error: error.message
        };
    }
}
/**
 * 测试RPC连接
 */
async function testRpcConnectivity(networkType) {
    const startTime = Date.now();
    try {
        const result = await (0, rpcFactory_1.testRpcConnection)(networkType);
        if (result.success) {
            return {
                testName: `RPC连接${networkType ? ` (${networkType})` : ''}`,
                success: true,
                message: `连接成功，提供者: ${result.provider}`,
                duration: Date.now() - startTime
            };
        }
        else {
            return {
                testName: `RPC连接${networkType ? ` (${networkType})` : ''}`,
                success: false,
                message: `连接失败: ${result.error}`,
                duration: Date.now() - startTime,
                error: result.error
            };
        }
    }
    catch (error) {
        return {
            testName: `RPC连接${networkType ? ` (${networkType})` : ''}`,
            success: false,
            message: '连接测试失败',
            duration: Date.now() - startTime,
            error: error.message
        };
    }
}
/**
 * 测试模拟交易广播
 */
async function testMockBroadcast() {
    const startTime = Date.now();
    try {
        const client = (0, rpcFactory_1.createRpcClient)();
        // 创建一个模拟的原始交易（无效的，只用于测试）
        const mockRawTx = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff08044c86041b020602ffffffff0100f2052a010000004341041b0e8c2567c12536aa13357b79a073dc4444acb83c4ec7a0e2f99dd7457516c5817242da796924ca4e99947d087fedf9ce467cb9f7c6287078f801df276fdf84ac0000000';
        // 只测试testMemPoolAccept方法（如果支持）
        if (client.testMemPoolAccept) {
            const canAccept = await client.testMemPoolAccept(mockRawTx);
            return {
                testName: '模拟广播测试',
                success: true,
                message: `交易池测试完成，接受状态: ${canAccept}`,
                duration: Date.now() - startTime
            };
        }
        else {
            return {
                testName: '模拟广播测试',
                success: true,
                message: 'RPC客户端不支持testMemPoolAccept方法',
                duration: Date.now() - startTime
            };
        }
    }
    catch (error) {
        return {
            testName: '模拟广播测试',
            success: false,
            message: '模拟广播测试失败',
            duration: Date.now() - startTime,
            error: error.message
        };
    }
}
/**
 * 性能测试
 */
async function testPerformance() {
    const startTime = Date.now();
    const iterations = 5;
    const durations = [];
    try {
        for (let i = 0; i < iterations; i++) {
            const iterStart = Date.now();
            await (0, rpcFactory_1.testRpcConnection)();
            durations.push(Date.now() - iterStart);
        }
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);
        return {
            testName: '性能测试',
            success: true,
            message: `${iterations}次测试: 平均${avgDuration.toFixed(0)}ms, 最快${minDuration}ms, 最慢${maxDuration}ms`,
            duration: Date.now() - startTime
        };
    }
    catch (error) {
        return {
            testName: '性能测试',
            success: false,
            message: '性能测试失败',
            duration: Date.now() - startTime,
            error: error.message
        };
    }
}
// ============================================================================
// 主要功能
// ============================================================================
/**
 * 运行所有测试
 */
async function runAllTests() {
    console.log('🔧 RPC配置测试工具');
    console.log('='.repeat(50));
    // 显示当前配置
    console.log('\n📋 当前配置:');
    const config = (0, rpcFactory_1.getCurrentRpcConfig)();
    (0, rpcConfig_1.printRpcConfigSummary)(config);
    const tests = [];
    // 运行测试
    console.log('\n🧪 开始测试...\n');
    // 1. 配置读取测试
    tests.push(await testConfigLoading());
    // 2. 连接测试
    tests.push(await testRpcConnectivity());
    // 3. 网络特定连接测试
    if (process.env.NETWORK_TYPE) {
        tests.push(await testRpcConnectivity(process.env.NETWORK_TYPE));
    }
    // 4. 模拟广播测试
    tests.push(await testMockBroadcast());
    // 5. 性能测试
    tests.push(await testPerformance());
    // 显示结果
    console.log('📊 测试结果:');
    console.log('-'.repeat(50));
    let passedCount = 0;
    let failedCount = 0;
    for (const test of tests) {
        const status = test.success ? '✅' : '❌';
        const duration = test.duration ? `(${test.duration}ms)` : '';
        console.log(`${status} ${test.testName}: ${test.message} ${duration}`);
        if (test.error) {
            console.log(`   错误详情: ${test.error}`);
        }
        if (test.success) {
            passedCount++;
        }
        else {
            failedCount++;
        }
    }
    console.log('-'.repeat(50));
    console.log(`📈 测试统计: ${passedCount} 通过, ${failedCount} 失败`);
    if (failedCount > 0) {
        console.log('\n⚠️  建议检查.env文件中的RPC配置');
        process.exit(1);
    }
    else {
        console.log('\n🎉 所有测试通过！');
    }
}
exports.runAllTests = runAllTests;
/**
 * 显示详细配置信息
 */
function showDetailedConfig() {
    console.log('🔧 详细RPC配置信息');
    console.log('='.repeat(50));
    const config = (0, rpcFactory_1.getCurrentRpcConfig)();
    console.log((0, rpcConfig_1.formatRpcConfig)(config));
    const validation = (0, rpcConfig_1.validateRpcConfig)(config);
    console.log('\n✅ 验证结果:');
    console.log(`状态: ${validation.isValid ? '有效' : '无效'}`);
    if (validation.errors.length > 0) {
        console.log('\n❌ 错误:');
        validation.errors.forEach(error => console.log(`  - ${error}`));
    }
    if (validation.warnings.length > 0) {
        console.log('\n⚠️  警告:');
        validation.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
}
exports.showDetailedConfig = showDetailedConfig;
// ============================================================================
// CLI入口
// ============================================================================
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'test';
    switch (command) {
        case 'test':
            await runAllTests();
            break;
        case 'config':
            showDetailedConfig();
            break;
        case 'help':
            console.log('RPC配置测试工具');
            console.log('');
            console.log('用法:');
            console.log('  npx ts-node src/cli/rpc-test.ts [命令]');
            console.log('');
            console.log('命令:');
            console.log('  test    运行所有测试 (默认)');
            console.log('  config  显示详细配置信息');
            console.log('  help    显示帮助信息');
            break;
        default:
            console.error(`未知命令: ${command}`);
            console.log('使用 "help" 查看可用命令');
            process.exit(1);
    }
}
// 运行主程序
if (require.main === module) {
    main().catch(error => {
        console.error('程序运行失败:', error.message);
        process.exit(1);
    });
}
//# sourceMappingURL=rpc-test.js.map