export declare class AlkanesRpc {
    getAlkanesByAddress(): Promise<{
        runes: {
            rune: {
                id: {
                    block: string;
                    tx: string;
                };
                name: string;
                spacedName: string;
                divisibility: number;
                spacers: number;
                symbol: string;
            };
            balance: string;
        }[];
        outpoint: {
            txid: string;
            vout: number;
        };
        output: {
            value: string;
            script: string;
        };
        height: number;
        txindex: number;
    }[]>;
}
