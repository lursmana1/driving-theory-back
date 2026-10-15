/**
 * Cache-Control for public responses that only change on deploy or when a
 * maintenance script runs (license categories, official exam rules).
 * Never use on per-user or admin-edited responses.
 */
export const STATIC_PUBLIC_CACHE_CONTROL = 'public, max-age=300';
