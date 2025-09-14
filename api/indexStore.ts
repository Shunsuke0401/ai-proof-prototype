// Simple in-memory index for mapping outputHash (sha256 of generated content)
// to one or more signed provenance CIDs.
// NOTE: This is ephemeral and resets when the server restarts. For a demo
// UX where users paste content and we infer provenance automatically, this
// is sufficient. A production system would persist this mapping in a DB
// or build a content-addressable index off-chain.

type Hash = string; // lowercase 0x-prefixed sha256 digest

interface IndexRecord {
  hash: Hash;
  cids: string[]; // signedProvenanceCid(s)
  lastUpdated: number;
}

const store: Record<Hash, IndexRecord> = {};

export function addOutputHashMapping(hash: string, signedProvenanceCid: string) {
  const h = hash.toLowerCase();
  if (!store[h]) {
    store[h] = { hash: h, cids: [signedProvenanceCid], lastUpdated: Date.now() };
  } else {
    if (!store[h].cids.includes(signedProvenanceCid)) {
      store[h].cids.push(signedProvenanceCid);
      store[h].lastUpdated = Date.now();
    }
  }
}

export function lookupByContentHash(hash: string): string[] | null {
  const rec = store[hash.toLowerCase()];
  return rec ? rec.cids.slice() : null;
}

export function debugIndexDump() {
  return Object.values(store);
}
