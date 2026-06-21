// =======================================================
// RidexShare AI — Analytics
// -------------------------------------------------------
// Records each interaction (fire-and-forget) and provides aggregate queries:
// most common questions, most used tools, failed queries, RAG grounding rate.
// Designed for future AI optimization dashboards. Never blocks the response.
// =======================================================

const config = require("./config");
const AiInteraction = require("../models/AiInteraction");

/**
 * Log an interaction. Fire-and-forget — failures are swallowed so analytics
 * never breaks the chat flow.
 */
function log(entry) {
    if (!config.analytics.enabled) return;
    AiInteraction.create({
        user_id: entry.userId || null,
        sessionId: entry.sessionId || "default",
        message: (entry.message || "").slice(0, 500),
        intent: entry.intent || "",
        toolsUsed: entry.toolsUsed || [],
        ragGrounded: Boolean(entry.ragGrounded),
        ragSources: entry.ragSources || [],
        usedLLM: Boolean(entry.usedLLM),
        success: entry.success !== false,
        latencyMs: entry.latencyMs || 0,
        role: entry.role || "",
    }).catch(() => { /* swallow */ });
}

/**
 * Aggregate metrics for the admin AI analytics view.
 */
async function summary(days = 30) {
    const since = new Date(); since.setDate(since.getDate() - days);
    const [topQuestions, topTools, failed, grounding, intents, daily] = await Promise.all([
        AiInteraction.aggregate([
            { $match: { createdAt: { $gte: since }, message: { $ne: "" } } },
            { $group: { _id: { $toLower: "$message" }, count: { $sum: 1 }, intent: { $first: "$intent" } } },
            { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        AiInteraction.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $unwind: "$toolsUsed" },
            { $group: { _id: "$toolsUsed", count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        AiInteraction.countDocuments({ createdAt: { $gte: since }, success: false }),
        AiInteraction.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: "$ragGrounded", count: { $sum: 1 } } },
        ]),
        AiInteraction.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: "$intent", count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 12 },
        ]),
        AiInteraction.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]),
    ]);

    const groundedTrue = grounding.find((g) => g._id === true)?.count || 0;
    const groundedTotal = grounding.reduce((s, g) => s + g.count, 0) || 1;

    return {
        days,
        topQuestions: topQuestions.map((q) => ({ question: q._id, count: q.count, intent: q.intent || "" })),
        topTools: topTools.map((t) => ({ tool: t._id, count: t.count })),
        failedQueries: failed,
        retrievalGroundingRate: Math.round((groundedTrue / groundedTotal) * 100),
        intents: intents.map((i) => ({ intent: i._id, count: i.count })),
        daily: daily.map((d) => ({ _id: d._id, count: d.count })),
    };
}

module.exports = { log, summary };
