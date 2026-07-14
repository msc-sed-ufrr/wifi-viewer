import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { NetworkReading } from '@shared/networkReading'
import { parseNetshOutput } from './windows'
import { parseNmcliOutput } from './linux'
import { parseMacwifiCliOutput } from './macos'

const execAsync = promisify(exec)

interface PlatformAdapter {
  isAvailable(): Promise<boolean>
  scan(): Promise<NetworkReading[]>
}

const windowsAdapter: PlatformAdapter = {
  async isAvailable() {
    try {
      await execAsync('where netsh')
      return true
    } catch {
      return false
    }
  },
  async scan() {
    const { stdout } = await execAsync('netsh wlan show networks mode=bssid')
    return parseNetshOutput(stdout, new Date().toISOString())
  }
}

const linuxAdapter: PlatformAdapter = {
  async isAvailable() {
    try {
      await execAsync('which nmcli')
      return true
    } catch {
      return false
    }
  },
  async scan() {
    const { stdout } = await execAsync('nmcli -t -f SSID,BSSID,SIGNAL,CHAN,SECURITY dev wifi list')
    return parseNmcliOutput(stdout, new Date().toISOString())
  }
}

/**
 * Depende de `macwifi-cli` (github.com/jaisonerick/macwifi-cli), instalável via
 * `brew install jaisonerick/tap/macwifi-cli` — mesmo modelo de dependência que
 * `netsh`/`nmcli`: uma ferramenta externa já presente no sistema, não algo que
 * o WiFi Viewer empacota ou assina. Substitui um helper Swift/CoreWLAN próprio
 * que foi tentado e confirmado inviável sem assinatura Developer ID paga — o
 * `macwifi-cli` já resolve isso porque seu autor assina/notariza os binários
 * (ver docs/02-arch.md, ADR-009).
 */
const macosAdapter: PlatformAdapter = {
  async isAvailable() {
    try {
      await execAsync('which macwifi-cli')
      return true
    } catch {
      return false
    }
  },
  async scan() {
    const { stdout } = await execAsync('macwifi-cli scan --json')
    return parseMacwifiCliOutput(stdout, new Date().toISOString())
  }
}

function getAdapter(): PlatformAdapter | null {
  switch (process.platform) {
    case 'win32':
      return windowsAdapter
    case 'linux':
      return linuxAdapter
    case 'darwin':
      return macosAdapter
    default:
      return null
  }
}

export async function isScanAvailable(): Promise<boolean> {
  const adapter = getAdapter()
  if (!adapter) return false
  try {
    return await adapter.isAvailable()
  } catch {
    return false
  }
}

export async function scanNetworks(): Promise<NetworkReading[]> {
  const adapter = getAdapter()
  if (!adapter) {
    throw new Error(`Varredura Wi-Fi nativa não é suportada neste sistema operacional (${process.platform}). Use importação de arquivo.`)
  }
  return adapter.scan()
}
