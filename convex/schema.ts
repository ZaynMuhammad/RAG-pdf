import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    filename: v.string(),
    title: v.string(),
    author: v.optional(v.string()),
    totalPages: v.number(),
    uploadedAt: v.string(),
    fileSize: v.number(),
  }),

  chunks: defineTable({
    documentId: v.id("documents"),
    chunkId: v.string(),
    content: v.string(),
    pageNumber: v.number(),
    title: v.optional(v.string()),
    chapter: v.optional(v.string()),
    paragraphIndex: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_document", ["documentId"])
    .index("by_chunk_id", ["chunkId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // OpenAI embedding size
      filterFields: ["documentId", "pageNumber", "chapter"],
    }),
});
