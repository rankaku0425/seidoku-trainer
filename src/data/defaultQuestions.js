// /api/prepare-reading が失敗した場合に使う既定の設問セット
export function getDefaultQuestions() {
  return [
    {
      id: 'q1',
      type: 'text',
      question: 'この文章の中心的な主張・テーマは何ですか？',
      hint: '筆者が最も伝えたいことを探してみよう',
      markerRef: null,
      charLimit: null,
      category: 'main_idea',
    },
    {
      id: 'q2',
      type: 'radio',
      question: 'この文章の構成として最も適切なものはどれですか？',
      hint: null,
      options: ['主張→理由→具体例→まとめ', '問題提起→考察→結論', '事実説明→意見→提案', 'その他'],
      markerRef: null,
      charLimit: null,
      category: 'structure',
    },
    {
      id: 'q3',
      type: 'text',
      question: 'この文章の要旨を40字以内でまとめなさい。',
      hint: '結論部分に注目してみよう',
      markerRef: null,
      charLimit: { min: null, max: 40 },
      category: 'expression',
    },
  ];
}
