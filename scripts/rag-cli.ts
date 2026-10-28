#!/usr/bin/env node

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantClient } from "@qdrant/js-client-rest";

const qdrantUrl = process.env.VITE_QDRANT_URL || "http://localhost:6333";
const parsedUrl = new URL(qdrantUrl);

const client = new QdrantClient({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port) || 6333,
});

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1/",
  apiKey: process.env.OPENAI_API_KEY || "ollama",
});

const program = new Command();
program
  .name("rag-cli")
  .description("Qdrant CLI for Ingestion & Querying")
  .version("1.0.0");

const embed = async (input: string) =>
  openai.embeddings
    .create({
      model: "qwen3-embedding",
      input: input,
      dimensions: 384,
    })
    .then((result) => result.data[0].embedding);

const makeChunksFromFile = async (filepath: string) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
    separators: ["\n\n\n", "\n\n", "\n", ". ", " "],
  });

  const document = await readFile(filepath, "utf8");
  return await splitter.splitText(document);
};

program
  .command("split")
  .description("Split file at <path> into chunks and print.")
  .argument("<path>", "file path")
  .action(async (path: string) => {
    const chunks = await makeChunksFromFile(path);
    chunks.forEach((c, ix) => console.log(ix, "\n", c));
  });

program
  .command("createCollection")
  .description("Create a collection in Qdrant")
  .argument("<name>", "collection name")
  .action(async (name: string) => {
    await client.createCollection(name, {
      vectors: { size: 384, distance: "Cosine" },
    });
    console.log(`Successfully created collection: ${name}`);
  });

program
  .command("addData")
  .description("Chunk data at <path> and add it to a collection.")
  .argument("<collection>", "collection name")
  .argument("<path>", "file path")
  .action(async (collection: string, path: string) => {
    const chunks = await makeChunksFromFile(path);
    const points = await Promise.all(
      chunks.map(async (chunk) => {
        const embedding = await embed(chunk);
        return {
          id: uuidv4(),
          vector: embedding,
          payload: { text: chunk },
        };
      }),
    );
    console.log(
      `Done chunking into ${chunks.length} documents. Adding them into collection: ${collection}...`,
    );
    await client.upsert(collection, { wait: true, points: points });
    console.log(
      `Successfully added ${chunks.length} documents into collection: ${collection}`,
    );
  });

program.parse();
