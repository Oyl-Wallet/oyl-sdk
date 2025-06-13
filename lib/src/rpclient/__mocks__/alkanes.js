"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlkanesRpc = void 0;
class AlkanesRpc {
    async getAlkanesByAddress() {
        return [
            {
                runes: [
                    {
                        rune: {
                            id: {
                                block: '123',
                                tx: '456',
                            },
                            name: 'TestRune',
                            spacedName: 'TestRune',
                            divisibility: 1,
                            spacers: 0,
                            symbol: 'TR',
                        },
                        balance: '1000',
                    },
                ],
                outpoint: {
                    txid: '1234',
                    vout: 0,
                },
                output: {
                    value: '1000',
                    script: 'mock_script',
                },
                height: 123,
                txindex: 456,
            },
            {
                runes: [
                    {
                        rune: {
                            id: {
                                block: '789',
                                tx: '012',
                            },
                            name: 'TestRune2',
                            spacedName: 'TestRune2',
                            divisibility: 1,
                            spacers: 0,
                            symbol: 'TR2',
                        },
                        balance: '2000',
                    },
                ],
                outpoint: {
                    txid: '5678',
                    vout: 1,
                },
                output: {
                    value: '2000',
                    script: 'mock_script_2',
                },
                height: 789,
                txindex: 12,
            },
        ];
    }
}
exports.AlkanesRpc = AlkanesRpc;
//# sourceMappingURL=alkanes.js.map