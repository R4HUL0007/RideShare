// =======================================================
// RidexShare AI — Document Ingestion Pipeline
// -------------------------------------------------------
// Document → Chunking → Embedding → Vector Storage.
// Turns knowledge sources (and, in future, uploaded PDFs / docs) into
// embedded, searchable chunks in the vector store. Idempotent: re-running
// upserts by stable chunk id, so it's safe to call on every boot.
// =======================================================

const config = require("../config");
const { KNOWLEDGE_SOURCES } = require("./knowledge");
const { embedBatch } = require("../providers/embeddings");
const { getVectorStore } = require("../vectorstore");

/**
 * Split text into overlapping chunks on sentence/word boundaries.
 */
function chunkText(text, { chunkSize, chunkOverlap }) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= chunkSize) return [clean];

    const chunks = [];
    let start = 0;
    while (start < clean.length) {
        let end = Math.min(start + chunkSize, clean.length);
        // Prefer to break at a sentence/word boundary near the end.
        if (end < clean.length) {
            const slice = clean.slice(start, end);
            const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
            const lastSpace = slice.lastIndexOf(" ");
            const breakAt = lastStop > chunkSize * 0.5 ? lastStop + 1 : (lastSpace > chunkSize * 0.5 ? lastSpace : -1);
            if (breakAt > 0) end = start + breakAt;
        }
        chunks.push(clean.slice(start, end).trim());
        if (end >= clean.length) break;
        start = end - chunkOverlap;
        if (start < 0) start = 0;
    }
    return chunks.filter(Boolean);
}

/**
 * Build chunk records (id, text, metadata) for a single source document.
 */
function chunkDocument(doc) {
    const chunks = chunkText(doc.content, {
        chunkSize: config.rag.chunkSize,
        chunkOverlap: config.rag.chunkOverlap,
    });
    return chunks.map((text, i) => ({
        id: `${doc.id}::${i}`,
        document: text,
        metadata: {
            sourceId: doc.id,
            title: doc.title,
            category: doc.category,
            chunk: i,
            totalChunks: chunks.length,
        },
    }));
}

/**
 * Ingest an array of source documents into the vector store.
 * @param {Array<{id,title,category,content}>} sources
 */
async function ingestSources(sources) {
    const store = await getVectorStore();
    const allChunks = sources.flatMap(chunkDocument);
    if (allChunks.length === 0) return { documents: 0, chunks: 0 };

    // Embed in batches.
    const vectors = await embedBatch(allChunks.map((c) => c.document));
    const records = allChunks.map((c, i) => ({ ...c, vector: vectors[i] }));
    await store.upsert(records);

    return { documents: sources.length, chunks: records.length };
}

/**
 * Ingest the built-in knowledge base. Called on server boot.
 */
async function ingestKnowledgeBase() {
    return ingestSources(KNOWLEDGE_SOURCES);
}

/**
 * Ensure the knowledge base is present (ingest only if the store is empty).
 * Cheap on warm restarts; full ingest on first run.
 */
async function ensureKnowledgeBase() {
    try {
        const store = await getVectorStore();
        const count = await store.count();
        if (count > 0) return { skipped: true, chunks: count };
        return await ingestKnowledgeBase();
    } catch (err) {
        console.warn("[AI] ensureKnowledgeBase failed:", err.message);
        return { error: err.message };
    }
}

module.exports = { chunkText, chunkDocument, ingestSources, ingestKnowledgeBase, ensureKnowledgeBase };
