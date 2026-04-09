import { encode, decode } from "gpt-tokenizer";

export const countTokens = (text: string): number => encode(text).length;

export const chunkTextWithMetadata = (
  pages: { pageNumber: number; text: string }[],
  fileName: string,
  limit: number = 500,
  overlap: number = 200,
) => {
  // 1. Pre-calculate size
  const encodedPages = pages.map((p) => ({
    tokens: encode(p.text),
    pageNumber: p.pageNumber,
  }));

  const totalTokens = encodedPages.reduce((acc, p) => acc + p.tokens.length, 0);

  // 2. Allocate Typed Arrays
  const allTokens = new Uint32Array(totalTokens);
  const pageMap = new Uint32Array(totalTokens);

  // 3. Fill Buffers (High Speed)
  let offset = 0;
  for (const page of encodedPages) {
    allTokens.set(page.tokens, offset);
    pageMap.fill(page.pageNumber, offset, offset + page.tokens.length);
    offset += page.tokens.length;
  }

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  // 4. Sliding Window with Subarrays
  while (start < totalTokens) {
    const end = Math.min(start + limit, totalTokens);

    // 1. Get the raw text from tokens
    const rawText = decode(allTokens.subarray(start, end));
    const startPage = pageMap[start];

    // 2. Create the Source Header
    // Example: [Source: budget_2024.pdf | Page: 12]
    // const sourceHeader = `[Source: ${fileName} | Page: ${startPage}]\n`;

    // 3. Prepend the header to the text
    // The AI will now "see" this header as part of the document content
    const chunkText = rawText;

    chunks.push({
      text: chunkText,
      metadata: {
        fileName,
        pageNumber: startPage,
        chunkIndex: chunkIndex++,
      },
    });

    start += limit - overlap;
    if (limit <= overlap) break;
  }

  return chunks;
};
