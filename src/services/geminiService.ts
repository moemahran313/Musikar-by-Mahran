import { GoogleGenAI, Modality } from "@google/genai";

const MODEL_NAME = "lyria-3-clip-preview"; // 30s clips for MVP

export async function generateMusic(prompt: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContentStream({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseModalities: [Modality.AUDIO],
    },
  });

  let audioBase64 = "";
  let lyrics = "";
  let mimeType = "audio/wav";

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (!audioBase64 && part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        audioBase64 += part.inlineData.data;
      }
      if (part.text && !lyrics) {
        lyrics = part.text;
      }
    }
  }

  if (!audioBase64) {
    throw new Error("No audio data generated");
  }

  // Decode base64 audio into a playable Blob URL
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const audioUrl = URL.createObjectURL(blob);

  return {
    audioUrl,
    lyrics,
    title: prompt.split(' ').slice(0, 3).join(' ') + '...',
    duration: 30, // lyria-3-clip-preview is 30s
  };
}
