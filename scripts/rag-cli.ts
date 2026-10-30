#!/usr/bin/env node

import { readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import {
  CULINARY_COLLECTION,
  DEFAULT_QDRANT_PORT,
  DEFAULT_QDRANT_URL,
  EMBEDDING_DIMENSIONS,
  embedQuery,
} from '../src/rag';
import { makeChunksFromFile } from './chunker';

const client = new QdrantClient({
  url: process.env.VITE_QDRANT_URL || DEFAULT_QDRANT_URL,
  port: Number(process.env.VITE_QDRANT_PORT) || DEFAULT_QDRANT_PORT,
  checkCompatibility: false,
});

const program = new Command();
program.name('rag-cli').description('Qdrant CLI for Ingestion & Querying').version('1.0.0');

const getMarkdownFiles = async (targetPath: string): Promise<string[]> => {
  const s = await stat(targetPath);
  if (s.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await getMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files;
  }
  return [targetPath];
};

program
  .command('split')
  .description('Split file at <path> into section-aware chunks and print.')
  .argument('<path>', 'file path')
  .action(async (filePath: string) => {
    const chunks = await makeChunksFromFile(filePath);
    chunks.forEach((c, ix) => {
      console.log(
        `\n--- Chunk ${ix + 1} [Category: ${c.metadata.category} | Topic: ${c.metadata.topic}] ---`,
      );
      console.log(c.text);
    });
  });

program
  .command('listCollections')
  .description('List all collections in Qdrant')
  .action(async () => {
    const res = await client.getCollections();
    console.log(
      'Qdrant collections:',
      res.collections.map((c) => c.name),
    );
  });

program
  .command('createCollection')
  .description('Create a collection in Qdrant')
  .argument('[name]', 'collection name', CULINARY_COLLECTION)
  .action(async (name: string = CULINARY_COLLECTION) => {
    await client.createCollection(name, {
      vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
    });
    console.log(`Successfully created collection: ${name}`);
  });

program
  .command('deleteCollection')
  .description('Delete a collection in Qdrant')
  .argument('[name]', 'collection name', CULINARY_COLLECTION)
  .action(async (name: string = CULINARY_COLLECTION) => {
    await client.deleteCollection(name);
    console.log(`Successfully deleted collection: ${name}`);
  });

program
  .command('addData')
  .description('Chunk data at <path> (file or directory) and add it to a collection.')
  .argument('<path>', 'file or directory path')
  .argument('[collection]', 'collection name', CULINARY_COLLECTION)
  .action(async (targetPath: string, collection: string = CULINARY_COLLECTION) => {
    let finalPath = targetPath;
    let finalCollection = collection;

    // support backwards compatibility if user passes collection first
    try {
      await stat(targetPath);
    } catch {
      if (collection) {
        try {
          await stat(collection);
          finalPath = collection;
          finalCollection = targetPath;
        } catch {
          // let default path proceed to throw standard error
        }
      }
    }

    const files = await getMarkdownFiles(finalPath);
    console.log(`Processing ${files.length} file(s) for ingestion into "${finalCollection}"...`);

    let totalChunks = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const chunks = await makeChunksFromFile(file);
      if (chunks.length === 0) continue;

      const points = await Promise.all(
        chunks.map(async (chunk) => {
          const vector = await embedQuery(chunk.text);
          return {
            id: uuidv4(),
            vector,
            payload: {
              text: chunk.text,
              ...chunk.metadata,
            },
          };
        }),
      );

      await client.upsert(finalCollection, { wait: true, points });
      totalChunks += chunks.length;
      console.log(
        `[${i + 1}/${files.length}] Added ${chunks.length} chunks from ${path.basename(file)}`,
      );
    }

    console.log(
      `\nSuccessfully added ${totalChunks} total chunks into collection: ${finalCollection}`,
    );
  });

program
  .command('query')
  .description('Query a collection with semantic vector search')
  .argument('<query>', 'search query string')
  .argument('[collection]', 'collection name', CULINARY_COLLECTION)
  .option('-l, --limit <number>', 'limit number of results', '3')
  .action(
    async (
      queryStr: string,
      collection: string = CULINARY_COLLECTION,
      options: { limit: string },
    ) => {
      let finalQuery = queryStr;
      let finalCollection = collection;

      // support backwards compatibility if user passes collection first
      if (queryStr === CULINARY_COLLECTION && collection !== CULINARY_COLLECTION) {
        finalQuery = collection;
        finalCollection = CULINARY_COLLECTION;
      }

      const limit = parseInt(options.limit, 10) || 3;
      console.log(`Querying "${finalCollection}" for: "${finalQuery}"...`);
      const embedding = await embedQuery(finalQuery);
      const results = await client.query(finalCollection, {
        query: embedding,
        limit,
        with_payload: true,
      });

      console.log(`\nFound ${results.points.length} matching chunks:\n`);
      results.points.forEach((point, idx) => {
        console.log(`[Result ${idx + 1}] Score: ${point.score.toFixed(4)}`);
        const payload = point.payload as {
          category?: string;
          topic?: string;
          text?: string;
        };
        if (payload?.category || payload?.topic) {
          console.log(
            `Category: ${payload?.category ?? 'n/a'} | Topic: ${payload?.topic ?? 'n/a'}`,
          );
        }
        console.log(`${payload?.text}\n`);
      });
    },
  );

program.parse();
