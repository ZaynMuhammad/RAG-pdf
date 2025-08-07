- **convex/schema.ts**

  - Changed `embedding` to `v.array(v.float64())`.
  - Added vector index filter fields: `["documentId", "pageNumber", "chapter"]`.
  - Kept dimensions at 1536.

- **convex/documents.ts**

  - Extended `uploadChunks` to accept `embedding`.
  - Added `getChunksByIds` (internal query) for fetching vector search results.
  - Added `semanticSearch` (action) that embeds the query via OpenAI, runs Convex vector search, and returns chunks with scores.
  - Updated `searchChunks` to a safe substring fallback (no `.like`).
  - Wired `internal` API usage and fixed types.

- **pdf/pdf-processor.ts**

  - Added `saveExtractedPdf(pdfUri, startPage, endPage, outPath)` to persist page ranges.
  - Added `splitPdfToPages(pdfUri, outDir)` to export one PDF per page.
  - Minor import additions (`mkdirSync`, `path`).

- **index.ts**

  - Removed unused Convex client instantiation requiring `CONVEX_URL`; tests pass.

- **Cursor rules**
  - Added `.cursor/rules/project-structure.mdc`, `typescript-style.mdc`, `convex-vector-search.mdc`, `pdf-processing.mdc` documenting flows, style, and vector search constraints.
