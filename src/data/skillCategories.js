// 設問の読解スキル分類（成長ダッシュボードのレーダーチャート軸として使用）
export const SKILL_CATEGORIES = [
  { key: 'main_idea', label: '主旨・要点把握' },
  { key: 'vocabulary', label: '語句・語彙理解' },
  { key: 'reference', label: '指示語・接続語' },
  { key: 'structure', label: '論理構造把握' },
  { key: 'emotion', label: '心情・意図読解' },
  { key: 'expression', label: '記述・要約力' },
];

export const DEFAULT_CATEGORY = 'main_idea';

export function getCategoryLabel(key) {
  return SKILL_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
