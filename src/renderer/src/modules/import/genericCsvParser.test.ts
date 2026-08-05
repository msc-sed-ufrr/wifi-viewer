import { describe, expect, it } from 'vitest'
import { CsvImportError } from './csvParser'
import {
  getGenericCsvHeaders,
  parseGenericCsv,
  type GenericCsvColumnMapping
} from './genericCsvParser'

const mapping: GenericCsvColumnMapping = {
  ssid: 'Nome da rede',
  bssid: 'Endereço',
  signalDbm: 'Potência',
  primaryChannel: 'Canal',
  security: 'Segurança',
  standard: 'Padrão',
  frequencyMhz: 'Frequência',
  widthMhz: 'Largura',
  capturedAt: 'Data'
}

describe('getGenericCsvHeaders', () => {
  it('returns headers from a comma-separated file', () => {
    const content = [
      'Nome da rede,Endereço,Potência,Canal',
      'Rede,00:11:22:33:44:55,-60,6'
    ].join('\n')

    expect(getGenericCsvHeaders(content)).toEqual([
      'Nome da rede',
      'Endereço',
      'Potência',
      'Canal'
    ])
  })

  it('detects semicolon-separated headers', () => {
    const content = [
      'Nome da rede;Endereço;Potência;Canal',
      'Rede;00:11:22:33:44:55;-60;6'
    ].join('\n')

    expect(getGenericCsvHeaders(content)).toEqual([
      'Nome da rede',
      'Endereço',
      'Potência',
      'Canal'
    ])
  })
})

describe('parseGenericCsv', () => {
  it('parses a generic CSV using manual column mapping', () => {
    const content = [
      'Nome da rede;Endereço;Potência;Canal;Segurança;Padrão;Frequência;Largura;Data',
      'Rede CIT;00-11-22-33-44-55;-58 dBm;6;WPA2;802.11n;2437 MHz;20 MHz;2026-08-05T12:00:00.000Z'
    ].join('\n')

    const readings = parseGenericCsv(content, mapping)

    expect(readings).toHaveLength(1)
    expect(readings[0]).toEqual({
      ssid: 'Rede CIT',
      bssid: '00:11:22:33:44:55',
      signalDbm: -58,
      signalSource: 'measured',
      primaryChannel: 6,
      primaryFrequencyMhz: 2437,
      widthMhz: 20,
      security: 'WPA2',
      standard: '802.11n',
      capturedAt: '2026-08-05T12:00:00.000Z'
    })
  })

  it('supports quoted cells containing the delimiter', () => {
    const content = [
      'Nome da rede;Endereço;Potência;Canal;Segurança',
      '"Rede; Visitantes";00:11:22:33:44:55;-65;11;"WPA2; Enterprise"'
    ].join('\n')

    const readings = parseGenericCsv(content, {
      ssid: 'Nome da rede',
      bssid: 'Endereço',
      signalDbm: 'Potência',
      primaryChannel: 'Canal',
      security: 'Segurança'
    })

    expect(readings[0]).toMatchObject({
      ssid: 'Rede; Visitantes',
      security: 'WPA2; Enterprise'
    })
  })

  it('uses null when the mapped SSID cell is empty', () => {
    const content = [
      'Nome da rede,Endereço,Potência,Canal',
      ',00:11:22:33:44:55,-70,1'
    ].join('\n')

    const readings = parseGenericCsv(content, {
      ssid: 'Nome da rede',
      bssid: 'Endereço',
      signalDbm: 'Potência',
      primaryChannel: 'Canal'
    })

    expect(readings[0].ssid).toBeNull()
  })

  it('generates capturedAt when no date column is mapped', () => {
    const content = [
      'Endereço,Potência,Canal',
      '00:11:22:33:44:55,-72,3'
    ].join('\n')

    const readings = parseGenericCsv(content, {
      bssid: 'Endereço',
      signalDbm: 'Potência',
      primaryChannel: 'Canal'
    })

    expect(Number.isNaN(Date.parse(readings[0].capturedAt))).toBe(false)
  })

  it('rejects a mapping without all required columns', () => {
    const content = [
      'Endereço,Potência,Canal',
      '00:11:22:33:44:55,-72,3'
    ].join('\n')

    expect(() =>
      parseGenericCsv(content, {
        bssid: 'Endereço',
        signalDbm: 'Potência',
        primaryChannel: 'Coluna inexistente'
      })
    ).toThrow(CsvImportError)
  })

  it('rejects a row without BSSID', () => {
    const content = [
      'Endereço,Potência,Canal',
      ',-72,3'
    ].join('\n')

    expect(() =>
      parseGenericCsv(content, {
        bssid: 'Endereço',
        signalDbm: 'Potência',
        primaryChannel: 'Canal'
      })
    ).toThrow(CsvImportError)
  })

  it('rejects an invalid signal value', () => {
    const content = [
      'Endereço,Potência,Canal',
      '00:11:22:33:44:55,inválido,3'
    ].join('\n')

    expect(() =>
      parseGenericCsv(content, {
        bssid: 'Endereço',
        signalDbm: 'Potência',
        primaryChannel: 'Canal'
      })
    ).toThrow(CsvImportError)
  })

  it('rejects an empty file', () => {
    expect(() => getGenericCsvHeaders('')).toThrow(CsvImportError)
  })
})