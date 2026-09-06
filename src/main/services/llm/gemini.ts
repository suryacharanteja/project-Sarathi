import { GoogleGenerativeAI } from '@google/generative-ai'
import { type AskParams, buildPrompt } from './types'

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

export async function askGemini(params: AskParams, onChunk: (text: string) => void): Promise<void> {
  const genAI = new GoogleGenerativeAI(params.apiKey)
  const generativeModel = genAI.getGenerativeModel({ model: params.model })

  const images = (params.imageDataUrls ?? []).map(parseDataUrl).filter((img) => img !== null)
  const request =
    images.length > 0
      ? {
          contents: [
            {
              role: 'user',
              parts: [
                { text: buildPrompt(params) },
                ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))
              ]
            }
          ]
        }
      : buildPrompt(params)

  const result = await generativeModel.generateContentStream(request)
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) onChunk(text)
  }
}
