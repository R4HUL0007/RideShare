// =======================================================
// RidexShare AI — RAG Retriever
// -------------------------------------------------------
// Embeds a query, runs semantic similarity search over the vector store, and
// returns the most relevant knowledge chunks (filtered by a minimum score).
// Also synthesizes a grounded answer: with an LLM it composes from retrieved
// context; without one it returns the best chunk verbatim — either way the
// answer is GROUNDED in retrieved knowledge (no hallucinated facts).
// =======================================================

const config = require("../config");
const { embed } = require("../providers/embeddings");
const { getVectorStore } = require("../vectorstore");
const llm = require("../providers/llm");

/**
 * Retrieve the top-K relevant chunks for a query.
 * @returns {Promise<Array<{id, score, document, metadata}>>}
 */
async function retrieve(query, { topK = config.rag.topK, minScore = config.rag.minScore } = {}) {
    const store = await getVectorStore();
    const qVec = await embed(query);
    const hits = await store.query(qVec, topK);
    return hits.filter((h) => h.score >= minScore);
}

/**
 * Answer a knowledge question with RAG. Returns:
 *   { answer, grounded: boolean, sources: [{title, category}] }
 * `grounded=false` means nothing relevant was retrieved (caller should treat
 * as "no knowledge found" and avoid fabricating).
 */
async function answer(query) {
    const hits = await retrieve(query);
    if (hits.length === 0) {
        return { answer: null, grounded: false, sources: [] };
    }

    const context = hits.map((h, i) => `[${i + 1}] (${h.metadata?.title || "doc"}) ${h.document}`).join("\n\n");
    const sources = dedupeSources(hits);

    // With an LLM: synthesize a concise, grounded answer from the context only.
    if (llm.isEnabled()) {
        const composed = await llm.complete([
            {
                role: "system",
                content:
                    "You are the RidexShare assistant. Answer the user's question ONLY using the provided context about the RidexShare platform. " +
                    "Be concise, friendly and accurate. If the context does not contain the answer, say you couldn't find that information. " +
                    "Never invent policies, numbers, payments, or rides.",
            },
            { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}` },
        ]);
        if (composed) return { answer: composed.trim(), grounded: true, sources };
    }

    // Without an LLM: return the single best chunk verbatim (still grounded).
    return { answer: hits[0].document, grounded: true, sources };
}

function dedupeSources(hits) {
    const seen = new Set();
    const out = [];
    for (const h of hits) {
        const key = h.metadata?.sourceId || h.metadata?.title;
        if (key && !seen.has(key)) {
            seen.add(key);
            out.push({ title: h.metadata?.title, category: h.metadata?.category });
        }
    }
    return out;
}

module.exports = { retrieve, answer };
