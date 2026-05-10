import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { ImportPanel } from './components/ImportPanel'
import { LibraryList } from './components/LibraryList'
import { OnboardingJourney } from './components/OnboardingJourney'
import { OcrReview } from './components/OcrReview'
import { ReaderRail } from './components/ReaderRail'
import { SessionSummary } from './components/SessionSummary'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsChart } from './components/StatsChart'
import { type AppRoute } from './app/routes'
import { selectActiveDocument, useAppStore } from './app/store'
import { exportProgressCsv, exportProgressJson } from './lib/db/export'
import { getDatabase } from './lib/db/migrations'
import type { ReaderMode } from './types/domain'

type PendingSession = {
  mode: ReaderMode
  targetWpm: number
  wordsRead: number
  durationSeconds: number
  pauseCount: number
  regressionCount: number
}

function App() {
  const [route, setRoute] = useState<AppRoute>('library')
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null)
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const documents = useAppStore((state) => state.documents)
  const sessions = useAppStore((state) => state.sessions)
  const settings = useAppStore((state) => state.settings)
  const onboarding = useAppStore((state) => state.onboarding)
  const activeDocument = useAppStore(selectActiveDocument)
  const createDocument = useAppStore((state) => state.createDocument)
  const archiveDocument = useAppStore((state) => state.archiveDocument)
  const setActiveDocument = useAppStore((state) => state.setActiveDocument)
  const completeSession = useAppStore((state) => state.completeSession)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const skipOnboarding = useAppStore((state) => state.skipOnboarding)
  const completeOnboardingIntro = useAppStore((state) => state.completeOnboardingIntro)
  const reopenOnboarding = useAppStore((state) => state.reopenOnboarding)
  const resetAllData = useAppStore((state) => state.resetAllData)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.reader.theme
  }, [settings.reader.theme])

  useEffect(() => {
    void getDatabase()
  }, [])

  const createAndOpenDocument = useCallback(
    (title: string, content: string, sourceType: 'paste' | 'text_file' | 'photo_ocr' = 'paste') => {
      const document = createDocument({ title, content, sourceType })
      setActiveDocument(document.id)
      setRoute('reader')
    },
    [createDocument, setActiveDocument],
  )

  function exportFile(kind: 'json' | 'csv'): void {
    const contents = kind === 'json' ? exportProgressJson(documents, sessions) : exportProgressCsv(sessions)
    const type = kind === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([contents], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `readrail-progress.${kind}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function enterAppAfterSkip(): void {
    skipOnboarding()
    setRoute('library')
  }

  function enterAppAfterIntro(): void {
    completeOnboardingIntro()
    setRoute('library')
  }

  if (onboarding.status === 'not_started') {
    return <OnboardingJourney onComplete={enterAppAfterIntro} onSkip={enterAppAfterSkip} />
  }

  return (
    <AppShell activeDocument={activeDocument} activeRoute={route} onRouteChange={setRoute}>
      {route === 'library' && (
        <div className="content-stack">
          <ImportPanel
            defaultWpm={settings.reader.defaultWpm}
            onCreateDocument={(title, content, sourceType) => createAndOpenDocument(title, content, sourceType)}
          />
          <OcrReview
            hasKey={hasGeminiKey}
            onCreateDocument={(title, content) => createAndOpenDocument(title, content, 'photo_ocr')}
            preservePageBreaks={settings.ocr.preservePageBreaks}
          />
          <LibraryList
            activeDocumentId={activeDocument?.id ?? null}
            documents={documents}
            onArchive={archiveDocument}
            onOpenJourney={reopenOnboarding}
            onSelect={(id) => {
              setActiveDocument(id)
              setRoute('reader')
            }}
          />
        </div>
      )}

      {route === 'reader' && (
        <div className="content-stack">
          <ReaderRail
            defaultChunkSize={settings.reader.chunkSize}
            defaultMode={settings.reader.defaultMode}
            defaultWpm={settings.reader.defaultWpm}
            document={activeDocument}
            fontSize={settings.reader.fontSize}
            key={activeDocument?.id ?? 'empty-reader'}
            lineHeight={settings.reader.lineHeight}
            onComplete={setPendingSession}
          />
          <SessionSummary
            onDiscard={() => setPendingSession(null)}
            onSave={(input) => {
              if (!activeDocument) {
                return
              }

              completeSession({ ...input, documentId: activeDocument.id })
              setPendingSession(null)
              setRoute('stats')
            }}
            pendingSession={pendingSession}
          />
        </div>
      )}

      {route === 'stats' && (
        <div className="content-stack">
          <StatsChart documents={documents} sessions={sessions} />
          <section className="panel export-panel">
            <span className="eyebrow">Export</span>
            <h2>Progress backup</h2>
            <div className="button-row">
              <button className="secondary-button" onClick={() => exportFile('csv')} type="button">
                Export CSV
              </button>
              <button className="secondary-button" onClick={() => exportFile('json')} type="button">
                Export JSON
              </button>
            </div>
          </section>
        </div>
      )}

      {route === 'settings' && (
        <SettingsPanel
          onKeyStateChange={setHasGeminiKey}
          onOpenJourney={reopenOnboarding}
          onResetData={resetAllData}
          onSettingsChange={updateSettings}
          settings={settings}
        />
      )}
    </AppShell>
  )
}

export default App
