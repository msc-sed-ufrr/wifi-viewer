import { useEffect, useState, type RefObject } from 'react'

interface Size {
  width: number
  height: number
}

/** Tamanho renderizado (CSS px) de um elemento, atualizado via ResizeObserver — usado para alinhar as réguas ao canvas escalado responsivamente. */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect
      setSize({ width: box.width, height: box.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
