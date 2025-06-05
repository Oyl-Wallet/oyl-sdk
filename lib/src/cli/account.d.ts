import { Command } from 'commander';
export declare const privateKeysCommand: Command;
export declare const mnemonicToAccountCommand: Command;
export declare const generateMnemonicCommand: Command;
export declare const signPsbt: Command;
/**
 * @dev example call
 * oyl account generateAddresses -p bitcoin -n 10
 *
 * You will need to specify a MNOMONIC= in your .env file
 */
export declare const generateAddressesCommand: Command;
