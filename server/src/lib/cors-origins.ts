/** CLIENT_URL is a comma-separated list so multiple dev surfaces (web client,
 * Expo web, LAN IP variants) can all reach the backend during development. */
export function getAllowedOrigins(): string[] {
  return (process.env.CLIENT_URL ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
