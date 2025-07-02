const { bech32 } = require('bech32');

/* hex and bech32 helper functions */
function hexToBech32(hexStr, hrp = 'npub') {
  // Validate hex input
  if (!/^[0-9a-fA-F]{64}$/.test(hexStr)) {
    throw new Error('Invalid hex format for Nostr public key');
  }
  
  const bytes = Buffer.from(hexStr, 'hex');
  const words = bech32.toWords(bytes);
  return bech32.encode(hrp, words);
}

function bech32ToHex(bech32Str) {
  const decoded = bech32.decode(bech32Str);
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== 32) throw new Error('Invalid public key length');
  return Buffer.from(bytes).toString('hex');
}

module.exports = {
  hexToBech32,
  bech32ToHex
}