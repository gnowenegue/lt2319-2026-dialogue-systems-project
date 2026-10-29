#!/usr/bin/env node

import { Command } from "commander";
import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";

import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import { QdrantClient } from "@qdrant/js-client-rest";
import { makeChunksFromFile } from "./chunker";

const qdrantUrl = process.env.VITE_QDRANT_URL || "http://localhost:6333";
const parsedUrl = new URL(qdrantUrl);

const client = new QdrantClient({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port) || 6333,
  checkCompatibility: false,
});

const program = new Command();
program
  .name("rag-cli")
  .description("Qdrant CLI for Ingestion & Querying")
  .version("1.0.0");

export const EMBEDDING_MODEL = "bge-small-en-v1.5";
export const EMBEDDING_DIMENSIONS = 384;

// Configure Transformers.js to load offline from public/models
env.localModelPath = path.resolve(process.cwd(), "public/models");
env.allowRemoteModels = false;

// Lazily load the embedding pipeline once
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
const getExtractor = (): Promise<FeatureExtractionPipeline> => {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      EMBEDDING_MODEL,
      { dtype: "q8" },
    ) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
};

const embed = async (input: string): Promise<number[]> => {
  const extractor = await getExtractor();
  const output = await extractor(input, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
};

const getMarkdownFiles = async (targetPath: string): Promise<string[]> => {
  const s = await stat(targetPath);
  if (s.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await getMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
    return files;
  }
  return [targetPath];
};

program
  .command("split")
  .description("Split file at <path> into section-aware chunks and print.")
  .argument("<path>", "file path")
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
  .command("listCollections")
  .description("List all collections in Qdrant")
  .action(async () => {
    const res = await client.getCollections();
    console.log(
      "Qdrant collections:",
      res.collections.map((c) => c.name),
    );
  });

program
  .command("createCollection")
  .description("Create a collection in Qdrant")
  .argument("<name>", "collection name")
  .action(async (name: string) => {
    await client.createCollection(name, {
      vectors: { size: EMBEDDING_DIMENSIONS, distance: "Cosine" },
    });
    console.log(`Successfully created collection: ${name}`);
  });

program
  .command("deleteCollection")
  .description("Delete a collection in Qdrant")
  .argument("<name>", "collection name")
  .action(async (name: string) => {
    await client.deleteCollection(name);
    console.log(`Successfully deleted collection: ${name}`);
  });

program
  .command("addData")
  .description(
    "Chunk data at <path> (file or directory) and add it to a collection.",
  )
  .argument("<collection>", "collection name")
  .argument("<path>", "file or directory path")
  .action(async (collection: string, targetPath: string) => {
    const files = await getMarkdownFiles(targetPath);
    console.log(`Processing ${files.length} file(s) for ingestion...`);

    let totalChunks = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const chunks = await makeChunksFromFile(file);
      if (chunks.length === 0) continue;

      const points = await Promise.all(
        chunks.map(async (chunk) => {
          const vector = await embed(chunk.text);
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

      await client.upsert(collection, { wait: true, points });
      totalChunks += chunks.length;
      console.log(
        `[${i + 1}/${files.length}] Added ${chunks.length} chunks from ${path.basename(file)}`,
      );
    }

    console.log(
      `\nSuccessfully added ${totalChunks} total chunks into collection: ${collection}`,
    );
  });

program
  .command("query")
  .description("Query a collection with semantic vector search")
  .argument("<collection>", "collection name")
  .argument("<query>", "search query string")
  .option("-l, --limit <number>", "limit number of results", "3")
  .action(
    async (
      collection: string,
      queryStr: string,
      options: { limit: string },
    ) => {
      const limit = parseInt(options.limit, 10) || 3;
      console.log(`Querying "${collection}" for: "${queryStr}"...`);
      const embedding = await embed(queryStr);
      const results = await client.query(collection, {
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
            `Category: ${payload?.category ?? "n/a"} | Topic: ${payload?.topic ?? "n/a"}`,
          );
        }
        console.log(`${payload?.text}\n`);
      });
    },
  );

program.parse();
