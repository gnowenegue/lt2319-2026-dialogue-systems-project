#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { ACTIVE_LLM_MODEL, ACTIVE_REFINER_MODEL, openai } from '../src/llm';
import prompts from '../src/prompts';
import { queryCulinaryKnowledge } from '../src/rag';
import { searchMealsByName } from '../src/recipes/api';
import { REFINER_TEMPERATURE } from '../src/recipes/constants';
import { refineRecipeWithLLM } from '../src/recipes/refiner';
import { parseUtterance } from '../src/semantic-parser/parser';

// load local .env credentials for Node CLI execution
if (typeof process !== 'undefined' && process.loadEnvFile && existsSync('.env')) {
  try {
    process.loadEnvFile();
  } catch (error) {
    console.warn('[Env] Failed to auto-load .env file:', error);
  }
}

const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const printDivider = (title: string): void => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title.toUpperCase()}`);
  console.log('='.repeat(70));
};

/**
 * test semantic parsing across common voice commands and entity slots
 */
async function testSemanticParser(): Promise<void> {
  printDivider('1. Testing Semantic Parser (Groq / LLM)');

  const testUtterances = [
    'next step',
    'set a timer for pasta for 7 minutes',
    'jump to step 3 please',
    'how much butter do I need',
    'what can I substitute for buttermilk',
    'yes sure that sounds good',
    'no wait hold on',
  ];

  for (const utterance of testUtterances) {
    const start = performance.now();
    const result = await parseUtterance(utterance);
    const durationMs = Math.round(performance.now() - start);

    console.log(`\nInput speech: "${utterance}" (${durationMs}ms)`);
    console.log(`-> Act: ${result.act}`);
    if (result.entities && Object.keys(result.entities).length > 0) {
      console.log(`-> Entities: ${JSON.stringify(result.entities)}`);
    } else {
      console.log('-> Entities: {} (none)');
    }
  }
}

/**
 * test default conversational persona for speech conciseness (<25 words)
 */
async function testSystemDefault(): Promise<void> {
  printDivider('2. Testing systemDefault (Conversational Assistance & Help)');

  // tests whether the model avoids bulleted feature lists and stays under 25 words
  const userQuery = 'What can you help me with in the kitchen?';
  console.log(`User asks: "${userQuery}"`);

  const start = performance.now();
  const completion = await openai.chat.completions.create({
    model: ACTIVE_LLM_MODEL,
    messages: [
      { role: 'system', content: prompts.systemDefault },
      { role: 'user', content: userQuery },
    ],
    temperature: REFINER_TEMPERATURE,
  });
  const durationMs = Math.round(performance.now() - start);

  const reply = completion.choices[0]?.message?.content?.trim() || '';
  const wordCount = countWords(reply);

  console.log(`\nResponse (${durationMs}ms):`);
  console.log(`"${reply}"`);
  console.log(
    `\nWord count: ${wordCount} words (Target: <= 25 words -> ${wordCount <= 25 ? 'PASS' : 'WARN: EXCEEDS 25'})`,
  );
}

/**
 * test RAG retrieval + spoken synthesis prompt grounding and safety
 */
async function testSystemRAG(): Promise<void> {
  printDivider('3. Testing systemRAG (Qdrant Retrieval + Spoken Synthesis)');

  const queries = [
    {
      question: 'What can I use instead of buttermilk?',
      category: 'substitutions' as const,
    },
    {
      question: 'How do I know when pasta is al dente?',
      category: 'techniques' as const,
    },
    {
      question: 'What temperature should I bake radioactive fuel rods at?',
      category: 'techniques' as const,
    },
  ];

  for (const item of queries) {
    console.log(`\n--- Question: "${item.question}" ---`);

    // retrieve culinary context string from Qdrant
    let contextText = '';
    try {
      const searchResult = await queryCulinaryKnowledge(item.question, {
        category: item.category,
        limit: 2,
      });

      const isNotFound = searchResult.startsWith('No matching culinary advice found');
      if (!isNotFound) {
        contextText = searchResult;
        console.log('Retrieved culinary context from Qdrant.');
      } else {
        console.log('No relevant context found in Qdrant (testing safety fallback).');
      }
    } catch (ragError) {
      console.warn('[RAG] Qdrant search skipped or offline:', (ragError as Error).message);
    }

    const start = performance.now();
    const completion = await openai.chat.completions.create({
      model: ACTIVE_LLM_MODEL,
      messages: [
        { role: 'system', content: prompts.systemRAG },
        {
          role: 'user',
          content: contextText
            ? `Context:\n${contextText}\n\nQuestion: ${item.question}`
            : `Question: ${item.question}`,
        },
      ],
      temperature: REFINER_TEMPERATURE,
    });
    const durationMs = Math.round(performance.now() - start);

    const reply = completion.choices[0]?.message?.content?.trim() || '';
    const wordCount = countWords(reply);

    console.log(`Spoken Output (${durationMs}ms):`);
    console.log(`"${reply}"`);
    console.log(
      `Word count: ${wordCount} words (Target: <= 25 words -> ${wordCount <= 25 ? 'PASS' : 'WARN: EXCEEDS 25'})`,
    );
  }
}

/**
 * test recipe refinement with TheMealDB data
 */
async function testRecipeRefinement(): Promise<void> {
  printDivider('4. Testing recipeRefinement (TheMealDB Normalization & TTS Cleanup)');

  console.log('Fetching sample recipe "Spicy Arrabiata Penne" from TheMealDB...');
  const meals = await searchMealsByName('Arrabiata');
  if (!meals || meals.length === 0) {
    console.warn('No meal found for Arrabiata, skipping refinement test.');
    return;
  }

  const rawMeal = meals[0];
  console.log(`Found recipe: "${rawMeal.strMeal}" (ID: ${rawMeal.idMeal})`);

  const start = performance.now();
  const refined = await refineRecipeWithLLM(rawMeal);
  const durationMs = Math.round(performance.now() - start);

  console.log(`\nRefinement completed in ${durationMs}ms:`);
  console.log(`- Title: ${refined.title}`);
  console.log(`- Estimated Total Time: ${refined.totalEstimatedMinutes ?? 'unknown'} minutes`);
  console.log(`- Ingredients count: ${refined.ingredients.length}`);
  console.log(`- Steps count: ${refined.steps.length}`);

  console.log('\nSample Refined Ingredients:');
  refined.ingredients.slice(0, 4).forEach((ing) => {
    console.log(`  * [${ing.name}] (${ing.measure}): "${ing.text}"`);
  });

  console.log('\nSample Refined Steps (Voice TTS Optimized):');
  refined.steps.slice(0, 3).forEach((st) => {
    const words = countWords(st.instruction);
    console.log(
      `  * Step ${st.stepNumber} (${words}w${st.estimatedMinutes ? `, ${st.estimatedMinutes}m` : ''}): "${st.instruction}"`,
    );
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * orchestrates the test suite with CLI section filtering and rate-limit pacing
 */
async function main(): Promise<void> {
  const target = process.argv[2]?.toLowerCase();
  console.log(`Active Voice Model: ${ACTIVE_LLM_MODEL}`);
  console.log(`Active Refiner Model: ${ACTIVE_REFINER_MODEL}`);
  console.log(`Target: ${target || 'all (with rate-limit pacing)'}\n`);

  try {
    if (!target || target === 'recipe') {
      await testRecipeRefinement();
      if (!target) await sleep(2000);
    }

    if (!target || target === 'parser' || target === 'nlu') {
      await testSemanticParser();
      if (!target) await sleep(1000);
    }

    if (!target || target === 'default' || target === 'chat') {
      await testSystemDefault();
      if (!target) await sleep(1000);
    }

    if (!target || target === 'rag') {
      await testSystemRAG();
    }

    printDivider('All Prompt Tests Finished');
  } catch (error) {
    console.error('\nTest Suite encountered an error:', error);
    process.exit(1);
  }
}

main();
