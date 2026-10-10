/** True when the volume URL is fetched over the widget comm (not HTTP). */
export function isCommVolumeUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (url.startsWith("/")) return false;
  return true;
}

/** True when the browser should read the store over HTTP(S) or same-origin static paths. */
export function isHttpVolumeUrl(url: string): boolean {
  if (!url) return false;
  return !isCommVolumeUrl(url);
}

/** Comm-relative store prefix (`images/foo/`) for a volume element URL. */
export function commRelativeVolumeBase(url: string): string {
  if (isCommVolumeUrl(url)) return url;
  const normalized = url.endsWith("/") ? url : `${url}/`;
  const idx = normalized.search(/\/(images|labels)\//);
  if (idx >= 0) return normalized.slice(idx + 1);
  return normalized.replace(/^\//, "");
}
