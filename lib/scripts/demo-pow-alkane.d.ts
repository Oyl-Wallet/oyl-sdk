#!/usr/bin/env npx ts-node
/**
 * PoW Alkane Demo Script
 *
 * This script demonstrates the PoW mining and alkane contract execution flow
 * using mock data for testing purposes.
 */
declare class PowAlkaneDemo {
    static demonstrateWorkflow(): void;
    static step1_WalletSetup(): void;
    static step2_UtxoSelection(): void;
    static step3_PowMining(): void;
    static step4_ContractExecution(): void;
    static step5_Summary(): void;
    static demonstrateHashCalculation(): void;
    static hexToBytes(hex: string): Uint8Array;
}
export { PowAlkaneDemo };
