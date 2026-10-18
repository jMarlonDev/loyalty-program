import {
  createCardToken,
  decryptCardToken,
  encryptCardToken,
  hashCardToken,
} from './programs-crypto.js';

export function createTokenCodec(hexKey: string) {
  if (!/^[0-9a-f]{64}$/i.test(hexKey))
    throw new Error('Invalid token encryption key.');
  return {
    encrypt: (token: string) => encryptCardToken(token, hexKey),
    decrypt: (cipher: string) => decryptCardToken(cipher, hexKey),
    hash: hashCardToken,
    generate: createCardToken,
  };
}
