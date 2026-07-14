/**
 * netsh (Windows) e nmcli (Linux) só reportam qualidade percentual, não dBm real.
 * Aproximação linear documentada em docs/02-arch.md (tabela de comandos por SO).
 */
export function qualityPercentToDbm(quality: number): number {
  return Math.round(quality / 2 - 100)
}
