import * as bitcoin from 'bitcoinjs-lib'
import { Signer, walletInit } from './signer'
import { BIP322, Verifier, Signer as bipSigner } from 'bip322-js'
import { ECPair } from '../shared/utils'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import crypto from 'crypto'

describe('Signer', () => {
  const network = bitcoin.networks.bitcoin

  const keys: walletInit = {
    segwitPrivateKey:
      '4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3',
    taprootPrivateKey:
      '41f41d69260df4cf277826a9b65a3717e4eeddbeedf637f212ca096576479361',
    legacyPrivateKey:
      'e284129cc0922579a535bbf4d1a3b25773090d28c909bc0fed73b5e0222cc372',
    nestedSegwitPrivateKey:
      '508c73a06f6b6c817238ba61be232f5080ea4616c54f94771156934666d38ee3',
  }

  const message = 'Hello World'
  const hashedMessage = crypto
    .createHash('sha256')
    .update(message)
    .digest()
    .toString('base64')

  test('should initialize the Signer class with segwit, taproot, legacy, and nested segwit keys', () => {
    const signer = new Signer(network, keys)

    expect(signer.network).toEqual(network)
    expect(signer.segwitKeyPair.publicKey.toString('hex')).toBe(
      ECPair.fromPrivateKey(
        Buffer.from(keys.segwitPrivateKey!, 'hex')
      ).publicKey.toString('hex')
    )
    expect(signer.taprootKeyPair.publicKey.toString('hex')).toBe(
      ECPair.fromPrivateKey(
        Buffer.from(keys.taprootPrivateKey!, 'hex')
      ).publicKey.toString('hex')
    )
    expect(signer.legacyKeyPair.publicKey.toString('hex')).toBe(
      ECPair.fromPrivateKey(
        Buffer.from(keys.legacyPrivateKey!, 'hex')
      ).publicKey.toString('hex')
    )
    expect(signer.nestedSegwitKeyPair.publicKey.toString('hex')).toBe(
      ECPair.fromPrivateKey(
        Buffer.from(keys.nestedSegwitPrivateKey!, 'hex')
      ).publicKey.toString('hex')
    )
  })

  test('Produce correct message hash', () => {
    const helloWorldHash = BIP322.hashMessage('Hello World')
    const emptyStringHash = BIP322.hashMessage('')

    expect(Buffer.from(emptyStringHash).toString('hex').toLowerCase()).toEqual(
      'c90c269c4f8fcbe6880f72a721ddfbf1914268a794cbb21cfafee13770ae19f1'
    )
    expect(Buffer.from(helloWorldHash).toString('hex').toLowerCase()).toEqual(
      'f0eb03b1a75ac6d9847f55c624a99169b5dccba2a31f5b23bea77ba270de0a7a'
    )
  })
  test('BIP322 Signer signs correctly', async () => {
    const privateKey = 'KwTbAxmBXjoZM3bzbXixEr9nxLhyYSM4vp2swet58i19bw9sqk5z'
    const privateKeyTestnet =
      'cMpadsm2xoVpWV5FywY5cAeraa1PCtSkzrBM45Ladpf9rgDu6cMz'
    const address = '3HSVzEhCFuH9Z3wvoWTexy7BMVVp3PjS6f'
    const addressTestnet = '2N8zi3ydDsMnVkqaUUe5Xav6SZqhyqEduap'
    const addressRegtest = '2N8zi3ydDsMnVkqaUUe5Xav6SZqhyqEduap'
    const message = 'Hello World'
    const expectedSignature =
      'AkgwRQIhAMd2wZSY3x0V9Kr/NClochoTXcgDaGl3OObOR17yx3QQAiBVWxqNSS+CKen7bmJTG6YfJjsggQ4Fa2RHKgBKrdQQ+gEhAxa5UDdQCHSQHfKQv14ybcYm1C9y6b12xAuukWzSnS+w'

    const signature = bipSigner.sign(privateKey, address, message)
    const signatureTestnet = bipSigner.sign(privateKey, addressTestnet, message)
    const signatureRegtest = bipSigner.sign(privateKey, addressRegtest, message)
    // Sign with testnet key
    const signatureTestnetKey = bipSigner.sign(
      privateKeyTestnet,
      address,
      message
    )
    const signatureTestnetTestnetKey = bipSigner.sign(
      privateKeyTestnet,
      addressTestnet,
      message
    )
    const signatureRegtestTestnetKey = bipSigner.sign(
      privateKeyTestnet,
      addressRegtest,
      message
    )

    expect(signature).toEqual(expectedSignature)
    expect(signatureTestnet).toEqual(expectedSignature)
    expect(signatureRegtest).toEqual(expectedSignature)
    expect(signatureTestnetKey).toEqual(expectedSignature)
    expect(signatureTestnetTestnetKey).toEqual(expectedSignature)
    expect(signatureRegtestTestnetKey).toEqual(expectedSignature)
  })

  test('Should sign a message with nested segwit keypair', async () => {
    const signtaure =
      'AkgwRQIhAIeILWhMNozkb7d3AyiVoT0vBw2mwY1q96FybOfj/bksAiA4ai7LzotKFfmZ6D54Xc8ASeNhUuwqDA6to0x+GA+aLQEhA5s7aUuPxbXgf7Bpx4PKx1T104w+CL7Rlg4x/bHdo1wk'
    let signer = new Signer(network, keys)

    const address = bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({
        pubkey: signer.nestedSegwitKeyPair.publicKey,
        network: network,
      }),
    }).address

    const signedMessage = await signer.signMessage({
      message,
      address,
      keypair: signer.nestedSegwitKeyPair,
      protocol: 'bip322',
    })

    const verifySignature: boolean = Verifier.verifySignature(
      address!,
      message,
      signedMessage!
    )

    expect(signedMessage).toEqual(signtaure)
    expect(verifySignature).toBe(true)
  })

  test('Should sign a message with taproot keypair', async () => {
    let signer = new Signer(network, keys)

    const address = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(signer.taprootKeyPair.publicKey),
      network,
    }).address

    const signedMessage = await signer.signMessage({
      message,
      address,
      keypair: signer.taprootKeyPair,
      protocol: 'bip322',
    })

    const verifySignature: boolean = Verifier.verifySignature(
      address!,
      message,
      signedMessage!
    )

    expect(verifySignature).toBe(true)
  })

  test('Should sign a message with native segwit keypair', async () => {
    const signtaure =
      'AkcwRAIgKjQeMT+Jb9zi6sHHxFb/RiwaLezvFRgB+AlEKcGMqCUCIEvNgnZFCrTJqvnQrw6VjTQ4V9k7PbK8uM44CHv6voffASEDMNVP0N1CCm5fjTYk9fNILK41D3nV8HU79b7vnC2Rrzw='
    let signer = new Signer(network, keys)

    const address = bitcoin.payments.p2wpkh({
      pubkey: signer.segwitKeyPair.publicKey,
      network,
    }).address

    const signedMessage = await signer.signMessage({
      message,
      address,
      keypair: signer.segwitKeyPair,
      protocol: 'bip322',
    })

    const verifySignature: boolean = Verifier.verifySignature(
      address!,
      message,
      signedMessage!
    )

    expect(signedMessage).toEqual(signtaure)
    expect(verifySignature).toBe(true)
  })

  test('Should sign a message with legacy keypair', async () => {
    const signtaure =
      'Hymg5niRV2DQcJWcJllx1mIvPR+vDqekeUhr2/NelgBdfFfIpU5xSM5FsCSqikZmIC7AG03hACFkxKuPp8TfCTI='
    let signer = new Signer(network, keys)

    const address = bitcoin.payments.p2pkh({
      pubkey: signer.legacyKeyPair.publicKey,
      network: network,
    }).address

    const signedMessage = await signer.signMessage({
      message,
      address,
      keypair: signer.legacyKeyPair,
      protocol: 'bip322',
    })

    const verifySignature: boolean = Verifier.verifySignature(
      address!,
      message,
      signedMessage!
    )

    expect(signedMessage).toEqual(signtaure)
    expect(verifySignature).toBe(true)
  })

  test('Should sign a message with ecdsa keypair', async () => {
    const signtaure =
      'QzeHWtTiap2cW8+7iS/0mhzDf1PUVbTmKCx0FRb8x4EDMiHLOdoUKVn3L4+S921lpaCwPXsKvF95TCealGwuhg=='
    let signer = new Signer(network, keys)

    const signedMessage = await signer.signMessage({
      message,
      keypair: signer.segwitKeyPair,
      protocol: 'ecdsa',
    })

    const verifySignature: boolean = signer.segwitKeyPair.verify(
      Buffer.from(hashedMessage, 'base64'),
      Buffer.from(signedMessage!, 'base64')
    )

    expect(signedMessage).toEqual(signtaure)
    expect(verifySignature).toBe(true)
  })

  test('should throw an error if keypair is not passed when signing a message', async () => {
    keys.nestedSegwitPrivateKey = undefined
    let signer = new Signer(network, keys)

    const address = bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({
        pubkey: signer.segwitKeyPair.publicKey,
        network: network,
      }),
      network: network,
    }).address

    await expect(
      signer.signMessage({
        message,
        address,
        keypair: signer.nestedSegwitKeyPair,
        protocol: 'bip322',
      })
    ).rejects.toThrow('Keypair required to sign')
  })
})
