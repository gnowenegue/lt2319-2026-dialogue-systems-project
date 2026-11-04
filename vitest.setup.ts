// polyfill browser globals required by SpeechState in Node.js test environment
if (typeof window === 'undefined') {
  globalThis.self = globalThis as unknown as Window & typeof globalThis;
  globalThis.document = {
    createElement: () => ({
      setAttribute: () => {},
      getAttribute: () => null,
    }),
    head: { appendChild: () => {} },
  } as unknown as Document;
  globalThis.window = globalThis as unknown as Window & typeof globalThis;
  globalThis.SpeechSynthesisUtterance = class {} as unknown as typeof SpeechSynthesisUtterance;
  globalThis.AudioContext = class {} as unknown as typeof AudioContext;
}
