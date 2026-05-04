import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import {
  createChapter,
  createNovel,
  listChapters,
  listNovels,
  novelSummaryFromMeta,
  listStoryFiles,
  readStoryFile,
  updateStoryFile,
  createCharacterCard,
  deleteChapter,
  readChapter,
  renameChapterTitle,
  updateChapter,
  updateNovelSynopsis
} from "./fsStore.js";
import { resolveDataDir, safeSlug } from "./paths.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true
});

const PORT = Number(process.env.PORT || 3177);
const dataDir = resolveDataDir(process.env.NOVEL_HELPER_DATA_DIR);

app.get("/api/health", async () => {
  return { ok: true, dataDir };
});

// 新路由：books（与目录结构一致）
app.get("/api/books", async () => {
  const novels = await listNovels(dataDir);
  return { books: novels };
});

app.post("/api/books", async (req, reply) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    synopsis: z.string().max(20000).optional()
  });
  const body = bodySchema.parse((req as any).body);
  const slug = safeSlug(body.slug?.trim() || body.title);
  if (!slug) return reply.code(400).send({ message: "Invalid slug/title" });

  try {
    const meta = await createNovel(dataDir, slug, body.title, body.synopsis);
    return { book: novelSummaryFromMeta(meta, 0, []) };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.patch("/api/books/:slug", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    synopsis: z.string().max(20000)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const book = await updateNovelSynopsis(dataDir, params.slug, body.synopsis);
    return { book };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.get("/api/books/:slug/chapters", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listChapters(dataDir, params.slug);
  return { chapters };
});

app.post("/api/books/:slug/chapters", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    chapterIndex: z.number().int().min(1).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(dataDir, params.slug, body.title, body.content, body.chapterIndex);
  return { chapter };
});

app.get("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(dataDir, params.slug, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:slug/chapters/:filename", async (req) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    content: z.string()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(dataDir, params.slug, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapter = await renameChapterTitle(dataDir, params.slug, params.filename, body.title);
    return { chapter };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Rename failed" });
  }
});

app.delete("/api/books/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteChapter(dataDir, params.slug, params.filename);
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Delete failed" });
  }
});

app.get("/api/books/:slug/story", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const { storyFiles, charFiles } = await listStoryFiles(dataDir, params.slug);
  return { storyFiles, charFiles };
});

app.post("/api/books/:slug/story/characters", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ name: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const out = await createCharacterCard(dataDir, params.slug, body.name);
    return { character: out };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/books/:slug/story/file", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const querySchema = z.object({ path: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const query = querySchema.parse((req as any).query);
  try {
    const content = await readStoryFile(dataDir, params.slug, query.path);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/books/:slug/story/file", async (req) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({ path: z.string().min(1), content: z.string() });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateStoryFile(dataDir, params.slug, body.path, body.content);
  return { ok: true };
});

// 兼容旧路由：novels -> books
app.get("/api/novels", async () => {
  const novels = await listNovels(dataDir);
  return { novels };
});

app.post("/api/novels", async (req, reply) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    slug: z.string().optional(),
    synopsis: z.string().max(20000).optional()
  });
  const body = bodySchema.parse((req as any).body);
  const slug = safeSlug(body.slug?.trim() || body.title);
  if (!slug) return reply.code(400).send({ message: "Invalid slug/title" });

  try {
    const meta = await createNovel(dataDir, slug, body.title, body.synopsis);
    return { novel: novelSummaryFromMeta(meta, 0, []) };
  } catch (e: any) {
    return reply.code(409).send({ message: e?.message || "Conflict" });
  }
});

app.get("/api/novels/:slug/chapters", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const params = paramsSchema.parse((req as any).params);
  const chapters = await listChapters(dataDir, params.slug);
  return { chapters };
});

app.post("/api/novels/:slug/chapters", async (req, reply) => {
  const paramsSchema = z.object({ slug: z.string().min(1) });
  const bodySchema = z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    chapterIndex: z.number().int().min(1).optional()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  const chapter = await createChapter(dataDir, params.slug, body.title, body.content, body.chapterIndex);
  return { chapter };
});

app.get("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    const content = await readChapter(dataDir, params.slug, params.filename);
    return { content };
  } catch {
    return reply.code(404).send({ message: "Not found" });
  }
});

app.put("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    content: z.string()
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  await updateChapter(dataDir, params.slug, params.filename, body.content);
  return { ok: true };
});

app.patch("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body);
  try {
    const chapter = await renameChapterTitle(dataDir, params.slug, params.filename, body.title);
    return { chapter };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Rename failed" });
  }
});

app.delete("/api/novels/:slug/chapters/:filename", async (req, reply) => {
  const paramsSchema = z.object({
    slug: z.string().min(1),
    filename: z.string().min(1)
  });
  const params = paramsSchema.parse((req as any).params);
  try {
    await deleteChapter(dataDir, params.slug, params.filename);
    return { ok: true };
  } catch (e: any) {
    return reply.code(400).send({ message: e?.message || "Delete failed" });
  }
});

await app.listen({ port: PORT, host: "127.0.0.1" });

