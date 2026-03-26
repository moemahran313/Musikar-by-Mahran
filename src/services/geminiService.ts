import { GoogleGenAI, Modality } from "@google/genai";
import { MusicOptions } from "../types";

const MUSIC_MODEL = "lyria-3-clip-preview";
const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

export async function generateLyrics(prompt: string, options: MusicOptions, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const fullPrompt = `Generate song lyrics based on this prompt: "${prompt}". 
  Genre: ${options.key} ${options.scale}. 
  Mood: ${options.includeInstruments.join(', ')}.
  Keep it concise and poetic. Return only the lyrics text.`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: fullPrompt,
  });

  return response.text || "No lyrics generated.";
}

export async function generateCoverArt(prompt: string, lyrics: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const imagePrompt = `Create a futuristic, artistic album cover for a song with this theme: "${prompt}". 
  Lyrics snippet: "${lyrics.slice(0, 100)}". 
  Style: Neon, cyberpunk, music-centric, high resolution.`;

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: imagePrompt,
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`;
}

export async function generateMusic(prompt: string, options: MusicOptions, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  
  // Use Pro model for longer tracks
  const model = options.duration > 30 ? "lyria-3-pro-preview" : MUSIC_MODEL;

  const enhancedPrompt = `Create a ${options.duration}-second track. 
  Description: ${prompt}. 
  Musical Key: ${options.key}. 
  Scale: ${options.scale}. 
  Include instruments: ${options.includeInstruments.join(', ')}. 
  Exclude: ${options.excludeInstruments.join(', ')}.`;

  const response = await ai.models.generateContentStream({
    model: model,
    contents: enhancedPrompt,
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
    duration: 30,
  };
}
