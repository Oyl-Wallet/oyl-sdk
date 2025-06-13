import { Provider } from '../provider';
type BasePsbtParams = {
    feeRate?: number;
    provider: Provider;
    fee?: number;
};
export declare const psbtBuilder: <T extends BasePsbtParams>(psbtBuilder: (params: T) => Promise<{
    psbt: string;
    fee?: number;
}>, params: T) => Promise<{
    psbt: string;
    fee: number;
    vsize: number;
}>;
export declare const getEstimatedFee: ({ feeRate, psbt, provider, }: {
    feeRate: number;
    psbt: string;
    provider: Provider;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export {};
