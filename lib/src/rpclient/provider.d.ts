import { SandshrewBitcoinClient } from './sandshrew';
import { EsploraRpc } from './esplora';
import { OrdRpc } from './ord';
import { AlkanesRpc } from './alkanes';
export declare class Provider {
    sandshrew: SandshrewBitcoinClient;
    esplora: EsploraRpc;
    ord: OrdRpc;
    alkanes: AlkanesRpc;
    constructor(url: any);
}
