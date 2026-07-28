import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../lib/useTheme'
import {
  CheckIcon,
  ChevronRightIcon,
  DarkModeIcon,
  LanguageIcon,
  LightModeIcon,
  SettingsIcon
} from './icons'

/** Subconjunto das locales oferecidas no menu — single source of truth pro submenu Language. */
const LANGUAGE_OPTIONS: Array<{ value: 'pt-BR' | 'en'; labelKey: 'language.portuguese' | 'language.english' }> = [
  { value: 'pt-BR', labelKey: 'language.portuguese' },
  { value: 'en', labelKey: 'language.english' }
]

/** Menu dropup de preferências — engrenagem no rodapé da sidebar abre um painel flutuante
 *  que contém:
 *  - Cabeçalho "Preferências" (não interativo)
 *  - Linha "Language" com chevron: ao clicar, expande submenu com Português/English (radio)
 *  - Linha "Tema": alterna direto entre claro/escuro (mostra label do estado atual)
 *
 *  O painel usa `position: fixed` calculado via `getBoundingClientRect` — escapa do
 *  `overflow-y: auto` da sidebar e nunca é cortado pelo scroll do shell. */
export function PreferencesMenu(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const isDarkTheme = theme === 'dark'
  const [open, setOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{ bottom: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const currentLanguage = (i18n.resolvedLanguage ?? i18n.language) as 'pt-BR' | 'en'

  /** Calcula a posição do painel em coordenadas de viewport (para `position: fixed`).
   *  Ancorado ao topo-esquerdo do trigger, abrindo para cima. */
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPanelPosition(null)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    setPanelPosition({
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left
    })
  }, [open])

  /** Recalcula quando a janela muda de tamanho com o painel aberto. */
  useEffect(() => {
    if (!open) return
    function handleResize(): void {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPanelPosition({
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open])

  /** Fecha o menu principal e o submenu Language ao clicar fora. */
  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: globalThis.MouseEvent): void {
      const target = event.target
      if (!(target instanceof Element)) return
      const insideTrigger = triggerRef.current?.contains(target)
      const insidePanel = panelRef.current?.contains(target)
      if (!insideTrigger && !insidePanel) {
        setOpen(false)
        setLanguageOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSelectLanguage(value: 'pt-BR' | 'en'): void {
    void i18n.changeLanguage(value)
    setLanguageOpen(false)
    setOpen(false)
  }

  function handleToggleTheme(): void {
    toggleTheme()
  }

  return (
    <div className="preferences-menu-root">
      <button
        ref={triggerRef}
        type="button"
        className="preferences-menu__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('toolbar.preferences')}
        title={t('toolbar.preferences')}
      >
        <SettingsIcon width={16} height={16} />
        <span className="preferences-menu__trigger-label">{t('toolbar.preferences')}</span>
      </button>

      {open && panelPosition && (
        <div
          ref={panelRef}
          className="preferences-menu"
          role="menu"
          style={{
            position: 'fixed',
            bottom: panelPosition.bottom,
            left: panelPosition.left
          }}
        >
          <div className="preferences-menu__header">{t('toolbar.preferences')}</div>

          <div className="preferences-menu__row-wrapper">
            <button
              type="button"
              className="preferences-menu__row"
              onClick={() => setLanguageOpen((value) => !value)}
              aria-expanded={languageOpen}
              aria-haspopup="menu"
              role="menuitem"
            >
              <LanguageIcon width={16} height={16} />
              <span className="preferences-menu__row-label">{t('toolbar.language')}</span>
              <ChevronRightIcon width={14} height={14} />
            </button>

            {languageOpen && (
              <div className="preferences-menu__submenu" role="menu">
                {LANGUAGE_OPTIONS.map((option) => {
                  const isSelected = option.value === currentLanguage
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`preferences-menu__submenu-item${isSelected ? ' preferences-menu__submenu-item--active' : ''}`}
                      onClick={() => handleSelectLanguage(option.value)}
                      role="menuitemradio"
                      aria-checked={isSelected}
                    >
                      <span className="preferences-menu__submenu-check">
                        {isSelected ? <CheckIcon width={14} height={14} /> : null}
                      </span>
                      <span>{t(option.labelKey)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="preferences-menu__row preferences-menu__row--theme"
            onClick={handleToggleTheme}
            role="switch"
            aria-checked={isDarkTheme}
            aria-label={t('toolbar.theme')}
            title={isDarkTheme ? t('toolbar.darkTheme') : t('toolbar.lightTheme')}
          >
            {isDarkTheme ? (
              <DarkModeIcon width={16} height={16} />
            ) : (
              <LightModeIcon width={16} height={16} />
            )}
            <span className="preferences-menu__row-label">{t('toolbar.theme')}</span>
            <span className="theme-switch" aria-hidden="true">
              <span className="theme-switch__knob" />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
