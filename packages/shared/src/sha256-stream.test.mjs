import { createHash, randomBytes } from "node:crypto";
import { Sha256Stream } from "./sha256-stream.ts";

function hexFromBytes(str) {
  return new TextEncoder().encode(str);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL ${label}\n  expected: ${expected}\n  actual:   ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
  }
}

// Known test vectors
{
  const s = new Sha256Stream();
  s.update(hexFromBytes(""));
  assertEqual(s.digestHex(), createHash("sha256").update("").digest("hex"), "empty string");
}
{
  const s = new Sha256Stream();
  s.update(hexFromBytes("abc"));
  assertEqual(s.digestHex(), createHash("sha256").update("abc").digest("hex"), "'abc'");
}
{
  const text = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
  const s = new Sha256Stream();
  s.update(hexFromBytes(text));
  assertEqual(s.digestHex(), createHash("sha256").update(text).digest("hex"), "56-char multi-block vector");
}

// Chunk-boundary stress test: feed random data in oddly-sized pieces
// (1, 63, 64, 65, 1000 bytes) and compare against Node's own SHA-256.
{
  const data = randomBytes(500_000);
  const expected = createHash("sha256").update(data).digest("hex");

  const s = new Sha256Stream();
  let offset = 0;
  const pieceSizes = [1, 63, 64, 65, 1000, 4096, 16384];
  let i = 0;
  while (offset < data.length) {
    const size = pieceSizes[i % pieceSizes.length];
    const end = Math.min(offset + size, data.length);
    s.update(data.subarray(offset, end));
    offset = end;
    i++;
  }
  assertEqual(s.digestHex(), expected, "500KB random data fed in odd-sized chunks vs node:crypto");
}

// Exact 64-byte boundary case
{
  const data = randomBytes(128); // exactly two blocks
  const expected = createHash("sha256").update(data).digest("hex");
  const s = new Sha256Stream();
  s.update(data);
  assertEqual(s.digestHex(), expected, "exact 2-block (128 byte) input");
}

if (process.exitCode !== 1) {
  console.log("\nAll SHA-256 vectors passed.");
}
