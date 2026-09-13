import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

const VOICE_STORAGE_KEY = 'seidoku-tts-voice';

// 端末にインストールされている音声の中から、より自然（人間っぽい）な音声を優先的にスコアリングする
// ブラウザ・OSによって呼び方が異なるため、名前に含まれるキーワードで簡易的に判定する
function scoreVoice(v) {
  const name = v.name || '';
  let score = 0;
  if (/natural/i.test(name)) score += 100;
  if (/neural/i.test(name)) score += 90;
  if (/online/i.test(name)) score += 50;
  if (/google/i.test(name)) score += 40;
  if (/desktop/i.test(name)) score -= 30;
  if (!v.localService) score += 20; // クラウド音声は概して自然な発話になりやすい
  return score;
}

function pickBestVoice(voices) {
  if (voices.length === 0) return null;
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

/**
 * 文単位の配列を順番に読み上げ、現在読み上げ中の文のインデックスを返すフック。
 * ブラウザ標準の Web Speech API (SpeechSynthesis) を使用する。
 *
 * cancel() を呼んだ直後でも古い utterance の onend が非同期に発火することがあるため、
 * セッションカウンターで「今どの再生セッションか」を管理し、
 * 古いセッションからのコールバックは無視することで誤って次の文へ進むバグを防ぐ。
 */
export function useReadAloud(sentences) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState(() => {
    try {
      return localStorage.getItem(VOICE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const sessionRef = useRef(0);
  const rateRef = useRef(1);
  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // 利用可能な音声一覧を取得する（非同期に読み込まれるブラウザが多いため voiceschanged も監視する）
  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const japanese = all.filter((v) => v.lang?.toLowerCase().startsWith('ja'));
      setVoices(japanese.length > 0 ? japanese : all);
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [supported]);

  // 未選択の場合は最も自然に聞こえそうな音声を自動選択する
  useEffect(() => {
    if (voiceURI || voices.length === 0) return;
    const best = pickBestVoice(voices);
    if (best) setVoiceURI(best.voiceURI);
  }, [voices, voiceURI]);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voiceURI === voiceURI) || null,
    [voices, voiceURI]
  );

  const changeVoice = useCallback((uri) => {
    setVoiceURI(uri);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, uri);
    } catch {
      // 無視する
    }
  }, []);

  const voiceRef = useRef(selectedVoice);
  voiceRef.current = selectedVoice;

  const speakFrom = useCallback((index, session) => {
    const list = sentencesRef.current;
    if (!supported || index >= list.length) {
      if (session === sessionRef.current) {
        setIsPlaying(false);
        setIsPaused(false);
        setActiveIndex(-1);
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(list[index]);
    utterance.lang = voiceRef.current?.lang || 'ja-JP';
    utterance.rate = rateRef.current;
    if (voiceRef.current) utterance.voice = voiceRef.current;

    utterance.onstart = () => {
      if (session !== sessionRef.current) return;
      setActiveIndex(index);
    };

    utterance.onend = () => {
      if (session !== sessionRef.current) return;
      speakFrom(index + 1, session);
    };

    utterance.onerror = () => {
      if (session !== sessionRef.current) return;
      speakFrom(index + 1, session);
    };

    window.speechSynthesis.speak(utterance);
  }, [supported]);

  const play = useCallback((fromIndex = 0) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    sessionRef.current += 1;
    const session = sessionRef.current;
    setIsPlaying(true);
    setIsPaused(false);
    speakFrom(fromIndex, session);
  }, [supported, speakFrom]);

  const pause = useCallback(() => {
    if (!supported || !isPlaying) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, [supported, isPlaying]);

  const resume = useCallback(() => {
    if (!supported || !isPaused) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, [supported, isPaused]);

  const stop = useCallback(() => {
    if (!supported) return;
    sessionRef.current += 1;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setActiveIndex(-1);
  }, [supported]);

  const changeRate = useCallback((next) => {
    rateRef.current = next;
    setRate(next);
  }, []);

  useEffect(() => stop, [stop]);

  return {
    supported,
    isPlaying,
    isPaused,
    activeIndex,
    rate,
    voices,
    voiceURI,
    play,
    pause,
    resume,
    stop,
    setRate: changeRate,
    setVoiceURI: changeVoice,
  };
}
