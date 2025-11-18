import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Constants ---
const VOICES = [
  { name: 'Ares', label: 'Ares (Male)' },
  { name: 'Atlas', label: 'Atlas (Male)' },
  { name: 'Calypso', label: 'Calypso (Female)' },
  { name: 'Charon', label: 'Charon (Male)' },
  { name: 'Echo', label: 'Echo (Female)' },
  { name: 'Eos', label: 'Eos (Female)' },
  { name: 'Fenrir', label: 'Fenrir (Male)' },
  { name: 'Hades', label: 'Hades (Male)' },
  { name: 'Helios', label: 'Helios (Male)' },
  { name: 'Hermes', label: 'Hermes (Male)' },
  { name: 'Kore', label: 'Kore (Female)' },
  { name: 'Luna', label: 'Luna (Female)' },
  { name: 'Nyx', label: 'Nyx (Female)' },
  { name: 'Orion', label: 'Orion (Male)' },
  { name: 'Persephone', label: 'Persephone (Female)' },
  { name: 'Prometheus', label: 'Prometheus (Male)' },
  { name: 'Puck', label: 'Puck (Male)' },
  { name: 'Styx', label: 'Styx (Female)' },
  { name: 'Tethys', label: 'Tethys (Female)' },
  { name: 'Titan', label: 'Titan (Male)' },
  { name: 'Zephyr', label: 'Zephyr (Female)' },
];

// --- Main App Component ---
const App = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].name);

  // Web Audio State
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(0); // In semitones, relative to original
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize AudioContext on component mount
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Cleanup on unmount
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null; // Avoid triggering onended state change
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
      setIsPlaying(false);
    }
  };

  const handleGenerateSpeech = async () => {
    if (!text.trim()) {
      setError('Please enter some text to generate speech.');
      return;
    }

    setLoading(true);
    setError('');
    stopPlayback();
    setAudioBuffer(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
          },
        },
      });
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        const decodedBytes = decode(base64Audio);
        const pcmData = new Int16Array(decodedBytes.buffer);
        const wavBlob = pcmToWavBlob(pcmData, 24000, 1);
        const arrayBuffer = await wavBlob.arrayBuffer();

        if (audioContextRef.current) {
          const decodedAudioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          setAudioBuffer(decodedAudioBuffer);
        } else {
           throw new Error("AudioContext not available.");
        }
      } else {
        throw new Error("No audio data received from the API.");
      }

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to generate speech. ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayStop = () => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    
    // On browsers like Chrome, the AudioContext may be suspended until a user gesture.
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (isPlaying) {
        stopPlayback();
    } else if (audioBuffer) {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        source.playbackRate.value = rate;
        source.detune.value = pitch * 100; // detune is in cents

        source.connect(audioContext.destination);
        source.start(0);

        source.onended = () => {
            setIsPlaying(false);
            sourceNodeRef.current = null;
        };

        sourceNodeRef.current = source;
        setIsPlaying(true);
    }
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopPlayback();
    setRate(parseFloat(e.target.value));
  };

  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopPlayback();
    setPitch(parseInt(e.target.value, 10));
  };

  return (
    <main>
      <div className="container">
        <h1>Generate Speech</h1>
        <p>Enter text below to convert it into speech with customizable voice, rate, and pitch.</p>
        
        <div className="settings-container">
            <div className="settings-group voice-selector">
                <label htmlFor="voice-select">Select a Voice:</label>
                <div className="select-wrapper">
                    <select 
                        id="voice-select"
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        disabled={loading}
                        aria-label="Select voice"
                    >
                        {VOICES.map((voice) => (
                            <option key={voice.name} value={voice.name}>{voice.label}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="settings-group">
                <label htmlFor="rate-slider">Speech Rate: {rate.toFixed(1)}x</label>
                <input 
                    id="rate-slider"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={rate}
                    onChange={handleRateChange}
                    disabled={loading}
                    aria-label="Speech rate slider"
                />
            </div>
            <div className="settings-group">
                <label htmlFor="pitch-slider">Pitch: {pitch > 0 ? '+' : ''}{pitch}</label>
                <input 
                    id="pitch-slider"
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={pitch}
                    onChange={handlePitchChange}
                    disabled={loading}
                    aria-label="Pitch slider"
                />
            </div>
        </div>

        <div className="input-group">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g., Hello world! Welcome to the future of AI."
            rows={5}
            disabled={loading}
            aria-label="Text to generate speech from"
          />
          <button onClick={handleGenerateSpeech} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Speech'}
          </button>
        </div>

        {loading && <div className="loader" aria-label="Loading audio"></div>}

        {error && <p className="error-message" role="alert">{error}</p>}
        
        {audioBuffer && !loading && (
          <div className="audio-player-container">
            <h2>Playback</h2>
            <button onClick={handlePlayStop} className="play-button" aria-label={isPlaying ? 'Stop playback' : 'Start playback'}>
              {isPlaying ? 'Stop' : 'Play'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
};


// --- Helper Functions ---

/**
 * Decodes a base64 string into a Uint8Array.
 */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw PCM audio data into a WAV file Blob.
 * The TTS model returns single-channel (mono), 16-bit PCM audio at a 24000 Hz sample rate.
 */
function pcmToWavBlob(pcmData: Int16Array, sampleRate: number, numChannels: number): Blob {
  const headerSize = 44;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = pcmData.length * bytesPerSample;
  const fileSize = headerSize + dataSize;
  
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // file size - 8
  writeString(8, 'WAVE');
  
  // "fmt " sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // 16 for PCM
  view.setUint16(20, 1, true); // Audio format 1 for PCM
  view.setUint16(22, numChannels, true); // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // Byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // Block align
  view.setUint16(34, bitsPerSample, true); // Bits per sample
  
  // "data" sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write the PCM data
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(headerSize + i * 2, pcmData[i], true);
  }
  
  return new Blob([view], { type: 'audio/wav' });
}


// --- Styles ---
const styles = `
:root {
  --background-color: #121212;
  --surface-color: #1e1e1e;
  --primary-color: #8a2be2;
  --primary-hover-color: #9932cc;
  --text-color: #e0e0e0;
  --text-secondary-color: #b0b0b0;
  --border-color: #333;
  --error-color: #ff5252;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Roboto', sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 1rem;
}

main {
  width: 100%;
  max-width: 600px;
}

.container {
  background-color: var(--surface-color);
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  text-align: center;
}

h1 {
  margin-top: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-color);
}

p {
  color: var(--text-secondary-color);
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.settings-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.5rem;
    margin-bottom: 1.5rem;
    text-align: left;
}

.settings-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.settings-group.voice-selector {
    grid-column: 1 / -1;
}

.settings-group label {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-secondary-color);
}

.select-wrapper {
    position: relative;
    width: 100%;
}

select {
    width: 100%;
    padding: 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background-color: var(--background-color);
    color: var(--text-color);
    font-family: inherit;
    font-size: 1rem;
    cursor: pointer;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.select-wrapper::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 1rem;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--text-secondary-color);
    pointer-events: none;
}


select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(138, 43, 226, 0.3);
}

select:disabled {
  background-color: #333;
  cursor: not-allowed;
  opacity: 0.7;
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 5px;
  outline: none;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: var(--primary-color);
  cursor: pointer;
  border-radius: 50%;
  border: 2px solid var(--surface-color);
  transition: background-color 0.2s;
}
input[type="range"]::-webkit-slider-thumb:hover {
  background-color: var(--primary-hover-color);
}

input[type="range"]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--primary-color);
  cursor: pointer;
  border-radius: 50%;
  border: 2px solid var(--surface-color);
  transition: background-color 0.2s;
}
input[type="range"]::-moz-range-thumb:hover {
  background-color: var(--primary-hover-color);
}


.input-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

textarea {
  width: 100%;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: var(--background-color);
  color: var(--text-color);
  font-family: inherit;
  font-size: 1rem;
  resize: vertical;
  transition: border-color 0.2s, box-shadow 0.2s;
}

textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(138, 43, 226, 0.3);
}

button {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  background-color: var(--primary-color);
  color: white;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

button:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
  transform: translateY(-1px);
}

button:disabled {
  background-color: #555;
  cursor: not-allowed;
  opacity: 0.7;
}

.loader {
  border: 4px solid #f3f3f330;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
  margin: 2rem auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  color: var(--error-color);
  background-color: rgba(255, 82, 82, 0.1);
  padding: 0.75rem;
  border-radius: 8px;
  margin-top: 1.5rem;
  border: 1px solid var(--error-color);
}

.audio-player-container {
  margin-top: 2rem;
  text-align: center;
}

.audio-player-container h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  font-weight: 500;
}

.play-button {
    min-width: 120px;
}
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);


// --- React Root ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}