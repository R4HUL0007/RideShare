// =======================================================
// RidexShare AI — Local Vector Store
// -------------------------------------------------------
// A dependency-free, persistent vector store. Vectors + metadata are kept in
// memory for fast cosine-similarity search and mirrored to a JSON file so the
// index survives restarts. This is the DEFAULT store for local development —
// no Docker, no external service required.
//
// Implements the same minimal interface as the Chroma/Pinecone/Qdrant adapters:
//   upsert(records)         records: [{ id, vector, document, metadata }]
//   query(vector, topK)     -> [{ id, score, document, metadata }]
//   count()
//   reset()
// =======================================================

const fs = require("fs");
const path = require("path");
const { cosineSimilarity } = require("../providers/embeddings");

class LocalVectorStore {
    constructor(filePath) {
        this.filePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(__dirname, "..", "..", filePath.replace(/^\.\//, ""));
        this.records = new Map(); // id -> { id, vector, document, metadata }
        this._loaded = false;
    }

    _ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    load() {
        if (this._loaded) return;
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
                if (Array.isArray(raw?.records)) {
                    for (const r of raw.records) this.records.set(r.id, r);
                }
            }
        } catch (err) {
            console.warn("[AI] Failed to load local vector store:", err.message);
        }
        this._loaded = true;
    }

    persist() {
        try {
            this._ensureDir();
            const payload = { version: 1, updatedAt: Date.now(), records: Array.from(this.records.values()) };
            fs.writeFileSync(this.filePath, JSON.stringify(payload), "utf-8");
        } catch (err) {
            console.warn("[AI] Failed to persist local vector store:", err.message);
        }
    }

    async upsert(records) {
        this.load();
        for (const rec of records) {
            if (!rec.id || !Array.isArray(rec.vector)) continue;
            this.records.set(rec.id, {
                id: rec.id,
                vector: rec.vector,
                document: rec.document || "",
                metadata: rec.metadata || {},
            });
        }
        this.persist();
        return { upserted: records.length };
    }

    async query(vector, topK = 4) {
        this.load();
        const scored = [];
        for (const rec of this.records.values()) {
            const score = cosineSimilarity(vector, rec.vector);
            scored.push({ id: rec.id, score, document: rec.document, metadata: rec.metadata });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }

    async count() {
        this.load();
        return this.records.size;
    }

    async reset() {
        this.records.clear();
        this.persist();
    }
}

module.exports = LocalVectorStore;
