import { useState, useEffect, useRef, useMemo } from 'react';
import QuestionPanel from './QuestionPanel';
import FeedbackPanel from './FeedbackPanel';
import { parseMarkedText, parseRubyText, stripMarkerSyntax, splitSentences, toSpeechText } from '../utils/textUtils';
import { useReadAloud } from '../hooks/useReadAloud';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

export default function SentenceReader({ text, onComplete, onBack }) {
  const [phase, setPhase] = useState('preview'); // 'preview' | 'question' | 'submitting' | 'feedback'
  const [markedContent] = useState(text.markedContent ?? text.content);
  const [questions] = useState(text.questions ?? []);
  const [annotations] = useState(text.annotations ?? []);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [writingMode, setWritingMode] = useState('horizontal'); // 'horizontal' | 'vertical'
  const [fontSize, setFontSize] = useState('md'); // 'sm' | 'md' | 'lg'
  const [hintUsedIds, setHintUsedIds] = useState(() => new Set());
  const [activeMarkerRef, setActiveMarkerRef] = useState(null);
  const sentenceRefs = useRef([]);

  // 音読モード：プレビュー画面のみで文単位に分割してTTS読み上げ・ハイライト同期を行う
  const previewSentences = useMemo(
    () => splitSentences(stripMarkerSyntax(markedContent || text.content)),
    [markedContent, text.content]
  );
  const speechSentences = useMemo(
    () => previewSentences.map(toSpeechText),
    [previewSentences]
  );
  // 日本語の黙読速度は概ね400〜600字/分とされるため、中間値500字/分で概算する
  const estimatedReadMinutes = Math.max(1, Math.round(text.content.length / 500));
  const readAloud = useReadAloud(speechSentences);

  useEffect(() => {
    if (phase !== 'preview') readAloud.stop();
  }, [phase]);

  useEffect(() => {
    if (!readAloud.isPlaying || readAloud.activeIndex < 0) return;
    sentenceRefs.current[readAloud.activeIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  }, [readAloud.activeIndex, readAloud.isPlaying]);

  // 縦書き時は overflow-y: hidden のためマウスホイールの縦スクロールを横スクロールに変換する
  // React の onWheel は passive で登録されるため preventDefault が効かず、
  // ページ自体も一緒に上下スクロールしてしまう。ネイティブの addEventListener で
  // passive: false を指定することでページの縦スクロールを確実に止める。
  const attachVerticalWheelScroll = (node) => {
    if (!node) return;
    const handler = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        node.scrollLeft -= e.deltaY;
        e.preventDefault();
      }
    };
    node.addEventListener('wheel', handler, { passive: false });
  };

  const handleUseHint = (id) => {
    setHintUsedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setPhase('submitting');
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: markedContent,
          title: text.title,
          questions,
          answers,
          leadText: text.leadText ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFeedback(data);
      setPhase('feedback');
    } catch {
      setError('フィードバックの取得に失敗しました。もう一度お試しください。');
      setPhase('question');
    }
  };

  const handleComplete = () => {
    onComplete({
      questions,
      answers: { ...answers },
      feedbackItems: feedback?.feedbackItems ?? [],
      overallComment: feedback?.overallComment ?? '',
      hintsUsedCount: hintUsedIds.size,
    });
  };

  const renderRubyText = (text, keyPrefix) => {
    return parseRubyText(text).map((seg, i) =>
      seg.type === 'ruby' ? (
        <ruby key={`${keyPrefix}-${i}`}>
          {seg.base}
          <rt>{seg.reading}</rt>
        </ruby>
      ) : (
        <span key={`${keyPrefix}-${i}`}>{seg.text}</span>
      )
    );
  };

  const renderMarkedContent = (content) => {
    const tokens = parseMarkedText(content);
    return tokens.map((token, i) => {
      if (token.type === 'marker') {
        const numberEl = <sup key="n" className="marker-number">{CIRCLED[token.num - 1]}</sup>;
        const underlineEl = (
          <span key="u" className="marker-underline">{renderRubyText(token.text, `m${i}`)}</span>
        );
        return (
          <span
            key={i}
            className={`text-marker ${activeMarkerRef === token.num ? 'text-marker-active' : ''}`}
          >
            {writingMode === 'vertical' ? (
              <>{numberEl}{underlineEl}</>
            ) : (
              <>{underlineEl}{numberEl}</>
            )}
          </span>
        );
      }
      return <span key={i}>{renderRubyText(token.text, `t${i}`)}</span>;
    });
  };

  return (
    <div className="sentence-reader">
      {/* プレビュー画面 */}
      {phase === 'preview' && (
        <div className="preview-screen">
          <div className="preview-header">
            <div className="preview-header-top">
              <h2>{text.title}</h2>
              <div className="reader-toolbar">
                <FontSizeToggle size={fontSize} onChange={setFontSize} />
                <WritingModeToggle mode={writingMode} onChange={setWritingMode} />
              </div>
            </div>
            <p className="preview-meta">
              {text.sentences.length}文 · {text.content.length}文字 · 約{estimatedReadMinutes}分で読めます
              {text.source ? ` · ${text.source}` : ''}
            </p>
            {readAloud.supported && (
              <ReadAloudControls readAloud={readAloud} />
            )}
          </div>
          <div className={`preview-body ${writingMode === 'vertical' ? 'preview-body-vertical' : ''}`}>
            {writingMode === 'vertical' ? (
              <div className="vertical-text-flow" ref={attachVerticalWheelScroll}>
                {text.leadText && <p className="lead-text text-vertical">{text.leadText}</p>}
                <p className={`preview-text text-vertical text-size-${fontSize}`}>
                  {previewSentences.map((s, i) => (
                    <span
                      key={i}
                      ref={(el) => (sentenceRefs.current[i] = el)}
                      className={`speech-sentence ${readAloud.activeIndex === i ? 'speech-sentence-active' : ''}`}
                    >
                      {renderRubyText(s, `pv${i}`)}
                    </span>
                  ))}
                </p>
                <TextAnnotations annotations={annotations} vertical />
              </div>
            ) : (
              <>
                {text.leadText && <p className="lead-text">{text.leadText}</p>}
                <p className={`preview-text text-size-${fontSize}`}>
                  {previewSentences.map((s, i) => (
                    <span
                      key={i}
                      ref={(el) => (sentenceRefs.current[i] = el)}
                      className={`speech-sentence ${readAloud.activeIndex === i ? 'speech-sentence-active' : ''}`}
                    >
                      {renderRubyText(s, `ph${i}`)}
                    </span>
                  ))}
                </p>
                <TextAnnotations annotations={annotations} />
              </>
            )}
          </div>
          <div className="preview-footer">
            <p className="preview-hint">全文を読んだら下のボタンを押してください</p>
            <button
              className="btn-primary preview-ready-btn"
              onClick={() => setPhase('question')}
            >
              読んだ！　問題を始める →
            </button>
            <button className="btn-secondary" onClick={onBack}>
              ← テキスト選択に戻る
            </button>
          </div>
        </div>
      )}

      {/* 問題・フィードバック画面 */}
      {phase !== 'preview' && (
        <>
          <div className={`reader-layout ${writingMode === 'vertical' ? 'reader-layout-vertical' : ''}`}>
            <div className={`text-panel ${writingMode === 'vertical' ? 'text-panel-vertical' : 'text-panel-horizontal'}`}>
              <div className="text-panel-header">
                <h3>本文</h3>
                <div className="reader-toolbar">
                  <FontSizeToggle size={fontSize} onChange={setFontSize} />
                  <WritingModeToggle mode={writingMode} onChange={setWritingMode} />
                </div>
              </div>
              {writingMode === 'vertical' ? (
                <div className="vertical-text-flow" ref={attachVerticalWheelScroll}>
                  {text.leadText && <p className="lead-text text-vertical">{text.leadText}</p>}
                  <div className={`full-text marked-text text-vertical text-size-${fontSize}`}>
                    {renderMarkedContent(markedContent)}
                  </div>
                  <TextAnnotations annotations={annotations} vertical />
                </div>
              ) : (
                <div className={`full-text marked-text text-size-${fontSize}`}>
                  {text.leadText && <p className="lead-text">{text.leadText}</p>}
                  {renderMarkedContent(markedContent)}
                  <TextAnnotations annotations={annotations} />
                </div>
              )}
            </div>

            <div className="question-panel-wrapper">
              {(phase === 'question' || phase === 'submitting') && (
                <QuestionPanel
                  questions={questions}
                  answers={answers}
                  onChange={setAnswers}
                  onSubmit={handleSubmit}
                  loading={phase === 'submitting'}
                  error={error}
                  hintUsedIds={hintUsedIds}
                  onUseHint={handleUseHint}
                  onFocusQuestion={setActiveMarkerRef}
                />
              )}
              {phase === 'feedback' && feedback && (
                <FeedbackPanel
                  questions={questions}
                  answers={answers}
                  feedback={feedback}
                  onComplete={handleComplete}
                />
              )}
            </div>
          </div>

          <button className="btn-secondary back-btn" onClick={onBack}>
            ← テキスト選択に戻る
          </button>
        </>
      )}
    </div>
  );
}

function FontSizeToggle({ size, onChange }) {
  const SIZES = [
    { value: 'sm', label: '小' },
    { value: 'md', label: '中' },
    { value: 'lg', label: '大' },
  ];
  return (
    <div className="writing-mode-toggle" role="group" aria-label="文字の大きさ">
      {SIZES.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`writing-mode-btn ${size === s.value ? 'active' : ''}`}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function WritingModeToggle({ mode, onChange }) {
  return (
    <div className="writing-mode-toggle" role="group" aria-label="文字組みの向き">
      <button
        type="button"
        className={`writing-mode-btn ${mode === 'horizontal' ? 'active' : ''}`}
        onClick={() => onChange('horizontal')}
      >
        横書き
      </button>
      <button
        type="button"
        className={`writing-mode-btn ${mode === 'vertical' ? 'active' : ''}`}
        onClick={() => onChange('vertical')}
      >
        縦書き
      </button>
    </div>
  );
}

function ReadAloudControls({ readAloud }) {
  const { isPlaying, isPaused, rate, voices, voiceURI, play, pause, resume, stop, setRate, setVoiceURI } = readAloud;
  return (
    <div className="read-aloud-controls">
      {!isPlaying ? (
        <button type="button" className="btn-secondary read-aloud-btn" onClick={() => play(0)}>
          音読開始
        </button>
      ) : isPaused ? (
        <button type="button" className="btn-secondary read-aloud-btn" onClick={resume}>
          再開
        </button>
      ) : (
        <button type="button" className="btn-secondary read-aloud-btn" onClick={pause}>
          一時停止
        </button>
      )}
      {isPlaying && (
        <button type="button" className="btn-secondary read-aloud-btn" onClick={stop}>
          停止
        </button>
      )}
      <select
        className="read-aloud-rate"
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
      >
        <option value={0.75}>遅い</option>
        <option value={1}>標準</option>
        <option value={1.25}>速い</option>
        <option value={1.5}>はやい</option>
      </select>
      {voices.length > 1 && (
        <select
          className="read-aloud-voice"
          value={voiceURI}
          onChange={(e) => setVoiceURI(e.target.value)}
        >
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TextAnnotations({ annotations, vertical }) {
  if (!annotations || annotations.length === 0) return null;

  if (vertical) {
    return (
      <div className="text-annotations text-vertical">
        <p className="text-annotations-title">語句の説明</p>
        {annotations.map((a, i) => (
          <p className="text-annotations-body" key={i}>{a.term}：{a.explanation}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="text-annotations">
      <p className="text-annotations-title">語句の説明</p>
      <dl className="text-annotations-list">
        {annotations.map((a, i) => (
          <div className="text-annotation-item" key={i}>
            <dt>{a.term}</dt>
            <dd>{a.explanation}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
