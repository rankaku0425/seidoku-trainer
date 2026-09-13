import { getDefaultQuestions } from '../data/defaultQuestions';

// 傍線マーキング・設問・語句注釈をまとめて取得する。
// テキスト選択の各画面（サンプル/カスタム入力/AI生成/青空文庫）から、
// 画面遷移する前にまとめて呼び出すことで、遷移後の待ち時間・追加のクリックをなくす。
export async function fetchPreparedReading({ content, title, difficulty, questionCount, leadText }) {
  try {
    const res = await fetch('/api/prepare-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title, difficulty, questionCount, leadText }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return {
      markedContent: data.markedContent ?? content,
      questions: data.questions ?? getDefaultQuestions(),
      annotations: data.annotations ?? [],
    };
  } catch {
    return {
      markedContent: content,
      questions: getDefaultQuestions(),
      annotations: [],
    };
  }
}
