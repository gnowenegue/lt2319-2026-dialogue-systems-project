/**
 * safely extracts and parses a JSON object or array from LLM responses,
 * handling markdown code fences, leading/trailing commentary, and whitespace.
 */
export const safeExtractJson = <T = Record<string, unknown>>(content: string): T | null => {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  // attempt direct parsing first for standard JSON responses
  try {
    const direct = JSON.parse(trimmed);
    if (typeof direct === 'object' && direct !== null) {
      return direct as T;
    }
  } catch {
    // proceed to pattern extraction
  }

  // strip markdown code block fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // try parsing from the first opening brace/bracket to each successive
  // closing brace/bracket until `JSON.parse` succeeds
  const opener = candidate.indexOf('{');
  const close = '}';

  if (opener === -1) {
    return null;
  }

  for (
    let pos = candidate.indexOf(close, opener + 1);
    pos !== -1;
    pos = candidate.indexOf(close, pos + 1)
  ) {
    try {
      const parsed = JSON.parse(candidate.slice(opener, pos + 1));
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as T;
      }
    } catch {
      // not enough closing braces yet, keep scanning
    }
  }

  return null;
};
