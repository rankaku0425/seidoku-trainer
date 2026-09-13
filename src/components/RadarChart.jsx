// 依存ライブラリなしで描画する汎用レーダーチャート（複数データセットの重ね描画に対応）
export default function RadarChart({ axes, datasets, size = 280 }) {
  const center = size / 2;
  const radius = size * 0.36;
  const levels = 4;
  const count = axes.length;

  const pointFor = (index, value) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = radius * Math.max(0, Math.min(1, value ?? 0));
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  const axisPointFor = (index, r) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  const labelPointFor = (index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = radius + 22;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} className="radar-chart">
      {/* 同心グリッド */}
      {Array.from({ length: levels }, (_, i) => {
        const r = (radius * (i + 1)) / levels;
        const points = Array.from({ length: count }, (_, idx) => axisPointFor(idx, r).join(',')).join(' ');
        return <polygon key={i} points={points} className="radar-grid" />;
      })}

      {/* 軸線 */}
      {axes.map((_, idx) => {
        const [x, y] = axisPointFor(idx, radius);
        return <line key={idx} x1={center} y1={center} x2={x} y2={y} className="radar-axis" />;
      })}

      {/* データセット */}
      {datasets.map((ds, dIdx) => {
        const points = ds.values.map((v, idx) => pointFor(idx, v).join(',')).join(' ');
        return (
          <g key={dIdx}>
            <polygon points={points} className="radar-shape" style={{ fill: ds.color, stroke: ds.color }} />
            {ds.values.map((v, idx) => {
              if (v == null) return null;
              const [x, y] = pointFor(idx, v);
              return <circle key={idx} cx={x} cy={y} r={3} style={{ fill: ds.color }} />;
            })}
          </g>
        );
      })}

      {/* ラベル */}
      {axes.map((label, idx) => {
        const [x, y] = labelPointFor(idx);
        return (
          <text
            key={idx}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="radar-label"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
