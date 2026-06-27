// =======================================================
// NoSQL operator-injection guard.
//
// MongoDB treats object-valued query fields as operator expressions, so a JSON
// body like { "email": { "$gt": "" } } can subvert a `findOne({ email })`
// lookup (auth bypass) or a `{ "$where": "..." }` payload can inject server-side
// JS. This middleware strips any property whose key begins with "$" or contains
// a "." (the two ways Mongo interprets operators / dotted paths) from req.body,
// req.params, and req.query — recursively, in place.
//
// This is an in-house replacement for express-mongo-sanitize: no extra
// dependency, and it works regardless of whether req.query is a read-only getter
// (Express 5) by mutating the existing object in place rather than reassigning.
//
// It deliberately does NOT coerce types — individual controllers still apply
// String(...) coercion on sensitive fields for defense in depth.
// =======================================================

const FORBIDDEN_KEY = /^\$|\./;

function scrub(value, depth = 0) {
    // Guard against pathologically deep payloads (the 100kb body limit already
    // bounds size; this bounds recursion).
    if (depth > 20 || value === null || typeof value !== "object") return;

    if (Array.isArray(value)) {
        for (const item of value) scrub(item, depth + 1);
        return;
    }

    for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEY.test(key)) {
            delete value[key];
            continue;
        }
        scrub(value[key], depth + 1);
    }
}

function sanitizeRequest(req, _res, next) {
    // req.body and req.params are always plain writable objects.
    if (req.body) scrub(req.body);
    if (req.params) scrub(req.params);
    // req.query may be a getter in some Express versions — mutate in place
    // (deleting offending keys) rather than reassigning the property.
    if (req.query) scrub(req.query);
    next();
}

module.exports = { sanitizeRequest };
