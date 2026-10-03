/**
 * Downloads a `Blob` as a file with the temporary-link pattern: create an object URL, click an
 * off-screen `<a download>` and release everything. Browser only.
 *
 * The caller sets the name: a blob ignores the server's `Content-Disposition`.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
