export type AudioSource = 'mic' | 'system'
export type SourceStatus = 'off' | 'connecting' | 'listening' | 'error'

export function normalizeSource(source: string): AudioSource {
  return source === 'system' ? 'system' : 'mic'
}

export function sourceLabel(source: AudioSource): string {
  return source === 'system' ? 'Host' : 'Mic'
}

export function createTranscriptionSourceState() {
  const selectedSources: Record<AudioSource, boolean> = { system: true, mic: false }
  const sourceStatuses: Record<AudioSource, SourceStatus> = { system: 'off', mic: 'off' }
  const activeSources: Record<AudioSource, boolean> = { system: false, mic: false }

  function setSourceSelected(source: string, enabled: boolean): void {
    selectedSources[normalizeSource(source)] = !!enabled
  }

  function isSourceSelected(source: string): boolean {
    return !!selectedSources[normalizeSource(source)]
  }

  function getSelectedSources(): Record<AudioSource, boolean> {
    return { ...selectedSources }
  }

  function setSourceStatus(source: string, status: string): void {
    const resolvedSource = normalizeSource(source)
    const allowedStatuses = new Set<SourceStatus>(['off', 'connecting', 'listening', 'error'])
    sourceStatuses[resolvedSource] = allowedStatuses.has(status as SourceStatus) ? (status as SourceStatus) : 'off'
  }

  function getSourceStatus(source: string): SourceStatus {
    return sourceStatuses[normalizeSource(source)]
  }

  function getSourceStatuses(): Record<AudioSource, SourceStatus> {
    return { ...sourceStatuses }
  }

  function setSourceActive(source: string, active: boolean): void {
    activeSources[normalizeSource(source)] = !!active
  }

  function isSourceActive(source: string): boolean {
    return !!activeSources[normalizeSource(source)]
  }

  function isAnySourceActive(): boolean {
    return activeSources.system || activeSources.mic
  }

  function isAnySourceConnecting(): boolean {
    return sourceStatuses.system === 'connecting' || sourceStatuses.mic === 'connecting'
  }

  return {
    selectedSources,
    sourceStatuses,
    getSelectedSources,
    getSourceStatus,
    getSourceStatuses,
    isAnySourceActive,
    isAnySourceConnecting,
    isSourceActive,
    isSourceSelected,
    setSourceActive,
    setSourceSelected,
    setSourceStatus
  }
}
