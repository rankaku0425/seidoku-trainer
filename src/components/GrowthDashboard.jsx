import { useMemo } from 'react';
import { SKILL_CATEGORIES } from '../data/skillCategories';
import { loadHistory, aggregateCategoryStats } from '../utils/growthHistory';
import RadarChart from './RadarChart';

export default function GrowthDashboard({ onBack }) {
  const history = useMemo(() => loadHistory(), []);

  const overallStats = useMemo(() => aggregateCategoryStats(history), [history]);
  const pastStats = useMemo(
    () => aggregateCategoryStats(history.slice(0, -1)),
    [history]
  );
  const latestStats = useMemo(() => {
    const latest = history[history.length - 1];
    return latest ? aggregateCategoryStats([latest]) : null;
  }, [history]);

  const axes = SKILL_CATEGORIES.map((c) => c.label);

  const datasets = [
    {
      label: 'これまでの平均',
      color: '#8c7b6e',
      values: SKILL_CATEGORIES.map((c) => pastStats[c.key] ?? 0),
    },
    {
      label: '直近の学習',
      color: '#c0392b',
      values: SKILL_CATEGORIES.map((c) => latestStats?.[c.key] ?? overallStats[c.key] ?? 0),
    },
  ];

  const hasData = history.length > 0;

  return (
    <div className="growth-dashboard">
      <div className="dashboard-header">
        <h2>成長記録</h2>
        <button className="btn-secondary" onClick={onBack}>戻る</button>
      </div>

      {!hasData && (
        <p className="dashboard-empty">
          まだ学習記録がありません。文章を読んで問題に答えると、ここにスキル別の成長グラフが表示されます。
        </p>
      )}

      {hasData && (
        <>
          <div className="dashboard-chart-wrap">
            <RadarChart axes={axes} datasets={datasets} />
            <div className="dashboard-legend">
              {datasets.map((ds) => (
                <span key={ds.label} className="legend-item">
                  <span className="legend-swatch" style={{ background: ds.color }} />
                  {ds.label}
                </span>
              ))}
            </div>
          </div>

          <div className="dashboard-category-list">
            {SKILL_CATEGORIES.map((c) => {
              const rate = overallStats[c.key];
              return (
                <div key={c.key} className="category-row">
                  <span className="category-name">{c.label}</span>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{ width: `${rate != null ? Math.round(rate * 100) : 0}%` }}
                    />
                  </div>
                  <span className="category-rate">
                    {rate != null ? `${Math.round(rate * 100)}%` : '未学習'}
                  </span>
                </div>
              );
            })}
          </div>

          <h3 className="dashboard-history-title">学習履歴</h3>
          <ul className="dashboard-history-list">
            {[...history].reverse().map((s) => (
              <li key={s.id} className="history-item">
                <span className="history-date">
                  {new Date(s.date).toLocaleDateString('ja-JP')}
                </span>
                <span className="history-title">{s.title}</span>
                <span className="history-score">
                  {s.correctCount}/{s.totalCount}問正解
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
