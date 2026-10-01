/**
 * Descarga un `Blob` como fichero con el patrón de enlace temporal: se crea una URL de objeto,
 * se pulsa un `<a download>` fuera de la vista y se libera todo. Solo navegador.
 *
 * El nombre lo fija quien llama: un blob ignora el `Content-Disposition` del servidor.
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
