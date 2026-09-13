/**
 * 日本語テキストを文単位で分割する（句点「。」で区切る）
 */
export function splitSentences(text) {
  return text
    .trim()
    .split(/(?<=。)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 【①テキスト】記法をパースして tokens の配列に変換する
 * 返り値: Array<{type: 'text', text: string} | {type: 'marker', num: number, text: string}>
 */
export function parseMarkedText(content) {
  const tokens = [];
  const circled = '①②③④⑤⑥⑦⑧⑨⑩';
  const regex = /【([①②③④⑤⑥⑦⑧⑨⑩])([^】]+)】/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    const num = circled.indexOf(match[1]) + 1;
    tokens.push({ type: 'marker', num, text: match[2] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    tokens.push({ type: 'text', text: content.slice(lastIndex) });
  }

  return tokens;
}

/**
 * 「漢字《かんじ》」記法をパースしてルビ表示用のセグメントに変換する
 * 返り値: Array<{type: 'text', text: string} | {type: 'ruby', base: string, reading: string}>
 */
export function parseRubyText(text) {
  const segments = [];
  const regex = /([\u4E00-\u9FFF々]+)《([^》]+)》/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'ruby', base: match[1], reading: match[2] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * 【①語句】記法の下線部マーカーを取り除き、語句のみを残す（ルビ記法はそのまま残す）
 */
export function stripMarkerSyntax(content) {
  return content.replace(/【[①②③④⑤⑥⑦⑧⑨⑩]([^】]+)】/g, '$1');
}

/**
 * 「漢字《かんじ》」記法・【①語句】記法を取り除き、読み上げ用のプレーンテキストに変換する
 * （SpeechSynthesisUtterance には表記のみを渡し、ルビは発音に影響させない）
 */
export function toSpeechText(text) {
  return stripMarkerSyntax(text).replace(/([\u4E00-\u9FFF々]+)《([^》]+)》/g, '$1');
}
