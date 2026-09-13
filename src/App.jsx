import { useState } from 'react';
import TextSelector from './components/TextSelector';
import SentenceReader from './components/SentenceReader';
import ResultSummary from './components/ResultSummary';
import GrowthDashboard from './components/GrowthDashboard';
import OnboardingGuide from './components/OnboardingGuide';
import './index.css';

const ONBOARDING_STORAGE_KEY = 'seidoku-onboarding-seen';

export default function App() {
  const [screen, setScreen] = useState('select'); // 'select' | 'reading' | 'result' | 'dashboard'
  const [selectedText, setSelectedText] = useState(null);
  const [sessionResult, setSessionResult] = useState(null);
  const [previousScreen, setPreviousScreen] = useState('select');
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(ONBOARDING_STORAGE_KEY)
  );

  const closeOnboarding = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setShowOnboarding(false);
  };

  const handleStart = (text) => {
    setSelectedText(text);
    setSessionResult(null);
    setScreen('reading');
  };

  const handleComplete = (result) => {
    setSessionResult(result);
    setScreen('result');
  };

  const openDashboard = () => {
    setPreviousScreen(screen);
    setScreen('dashboard');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <h1>精読トレーナー</h1>
          <p>文章を一文ずつ丁寧に読む力を鍛えよう</p>
        </div>
        {screen !== 'dashboard' && (
          <div className="header-actions">
            <button className="header-dashboard-btn" onClick={() => setShowOnboarding(true)}>
              使い方
            </button>
            <button className="header-dashboard-btn" onClick={openDashboard}>
              成長記録
            </button>
          </div>
        )}
      </header>
      {showOnboarding && <OnboardingGuide onClose={closeOnboarding} />}
      <main className="app-main">
        {screen === 'select' && <TextSelector onStart={handleStart} />}
        {screen === 'reading' && selectedText && (
          <SentenceReader
            text={selectedText}
            onComplete={handleComplete}
            onBack={() => setScreen('select')}
          />
        )}
        {screen === 'result' && (
          <ResultSummary
            text={selectedText}
            result={sessionResult}
            onRestart={() => setScreen('select')}
            onViewDashboard={openDashboard}
          />
        )}
        {screen === 'dashboard' && (
          <GrowthDashboard onBack={() => setScreen(previousScreen)} />
        )}
      </main>
    </div>
  );
}
