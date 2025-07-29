import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const uploadDocument = mutation({
  args: {
    filename: v.string(),
    title: v.string(),
    author: v.optional(v.string()),
    totalPages: v.number(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      ...args,
      uploadedAt: new Date().toISOString(),
    });
  },
});

export const uploadChunks = mutation({
  args: {
    chunks: v.array(
      v.object({
        documentId: v.id("documents"),
        chunkId: v.string(),
        content: v.string(),
        pageNumber: v.number(),
        title: v.optional(v.string()),
        chapter: v.optional(v.string()),
        paragraphIndex: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const insertedChunks = [];
    for (const chunk of args.chunks) {
      const id = await ctx.db.insert("chunks", chunk);
      insertedChunks.push(id);
    }
    return insertedChunks;
  },
});

export const searchChunks = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Basic text search - you'll want to add vector search later
    const chunks = await ctx.db
      .query("chunks")
      .filter((q) => q.like(q.field("content"), args.query))
      .take(args.limit ?? 10);

    return chunks;
  },
});
