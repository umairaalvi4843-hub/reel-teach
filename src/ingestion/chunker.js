// Splits raw document text into overlapping chunks.
// Overlap matters: it stops a concept from being cut in half between two chunks.

export function chunkText(text, chunkSize = 800, overlap = 150) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks = [];

  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks.map((content, index) => ({ id: index, content }));
}
