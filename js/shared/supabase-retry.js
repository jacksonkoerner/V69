/**
 * supabase-retry.js — Shared retry utility for critical Supabase operations
 * Sprint 15 (SUP-02): Exponential backoff for fire-and-forget saves
 *
 * Loaded on: quick-interview.html, report.html
 */

/**
 * Retry an async function with exponential backoff.
 * Delays: 1s, 2s, 4s (for maxRetries=3).
 *
 * @param {Function} fn - Async function to retry. Must return a result or throw.
 * @param {number} [maxRetries=3] - Maximum number of retry attempts (total calls = maxRetries + 1 if all fail)
 * @param {string} [label='supabaseRetry'] - Label for console logging
 * @returns {Promise<*>} The result of fn() on success
 * @throws {Error} The last error if all retries are exhausted
 */
async function supabaseRetry(fn, maxRetries, label) {
    if (maxRetries === undefined || maxRetries === null) maxRetries = 3;
    if (!label) label = 'supabaseRetry';

    var lastError = null;

    for (var attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            var result = await fn();

            // Supabase client returns { data, error } — treat .error as failure
            if (result && result.error) {
                throw new Error(result.error.message || JSON.stringify(result.error));
            }

            return result;
        } catch (err) {
            lastError = err;

            if (attempt < maxRetries) {
                var delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                console.warn('[' + label + '] Attempt ' + (attempt + 1) + ' failed, retrying in ' + delayMs + 'ms:', err.message || err);
                await new Promise(function(resolve) { setTimeout(resolve, delayMs); });
            }
        }
    }

    console.error('[' + label + '] All ' + (maxRetries + 1) + ' attempts failed:', lastError.message || lastError);
    throw lastError;
}

// Expose globally
if (typeof window !== 'undefined') {
    window.supabaseRetry = supabaseRetry;
}
