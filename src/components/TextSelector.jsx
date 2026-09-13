import { useState } from 'react';
import { sampleTexts } from '../data/sampleTexts';
import { splitSentences } from '../utils/textUtils';
import { fetchPreparedReading } from '../utils/prepareReadingApi';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';
import TextGenerator from './TextGenerator';
import AozoraSelector from './AozoraSelector';

export default function TextSelector({ onStart }) {
  const [mode, setMode] = useState('sample');
  const [selectedId, setSelectedId] = useState(sampleTexts[0].id);
  const [customText, setCustomText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [preparing, setPreparing] = useState(false);

  const handleStart = async () => {
    const text = mode === 'sample'
      ? sampleTexts.find((t) => t.id === selectedId)
      : {
        id: 'custom',
        title: customTitle.trim() || 'オリジナルテキスト',
        source: '',
        content: customText,
        sentences: splitSentences(customText),
      };
    if (mode === 'custom' && !customText.trim()) return;

    setPreparing(true);
    const prepared = await fetchPreparedReading({
      content: text.content,
      title: text.title,
      difficulty: text.level ?? '中学3年生',
      questionCount: text.questionCount ?? null,
      leadText: text.leadText ?? null,
    });
    setPreparing(false);
    onStart({ ...text, ...prepared });
  };

  const canStart = (mode === 'sample' || customText.trim().length > 0) && !preparing;
  const customSentences = customText ? splitSentences(customText) : [];
  const prepProgress = useSimulatedProgress(preparing);

  return (
    <div className="text-selector">
      <div className="selector-intro">
        <h2>テキストを選んでスタート</h2>
        <p>文章を一文ずつ読み、設問に答えながら精読力を鍛えましょう。</p>
      </div>

      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'sample' ? 'active' : ''}`}
          onClick={() => setMode('sample')}
        >
          サンプルテキスト
        </button>
        <button
          className={`mode-tab ${mode === 'custom' ? 'active' : ''}`}
          onClick={() => setMode('custom')}
        >
          テキストを入力する
        </button>
        <button
          className={`mode-tab ${mode === 'generate' ? 'active' : ''}`}
          onClick={() => setMode('generate')}
        >
          AIで生成する
        </button>
        <button
          className={`mode-tab ${mode === 'aozora' ? 'active' : ''}`}
          onClick={() => setMode('aozora')}
        >
          青空文庫から探す
        </button>
      </div>

      {mode === 'sample' && (
        <div className="sample-list">
          {sampleTexts.map((text) => (
            <label
              key={text.id}
              className={`sample-card ${selectedId === text.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(text.id)}
            >
              <input
                type="radio"
                name="sample"
                value={text.id}
                checked={selectedId === text.id}
                onChange={() => setSelectedId(text.id)}
              />
              <div className="sample-info">
                <span className="sample-title">{text.title}</span>
                <span className="sample-meta">
                  {text.sentences.length}文 · {text.content.length}文字 · {text.level} · {text.topic}
                </span>
                <p className="sample-preview">{text.content.slice(0, 65)}…</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {mode === 'custom' && (
        <div className="custom-input">
          <input
            type="text"
            className="text-input"
            placeholder="テキストのタイトル（省略可）"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
          />
          <textarea
            className="custom-textarea"
            placeholder="ここにテキストを貼り付けてください。&#10;文末に「。」がある説明文・評論文が適しています。"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={8}
          />
          {customSentences.length > 0 && (
            <p className="sentence-count-preview">
              → {customSentences.length}文 / {customText.length}文字
            </p>
          )}
        </div>
      )}

      {mode === 'generate' && <TextGenerator onUseText={onStart} />}

      {mode === 'aozora' && <AozoraSelector onUseText={onStart} />}

      {mode !== 'generate' && mode !== 'aozora' && <button className="btn-primary start-btn" onClick={handleStart} disabled={!canStart}>
        {preparing ? `問題を準備しています... ${prepProgress}%` : '精読スタート →'}
      </button>}

      {mode !== 'generate' && mode !== 'aozora' && <div className="how-to">
        <h3>使い方</h3>
        <ol>
          <li>テキストを選んでスタート</li>
          <li>本文をひと通り読みます</li>
          <li>
            文章の内容に沿った<strong>いくつかの設問</strong>に回答します（内容理解・語彙・指示語など）
          </li>
          <li>AIがその場で採点し、フィードバックをくれます</li>
          <li>全文読み終えたら<strong>弱点分析レポート</strong>が表示されます</li>
        </ol>
      </div>}
    </div>
  );
}
