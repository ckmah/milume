/** True when the volume URL is fetched over the widget comm (not HTTP). */
export function isCommVolumeUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (url.startsWith("/")) return false;
  return true;
}
