import { useEffect, useRef, useState } from 'react';

// ストリーミングされない（進捗が実測できない）AI呼び出し向けに、
// 疑似的な進捗率を表示するためのフック。
// 経過時間に対して指数関数的に95%へ漸近させる（実際の処理時間の目安=TAU_MSに近づくほど遅くなる）。
// 離散的なステップで一気に95%まで進んで長時間止まるのを避け、常にゆっくり動き続けるようにする。
const TAU_MS = 6000;

export function useSimulatedProgress(active) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (!active) {
      clearInterval(timerRef.current);
      setProgress(0);
      return;
    }
    startRef.current = Date.now();
    setProgress(5);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(95 * (1 - Math.exp(-elapsed / TAU_MS)));
    }, 200);
    return () => clearInterval(timerRef.current);
  }, [active]);

  return Math.round(progress);
}
