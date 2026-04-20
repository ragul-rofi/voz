const PRIVATE_IPV4_RANGES: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

export function assertSafeWebhookOrigin(url: string): void {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS webhook URLs are allowed.");
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Local hostnames are not allowed.");
  }

  for (const range of PRIVATE_IPV4_RANGES) {
    if (range.test(host)) {
      throw new Error("Private network targets are blocked.");
    }
  }
}
