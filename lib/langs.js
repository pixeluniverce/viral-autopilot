// Languages the channel posts in. Voices are free Microsoft Edge neural voices.
export const VOICES = {
  gujarati: { name: 'Gujarati', voice: 'gu-IN-NiranjanNeural' },
  hindi: { name: 'Hindi', voice: 'hi-IN-MadhurNeural' },
  english: { name: 'English', voice: 'en-US-AndrewNeural' },
};

export function enabledLanguages() {
  const keys = (process.env.LANGUAGES || 'gujarati,hindi,english')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((k) => VOICES[k]);
  return keys.length ? keys : ['english'];
}

// language = 'gujarati' | 'hindi' | 'english' | '' (auto-rotate)
export function pickLanguage(language, counter = 0) {
  const keys = enabledLanguages();
  const key = VOICES[(language || '').toLowerCase()] ? language.toLowerCase() : keys[counter % keys.length];
  const cfg = VOICES[key];
  const voice = process.env[`VOICE_${key.toUpperCase()}`] || cfg.voice;
  return { key, name: cfg.name, voice };
}
