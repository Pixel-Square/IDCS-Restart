export function normalizeRegisterNo(value) {
    if (value == null)
        return '';
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            return '';
        return String(Math.trunc(value));
    }
    var s = String(value).trim();
    if (!s)
        return '';
    // Excel sometimes preserves a leading apostrophe for "text" cells.
    if (s.startsWith("'"))
        s = s.slice(1).trim();
    // Remove thousands separators.
    s = s.replace(/,/g, '');
    // Handle scientific notation strings (rare, but happens when Excel auto-formats).
    if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(s)) {
        var n = Number(s);
        if (Number.isFinite(n))
            s = String(Math.trunc(n));
    }
    // If Excel exports numeric-looking text with trailing .0
    if (/^\d+\.0+$/.test(s))
        s = s.replace(/\.0+$/, '');
    // Normalize: keep only alphanumerics so "1142 1002" / "1142-1002" / etc match.
    s = s.replace(/[^0-9A-Za-z]/g, '');
    return s.toUpperCase();
}
export function registerNoKeys(value) {
    var norm = normalizeRegisterNo(value);
    if (!norm)
        return [];
    var keys = [norm];
    // Common UI pattern: show only last N digits.
    if (norm.length > 8)
        keys.push(norm.slice(-8));
    if (norm.length > 10)
        keys.push(norm.slice(-10));
    return Array.from(new Set(keys));
}
