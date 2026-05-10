import type { ReaderMode } from '../types/domain'

type ReaderControlsProps = {
  mode: ReaderMode
  targetWpm: number
  chunkSize: number
  isRunning: boolean
  onModeChange: (mode: ReaderMode) => void
  onWpmChange: (wpm: number) => void
  onChunkSizeChange: (chunkSize: number) => void
  onToggleRunning: () => void
  onRewind: () => void
  onRegression: () => void
  onFinish: () => void
}

export function ReaderControls({
  mode,
  targetWpm,
  chunkSize,
  isRunning,
  onModeChange,
  onWpmChange,
  onChunkSizeChange,
  onToggleRunning,
  onRewind,
  onRegression,
  onFinish,
}: ReaderControlsProps) {
  return (
    <div className="reader-controls">
      <div className="segmented" aria-label="Reading mode">
        {(['rail', 'chunk', 'rsvp'] as const).map((candidate) => (
          <button
            className={candidate === mode ? 'active' : ''}
            key={candidate}
            onClick={() => onModeChange(candidate)}
            type="button"
          >
            {candidate.toUpperCase()}
          </button>
        ))}
      </div>

      <label>
        WPM
        <input max={900} min={80} onChange={(event) => onWpmChange(Number(event.target.value))} type="range" value={targetWpm} />
        <strong>{targetWpm}</strong>
      </label>

      <label>
        Chunk
        <input
          max={8}
          min={1}
          onChange={(event) => onChunkSizeChange(Number(event.target.value))}
          type="number"
          value={chunkSize}
        />
      </label>

      <div className="control-buttons">
        <button className="primary-button" onClick={onToggleRunning} type="button">
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button className="secondary-button" onClick={onRewind} type="button">
          Rewind
        </button>
        <button className="secondary-button" onClick={onRegression} type="button">
          Reread
        </button>
        <button className="finish-button" onClick={onFinish} type="button">
          Finish
        </button>
      </div>
    </div>
  )
}
