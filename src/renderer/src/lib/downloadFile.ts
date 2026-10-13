export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  try { link.click() }
  finally {
    link.remove()
    // Allow Chromium to consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
