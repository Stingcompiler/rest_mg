export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8000';

/** Cookie names must match the API's AUTH_COOKIE_* settings. */
export const ACCESS_COOKIE = 'sp_access';
export const REFRESH_COOKIE = 'sp_refresh';
