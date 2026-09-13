export default function FeedbackPanel({ questions, answers, feedback, onComplete }) {
  const items = feedback.feedbackItems ?? [];

  return (
    <div className="feedback-panel">
      <h3>採点結果</h3>

      {items.map((item, index) => {
        const question = questions.find((q) => q.id === item.id);
        return (
          <div key={item.id} className="feedback-item">
            <div className={`feedback-badge ${item.correct ? 'correct' : 'incorrect'}`}>
              {item.correct ? '○' : '×'}
            </div>
            <div className="feedback-content">
              {question && (
                <p className="feedback-question-text">Q{index + 1}. {question.question}</p>
              )}
              <div className="feedback-row">
                <span className="feedback-answer">
                  回答: {answers[item.id] || '（未回答）'}
                </span>
              </div>
              {item.actual && (
                <p className="feedback-model-answer">模範解答: {item.actual}</p>
              )}
              <p className="feedback-comment">{item.comment}</p>
            </div>
          </div>
        );
      })}

      <div className="overall-feedback">
        <p>{feedback.overallComment}</p>
      </div>

      <button className="btn-primary" onClick={onComplete}>
        結果を見る →
      </button>
    </div>
  );
}
