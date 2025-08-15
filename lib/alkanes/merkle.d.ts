export declare class SchemaMerkleLeaf {
    address: string;
    amount: bigint;
    constructor({ address, amount }: {
        address: string;
        amount: bigint;
    });
}
export declare class SchemaMerkleProof {
    leaf: Uint8Array;
    proofs: Uint8Array[];
    constructor({ leaf, proofs }: {
        leaf: Uint8Array;
        proofs: Uint8Array[];
    });
}
export declare const leafSchema: {
    struct: {
        address: string;
        amount: string;
    };
};
export declare const proofSchema: {
    struct: {
        leaf: {
            array: {
                type: string;
            };
        };
        proofs: {
            array: {
                type: {
                    array: {
                        type: string;
                    };
                };
            };
        };
    };
};
export declare function calculateMerkleRoot(leafHashes: Uint8Array[]): Uint8Array;
export declare function generateProof(leafHashes: Uint8Array[], leafIndex: number): Uint8Array[];
