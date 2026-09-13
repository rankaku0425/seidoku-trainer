import { SKILL_CATEGORIES } from '../data/skillCategories';

const STORAGE_KEY = 'seidoku-growth-history';
const MAX_SESSIONS = 50;

// { id, date, title, correctCount, totalCount, categories: { [key]: { correct, total } } }
export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSession(session) {
  const history = loadHistory();
  history.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    ...session,
  });
  const trimmed = history.slice(-MAX_SESSIONS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorageが使えない環境（プライベートモード等）では無視する
  }
  return trimmed;
}

// カテゴリー別の正答率を集計する（0〜1、データがなければnull）
export function aggregateCategoryStats(sessions) {
  const totals = Object.fromEntries(SKILL_CATEGORIES.map((c) => [c.key, { correct: 0, total: 0 }]));
  sessions.forEach((session) => {
    Object.entries(session.categories ?? {}).forEach(([key, stat]) => {
      if (!totals[key]) totals[key] = { correct: 0, total: 0 };
      totals[key].correct += stat.correct ?? 0;
      totals[key].total += stat.total ?? 0;
    });
  });
  return Object.fromEntries(
    Object.entries(totals).map(([key, { correct, total }]) => [
      key,
      total > 0 ? correct / total : null,
    ])
  );
}

export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視する
  }
}
