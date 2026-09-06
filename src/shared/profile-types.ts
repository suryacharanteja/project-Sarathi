export interface Profile {
  id: string
  name: string
  resumeText: string
  /** Plain-text description of HOW this profile's candidate speaks
   *  (sentence length, real filler words observed, typical opens/closes,
   *  formality) — generated once from their own past saved mic transcripts
   *  via "Learn my speaking style". Null until that's been run. */
  speakingStyleProfile: string | null
  speakingStyleGeneratedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentRecord {
  id: string
  fileName: string
  extractedText: string
  sizeBytes: number
  createdAt: string
}
