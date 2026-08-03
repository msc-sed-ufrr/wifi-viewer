export type CsvFormat = 'reference' | 'netspot' | 'acrylic' | 'generic'

function normalizeHeaderCell(value: string): string {
  return value.trim().toLowerCase()
}

function splitHeader(line: string): string[] {
  const delimiter = line.includes('|') ? '|' : line.includes(';') ? ';' : ','

  return line.split(delimiter).map(normalizeHeaderCell)
}

export function detectCsvFormat(content: string): CsvFormat {
  const firstLine = content
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)

  if (!firstLine) {
    return 'generic'
  }

  const header = splitHeader(firstLine)

  const hasReferenceColumns =
    header.includes('time stamp') &&
    header.includes('ssid') &&
    header.includes('bssid') &&
    header.includes('strength') &&
    header.includes('primary channel')

  if (hasReferenceColumns) {
    return 'reference'
  }

  const hasNetSpotColumns =
    header.includes('ssid') &&
    header.includes('bssid') &&
    (header.includes('signal') || header.includes('signal level')) &&
    header.includes('channel')

  if (hasNetSpotColumns) {
    return 'netspot'
  }

  const hasAcrylicColumns =
    (header.includes('ssid') || header.includes('network')) &&
    (header.includes('mac address') || header.includes('bssid')) &&
    (header.includes('rssi') || header.includes('signal')) &&
    header.includes('channel')

  if (hasAcrylicColumns) {
    return 'acrylic'
  }

  return 'generic'
}