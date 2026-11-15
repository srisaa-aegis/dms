const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
};

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 && i < fileName.length - 1 ? fileName.slice(i + 1).toLowerCase() : '';
}

/** Best-effort MIME type from a file name. */
export function guessMimeType(fileName: string): string {
  return MIME_BY_EXT[extensionOf(fileName)] ?? 'application/octet-stream';
}

/** `"Annual Report.pdf"` -> `"Annual Report"` */
export function baseName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/** PrimeIcons + Tailwind colour classes for a file type. */
export function fileIcon(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.startsWith('image/')) return 'pi pi-image text-green-500';
  if (m.includes('pdf')) return 'pi pi-file-pdf text-red-500';
  if (m.includes('word') || m.includes('msword')) return 'pi pi-file-word text-blue-500';
  if (m.includes('excel') || m.includes('spreadsheet')) return 'pi pi-file-excel text-green-600';
  if (m.includes('presentation') || m.includes('powerpoint')) return 'pi pi-file text-orange-500';
  if (m.startsWith('text/')) return 'pi pi-file-edit text-gray-500';
  if (m.includes('zip')) return 'pi pi-box text-yellow-600';
  return 'pi pi-file text-gray-400';
}

/** Types a browser can show in a tab; everything else is downloaded instead. */
export function isViewable(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf' || m.startsWith('text/') || m === 'application/json';
}

/** `2026-11-14T10:30:00Z` -> `14 Nov 2026` */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Rejects names that are empty or contain path separators / reserved characters. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Name is required';
  if (n.length > 255) return 'Name is too long (max 255)';
  if (/[\\/:*?"<>|]/.test(n)) return 'Name cannot contain \\ / : * ? " < > |';
  if (n === '.' || n === '..') return 'Invalid name';
  return null;
}
