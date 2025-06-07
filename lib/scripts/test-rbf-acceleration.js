"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const dotenv = tslib_1.__importStar(require("dotenv"));
// Load environment variables
dotenv.config();
class RBFAccelerationTester {
    config = {
        accelerateFeeMultiplier: 1.2,
        maxFeeIncrease: 2,
        maxFeeRate: 100,
        cooldownTime: 300000 // 5 minutes
    };
    mockTransactions = new Map();
    constructor() {
        // 创建一些模拟交易
        this.createMockTransactions();
    }
    createMockTransactions() {
        const mockTxs = [
            {
                txId: 'tx1_low_fee',
                feeRate: 2,
                accelerationAttempts: 0,
                confirmed: false
            },
            {
                txId: 'tx2_medium_fee',
                feeRate: 5,
                accelerationAttempts: 1,
                lastAccelerationTime: Date.now() - 400000,
                confirmed: false
            },
            {
                txId: 'tx3_recent_acceleration',
                feeRate: 3,
                accelerationAttempts: 1,
                lastAccelerationTime: Date.now() - 120000,
                confirmed: false
            },
            {
                txId: 'tx4_max_attempts',
                feeRate: 4,
                accelerationAttempts: 3,
                lastAccelerationTime: Date.now() - 600000,
                confirmed: false
            },
            {
                txId: 'tx5_confirmed',
                feeRate: 10,
                accelerationAttempts: 0,
                confirmed: true
            }
        ];
        mockTxs.forEach(tx => {
            this.mockTransactions.set(tx.txId, tx);
        });
    }
    shouldAccelerate(tx, currentMedianFeeRate) {
        // 基本条件检查
        if (tx.confirmed) {
            console.log(`  ❌ ${tx.txId}: Already confirmed`);
            return false;
        }
        if (currentMedianFeeRate <= tx.feeRate) {
            console.log(`  ⏸️ ${tx.txId}: Current fee rate ${currentMedianFeeRate} <= tx fee rate ${tx.feeRate}`);
            return false;
        }
        if (tx.accelerationAttempts >= 3) {
            console.log(`  🚫 ${tx.txId}: Max acceleration attempts reached (${tx.accelerationAttempts})`);
            return false;
        }
        // 冷却时间检查
        const timeSinceLastAcceleration = tx.lastAccelerationTime ?
            Date.now() - tx.lastAccelerationTime : Number.MAX_SAFE_INTEGER;
        if (timeSinceLastAcceleration < this.config.cooldownTime) {
            const remainingCooldown = Math.ceil((this.config.cooldownTime - timeSinceLastAcceleration) / 1000);
            console.log(`  ⏰ ${tx.txId}: Still in cooldown period (${remainingCooldown}s remaining)`);
            return false;
        }
        console.log(`  ✅ ${tx.txId}: Ready for acceleration`);
        return true;
    }
    calculateNewFeeRate(currentFeeRate, currentMedianFeeRate) {
        const newFeeRate = Math.min(Math.ceil(currentMedianFeeRate * this.config.accelerateFeeMultiplier), currentFeeRate + this.config.maxFeeIncrease, this.config.maxFeeRate);
        return newFeeRate;
    }
    simulateAcceleration(tx, newFeeRate) {
        console.log(`  🚀 Accelerating ${tx.txId}: ${tx.feeRate} -> ${newFeeRate} sat/vB`);
        // 模拟加速成功
        tx.feeRate = newFeeRate;
        tx.accelerationAttempts++;
        tx.lastAccelerationTime = Date.now();
        console.log(`  ✅ Acceleration successful (attempt ${tx.accelerationAttempts})`);
        return true;
    }
    testAccelerationLogic(currentMedianFeeRate) {
        console.log(`\n🧪 Testing RBF Acceleration Logic`);
        console.log(`📊 Current median fee rate: ${currentMedianFeeRate} sat/vB`);
        console.log(`⚙️ Configuration:`);
        console.log(`   - Acceleration multiplier: ${this.config.accelerateFeeMultiplier}x`);
        console.log(`   - Max fee increase: +${this.config.maxFeeIncrease} sat/vB`);
        console.log(`   - Max fee rate: ${this.config.maxFeeRate} sat/vB`);
        console.log(`   - Cooldown time: ${this.config.cooldownTime / 1000}s`);
        console.log('');
        const pendingTransactions = Array.from(this.mockTransactions.values())
            .filter(tx => !tx.confirmed);
        console.log(`📋 Checking ${pendingTransactions.length} pending transactions:`);
        for (const tx of pendingTransactions) {
            console.log(`\n🔍 Transaction ${tx.txId}:`);
            console.log(`   Current fee rate: ${tx.feeRate} sat/vB`);
            console.log(`   Acceleration attempts: ${tx.accelerationAttempts}/3`);
            if (tx.lastAccelerationTime) {
                const timeSince = Math.floor((Date.now() - tx.lastAccelerationTime) / 1000);
                console.log(`   Last acceleration: ${timeSince}s ago`);
            }
            if (this.shouldAccelerate(tx, currentMedianFeeRate)) {
                const newFeeRate = this.calculateNewFeeRate(tx.feeRate, currentMedianFeeRate);
                if (newFeeRate > tx.feeRate) {
                    this.simulateAcceleration(tx, newFeeRate);
                }
                else {
                    console.log(`  ⏸️ ${tx.txId}: Calculated fee rate ${newFeeRate} not higher than current ${tx.feeRate}`);
                }
            }
        }
        console.log('\n📊 Final Transaction Status:');
        this.mockTransactions.forEach((tx, txId) => {
            const status = tx.confirmed ? '✅ CONFIRMED' : '⏳ PENDING';
            console.log(`   ${txId}: ${status} | Fee: ${tx.feeRate} sat/vB | Attempts: ${tx.accelerationAttempts}`);
        });
    }
    testDifferentFeeRateScenarios() {
        console.log('\n🎯 Testing Different Fee Rate Scenarios:');
        const scenarios = [
            { name: 'Low Network Activity', medianFeeRate: 1 },
            { name: 'Normal Network Activity', medianFeeRate: 5 },
            { name: 'High Network Activity', medianFeeRate: 15 },
            { name: 'Extreme Network Congestion', medianFeeRate: 50 }
        ];
        scenarios.forEach(scenario => {
            console.log(`\n🌐 Scenario: ${scenario.name} (${scenario.medianFeeRate} sat/vB)`);
            console.log('─'.repeat(50));
            // Reset transactions for each scenario
            this.createMockTransactions();
            this.testAccelerationLogic(scenario.medianFeeRate);
        });
    }
}
// 运行测试
console.log('🚀 RBF Acceleration Logic Tester');
console.log('═'.repeat(50));
const tester = new RBFAccelerationTester();
// 测试单一场景
tester.testAccelerationLogic(8);
// 测试多种场景
tester.testDifferentFeeRateScenarios();
console.log('\n✅ Testing completed!');
console.log('\n💡 Tips:');
console.log('   - Acceleration is triggered when median fee rate > transaction fee rate');
console.log('   - Maximum 3 acceleration attempts per transaction');
console.log('   - Minimum 5-minute cooldown between accelerations');
console.log('   - Fee rate increases are capped by configuration limits');
//# sourceMappingURL=test-rbf-acceleration.js.map