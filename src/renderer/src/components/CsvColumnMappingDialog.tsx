import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { GenericCsvColumnMapping } from '../modules/import/genericCsvParser'

interface Props {
  headers: string[]
  onConfirm: (mapping: GenericCsvColumnMapping) => void
  onCancel: () => void
}

type MappingField = keyof GenericCsvColumnMapping

interface FieldDefinition {
  key: MappingField
  required: boolean
}

const REQUIRED_FIELDS: FieldDefinition[] = [
  { key: 'bssid', required: true },
  { key: 'signalDbm', required: true },
  { key: 'primaryChannel', required: true }
]

const OPTIONAL_FIELDS: FieldDefinition[] = [
  { key: 'ssid', required: false },
  { key: 'security', required: false },
  { key: 'standard', required: false },
  { key: 'frequencyMhz', required: false },
  { key: 'widthMhz', required: false },
  { key: 'capturedAt', required: false }
]

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function findSuggestedHeader(headers: string[], aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeHeader)

  return (
    headers.find((header) => normalizedAliases.includes(normalizeHeader(header))) ?? ''
  )
}

function buildInitialMapping(headers: string[]): Record<MappingField, string> {
  return {
    ssid: findSuggestedHeader(headers, ['ssid', 'network', 'network name', 'nome da rede']),
    bssid: findSuggestedHeader(headers, [
      'bssid',
      'mac address',
      'mac',
      'endereco',
      'endereço'
    ]),
    signalDbm: findSuggestedHeader(headers, [
      'signal',
      'signal level',
      'rssi',
      'potencia',
      'potência'
    ]),
    primaryChannel: findSuggestedHeader(headers, ['channel', 'canal']),
    security: findSuggestedHeader(headers, [
      'security',
      'encryption',
      'privacy',
      'seguranca',
      'segurança'
    ]),
    standard: findSuggestedHeader(headers, [
      'standard',
      'mode',
      'network type',
      'padrao',
      'padrão'
    ]),
    frequencyMhz: findSuggestedHeader(headers, [
      'frequency',
      'frequency mhz',
      'frequencia',
      'frequência'
    ]),
    widthMhz: findSuggestedHeader(headers, [
      'width',
      'channel width',
      'largura',
      'largura do canal'
    ]),
    capturedAt: findSuggestedHeader(headers, [
      'captured at',
      'timestamp',
      'time stamp',
      'date',
      'data'
    ])
  }
}

export function CsvColumnMappingDialog({
  headers,
  onConfirm,
  onCancel
}: Props): JSX.Element {
  const { t } = useTranslation()

  const initialMapping = useMemo(() => buildInitialMapping(headers), [headers])
  const [mapping, setMapping] =
    useState<Record<MappingField, string>>(initialMapping)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: MappingField, value: string): void {
    setMapping((current) => ({
      ...current,
      [field]: value
    }))
    setError(null)
  }

  function renderField({ key, required }: FieldDefinition): JSX.Element {
    return (
      <label key={key}>
        {t(`csvMapping.${key}`)}
        {required ? ' *' : ''}
        <select
          value={mapping[key]}
          onChange={(event) => updateField(key, event.target.value)}
        >
          <option value="">{t('csvMapping.selectColumn')}</option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </select>
      </label>
    )
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()

    if (
      !mapping.bssid ||
      !mapping.signalDbm ||
      !mapping.primaryChannel
    ) {
      setError(t('error.csvRequiredMapping'))
      return
    }

    onConfirm({
      ssid: mapping.ssid || undefined,
      bssid: mapping.bssid,
      signalDbm: mapping.signalDbm,
      primaryChannel: mapping.primaryChannel,
      security: mapping.security || undefined,
      standard: mapping.standard || undefined,
      frequencyMhz: mapping.frequencyMhz || undefined,
      widthMhz: mapping.widthMhz || undefined,
      capturedAt: mapping.capturedAt || undefined
    })
  }

  return (
    <div className="modal-overlay">
      <form className="modal modal--wide" onSubmit={handleSubmit}>
        <h2>{t('csvMapping.title')}</h2>
        <p className="modal__hint">{t('csvMapping.hint')}</p>

        <h3>{t('csvMapping.requiredFields')}</h3>
        {REQUIRED_FIELDS.map(renderField)}

        <h3>{t('csvMapping.optionalFields')}</h3>
        {OPTIONAL_FIELDS.map(renderField)}

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            {t('csvMapping.cancel')}
          </button>
          <button type="submit">{t('csvMapping.confirm')}</button>
        </div>
      </form>
    </div>
  )
}