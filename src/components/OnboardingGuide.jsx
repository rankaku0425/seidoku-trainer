import { useState } from 'react';

const STEP_TITLES = [
  'ようこそ',
  'テキストを選ぶ',
  '一文ずつ問いに答える',
  'AIがすぐに採点',
  '成長記録',
];

const DEMO_SENTENCE = '太陽は東の空から昇る。';
const DEMO_OPTIONS = ['太陽', '東の空', '昇る'];
const DEMO_CORRECT = '太陽';

export default function OnboardingGuide({ onClose }) {
  const [step, setStep] = useState(0);
  const [demoAnswer, setDemoAnswer] = useState(null);

  const lastStep = step === STEP_TITLES.length - 1;

  const goNext = () => {
    if (lastStep) {
      onClose();
      return;
    }
    setStep((s) => s + 1);
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <h2 className="onboarding-step-title">{STEP_TITLES[step]}</h2>

        {step === 0 && (
          <p className="onboarding-step-body">
            精読トレーナーへようこそ。文章を一文ずつ丁寧に読み解き、主語や文の構造、文と文のつながりを意識する「精読力」を鍛えるアプリです。実際に少しだけ操作しながら使い方を確認してみましょう。
          </p>
        )}

        {step === 1 && (
          <>
            <p className="onboarding-step-body">
              学習に使う文章は、次の4つの方法から選べます。
            </p>
            <div className="onboarding-mode-preview">
              <span className="onboarding-mode-chip">サンプルテキスト</span>
              <span className="onboarding-mode-chip">テキストを入力する</span>
              <span className="onboarding-mode-chip">AIで生成する</span>
              <span className="onboarding-mode-chip">青空文庫から探す</span>
            </div>
            <p className="onboarding-step-body">
              初めての方はまず「サンプルテキスト」から始めるのがおすすめです。
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <p className="onboarding-step-body">
              文章を読み終えると、一文ずつ設問に答えていきます。試しに下の問題に答えてみてください。
            </p>
            <p className="onboarding-demo-sentence">{DEMO_SENTENCE}</p>
            <p className="onboarding-demo-question">この文の主語はどれですか？</p>
            <div className="onboarding-demo-options">
              {DEMO_OPTIONS.map((opt) => {
                const revealed = demoAnswer !== null;
                const isSelected = demoAnswer === opt;
                const isCorrectOpt = opt === DEMO_CORRECT;
                let cls = 'onboarding-demo-option';
                if (revealed && isSelected && isCorrectOpt) cls += ' correct';
                if (revealed && isSelected && !isCorrectOpt) cls += ' incorrect';
                return (
                  <button
                    key={opt}
                    type="button"
                    className={cls}
                    onClick={() => setDemoAnswer(opt)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {demoAnswer && (
              <p className={`onboarding-demo-feedback ${demoAnswer === DEMO_CORRECT ? 'correct' : 'incorrect'}`}>
                {demoAnswer === DEMO_CORRECT
                  ? '正解です。「〜は」の形で動作の主になっている部分が主語です。'
                  : '惜しいです。文の中で実際に動作をしているのは誰か、探してみましょう。'}
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <p className="onboarding-step-body">
            回答すると、AIがその場で採点しフィードバックコメントを返します。分からないときは「ヒントを見る」で手がかりを確認することもできます。
          </p>
        )}

        {step === 4 && (
          <p className="onboarding-step-body">
            学習を終えると、その回のスコアと弱点分析が表示されます。画面上部の「成長記録」からは、これまでの学習履歴とスキル別の得意・不得意をレーダーチャートでいつでも振り返れます。
          </p>
        )}

        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {STEP_TITLES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`onboarding-dot ${i === step ? 'active' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`ステップ${i + 1}へ`}
              />
            ))}
          </div>
          <div className="onboarding-nav">
            <button type="button" className="onboarding-skip" onClick={onClose}>
              スキップ
            </button>
            <div className="onboarding-nav-buttons">
              {step > 0 && (
                <button type="button" className="btn-secondary" onClick={goPrev}>
                  戻る
                </button>
              )}
              <button type="button" className="btn-primary" onClick={goNext}>
                {lastStep ? 'はじめる' : '次へ'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
