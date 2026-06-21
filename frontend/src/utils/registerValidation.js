// Pure, dependency-free validation helpers for the registration form.
// These mirror the constraints enforced by the existing backend
// (authController.registerUser + User model) so the client gives fast,
// friendly feedback WITHOUT changing any backend behavior:
//   - email domain is restricted to @paruluniversity.ac.in (User schema regex)
//   - phoneNumber must be exactly 10 digits
//   - username unique (server-enforced; client checks format only)
//   - password min length 6 (RegisterForm minLength)

export const EMAIL_DOMAIN = 'paruluniversity.ac.in';
const EMAIL_RE = new RegExp(`^[^\\s@]+@${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
const PHONE_RE = /^\d{10}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * Validate a single field. Returns an error string, or '' when valid.
 * `form` is the full form state (needed for confirmPassword matching).
 */
export function validateField(name, value, form = {}) {
    const v = (value ?? '').toString();

    switch (name) {
        case 'name':
            if (!v.trim()) return 'Full name is required';
            if (v.trim().length < 2) return 'Name looks too short';
            return '';

        case 'username':
            if (!v) return 'Username is required';
            if (v.length < 3) return 'At least 3 characters';
            if (!USERNAME_RE.test(v)) return 'Use 3–20 letters, numbers, or _';
            return '';

        case 'email':
            if (!v) return 'Email is required';
            if (!EMAIL_RE.test(v)) return `Use your @${EMAIL_DOMAIN} email`;
            return '';

        case 'phoneNumber':
            if (!v) return 'Phone number is required';
            if (!PHONE_RE.test(v)) return 'Enter a 10-digit number';
            return '';

        case 'password':
            if (!v) return 'Password is required';
            if (v.length < 6) return 'At least 6 characters';
            return '';

        case 'confirmPassword':
            if (!v) return 'Please confirm your password';
            if (v !== (form.password ?? '')) return 'Passwords do not match';
            return '';

        case 'role':
            if (!v) return 'Please select your role';
            return '';

        case 'gender':
            if (!v) return 'Please select your gender';
            return '';

        default:
            return '';
    }
}

/**
 * Score a password 0–4 and map it to a strength bucket.
 * Lightweight heuristic (length + character variety) — no external libs.
 */
export function getPasswordStrength(password) {
    const pw = password ?? '';
    if (!pw) return { score: 0, label: '', level: 'none' };

    let score = 0;
    if (pw.length >= 6) score += 1;
    if (pw.length >= 10) score += 1;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
    if (/\d/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;

    // Collapse to 3 visible buckets.
    if (score <= 2) return { score, label: 'Weak', level: 'weak' };
    if (score === 3) return { score, label: 'Medium', level: 'medium' };
    return { score, label: 'Strong', level: 'strong' };
}

/**
 * Validate the whole form. Returns an object of { field: errorString } for
 * every field that currently has an error (empty object means valid).
 */
export function validateAll(form) {
    const fields = [
        'name',
        'username',
        'email',
        'phoneNumber',
        'password',
        'confirmPassword',
        'role',
        'gender',
    ];
    const errors = {};
    for (const f of fields) {
        const msg = validateField(f, form[f], form);
        if (msg) errors[f] = msg;
    }
    return errors;
}
