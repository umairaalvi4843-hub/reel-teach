// Phase 1 retrieval: simple keyword-overlap scoring, no external vector DB needed.
// This is intentionally simple so the whole app runs with zero extra signups today.
// Phase 2 upgrade note is at the bottom — swapping this for real embeddings later
// does NOT require changing any other file, only this one.

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreChunk(queryTokens, chunkText) {
  const chunkTokens = new Set(tokenize(chunkText));
  let matches = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) matches++;
  }
  return matches;
}

/**
 * Returns the top-K chunks most relevant to the query (topic or student question).
 */
export function retrieveRelevantChunks(chunks, query, topK = 4) {
  const queryTokens = tokenize(query);

  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: scoreChunk(queryTokens, chunk.content),
  }));

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, topK).filter((c) => c.score > 0);

  // If nothing scored (e.g. very short query), just return the first few chunks
  // so the lesson planner still has SOME grounding material.
  return top.length > 0 ? top : chunks.slice(0, topK);
}

// PHASE 2 UPGRADE: replace this file's logic with real embeddings.
// 1. npm install @anthropic-ai/sdk already gives you a client; for embeddings
//    specifically, sign up at openai.com (embeddings) or use a local model.
// 2. Embed each chunk once at upload time, store vectors in a simple array
//    or in Chroma/Pinecone.
// 3. Embed the query, do cosine similarity instead of tokenize+overlap.
// Everything else in the app (planner, evaluator) stays exactly the same
// because they just receive "relevant chunks" from this file either way.
