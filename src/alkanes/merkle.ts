import { sha256 } from '@noble/hashes/sha2';


export class SchemaMerkleLeaf {
    address: string;
    amount: bigint;
  
    constructor({ address, amount }: { address: string; amount: bigint }) {
      this.address = address;
      this.amount = amount;
    }
  }
  
  export class SchemaMerkleProof {
    leaf: Uint8Array;
    proofs: Uint8Array[];
  
    constructor({ leaf, proofs }: { leaf: Uint8Array; proofs: Uint8Array[] }) {
      this.leaf = leaf;
      this.proofs = proofs;
    }
  }
  
  export const leafSchema = {
    struct: {
      address: 'string',
      amount: 'u128'
    }
  };
  
  export const proofSchema = {
    struct: {
      leaf: { array: { type: 'u8' } },
      proofs: { array: { type: { array: { type: 'u8' } } } }
    }
  };
  
  export function calculateMerkleRoot(leafHashes: Uint8Array[]): Uint8Array {
    if (leafHashes.length === 0) {
      return new Uint8Array(32);
    }
    let nodes = [...leafHashes];
    while (nodes.length > 1) {
      if (nodes.length % 2 !== 0) {
        nodes.push(nodes[nodes.length - 1]);
      }
      const nextLevel: Uint8Array[] = [];
      for (let i = 0; i < nodes.length; i += 2) {
        const left = nodes[i];
        const right = nodes[i + 1];
        let sorted: Uint8Array[];
        if (Buffer.compare(left, right) <= 0) {
          sorted = [left, right];
        } else {
          sorted = [right, left];
        }
        const parent = sha256(Buffer.concat(sorted));
        nextLevel.push(parent);
      }
      nodes = nextLevel;
    }
    return nodes[0];
  }
  
  export function generateProof(leafHashes: Uint8Array[], leafIndex: number): Uint8Array[] {
    if (leafHashes.length <= 1) {
      return [];
    }
  
    const proof: Uint8Array[] = [];
    let nodes = [...leafHashes];
    let currentIndex = leafIndex;
  
    while (nodes.length > 1) {
      if (nodes.length % 2 !== 0) {
        nodes.push(nodes[nodes.length - 1]);
      }
  
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      proof.push(nodes[siblingIndex]);
  
      const nextLevel: Uint8Array[] = [];
      for (let i = 0; i < nodes.length; i += 2) {
        const left = nodes[i];
        const right = nodes[i + 1];
        let sorted: Uint8Array[];
        if (Buffer.compare(left, right) <= 0) {
          sorted = [left, right];
        } else {
          sorted = [right, left];
        }
        const parent = sha256(Buffer.concat(sorted));
        nextLevel.push(parent);
      }
      nodes = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }
    return proof;
  }