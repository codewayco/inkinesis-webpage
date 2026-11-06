// Read the header of a binary rig container (lab/rigs/*.ikr, written by toBinary.mjs): the web preview
// with its nodes, parameters, bindings and metadata, where each deform binding's values and each
// texture are blob references. Enough for tools that inspect a rig's structure without its keyforms.
import fs from 'node:fs'; import zlib from 'node:zlib';

export function readIkrHeader(file) {
  const raw = zlib.gunzipSync(fs.readFileSync(file));
  if (raw.subarray(0, 4).toString('latin1') !== 'IKR1') throw Error(`${file} is not a rig container`);
  return JSON.parse(raw.subarray(8, 8 + raw.readUInt32LE(4)).toString());
}
