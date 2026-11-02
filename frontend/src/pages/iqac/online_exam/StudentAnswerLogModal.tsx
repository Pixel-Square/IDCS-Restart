import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  User,
  Award,
  BookOpen,
  Filter,
  Check,
  AlertTriangle
} from 'lucide-react';
import {
  StudentAnswerLogResponse,
  fetchStudentAnswerLog
} from '../../../services/onlineExam';

interface StudentAnswerLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: number;
  studentId: number | null;
  studentName?: string;
}

export default function StudentAnswerLogModal({
  isOpen,
  onClose,
  examId,
  studentId,
  studentName,
}: StudentAnswerLogModalProps) {
  const [data, setData] = useState<StudentAnswerLogResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CORRECT' | 'INCORRECT' | 'UNANSWERED'>('ALL');

  useEffect(() => {
    if (!isOpen || !studentId) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMsg('');

    fetchStudentAnswerLog(examId, studentId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setErrorMsg(err.message || 'Failed to load student answer log.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, examId, studentId]);

  if (!isOpen) return null;

  const questions = data?.questions || [];
  const correctCount = questions.filter((q) => q.is_answered && q.is_correct).length;
  const incorrectCount = questions.filter((q) => q.is_answered && !q.is_correct).length;
  const unansweredCount = questions.filter((q) => !q.is_answered).length;

  const filteredQuestions = questions.filter((q) => {
    if (activeFilter === 'CORRECT') return q.is_answered && q.is_correct;
    if (activeFilter === 'INCORRECT') return q.is_answered && !q.is_correct;
    if (activeFilter === 'UNANSWERED') return !q.is_answered;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Student Answer Log
              </h2>
              <p className="text-xs text-slate-500">
                Detailed question-by-question responses & evaluation breakdown
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading && (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading answered log...</p>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs">
              {errorMsg}
            </div>
          )}

          {!loading && data && (
            <>
              {/* Student Profile & Score Summary Banner */}
              <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 p-5 rounded-2xl border border-blue-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {data.student.profile_image ? (
                    <img
                      src={data.student.profile_image}
                      alt={data.student.name}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
                      {data.student.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base leading-tight">
                        {data.student.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-mono font-bold">
                        {data.student.reg_no}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                      <span>{data.student.department || 'Department'}</span>
                      <span>•</span>
                      <span>{data.student.batch || 'Batch'}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-800">
                        Section: {data.student.section || '—'}
                      </span>
                    </p>

                    <div className="text-[11px] text-slate-500 flex items-center gap-2 pt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>
                        Status:{' '}
                        <strong className="text-slate-700">{data.submission.status}</strong>
                        {data.submission.submitted_at && ` at ${data.submission.submitted_at}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Pill */}
                <div className="sm:text-right bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Total Score
                  </span>
                  <div className="text-2xl font-black text-slate-900 font-mono">
                    <span className="text-blue-600">{data.submission.score}</span>
                    <span className="text-slate-400 text-base font-normal"> / {data.submission.total_questions}</span>
                  </div>
                  <div className="text-xs font-bold text-emerald-600 mt-0.5">
                    {data.submission.percentage}% Score
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                <button
                  onClick={() => setActiveFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    activeFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <span>All Questions</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
                    {questions.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveFilter('CORRECT')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    activeFilter === 'CORRECT'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Correct</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
                    {correctCount}
                  </span>
                </button>

                <button
                  onClick={() => setActiveFilter('INCORRECT')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    activeFilter === 'INCORRECT'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Incorrect</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
                    {incorrectCount}
                  </span>
                </button>

                <button
                  onClick={() => setActiveFilter('UNANSWERED')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    activeFilter === 'UNANSWERED'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Unanswered</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
                    {unansweredCount}
                  </span>
                </button>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                {filteredQuestions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No questions in this filter.
                  </div>
                ) : (
                  filteredQuestions.map((q) => {
                    const isCorrect = q.is_answered && q.is_correct;
                    const isWrong = q.is_answered && !q.is_correct;
                    const isUnanswered = !q.is_answered;

                    return (
                      <div
                        key={q.id || q.question_number}
                        className={`rounded-2xl p-5 border transition ${
                          isCorrect
                            ? 'bg-emerald-50/30 border-emerald-200'
                            : isWrong
                            ? 'bg-red-50/30 border-red-200'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        {/* Question Title & Result Tag */}
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200/60">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold shadow-xs">
                              Question {q.question_number}
                            </span>
                            {q.co && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold">
                                CO {q.co}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                              {q.marks || 1} M
                            </span>
                          </div>

                          <div>
                            {isCorrect && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Correct (+1)</span>
                              </span>
                            )}
                            {isWrong && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                                <XCircle className="w-3.5 h-3.5 text-red-600" />
                                <span>Incorrect (0)</span>
                              </span>
                            )}
                            {isUnanswered && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>Not Answered</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="text-sm font-semibold text-slate-800 py-3 leading-relaxed">
                          {q.question_text}
                        </div>

                        {/* Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          {[
                            { letter: 'A', text: q.option_a },
                            { letter: 'B', text: q.option_b },
                            { letter: 'C', text: q.option_c },
                            { letter: 'D', text: q.option_d },
                          ].map((opt) => {
                            const isStudentChoice = q.selected_answer === opt.letter;
                            const isCorrectOpt = q.correct_answer === opt.letter;

                            let optStyle = 'bg-white border-slate-200 text-slate-700';
                            let badgeStyle = 'bg-slate-100 text-slate-600';

                            if (isStudentChoice && isCorrectOpt) {
                              optStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500 font-medium';
                              badgeStyle = 'bg-emerald-600 text-white';
                            } else if (isStudentChoice && !isCorrectOpt) {
                              optStyle = 'bg-red-50 border-red-500 text-red-950 ring-1 ring-red-500 font-medium';
                              badgeStyle = 'bg-red-600 text-white';
                            } else if (isCorrectOpt) {
                              optStyle = 'bg-emerald-50/70 border-emerald-300 text-emerald-900 border-dashed';
                              badgeStyle = 'bg-emerald-100 text-emerald-800 font-bold';
                            }

                            return (
                              <div
                                key={opt.letter}
                                className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs transition ${optStyle}`}
                              >
                                <span
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${badgeStyle}`}
                                >
                                  {opt.letter}
                                </span>
                                <span className="flex-1 leading-snug">{opt.text}</span>

                                {isStudentChoice && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white shadow-xs border border-slate-200">
                                    Student Choice
                                  </span>
                                )}
                                {!isStudentChoice && isCorrectOpt && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                    Correct Key
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            Close Answer Log
          </button>
        </div>
      </div>
    </div>
  );
}
