// Decodes a probe result pasted from the phone: node tools/decode.js "<text>" (or pipe it on stdin).
const zlib = require('zlib');
const fs = require('fs');
let raw = process.argv[2] || fs.readFileSync(0, 'utf8');
// Rejoin multi-part codes: "[1/3]..." "[2/3]..."
const parts = raw.match(/\[(\d+)\/(\d+)\][^\[]*/g);
if (parts) raw = parts.sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).map(p => p.replace(/^\[\d+\/\d+\]/, '').trim()).join('');
raw = raw.trim();
let json;
if (raw.startsWith('PS5P1Z:')) {
  const b64 = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/');
  json = zlib.inflateRawSync(Buffer.from(b64, 'base64')).toString('utf8');
} else if (raw.startsWith('PS5P1J:')) {
  json = raw.slice(7);
} else {
  throw new Error('Not a probe result');
}
console.log(JSON.stringify(JSON.parse(json), null, 2));
