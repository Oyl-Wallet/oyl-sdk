#!/usr/bin/env ts-node
/**
 * RPC配置测试工具
 *
 * 用于测试和验证.env文件中配置的RPC设置
 * 支持连接测试、配置验证、性能测试等功能
 */
/**
 * 运行所有测试
 */
declare function runAllTests(): Promise<void>;
/**
 * 显示详细配置信息
 */
declare function showDetailedConfig(): void;
export { runAllTests, showDetailedConfig };
