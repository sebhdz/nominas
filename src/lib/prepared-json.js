// Local preparation/build only. Browser assets remain ordinary static JSON.
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(gzip);
const decompress = promisify(gunzip);

export async function readPreparedJson(file) {
  let bytes;
  try {
    bytes = await readFile(`${file}.gz`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Older prepared files can be read until regenerated or migrated.
    return JSON.parse(await readFile(file, 'utf8'));
  }
  // Corrupt compressed data must fail, never fall back to an older JSON copy.
  return JSON.parse((await decompress(bytes)).toString('utf8'));
}

export async function writePreparedJson(file, data) {
  const bytes = await compress(JSON.stringify(data) + '\n');
  const temporary = `${file}.gz.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, `${file}.gz`);
  // Replace the uncompressed artifact only after the gzip is written successfully.
  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
