import { Provider } from '../provider/provider';
import { Account } from '../account';
export declare function createRBFPsbt(txid: string, new_fee_rate: number, account: Account, provider: Provider): Promise<{
    psbt: string;
    newFee: number;
}>;
