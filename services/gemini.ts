import { GoogleGenAI } from "@google/genai";

// Initialize the client safely
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key missing");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateLyrics = async (title: string, artist: string): Promise<string> => {
  if (!navigator.onLine) {
    return "Fehler: Keine Internetverbindung. Lyrics können nur online abgerufen werden.";
  }

  const client = getClient();
  if (!client) return "Fehler: API Key fehlt.";

  try {
    const prompt = `Ich brauche den Songtext für das Lied "${title}" von "${artist}". 
    Bitte gib NUR den Songtext zurück, formatiert mit Zeilenumbrüchen für einen Teleprompter. 
    Keine Einleitung, keine Erklärung, keine Metadaten am Ende. Nur den Text.`;

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Keine Lyrics gefunden.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Fehler beim Abrufen der Lyrics. Bitte versuchen Sie es später erneut.";
  }
};

export const estimateBPMAndMood = async (lyrics: string): Promise<{ speed: number, mood: string }> => {
  if (!navigator.onLine) {
    return { speed: 3, mood: 'neutral' };
  }

  const client = getClient();
  if (!client) return { speed: 3, mood: 'neutral' };

  try {
    const prompt = `Analysiere diesen Songtext: "${lyrics.substring(0, 200)}...".
    Schätze ein passendes Scroll-Tempo für einen Teleprompter auf einer Skala von 1 (sehr langsam) bis 10 (sehr schnell).
    Gib das Ergebnis als JSON zurück. Schema: { "speed": number, "mood": string }`;

    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    
    const json = JSON.parse(response.text || "{}");
    return { 
        speed: typeof json.speed === 'number' ? json.speed : 3,
        mood: json.mood || 'neutral'
    };

  } catch (error) {
      return { speed: 3, mood: 'neutral' };
  }
}