declare module 'bidi-js' {
  export interface EmbeddingLevelsResult {
    readonly levels: Uint8Array;
    readonly paragraphs: readonly { readonly start: number; readonly end: number; readonly level: number }[];
  }

  export interface Bidi {
    getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl' | 'auto'): EmbeddingLevelsResult;
    getReorderedString(text: string, embeddingLevelsResult: EmbeddingLevelsResult, start?: number, end?: number): string;
  }

  export default function bidiFactory(): Bidi;
}
