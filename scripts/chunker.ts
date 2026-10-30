import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface ChunkWithMetadata {
  text: string;
  metadata: {
    category: string;
    topic: string;
    source: string;
  };
}

/**
 * splits a culinary markdown file into section-aware, self-contained chunks.
 * preserves heading hierarchy and attaches metadata (`category`, `topic`, `source`).
 */
export const makeChunksFromFile = async (filepath: string): Promise<ChunkWithMetadata[]> => {
  const document = await readFile(filepath, 'utf8');
  const normalizedPath = filepath.replace(/\\/g, '/');
  const pathParts = normalizedPath.split('/');
  const filename = path.basename(filepath, path.extname(filepath));
  const category = pathParts.length > 2 ? pathParts[pathParts.length - 2] : 'general';

  const titleMatch = document.match(/^#\s+(.+)$/m);
  const docTitle = titleMatch ? titleMatch[1].trim() : filename;

  // strip top # Title and HTML comments from document body
  const bodyText = document
    .replace(/^#\s+[^\n]+/m, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  // split by markdown sections (headers starting with ## or ###)
  const rawSections = bodyText
    .split(/\n(?=#{2,3}\s+)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: ChunkWithMetadata[] = [];
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 60,
    separators: ['\n\n\n', '\n\n', '. ', '\n', ' '],
  });

  for (const section of rawSections) {
    // skip trailing recipe lists, cross-references, or bibliography
    if (section.match(/^#{2,3}\s+(Recipes\b|See also|References|External links)/i)) {
      continue;
    }

    // skip orphan headings without substantive text content
    const contentWithoutHeading = section.replace(/^#{1,4}\s+[^\n]+/gm, '').trim();
    if (contentWithoutHeading.length < 15) {
      continue;
    }

    const prefixedSection =
      docTitle && !section.startsWith(`[${docTitle}]`) ? `[${docTitle}] ${section}` : section;

    if (prefixedSection.length > 900) {
      const subChunks = await textSplitter.splitText(prefixedSection);
      for (const sub of subChunks) {
        chunks.push({
          text: sub,
          metadata: { category, topic: filename, source: filepath },
        });
      }
    } else {
      chunks.push({
        text: prefixedSection,
        metadata: { category, topic: filename, source: filepath },
      });
    }
  }

  // fallback if no markdown sections were recognized
  if (chunks.length === 0) {
    const rawChunks = await textSplitter.splitText(document);
    for (const chunk of rawChunks) {
      chunks.push({
        text: chunk,
        metadata: { category, topic: filename, source: filepath },
      });
    }
  }

  return chunks;
};
