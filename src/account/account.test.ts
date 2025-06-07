import {
  mnemonicToAccount,
  generateMnemonic,
  getWalletPrivateKeys,
  validateMnemonic,
  getHDPaths,
  HDPaths,
  WalletStandard,
} from './account'
import * as bitcoin from 'bitcoinjs-lib'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const TEST_HD_PATHS = {
  legacy: "m/44'/0'/0'/0/999",
  nestedSegwit: "m/49'/0'/0'/0/998",
  nativeSegwit: "m/84'/0'/0'/0/997",
  taproot: "m/86'/0'/0'/0/996",
}

describe('Account Tests', () => {
  it('mnemonicToAccount should generate the right default spend strategy', () => {
    const account = mnemonicToAccount({
      mnemonic: TEST_MNEMONIC,
      opts: {
        network: bitcoin.networks.regtest,
      },
    })

    expect(account.spendStrategy.addressOrder).toEqual([
      'taproot',
      'nativeSegwit',
      'nestedSegwit',
      'legacy',
    ])
    expect(account.spendStrategy.utxoSortGreatestToLeast).toBe(true)
    expect(account.spendStrategy.changeAddress).toBe('taproot')
  })

  it('mnemonicToAccount should generate the right custom spend strategy', () => {
    const account = mnemonicToAccount({
      mnemonic: TEST_MNEMONIC,
      opts: {
        network: bitcoin.networks.regtest,
        spendStrategy: {
          addressOrder: ['taproot', 'legacy', 'nestedSegwit', 'nativeSegwit'],
          utxoSortGreatestToLeast: false,
          changeAddress: 'legacy',
        },
      },
    })

    expect(account.spendStrategy.addressOrder).toEqual([
      'taproot',
      'legacy',
      'nestedSegwit',
      'nativeSegwit',
    ])
    expect(account.spendStrategy.utxoSortGreatestToLeast).toBe(false)
    expect(account.spendStrategy.changeAddress).toBe('legacy')
  })

  it('mnemonicToAccount should work with default hdPaths', () => {
    const account = mnemonicToAccount({
      mnemonic: TEST_MNEMONIC,
      opts: {
        network: bitcoin.networks.regtest,
      },
    })

    expect(account.legacy.hdPath).toBe("m/44'/0'/0'/0/0")
    expect(account.nestedSegwit.hdPath).toBe("m/49'/0'/0'/0/0")
    expect(account.nativeSegwit.hdPath).toBe("m/84'/0'/0'/0/0")
    expect(account.taproot.hdPath).toBe("m/86'/0'/0'/0/0")

    expect(account.legacy.address).toBe('n1M8ZVQtL7QoFvGMg24D6b2ojWvFXCGpoS')
    expect(account.nestedSegwit.address).toBe(
      '2My47gHNc8nhX5kBWqXHU4f8uuQvQKEgwMd'
    )
    expect(account.nativeSegwit.address).toBe(
      'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx'
    )
    expect(account.taproot.address).toBe(
      'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk'
    )

    expect(account.legacy.pubkey).toBe(
      '03aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e'
    )
    expect(account.nestedSegwit.pubkey).toBe(
      '039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c24'
    )
    expect(account.nativeSegwit.pubkey).toBe(
      '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c'
    )
    expect(account.taproot.pubkey).toBe(
      '03cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115'
    )
    expect(account.taproot.pubKeyXOnly).toBe(
      'cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115'
    )
  })

  it('mnemonicToAccount should work with custom hdPaths', () => {
    const account = mnemonicToAccount({
      mnemonic: TEST_MNEMONIC,
      opts: {
        network: bitcoin.networks.regtest,
        hdPaths: TEST_HD_PATHS,
      },
    })

    expect(account.legacy.hdPath).toBe("m/44'/0'/0'/0/999")
    expect(account.nestedSegwit.hdPath).toBe("m/49'/0'/0'/0/998")
    expect(account.nativeSegwit.hdPath).toBe("m/84'/0'/0'/0/997")
    expect(account.taproot.hdPath).toBe("m/86'/0'/0'/0/996")

    expect(account.legacy.address).toBe('n4UB1By7USunM5R4ivdihhYkp1tY84oeuu')
    expect(account.nestedSegwit.address).toBe(
      '2N9XTnMurNTR4MFY9kpDAgqaHjdRHXYDvzb'
    )
    expect(account.nativeSegwit.address).toBe(
      'bcrt1qn2n42yyx3eeh5mp08858kltysygrrd95slm23k'
    )
    expect(account.taproot.address).toBe(
      'bcrt1p26hyxc7dqdq44m99ggsdwpx046av5uff057gl7edajqlyly9qyus59x39n'
    )

    expect(account.legacy.pubkey).toBe(
      '0379af79751899a87883ff3728ecf3dd094bcf77e5531bd64da1c7791eab51fa56'
    )
    expect(account.nestedSegwit.pubkey).toBe(
      '0358524ff929208bf6676ee03e02960105c61f060d32cca03dedb1faa247cac64d'
    )
    expect(account.nativeSegwit.pubkey).toBe(
      '02aa05b9094bdbc489dc6b336b23e8ab12f33448d2bf9708454cd76acb14907abf'
    )
    expect(account.taproot.pubkey).toBe(
      '02c43b42d9cea2a355d90e9374177d465471e410db495a8340fb535ceea9f1f618'
    )
    expect(account.taproot.pubKeyXOnly).toBe(
      'c43b42d9cea2a355d90e9374177d465471e410db495a8340fb535ceea9f1f618'
    )
  })

  it('mnemonicToAccount does not throw an error if mnemonic is invalid', () => {
    expect(() =>
      mnemonicToAccount({
        mnemonic: 'invalid mnemonic',
        opts: {
          network: bitcoin.networks.regtest,
        },
      })
    ).not.toThrow(Error)
  })

  it('getWalletPrivateKeys should work with default hdPaths', () => {
    const account = getWalletPrivateKeys({
      mnemonic: TEST_MNEMONIC,
      opts: {
        network: bitcoin.networks.regtest,
      },
    })

    expect(account.legacy.privateKey).toBe(
      'e284129cc0922579a535bbf4d1a3b25773090d28c909bc0fed73b5e0222cc372'
    )
    expect(account.nestedSegwit.privateKey).toBe(
      '508c73a06f6b6c817238ba61be232f5080ea4616c54f94771156934666d38ee3'
    )
    expect(account.nativeSegwit.privateKey).toBe(
      '4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3'
    )
    expect(account.taproot.privateKey).toBe(
      '41f41d69260df4cf277826a9b65a3717e4eeddbeedf637f212ca096576479361'
    )
  })

  it('getWalletPrivateKeys should work with custom hdPaths', () => {
    const account = getWalletPrivateKeys({
      mnemonic: TEST_MNEMONIC,
      opts: {
        network: bitcoin.networks.regtest,
        hdPaths: {
          legacy: "m/44'/0'/0'/0/999",
          nestedSegwit: "m/49'/0'/0'/0/998",
          nativeSegwit: "m/84'/0'/0'/0/997",
          taproot: "m/86'/0'/0'/0/996",
        },
      },
    })

    expect(account.legacy.privateKey).toBe(
      '64c9a3543213639eb80d4317db5e66b702c93fd009a28f39837cb71807d1dac3'
    )
    expect(account.nestedSegwit.privateKey).toBe(
      '5c475de483cc1e0b25fc143749894b828559d46a8283e8374f5221a7ebdf5478'
    )
    expect(account.nativeSegwit.privateKey).toBe(
      '079cd154b93b396e7fb1ad2073c5ab036da40a77c53d9245dcb37bbc7e4ab3a2'
    )
    expect(account.taproot.privateKey).toBe(
      'db8ef506d05fe881f3697c32c851d881471364138e6dc437c9e2772d924a98d7'
    )
  })

  it('getWalletPrivateKeys does not throw an error if mnemonic is invalid', () => {
    expect(() =>
      getWalletPrivateKeys({
        mnemonic: 'invalid mnemonic',
        opts: {
          network: bitcoin.networks.regtest,
        },
      })
    ).not.toThrow(Error)
  })

  it('generateMnemonic generates a 12 word mnemonic', () => {
    const mnemonic = generateMnemonic()
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(12)
  })

  it('getHDPaths returns the correct default HD paths', () => {
    const paths = getHDPaths()

    expect(paths.legacy).toBe("m/44'/0'/0'/0/0")
    expect(paths.nestedSegwit).toBe("m/49'/0'/0'/0/0")
    expect(paths.nativeSegwit).toBe("m/84'/0'/0'/0/0")
    expect(paths.taproot).toBe("m/86'/0'/0'/0/0")

    const paths1 = getHDPaths(1)

    expect(paths1.legacy).toBe("m/44'/0'/0'/0/1")
    expect(paths1.nestedSegwit).toBe("m/49'/0'/0'/0/1")
    expect(paths1.nativeSegwit).toBe("m/84'/0'/0'/0/1")
    expect(paths1.taproot).toBe("m/86'/0'/0'/0/1")
  })

  it('getHDPaths returns the right HD paths using the bip32_simple wallet standard', () => {
    const network = bitcoin.networks.bitcoin
    const walletStandard: WalletStandard = 'bip32_simple'

    const paths = getHDPaths(0, network, walletStandard)

    expect(paths.legacy).toBe("m/44'/0'/0'/0")
    expect(paths.nestedSegwit).toBe("m/49'/0'/0'/0")
    expect(paths.nativeSegwit).toBe("m/84'/0'/0'/0")
    expect(paths.taproot).toBe("m/86'/0'/0'/0")

    const paths1 = getHDPaths(1, network, walletStandard)

    expect(paths1.legacy).toBe("m/44'/0'/1'/0")
    expect(paths1.nestedSegwit).toBe("m/49'/0'/1'/0")
    expect(paths1.nativeSegwit).toBe("m/84'/0'/1'/0")
    expect(paths1.taproot).toBe("m/86'/0'/1'/0")
  })

  it('getHDPaths returns the right HD paths using the bip44_standard wallet standard', () => {
    const network = bitcoin.networks.bitcoin
    const walletStandard: WalletStandard = 'bip44_standard'

    const paths = getHDPaths(0, network, walletStandard)

    expect(paths.legacy).toBe("m/44'/0'/0'/0/0")
    expect(paths.nestedSegwit).toBe("m/49'/0'/0'/0/0")
    expect(paths.nativeSegwit).toBe("m/84'/0'/0'/0/0")
    expect(paths.taproot).toBe("m/86'/0'/0'/0/0")

    const paths1 = getHDPaths(1, network, walletStandard)

    expect(paths1.legacy).toBe("m/44'/0'/1'/0/0")
    expect(paths1.nestedSegwit).toBe("m/49'/0'/1'/0/0")
    expect(paths1.nativeSegwit).toBe("m/84'/0'/1'/0/0")
    expect(paths1.taproot).toBe("m/86'/0'/1'/0/0")
  })

  it('validateMnemonic returns true for valid mnemonic', () => {
    expect(validateMnemonic(TEST_MNEMONIC)).toBeTruthy()
  })

  it('validateMnemonic returns false for invalid mnemonic', () => {
    expect(validateMnemonic('invalid mnemonic')).toBeFalsy()
  })
})
