import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { TourDefinition } from '../app/tours'

type GuidedTourProps = {
  tour: TourDefinition
  onComplete: () => void
}

type HighlightBox = {
  top: number
  left: number
  width: number
  height: number
}

function getViewportSize(): { width: number; height: number } {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }
}

export function GuidedTour({ tour, onComplete }: GuidedTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [highlight, setHighlight] = useState<HighlightBox | null>(null)
  const step = tour.steps[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === tour.steps.length - 1

  useEffect(() => {
    function updateHighlight(): void {
      const target = document.querySelector<HTMLElement>(step.target)

      if (!target) {
        setHighlight(null)
        return
      }

      const initialRect = target.getBoundingClientRect()
      const viewport = getViewportSize()
      const isOutsideViewport =
        initialRect.top < 0 ||
        initialRect.left < 0 ||
        initialRect.bottom > viewport.height ||
        initialRect.right > viewport.width

      if (isOutsideViewport) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' })
      }

      const rect = target.getBoundingClientRect()
      const padding = 8
      setHighlight({
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: Math.min(viewport.width - 16, rect.width + padding * 2),
        height: Math.min(viewport.height - 16, rect.height + padding * 2),
      })
    }

    updateHighlight()
    window.addEventListener('resize', updateHighlight)
    window.addEventListener('scroll', updateHighlight, true)
    return () => {
      window.removeEventListener('resize', updateHighlight)
      window.removeEventListener('scroll', updateHighlight, true)
    }
  }, [step.target])

  const popoverStyle = useMemo<CSSProperties>(() => {
    if (!highlight) {
      return {}
    }

    const viewport = getViewportSize()
    const maxWidth = Math.min(360, viewport.width - 32)
    const estimatedHeight = 260
    const belowTop = highlight.top + highlight.height + 18
    const aboveTop = highlight.top - estimatedHeight - 18
    const top =
      belowTop + estimatedHeight <= viewport.height - 16
        ? belowTop
        : aboveTop >= 16
          ? aboveTop
          : Math.max(16, Math.min(belowTop, viewport.height - estimatedHeight - 16))
    const left = Math.min(Math.max(16, highlight.left), viewport.width - maxWidth - 16)

    return { left, maxWidth, top, width: maxWidth }
  }, [highlight])

  return (
    <div className="tour-layer" aria-label={tour.title} aria-modal="true" role="dialog">
      <div className="tour-scrim" />
      {highlight && <div className="tour-highlight" style={highlight} />}
      <section className="tour-card" style={popoverStyle}>
        <span className="eyebrow">
          {tour.title} {stepIndex + 1}/{tour.steps.length}
        </span>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="secondary-button" disabled={isFirstStep} onClick={() => setStepIndex((index) => index - 1)} type="button">
            Back
          </button>
          <button
            className="primary-button"
            onClick={() => {
              if (isLastStep) {
                onComplete()
              } else {
                setStepIndex((index) => index + 1)
              }
            }}
            type="button"
          >
            {isLastStep ? 'Done' : 'Next'}
          </button>
        </div>
      </section>
    </div>
  )
}
