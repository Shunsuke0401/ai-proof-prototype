import { NextRequest, NextResponse } from 'next/server';
import { addJson } from '../../../api/ipfs';
import { domain, types, ContentProvenanceValue, ZERO_HASH } from '../../../api/types';
import { addOutputHashMapping } from '../../../api/indexStore';

interface PublishBody {
  provenance: ContentProvenanceValue;
  signature: string; // hex signature from wallet
  signer: string;    // address recovered client-side (we will not trust blindly)
  promptCid?: string; // optional CID of original prompt (not part of signed struct)
}


export async function POST(req: NextRequest) {
  try {
    const body: PublishBody = await req.json();
    if (!body?.provenance || !body.signature || !body.signer) {
      return NextResponse.json({ error: 'Missing provenance, signature or signer' }, { status: 400 });
    }

    const prov = body.provenance;

    // Basic structural validation
    if (prov.version !== 1) return NextResponse.json({ error: 'Unsupported version' }, { status: 400 });
    // Basic shape checks
    const requiredStrings: Array<keyof ContentProvenanceValue> = ['modelId','promptHash','outputHash','paramsHash','contentCid'];
    for (const k of requiredStrings) {
      if (!prov[k]) return NextResponse.json({ error: `Missing field ${k}` }, { status: 400 });
    }

    // Placeholder: we could fetch contentCid & recompute outputHash here (Stage 2 verify endpoint will do deeper checks)

    const prunedTypes: any = { ContentProvenance: types.ContentProvenance };
    const signedEnvelope = {
      domain,
      types: prunedTypes,
      primaryType: 'ContentProvenance',
      provenance: prov,
      signature: body.signature,
      signer: body.signer,
      createdAt: Date.now(),
      promptCid: body.promptCid || undefined
    };

    const signedProvenanceCid = await addJson(signedEnvelope);
    // Index by outputHash so later we can allow paste-of-content -> provenance discovery.
    if (prov.outputHash) {
      try { addOutputHashMapping(prov.outputHash, signedProvenanceCid); } catch {}
    }

    return NextResponse.json({
      signedProvenanceCid,
      proofCid: prov.proofCid || undefined,
      journalCid: prov.journalCid || undefined
    });
  } catch (e) {
    console.error('[publish] error', e);
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'POST signed provenance to publish.' });
}