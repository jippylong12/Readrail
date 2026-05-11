// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuidedTour } from '../components/GuidedTour'
import { ROUTES } from '../app/routes'
import { TOUR_DEFINITIONS, type TourDefinition, type TourId } from '../app/tours'

const tour: TourDefinition = {
  id: 'library',
  title: 'Library walkthrough',
  steps: [
    {
      target: '[data-tour="first"]',
      title: 'First step',
      body: 'First body.',
    },
    {
      target: '[data-tour="second"]',
      title: 'Second step',
      body: 'Second body.',
    },
  ],
}

afterEach(() => {
  cleanup()
})

function getSourceTourAnchors(): Set<string> {
  const componentDirectory = join(process.cwd(), 'src/components')
  const componentFiles = readdirSync(componentDirectory)
    .filter((fileName) => fileName.endsWith('.tsx'))
    .map((fileName) => join(componentDirectory, fileName))
  const sourceFiles = [join(process.cwd(), 'src/App.tsx'), ...componentFiles]
  const source = sourceFiles.map((filePath) => readFileSync(filePath, 'utf8')).join('\n')
  return new Set(Array.from(source.matchAll(/data-tour="([^"]+)"/g), (match) => `[data-tour="${match[1]}"]`))
}

describe('GuidedTour', () => {
  it('moves through steps and completes on the final step', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(
      <>
        <div data-tour="first">Import</div>
        <div data-tour="second">Library</div>
        <GuidedTour tour={tour} onComplete={onComplete} />
      </>,
    )

    expect(screen.getByRole('dialog', { name: 'Library walkthrough' })).toBeTruthy()
    expect(screen.getByText('First step')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Second step')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByText('First step')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('defines one complete tour for each replayable route', () => {
    const replayableRouteIds = ROUTES.map((route) => route.id).filter((routeId): routeId is TourId => routeId !== 'test')

    expect(Object.keys(TOUR_DEFINITIONS)).toEqual(replayableRouteIds)

    replayableRouteIds.forEach((routeId) => {
      expect(TOUR_DEFINITIONS[routeId].steps.length).toBeGreaterThan(0)
    })
  })

  it('targets anchors that exist in app screens', () => {
    const sourceTourAnchors = getSourceTourAnchors()

    Object.values(TOUR_DEFINITIONS).forEach((definition) => {
      definition.steps.forEach((step) => {
        expect(sourceTourAnchors.has(step.target), `${definition.id} step "${step.title}" uses ${step.target}`).toBe(true)
      })
    })
  })
})
