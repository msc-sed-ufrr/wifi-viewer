import type { NetworkReading } from '@shared/networkReading'
import { parseAcrylicCsv } from './acrylicParser'
import { detectCsvFormat } from './csvFormat'
import { CsvImportError, parseWifiScanCsv } from './csvParser'
import { parseNetSpotCsv } from './netspotParser'

export function parseImportedCsv(content: string): NetworkReading[] {
  const format = detectCsvFormat(content)

  switch (format) {
    case 'reference':
      return parseWifiScanCsv(content)

    case 'netspot':
      return parseNetSpotCsv(content)

    case 'acrylic':
      return parseAcrylicCsv(content)

    case 'generic':
      throw new CsvImportError(
        'Formato CSV não reconhecido. Use um arquivo de referência, NetSpot ou Acrylic.',
        'error.csvUnsupportedFormat'
      )
  }
}