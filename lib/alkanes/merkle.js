"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateProof = exports.calculateMerkleRoot = exports.proofSchema = exports.leafSchema = exports.SchemaMerkleProof = exports.SchemaMerkleLeaf = void 0;
const sha2_1 = require("@noble/hashes/sha2");
class SchemaMerkleLeaf {
    address;
    amount;
    constructor({ address, amount }) {
        this.address = address;
        this.amount = amount;
    }
}
exports.SchemaMerkleLeaf = SchemaMerkleLeaf;
class SchemaMerkleProof {
    leaf;
    proofs;
    constructor({ leaf, proofs }) {
        this.leaf = leaf;
        this.proofs = proofs;
    }
}
exports.SchemaMerkleProof = SchemaMerkleProof;
exports.leafSchema = {
    struct: {
        address: 'string',
        amount: 'u128'
    }
};
exports.proofSchema = {
    struct: {
        leaf: { array: { type: 'u8' } },
        proofs: { array: { type: { array: { type: 'u8' } } } }
    }
};
function calculateMerkleRoot(leafHashes) {
    if (leafHashes.length === 0) {
        return new Uint8Array(32);
    }
    let nodes = [...leafHashes];
    while (nodes.length > 1) {
        if (nodes.length % 2 !== 0) {
            nodes.push(nodes[nodes.length - 1]);
        }
        const nextLevel = [];
        for (let i = 0; i < nodes.length; i += 2) {
            const left = nodes[i];
            const right = nodes[i + 1];
            let sorted;
            if (Buffer.compare(left, right) <= 0) {
                sorted = [left, right];
            }
            else {
                sorted = [right, left];
            }
            const parent = (0, sha2_1.sha256)(Buffer.concat(sorted));
            nextLevel.push(parent);
        }
        nodes = nextLevel;
    }
    return nodes[0];
}
exports.calculateMerkleRoot = calculateMerkleRoot;
function generateProof(leafHashes, leafIndex) {
    if (leafHashes.length <= 1) {
        return [];
    }
    const proof = [];
    let nodes = [...leafHashes];
    let currentIndex = leafIndex;
    while (nodes.length > 1) {
        if (nodes.length % 2 !== 0) {
            nodes.push(nodes[nodes.length - 1]);
        }
        const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
        proof.push(nodes[siblingIndex]);
        const nextLevel = [];
        for (let i = 0; i < nodes.length; i += 2) {
            const left = nodes[i];
            const right = nodes[i + 1];
            let sorted;
            if (Buffer.compare(left, right) <= 0) {
                sorted = [left, right];
            }
            else {
                sorted = [right, left];
            }
            const parent = (0, sha2_1.sha256)(Buffer.concat(sorted));
            nextLevel.push(parent);
        }
        nodes = nextLevel;
        currentIndex = Math.floor(currentIndex / 2);
    }
    return proof;
}
exports.generateProof = generateProof;
//# sourceMappingURL=merkle.js.map