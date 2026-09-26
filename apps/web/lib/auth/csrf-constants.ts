/** Shared by the browser client and the server-side CSRF checks; must stay free of Node imports. */
export const CSRF_HEADER = 'x-csrf-token';
