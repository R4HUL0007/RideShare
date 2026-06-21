import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { submitReview } from "../services/reviewService";
import "../styles/reviews.css";

/* ---------------- category sets per direction ---------------- */
// passengerToDriver = a passenger reviewing the DRIVER
// driverToPassenger = a driver reviewing a PASSENGER
const CATEGORY_SETS = {
    passengerToDriver: [
        { key: "driving", label: "Driving Quality" },
        { key: "punctuality", label: "Punctuality" },
        { key: "communication", label: "Communication" },
        { key: "vehicle", label: "Vehicle Condition" },
    ],
    driverToPassenger: [
        { key: "punctuality", label: "Punctuality" },
        { key: "communication", label: "Communication" },
        { key: "behavior", label: "Behavior" },
    ],
};

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

const initials = (name = "") =>
    name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";

/* ---------------- interactive star row ---------------- */
const StarRow = ({ value, onChange, size = 34, ariaLabel = "Rating" }) => {
    const [hover, setHover] = useState(0);
    const active = hover || value;
    return (
        <div className="rv-stars" role="radiogroup" aria-label={ariaLabel}>
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    className={`rv-star ${n <= active ? "on" : ""}`}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => onChange(n)}
                >
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                    </svg>
                </button>
            ))}
        </div>
    );
};

/**
 * ReviewModal — collects a 1–5 star rating, optional per-category stars (set
 * depends on `direction`), and an optional written comment, then submits.
 *
 * props:
 *   pending: { rideId, reviewee:{_id,name,profilePicture,role}, direction, source, destination, timing }
 *   onClose():       skip / dismiss
 *   onSubmitted(res): called after a successful submit
 */
const ReviewModal = ({ pending, onClose, onSubmitted }) => {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [categories, setCategories] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const cats = useMemo(
        () => CATEGORY_SETS[pending?.direction] || CATEGORY_SETS.passengerToDriver,
        [pending?.direction]
    );

    if (!pending) return null;

    const reviewee = pending.reviewee || {};
    const isDriver = pending.direction === "passengerToDriver";
    const roleWord = isDriver ? "driver" : "passenger";

    const setCat = (key, val) => setCategories((c) => ({ ...c, [key]: val }));

    const handleSubmit = async () => {
        if (submitting) return;
        if (rating < 1) {
            toast.error("Please pick a star rating.");
            return;
        }
        setSubmitting(true);
        try {
            const { data } = await submitReview(pending.rideId, reviewee._id, {
                rating,
                comment: comment.trim(),
                categories,
            });
            toast.success("Thanks for your review!");
            onSubmitted?.(data);
        } catch (err) {
            const status = err.response?.status;
            const msg = err.response?.data?.message || "Couldn't submit review.";
            // 409 = already reviewed; treat as resolved so the prompt clears.
            if (status === 409) {
                toast.info(msg);
                onSubmitted?.({ duplicate: true });
            } else {
                toast.error(msg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="rv-overlay" role="dialog" aria-modal="true" aria-label="Leave a review">
            <div className="rv-backdrop" onClick={submitting ? undefined : onClose} />
            <div className="rv-modal">
                <button className="rv-close" onClick={onClose} aria-label="Close" disabled={submitting}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>

                <div className="rv-head">
                    <div className="rv-avatar">
                        {reviewee.profilePicture ? (
                            <img src={reviewee.profilePicture} alt={reviewee.name || "User"} />
                        ) : (
                            <span>{initials(reviewee.name)}</span>
                        )}
                    </div>
                    <div className="rv-head-text">
                        <div className="rv-eyebrow">Rate your {roleWord}</div>
                        <h3 className="rv-name">{reviewee.name || "User"}</h3>
                        {(pending.source || pending.destination) && (
                            <div className="rv-route">{pending.source} → {pending.destination}</div>
                        )}
                    </div>
                </div>

                <div className="rv-body">
                    {/* overall star rating */}
                    <div className="rv-overall">
                        <StarRow value={rating} onChange={setRating} ariaLabel="Overall rating" />
                        <div className="rv-rating-word">{RATING_WORDS[rating] || "Tap to rate"}</div>
                    </div>

                    {/* per-category ratings */}
                    <div className="rv-cats">
                        {cats.map((c) => (
                            <div className="rv-cat-row" key={c.key}>
                                <span className="rv-cat-label">{c.label}</span>
                                <StarRow
                                    value={categories[c.key] || 0}
                                    onChange={(v) => setCat(c.key, v)}
                                    size={20}
                                    ariaLabel={c.label}
                                />
                            </div>
                        ))}
                    </div>

                    {/* written review */}
                    <div className="rv-comment-wrap">
                        <textarea
                            className="rv-comment"
                            placeholder={`Share a few words about your ${roleWord} (optional)`}
                            value={comment}
                            maxLength={1000}
                            rows={3}
                            onChange={(e) => setComment(e.target.value)}
                        />
                        <span className="rv-count">{comment.length}/1000</span>
                    </div>
                </div>

                <div className="rv-actions">
                    <button className="rv-skip" onClick={onClose} disabled={submitting}>
                        Skip For Now
                    </button>
                    <button className="rv-submit" onClick={handleSubmit} disabled={submitting || rating < 1}>
                        {submitting ? <span className="rv-spin" /> : "Submit Review"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReviewModal;
