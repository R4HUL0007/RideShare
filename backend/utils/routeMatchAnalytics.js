// =======================================================
// Smart Route Matching — analytics (fire-and-forget)
// -------------------------------------------------------
// Records a compact summary of each smart search and exposes an aggregate for
// the admin panel: match success rate, match-type distribution, conversion.
// Never blocks the request path; failures are swallowed.
// =======================================================

const RouteMatchLog = require("../models/RouteMatchLog");

/**
 * Log one smart search. `results` are the annotated rides (each with `_match`).
 */
function logRouteMatch({ userId, candidates, results }) {
    const types = { exact: 0, on_route: 0, near_route: 0, near_dest: 0, partial: 0, source_only: 0 };
    let bestScore = 0;
    for (const r of results) {
        const t = r._match?.type;
        if (t && t in types) types[t] += 1;
        if ((r._match?.score || 0) > bestScore) bestScore = r._match.score;
    }
    RouteMatchLog.create({
        user_id: userId || null,
        candidates: candidates || 0,
        matches: results.length,
        bestScore,
        types,
    }).catch(() => { /* swallow */ });
}

/**
 * Aggregate metrics over the last `days` days for the admin analytics view.
 */
async function summary(days = 30) {
    const since = new Date(); since.setDate(since.getDate() - days);
    const [totals, typeAgg] = await Promise.all([
        RouteMatchLog.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: {
                _id: null,
                searches: { $sum: 1 },
                withMatches: { $sum: { $cond: [{ $gt: ["$matches", 0] }, 1, 0] } },
                converted: { $sum: { $cond: ["$converted", 1, 0] } },
                avgMatches: { $avg: "$matches" },
            } },
        ]),
        RouteMatchLog.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: {
                _id: null,
                exact: { $sum: "$types.exact" },
                on_route: { $sum: "$types.on_route" },
                near_route: { $sum: "$types.near_route" },
                near_dest: { $sum: "$types.near_dest" },
                partial: { $sum: "$types.partial" },
            } },
        ]),
    ]);
    const t = totals[0] || { searches: 0, withMatches: 0, converted: 0, avgMatches: 0 };
    const ty = typeAgg[0] || {};
    return {
        days,
        searches: t.searches,
        matchSuccessRate: t.searches ? Math.round((t.withMatches / t.searches) * 100) : 0,
        conversionRate: t.withMatches ? Math.round((t.converted / t.withMatches) * 100) : 0,
        avgMatchesPerSearch: Number((t.avgMatches || 0).toFixed(1)),
        intermediateStopMatches: (ty.on_route || 0),
        nearbyDestinationMatches: (ty.near_dest || 0) + (ty.near_route || 0),
        typeBreakdown: {
            exact: ty.exact || 0, on_route: ty.on_route || 0, near_route: ty.near_route || 0,
            near_dest: ty.near_dest || 0, partial: ty.partial || 0,
        },
    };
}

module.exports = { logRouteMatch, summary };
