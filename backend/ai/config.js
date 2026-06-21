// =======================================================
// RidexShare AI — Central configuration
// -------------------------------------------------------
// Single source of truth for how the AI layer behaves. Every capability
// (LLM, embeddings, vector store) is selected here and degrades gracefully:
// when no API key / external service is configured, the system falls back to
// a fully-local, dependency-free implementation so the app always works.
//
// The whole AI layer is MODULAR and REPLACEABLE — swap a provider here and
// nothing else changes.
// =======================================================

require("dotenv").config();

const env = process.env;

const config = {
    // ---- LLM provider ----
    // When an API key is present the agent uses a real LLM (via LangChain when
    // the packages are installed). Otherwise it uses the deterministic
    // rule-based reasoner (the existing assistant brain, ported server-side).
    llm: {
        provider: env.AI_LLM_PROVIDER || "auto", // auto | openai | none
        openaiApiKey: env.OPENAI_API_KEY || "",
        model: env.AI_LLM_MODEL || "gpt-4o-mini",
        temperature: Number(env.AI_LLM_TEMPERATURE ?? 0.2),
        maxTokens: Number(env.AI_LLM_MAX_TOKENS ?? 512),
        get enabled() {
            return Boolean(this.openaiApiKey) && this.provider !== "none";
        },
    },

    // ---- Embeddings provider ----
    // Used by the RAG layer. Defaults to a fast, local, deterministic embedding
    // (no network) so retrieval works offline. Switches to OpenAI embeddings
    // when a key is present and AI_EMBEDDINGS=openai.
    embeddings: {
        provider: env.AI_EMBEDDINGS_PROVIDER || "local", // local | openai
        openaiModel: env.AI_EMBEDDINGS_MODEL || "text-embedding-3-small",
        localDim: Number(env.AI_EMBEDDINGS_DIM ?? 384), // local hashed-embedding size
    },

    // ---- Vector store ----
    // Default: a local cosine-similarity store persisted to JSON (zero deps).
    // Ready for ChromaDB / Pinecone / Qdrant by setting AI_VECTOR_STORE + the
    // relevant connection envs.
    vectorStore: {
        provider: env.AI_VECTOR_STORE || "local", // local | chroma | pinecone | qdrant
        collection: env.AI_VECTOR_COLLECTION || "rideshare_knowledge",
        // Local store persistence path.
        localPath: env.AI_VECTOR_LOCAL_PATH || "./ai/data/vectorstore.json",
        chroma: {
            url: env.CHROMA_URL || "http://localhost:8000",
        },
        pinecone: {
            apiKey: env.PINECONE_API_KEY || "",
            index: env.PINECONE_INDEX || "rideshare",
        },
        qdrant: {
            url: env.QDRANT_URL || "http://localhost:6333",
            apiKey: env.QDRANT_API_KEY || "",
        },
    },

    // ---- RAG tuning ----
    rag: {
        chunkSize: Number(env.AI_RAG_CHUNK_SIZE ?? 700),
        chunkOverlap: Number(env.AI_RAG_CHUNK_OVERLAP ?? 100),
        topK: Number(env.AI_RAG_TOP_K ?? 4),
        minScore: Number(env.AI_RAG_MIN_SCORE ?? 0.12),
    },

    // ---- Memory ----
    memory: {
        maxTurns: Number(env.AI_MEMORY_MAX_TURNS ?? 12),
        ttlMs: Number(env.AI_MEMORY_TTL_MS ?? 30 * 60 * 1000), // 30 min
    },

    // ---- Analytics ----
    analytics: {
        enabled: env.AI_ANALYTICS_ENABLED !== "false",
    },
};

module.exports = config;
