// =======================================================
// RidexShare AI — Embeddings provider (abstraction)
// -------------------------------------------------------
// Produces vector embeddings for text. Two backends:
//   - "local"  : a deterministic, dependency-free hashed bag-of-words +
//                character n-gram embedding. Good enough for semantic-ish
//                keyword retrieval over our curated knowledge base, works
//                fully offline, and is fast.
//   - "openai" : real semantic embeddings via LangChain/OpenAI (when a key is
//                present). Loaded lazily so the package is optional.
//
// The output shape (an array of floats, L2-normalized) is identical for both,
// so the vector store and retriever never care which backend produced them.
// =======================================================

const config = require("../config");

// ---------- Local deterministic embedding ----------
const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
    "was", "were", "be", "by", "with", "as", "at", "it", "this", "that", "you",
    "your", "i", "me", "my", "we", "our", "do", "does", "how", "what", "when",
    "can", "will", "would", "should",
]);

function tokenize(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t && t.length > 1 && !STOPWORDS.has(t));
}

// Stable string hash (FNV-1a) → non-negative int.
function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function l2normalize(vec) {
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return vec.map((v) => v / norm);
}

/**
 * Local hashed embedding: project tokens (and char trigrams for fuzzy matching)
 * into a fixed-dimension vector with TF weighting, then L2-normalize.
 */
function localEmbed(text, dim = config.embeddings.localDim) {
    const vec = new Array(dim).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vec;

    const addFeature = (feature, weight) => {
        const idx = hash(feature) % dim;
        const sign = (hash(feature + "#") & 1) ? 1 : -1; // signed hashing reduces collisions
        vec[idx] += sign * weight;
    };

    for (const tok of tokens) {
        addFeature(tok, 1);
        // character trigrams for fuzzy / typo tolerance
        const padded = `^${tok}$`;
        for (let i = 0; i < padded.length - 2; i++) {
            addFeature(`tri:${padded.slice(i, i + 3)}`, 0.35);
        }
    }
    return l2normalize(vec);
}

// ---------- OpenAI embedding (lazy) ----------
let _openaiEmbedder = null;
async function getOpenAIEmbedder() {
    if (_openaiEmbedder) return _openaiEmbedder;
    // Lazy import so @langchain/openai is OPTIONAL.
    const { OpenAIEmbeddings } = await import("@langchain/openai");
    _openaiEmbedder = new OpenAIEmbeddings({
        apiKey: config.llm.openaiApiKey,
        model: config.embeddings.openaiModel,
    });
    return _openaiEmbedder;
}

const useOpenAI = () =>
    config.embeddings.provider === "openai" && Boolean(config.llm.openaiApiKey);

/**
 * Embed a single string → float[].
 */
async function embed(text) {
    if (useOpenAI()) {
        try {
            const e = await getOpenAIEmbedder();
            const [vec] = await e.embedDocuments([text]);
            return vec;
        } catch (err) {
            console.warn("[AI] OpenAI embed failed, falling back to local:", err.message);
        }
    }
    return localEmbed(text);
}

/**
 * Embed many strings → float[][]. Batches for OpenAI; maps for local.
 */
async function embedBatch(texts) {
    if (useOpenAI()) {
        try {
            const e = await getOpenAIEmbedder();
            return await e.embedDocuments(texts);
        } catch (err) {
            console.warn("[AI] OpenAI batch embed failed, falling back to local:", err.message);
        }
    }
    return texts.map((t) => localEmbed(t));
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = {
    embed,
    embedBatch,
    localEmbed,
    cosineSimilarity,
    activeProvider: () => (useOpenAI() ? "openai" : "local"),
};
