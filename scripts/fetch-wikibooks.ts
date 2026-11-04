#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';

const WIKIMEDIA_API_URL = 'https://en.wikibooks.org/w/api.php';
const USER_AGENT = 'CookMate/1.0 (academic course project; student@gu.se)';

const program = new Command();
program
  .name('fetch-wikibooks')
  .description('Fetch culinary knowledge directly from Wikibooks MediaWiki API')
  .version('1.0.0');

interface CategoryMember {
  pageid: number;
  ns: number;
  title: string;
}

interface PageExtractResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        extract?: string;
      }
    >;
  };
}

const toSlug = (title: string): string => {
  return title
    .replace(/^Cookbook:/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics to create clean url slugs
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const cleanExtract = (title: string, rawExtract: string): string => {
  const cleanTitle = title.replace(/^Cookbook:/i, '').trim();
  const wikiUrl = `https://en.wikibooks.org/wiki/${title.replace(/ /g, '_')}`;

  const lines = rawExtract.split('\n');
  const filteredLines = lines.filter(
    (line) => !line.match(/^Cookbook\s*\|.*?(Recipes|Ingredients|Equipment|Techniques)/i),
  );

  let text = filteredLines.join('\n').trim();

  // convert wikitext section headers to markdown
  text = text
    .replace(/^====\s*(.+?)\s*====$/gm, '#### $1')
    .replace(/^===\s*(.+?)\s*===$/gm, '### $1')
    .replace(/^==\s*(.+?)\s*==$/gm, '## $1');

  // normalize excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return `# ${cleanTitle}\n<!-- Source: ${wikiUrl} (CC BY-SA 4.0) -->\n\n${text}\n`;
};

const fetchCategoryMembers = async (categoryTitle: string): Promise<CategoryMember[]> => {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: categoryTitle,
    cmlimit: '500',
    format: 'json',
  });

  const res = await fetch(`${WIKIMEDIA_API_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch category members: ${res.statusText}`);
  }

  const data = (await res.json()) as {
    query?: { categorymembers?: CategoryMember[] };
  };
  return data.query?.categorymembers ?? [];
};

const fetchPageExtract = async (title: string): Promise<string | null> => {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    titles: title,
    format: 'json',
  });

  const res = await fetch(`${WIKIMEDIA_API_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch extract for "${title}": ${res.statusText}`);
  }

  const data = (await res.json()) as PageExtractResponse;
  const pages = data.query?.pages ?? {};
  const pageObj = Object.values(pages)[0];

  return pageObj?.extract ?? null;
};

const SUBTITUTIONS_PAGES = [
  'Cookbook:Substitutions',
  'Cookbook:Vegan Substitutions',
  'Cookbook:Garlic',
  'Cookbook:Olive Oil',
  'Cookbook:Egg',
  'Cookbook:Cornstarch',
  'Cookbook:Cream',
  'Cookbook:Bread Crumbs',
  'Cookbook:Honey',
  'Cookbook:Parsley',
  'Cookbook:Margarine',
  'Cookbook:Turmeric',
  'Cookbook:Cheese',
];

const fetchPageList = async (pages: string[], outputDir: string) => {
  await mkdir(outputDir, { recursive: true });
  console.log(`Fetching ${pages.length} pages into ${outputDir}...`);

  let successCount = 0;
  for (let i = 0; i < pages.length; i++) {
    const title = pages[i];
    const slug = toSlug(title);
    const filePath = path.join(outputDir, `${slug}.md`);

    try {
      const rawExtract = await fetchPageExtract(title);
      if (!rawExtract || rawExtract.trim().length === 0) {
        console.warn(`[${i + 1}/${pages.length}] Skipping empty: ${title}`);
        continue;
      }

      const markdown = cleanExtract(title, rawExtract);
      await writeFile(filePath, markdown, 'utf8');
      successCount++;
      console.log(
        `[${i + 1}/${pages.length}] Saved: ${path.relative(process.cwd(), filePath)} (${title})`,
      );

      // pause briefly between requests to avoid rate limits from the Wikibooks API
      await new Promise((resolve) => setTimeout(resolve, 80));
    } catch (err) {
      console.error(`[${i + 1}/${pages.length}] Error fetching ${title}:`, err);
    }
  }

  console.log(
    `\nDone! Successfully saved ${successCount} authentic Wikibooks files to ${outputDir}`,
  );
};

const fetchCookingTechniques = async (outputDir: string) => {
  await mkdir(outputDir, { recursive: true });
  console.log('Fetching list of pages from Category:Cooking_techniques...');

  const members = await fetchCategoryMembers('Category:Cooking_techniques');
  // filter for valid cookbook pages (namespace 102) and ignore category subpages
  const pages = members.filter((m) => m.ns === 102 && !m.title.startsWith('Category:'));

  console.log(`Found ${pages.length} technique articles to fetch.\n`);

  let successCount = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slug = toSlug(page.title);
    const filePath = path.join(outputDir, `${slug}.md`);

    try {
      const rawExtract = await fetchPageExtract(page.title);
      if (!rawExtract || rawExtract.trim().length === 0) {
        console.warn(`[${i + 1}/${pages.length}] Skipping empty: ${page.title}`);
        continue;
      }

      const markdown = cleanExtract(page.title, rawExtract);
      await writeFile(filePath, markdown, 'utf8');
      successCount++;
      console.log(
        `[${i + 1}/${pages.length}] Saved: ${path.relative(process.cwd(), filePath)} (${page.title})`,
      );

      // pause briefly between requests to avoid rate limits from the Wikibooks API
      await new Promise((resolve) => setTimeout(resolve, 80));
    } catch (err) {
      console.error(`[${i + 1}/${pages.length}] Error fetching ${page.title}:`, err);
    }
  }

  console.log(
    `\nDone! Successfully saved ${successCount} authentic Wikibooks technique files to ${outputDir}`,
  );
};

program
  .command('techniques')
  .description('Fetch all pages from Category:Cooking_techniques into data/knowledge/techniques')
  .option(
    '-o, --out <dir>',
    'output directory',
    path.join(process.cwd(), 'data', 'knowledge', 'techniques'),
  )
  .action(async (options: { out: string }) => {
    await fetchCookingTechniques(options.out);
  });

program
  .command('substitutions')
  .description(
    'Fetch substitution hub and staple ingredient pages into data/knowledge/substitutions',
  )
  .option(
    '-o, --out <dir>',
    'output directory',
    path.join(process.cwd(), 'data', 'knowledge', 'substitutions'),
  )
  .action(async (options: { out: string }) => {
    await fetchPageList(SUBTITUTIONS_PAGES, options.out);
  });

program
  .command('all')
  .description('Fetch all configured culinary categories from Wikibooks')
  .action(async () => {
    const techniquesDir = path.join(process.cwd(), 'data', 'knowledge', 'techniques');
    const substitutionsDir = path.join(process.cwd(), 'data', 'knowledge', 'substitutions');
    await fetchCookingTechniques(techniquesDir);
    await fetchPageList(SUBTITUTIONS_PAGES, substitutionsDir);
  });

// default to running `techniques` if no subcommand is passed
if (process.argv.length <= 2) {
  process.argv.push('techniques');
}

program.parse();
