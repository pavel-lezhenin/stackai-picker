export const API_BASE_URL = '/api';

export const QUERY_STALE_TIME = 5 * 60 * 1000; // 5 minutes
export const QUERY_GC_TIME = 10 * 60 * 1000; // 10 minutes

export const SEARCH_DEBOUNCE_MS = 300;

// Slightly shorter than the FileRow exit-animation duration (duration-200 = 200ms)
// to let the animation start before the row is removed from the DOM.
export const DELETE_ANIMATION_MS = 180;
