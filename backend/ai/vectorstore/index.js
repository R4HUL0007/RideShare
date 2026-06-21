// =======================================================
// RidexShare AI — Vector Store factory
// -------------------------------------------------------
// Returns a vector store instance for the configured provider. The local store
// is always available (default). Chroma / Pinecone / Qdrant adapters are loaded
// LAZILY and only when selected, so their client packages stay optional.
//
// Every adapter exposes the same interface:
//   upsert(records) | query(vector, topK) | count() | reset()
// =======================================================

const config = require("../config");
const LocalVectorStore = require("./localStore");

let _store = null;

// --- Lazy adapters for external vector DBs (kept thin + optional) ---

async function makeChromaStore() {
    const { ChromaClient } = await import("chromadb");
    const client = new ChromaClient({ path: config.vectorStore.chroma.url });
    const name = config.vectorStore.collection;
    const collection = await client.getOrCreateCollection({ name });
    return {
        async upsert(records) {
            await collection.upsert({
                ids: records.map((r) => r.id),
                embeddings: records.map((r) => r.vector),
                documents: records.map((r) => r.document || ""),
                metadatas: records.map((r) => r.metadata || {}),
            });
            return { upserted: records.length };
        },
        async query(vector, topK = 4) {
            const res = await collection.query({ queryEmbeddings: [vector], nResults: topK });
            const ids = res.ids?.[0] || [];
            return ids.map((id, i) => ({
                id,
                score: 1 - (res.distances?.[0]?.[i] ?? 0), // cosine distance -> similarity
                document: res.documents?.[0]?.[i] || "",
                metadata: res.metadatas?.[0]?.[i] || {},
            }));
        },
        async count() { return collection.count(); },
        async reset() { await client.deleteCollection({ name }); },
    };
}

async function makeQdrantStore() {
    const { QdrantClient } = await import("@qdrant/js-client-rest");
    const client = new QdrantClient({ url: config.vectorStore.qdrant.url, apiKey: config.vectorStore.qdrant.apiKey || undefined });
    const name = config.vectorStore.collection;
    return {
        async upsert(records) {
            await client.upsert(name, {
                points: records.map((r) => ({ id: r.id, vector: r.vector, payload: { document: r.document, ...r.metadata } })),
            });
            return { upserted: records.length };
        },
        async query(vector, topK = 4) {
            const res = await client.search(name, { vector, limit: topK, with_payload: true });
            return res.map((p) => ({ id: p.id, score: p.score, document: p.payload?.document || "", metadata: p.payload || {} }));
        },
        async count() { const r = await client.count(name); return r.count; },
        async reset() { /* left to ops */ },
    };
}

async function makePineconeStore() {
    const { Pinecone } = await import("@pinecone-database/pinecone");
    const pc = new Pinecone({ apiKey: config.vectorStore.pinecone.apiKey });
    const index = pc.index(config.vectorStore.pinecone.index);
    return {
        async upsert(records) {
            await index.upsert(records.map((r) => ({ id: r.id, values: r.vector, metadata: { document: r.document, ...r.metadata } })));
            return { upserted: records.length };
        },
        async query(vector, topK = 4) {
            const res = await index.query({ vector, topK, includeMetadata: true });
            return (res.matches || []).map((m) => ({ id: m.id, score: m.score, document: m.metadata?.document || "", metadata: m.metadata || {} }));
        },
        async count() { const s = await index.describeIndexStats(); return s.totalRecordCount || 0; },
        async reset() { /* left to ops */ },
    };
}

/**
 * Get the configured vector store (singleton). Falls back to the local store if
 * an external adapter fails to initialize.
 */
async function getVectorStore() {
    if (_store) return _store;
    const provider = config.vectorStore.provider;
    try {
        if (provider === "chroma") _store = await makeChromaStore();
        else if (provider === "qdrant") _store = await makeQdrantStore();
        else if (provider === "pinecone") _store = await makePineconeStore();
        else _store = new LocalVectorStore(config.vectorStore.localPath);
        if (provider !== "local") console.log(`[AI] Vector store: ${provider}`);
    } catch (err) {
        console.warn(`[AI] Vector store '${provider}' init failed, using local. Reason:`, err.message);
        _store = new LocalVectorStore(config.vectorStore.localPath);
    }
    return _store;
}

module.exports = { getVectorStore };
