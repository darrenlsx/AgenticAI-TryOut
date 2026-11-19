const crypto = require('crypto');

// 6-character join codes without look-alike characters (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newJoinCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

module.exports = { newJoinCode };
