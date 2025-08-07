import { mutation, query, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
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
        embedding: v.optional(v.array(v.float64())),
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
    // Basic text search fallback using full table scan and substring match
    const all = await ctx.db.query("chunks").collect();
    const q = args.query.toLowerCase();
    const filtered = all.filter((c) => c.content.toLowerCase().includes(q));
    return filtered.slice(0, args.limit ?? 10);
  },
});

export const getChunksByIds = internalQuery({
  args: { ids: v.array(v.id("chunks")) },
  handler: async (ctx, args) => {
    const results: any[] = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc !== null) results.push(doc);
    }
    return results;
  },
});

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY as string;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model: "text-embedding-3-small" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings error: ${res.status} ${body}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

export const semanticSearch = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    documentId: v.optional(v.id("documents")),
    pageMin: v.optional(v.number()),
    pageMax: v.optional(v.number()),
    chapter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vector = await embed(args.query);
    const results = await (ctx as any).vectorSearch("chunks", "by_embedding", {
      vector,
      limit: args.limit ?? 10,
      filter: (q: any) => {
        let expr = q;
        if (args.documentId) expr = expr.eq("documentId", args.documentId);
        if (args.chapter) expr = expr.eq("chapter", args.chapter);
        return expr;
      },
    });

    const docs = await ctx.runQuery(
      (internal as any).documents.getChunksByIds,
      {
        ids: results.map((r: any) => r._id),
      }
    );

    const withScores = (docs as any[])
      .map((doc) => ({
        ...doc,
        _score: results.find((r: any) => r._id === doc._id)?._score ?? 0,
      }))
      .filter((d) =>
        args.pageMin != null && args.pageMax != null
          ? d.pageNumber >= (args.pageMin as number) &&
            d.pageNumber <= (args.pageMax as number)
          : true
      )
      .sort((a, b) => b._score - a._score);

    return withScores;
  },
});
