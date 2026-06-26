/**
 * Voice layer for the assistant: speech recognition (Web Speech API) and
 * text-to-speech (speechSynthesis). Both degrade gracefully — callers should
 * check `isRecognitionSupported()` and hide the mic button when false.
 */

import { toPhonetic } from './phonetic.js';
import { config } from '../../core/config.js';

const SpeechRecognition = (typeof window !== 'undefined') &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

let recognition = null;
let listening = false;

const LANG_TAG = { tr: 'tr-TR', en: 'en-US' };

function voiceEnabled() {
    return config.features.assistant?.voice !== false;
}

export function isRecognitionSupported() {
    return !!SpeechRecognition && voiceEnabled();
}

export function isSpeechSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isListening() {
    return listening;
}

/**
 * Start a one-shot recognition session.
 * @param {{lang?:string, onResult:Function, onState?:Function, onError?:Function}} opts
 */
export function startListening({ lang = 'tr', onResult, onState, onError } = {}) {
    if (!SpeechRecognition || !voiceEnabled()) {
        onError?.('unsupported');
        return false;
    }
    if (listening) stopListening();

    recognition = new SpeechRecognition();
    recognition.lang = LANG_TAG[lang] || LANG_TAG.tr;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { listening = true; onState?.('start'); };
    recognition.onend = () => { listening = false; onState?.('end'); };
    recognition.onerror = (e) => { listening = false; onError?.(e?.error || 'error'); onState?.('end'); };
    recognition.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) onResult?.(transcript);
    };

    try {
        recognition.start();
        return true;
    } catch (err) {
        listening = false;
        onError?.(err?.message || 'start-failed');
        return false;
    }
}

export function stopListening() {
    if (recognition) {
        try { recognition.stop(); } catch { /* already stopped */ }
    }
    listening = false;
}

let voicesCache = null;
function pickVoice(langTag) {
    if (!isSpeechSupported()) return null;
    if (!voicesCache || !voicesCache.length) voicesCache = window.speechSynthesis.getVoices();
    if (!voicesCache || !voicesCache.length) return null;
    const base = langTag.split('-')[0];
    return voicesCache.find(v => v.lang === langTag)
        || voicesCache.find(v => v.lang?.startsWith(base))
        || null;
}

/** Speak `text`. Brand names are converted to a Turkish spoken form first. */
export function speak(text, lang = 'tr') {
    if (!isSpeechSupported() || !voiceEnabled() || !text) return;
    try {
        window.speechSynthesis.cancel();
        const spoken = lang === 'tr' ? toPhonetic(text) : text;
        const utter = new SpeechSynthesisUtterance(spoken);
        const tag = LANG_TAG[lang] || LANG_TAG.tr;
        utter.lang = tag;
        const v = pickVoice(tag);
        if (v) utter.voice = v;
        utter.rate = 1.0;
        utter.pitch = 1.0;
        window.speechSynthesis.speak(utter);
    } catch { /* TTS unavailable — silent */ }
}

export function cancelSpeech() {
    if (isSpeechSupported()) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
}

if (isSpeechSupported() && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => { voicesCache = window.speechSynthesis.getVoices(); };
}
