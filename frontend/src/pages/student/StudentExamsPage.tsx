import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Play,
  Award,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  BookOpen,
  Send,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Lock,
  CopyX,
  Shuffle,
  EyeOff,
  Timer,
  ArrowLeft,
  Check,
  HelpCircle,
  Sparkles,
  User,
  RotateCcw,
  UserX,
  XCircle,
  ShieldX
} from 'lucide-react';
import {
  OnlineExam,
  fetchStudentExams,
  fetchStudentExamDetail,
  fetchStudentTakeExam,
  submitStudentExam,
  saveStudentExamDraft,
  kickStudentExam,
  StudentTakeExamResponse
} from '../../services/onlineExam';

export default function StudentExamsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { examId: routeExamId } = useParams<{ examId?: string }>();

  // Determine current sub-view from pathname
  const isInstructionsView = Boolean(location.pathname.endsWith('/instructions') && routeExamId);
  const isTakeView = Boolean(location.pathname.endsWith('/take') && routeExamId);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'PAST'>('ACTIVE');
  const [activeExams, setActiveExams] = useState<OnlineExam[]>([]);
  const [pastExams, setPastExams] = useState<OnlineExam[]>([]);
  const [studentSection, setStudentSection] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Instructions view state
  const [instructionExam, setInstructionExam] = useState<OnlineExam | null>(null);
  const [agreedToRules, setAgreedToRules] = useState<boolean>(false);
  const [instructionLoading, setInstructionLoading] = useState<boolean>(false);

  // Active exam taking state
  const [takingExamData, setTakingExamData] = useState<StudentTakeExamResponse | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [remainingSecs, setRemainingSecs] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<{ score: number; total_questions: number } | null>(null);

  // Malpractices & Proctoring Penalty State
  const [violationsCount, setViolationsCount] = useState<number>(0);
  const [warningModalOpen, setWarningModalOpen] = useState<boolean>(false);
  const [warningReason, setWarningReason] = useState<string>('');
  const [warningSecs, setWarningSecs] = useState<number>(30);
  const [screenshotShieldOpen, setScreenshotShieldOpen] = useState<boolean>(false);

  // Kicked Student State
  const [kickedModalOpen, setKickedModalOpen] = useState<boolean>(false);
  const [kickedReason, setKickedReason] = useState<string>('');
  const [kickedExamTitle, setKickedExamTitle] = useState<string>('');

  // Refs for stable event listener callbacks & anti-cheating tracking
  const warningTimerRef = useRef<any>(null);
  const isExamActiveRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const takingExamIdRef = useRef<number | null>(null);
  const selectedAnswersRef = useRef<Record<string, string>>({});
  const violationsCountRef = useRef<number>(0);
  const maxViolationsRef = useRef<number>(3);
  const cooldownSecsRef = useRef<number>(30);
  const isIOSFullscreenRef = useRef<boolean>(false);

  // Helper to detect iOS (iPhone / iPad / iPod)
  const isIOSDevice = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }, []);

  // Sync refs
  useEffect(() => {
    isExamActiveRef.current = isTakeView && Boolean(takingExamData);
    takingExamIdRef.current = takingExamData ? takingExamData.exam_id : null;
    selectedAnswersRef.current = selectedAnswers;
    violationsCountRef.current = violationsCount;
    maxViolationsRef.current = takingExamData?.max_violations || 3;
    cooldownSecsRef.current = takingExamData?.cooldown_seconds || 30;
  }, [isTakeView, takingExamData, selectedAnswers, violationsCount]);

  // ─────────────────────────────────────────────────────────────
  // FULLSCREEN CONTROLS (WITH IPHONE / IOS SAFARI SUPPORT)
  // ─────────────────────────────────────────────────────────────
  const requestFullscreen = async (): Promise<boolean> => {
    // iPhone Safari does not implement documentElement.requestFullscreen
    // We activate an edge-to-edge iOS viewport lock that simulates full screen
    if (isIOSDevice()) {
      try {
        document.documentElement.classList.add('ios-fullscreen-lock');
        document.body.classList.add('ios-fullscreen-lock');
        window.scrollTo(0, 0);
        isIOSFullscreenRef.current = true;
        return true;
      } catch (err) {
        console.warn('iOS fullscreen setup failed:', err);
      }
    }

    try {
      const elem = document.documentElement as any;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
        return true;
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
        return true;
      } else if (elem.mozRequestFullScreen) {
        await elem.mozRequestFullScreen();
        return true;
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
        return true;
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
    return false;
  };

  const exitFullscreen = async () => {
    if (isIOSDevice()) {
      try {
        document.documentElement.classList.remove('ios-fullscreen-lock');
        document.body.classList.remove('ios-fullscreen-lock');
        isIOSFullscreenRef.current = false;
      } catch (err) {
        console.warn('iOS exit fullscreen error:', err);
      }
    }

    try {
      const doc = document as any;
      if (document.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Exit fullscreen error:', err);
    }
  };

  const isFullscreenActive = (): boolean => {
    if (isIOSDevice()) {
      return isIOSFullscreenRef.current;
    }
    const doc = document as any;
    return Boolean(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );
  };

  // ─────────────────────────────────────────────────────────────
  // KICK STUDENT HANDLER
  // ─────────────────────────────────────────────────────────────
  const handleKickStudent = async (reason: string) => {
    const examId = takingExamIdRef.current;
    if (!examId || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setSubmitting(true);
    setWarningModalOpen(false);

    try {
      await kickStudentExam(
        examId,
        reason,
        selectedAnswersRef.current,
        violationsCountRef.current
      );
      setKickedReason(reason);
      setKickedExamTitle(takingExamData?.title || 'Online Examination');
      setKickedModalOpen(true);
      setTakingExamData(null);
      await exitFullscreen();
    } catch (err: any) {
      console.error('Kick recording error:', err);
      setKickedReason(reason);
      setKickedModalOpen(true);
      setTakingExamData(null);
      await exitFullscreen();
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // MALPRACTICE WARNING TRIGGER & COUNTDOWN
  // ─────────────────────────────────────────────────────────────
  const triggerWarningModal = useCallback(async (reason: string) => {
    if (!isExamActiveRef.current || isSubmittingRef.current) return;

    const examId = takingExamIdRef.current;
    if (!examId) return;

    // Increment violation attempt count
    const nextViolations = violationsCountRef.current + 1;
    violationsCountRef.current = nextViolations;
    setViolationsCount(nextViolations);

    const maxAllowed = maxViolationsRef.current || 3;

    // Check if violation attempts reached max allowed
    if (nextViolations >= maxAllowed) {
      await handleKickStudent(
        `Exceeded maximum allowed attempts (${nextViolations}/${maxAllowed}). Reason: ${reason}`
      );
      return;
    }

    // Otherwise, show warning modal with configured cooldown time
    const cooldown = cooldownSecsRef.current || 30;
    setWarningReason(reason);
    setWarningSecs(cooldown);
    setWarningModalOpen(true);
  }, []);

  const handleContinueExam = async () => {
    // Clear warning countdown
    if (warningTimerRef.current) {
      clearInterval(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    setWarningModalOpen(false);
    setScreenshotShieldOpen(false);
    setWarningSecs(cooldownSecsRef.current || 30);

    // Re-enter fullscreen mode
    await requestFullscreen();
  };

  // Countdown timer for security warning modal: If time expires without continue, kick candidate!
  useEffect(() => {
    if (!warningModalOpen) {
      if (warningTimerRef.current) {
        clearInterval(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      return;
    }

    warningTimerRef.current = setInterval(() => {
      setWarningSecs((prev) => {
        if (prev <= 1) {
          clearInterval(warningTimerRef.current);
          warningTimerRef.current = null;
          // Cooldown time ended and student did not continue: Kick candidate!
          handleKickStudent(
            `Warning cooldown timeout of ${cooldownSecsRef.current || 30}s expired without resuming the examination.`
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (warningTimerRef.current) {
        clearInterval(warningTimerRef.current);
        warningTimerRef.current = null;
      }
    };
  }, [warningModalOpen]);

  // ─────────────────────────────────────────────────────────────
  // ANTI-CHEATING PROCTORING EVENT LISTENERS & SCREENSHOT BLOCKER
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTakeView) return;

    // 1. Fullscreen change listener
    const onFullscreenChange = () => {
      if (!isExamActiveRef.current || isSubmittingRef.current) return;
      if (!isFullscreenActive()) {
        triggerWarningModal('Full-screen mode was exited. Full-screen mode is required throughout the examination.');
      }
    };

    // 2. Visibility change & Window blur listener (Alt+Tab, app switch, minimize, snipping tool)
    const onVisibilityChange = () => {
      if (!isExamActiveRef.current || isSubmittingRef.current) return;
      if (document.visibilityState === 'hidden') {
        triggerWarningModal('Window switch or browser minimization detected (Alt+Tab / tab switch).');
      }
    };

    const onWindowBlur = () => {
      if (!isExamActiveRef.current || isSubmittingRef.current) return;
      // When a user activates Windows Snipping Tool (Win+Shift+S) or Mac screenshot tool,
      // window instantly blurs! Trigger anti-screenshot shield so the screenshot captured is the warning shield!
      setScreenshotShieldOpen(true);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('⚠️ SCREENSHOTS ARE STRICTLY PROHIBITED IN IDCS ONLINE EXAMINATION ⚠️');
        }
      } catch {}
      triggerWarningModal('Window focus lost. Navigation away or snipping tool is prohibited.');
    };

    // 3. Block copy, cut, paste, context menu, text selection
    const blockEvent = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // 4. Block dangerous shortcut keys & Anti-Screenshot trigger
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isExamActiveRef.current) return;

      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code ? e.code.toLowerCase() : '';

      // Check screenshot triggers: PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5
      const isPrtScn = key === 'printscreen' || code === 'printscreen' || e.keyCode === 44;
      const isWinSnipping = (e.metaKey || e.ctrlKey) && e.shiftKey && ['s', '3', '4', '5'].includes(key);
      const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5', '$'].includes(key);

      if (isPrtScn || isWinSnipping || isMacScreenshot) {
        e.preventDefault();
        e.stopPropagation();
        setScreenshotShieldOpen(true);
        // Overwrite clipboard immediately
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('⚠️ SCREENSHOTS ARE STRICTLY PROHIBITED IN IDCS ONLINE EXAMINATION ⚠️');
          }
        } catch {}
        triggerWarningModal('Screenshot attempt detected! Screenshots are strictly prohibited during examination.');
        return;
      }

      // Block Ctrl/Cmd + shortcuts: C, V, X, A, U, P, R, S, W, T, N
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'u', 'p', 'r', 's', 'w', 't', 'n'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Block function keys F5 (reload), F11 (browser fullscreen toggle), F12 (devtools)
      if (['f5', 'f11', 'f12'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Block Alt shortcuts (Alt+Arrow, Alt+Tab if trapped)
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isExamActiveRef.current) return;
      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code ? e.code.toLowerCase() : '';
      if (key === 'printscreen' || code === 'printscreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        setScreenshotShieldOpen(true);
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('⚠️ SCREENSHOTS ARE STRICTLY PROHIBITED IN IDCS ONLINE EXAMINATION ⚠️');
          }
        } catch {}
      }
    };

    // 5. Prevent accidental tab close or page reload
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExamActiveRef.current && !isSubmittingRef.current) {
        e.preventDefault();
        e.returnValue = 'You have an examination in progress. Leaving will forfeit your exam.';
      }
    };

    // Attach listeners
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);

    document.addEventListener('copy', blockEvent);
    document.addEventListener('cut', blockEvent);
    document.addEventListener('paste', blockEvent);
    document.addEventListener('contextmenu', blockEvent);
    document.addEventListener('selectstart', blockEvent);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('mozfullscreenchange', onFullscreenChange);
      document.removeEventListener('MSFullscreenChange', onFullscreenChange);

      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);

      document.removeEventListener('copy', blockEvent);
      document.removeEventListener('cut', blockEvent);
      document.removeEventListener('paste', blockEvent);
      document.removeEventListener('contextmenu', blockEvent);
      document.removeEventListener('selectstart', blockEvent);

      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isTakeView, triggerWarningModal]);

  // ─────────────────────────────────────────────────────────────
  // LOAD EXAMS LIST WITH LIVE AUTO-REFRESH
  // ─────────────────────────────────────────────────────────────
  const loadExams = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchStudentExams();
      setActiveExams(res.active || []);
      setPastExams(res.past || []);
      setStudentSection(res.student_section || '');
    } catch (err: any) {
      if (!isBackground) setErrorMsg(err.message || 'Failed to load exams.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  // Initial load + 3.5s auto-refresh polling on dashboard so student sees live admin starts
  useEffect(() => {
    if (isInstructionsView || isTakeView) return;
    loadExams(false);
    const interval = setInterval(() => {
      loadExams(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [isInstructionsView, isTakeView]);

  // ─────────────────────────────────────────────────────────────
  // LOAD INSTRUCTIONS VIEW
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInstructionsView || !routeExamId) return;

    let mounted = true;
    const fetchExamInfo = async () => {
      setInstructionLoading(true);
      setErrorMsg('');
      try {
        const idNum = parseInt(routeExamId, 10);
        const existing = activeExams.find((e) => e.id === idNum);
        if (existing) {
          if (mounted) setInstructionExam(existing);
        } else {
          const detail = await fetchStudentExamDetail(idNum);
          if (mounted) setInstructionExam(detail);
        }
      } catch (err: any) {
        if (mounted) setErrorMsg(err.message || 'Failed to load exam details.');
      } finally {
        if (mounted) setInstructionLoading(false);
      }
    };

    fetchExamInfo();
    return () => {
      mounted = false;
    };
  }, [isInstructionsView, routeExamId, activeExams]);

  // ─────────────────────────────────────────────────────────────
  // LOAD EXAM QUESTIONS (FOR TAKE VIEW)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTakeView || !routeExamId) return;

    let mounted = true;
    const initExamTake = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const idNum = parseInt(routeExamId, 10);
        const data = await fetchStudentTakeExam(idNum);
        if (!mounted) return;

        setTakingExamData(data);
        setCurrentQIndex(0);
        setSelectedAnswers(data.saved_answers || {});
        setRemainingSecs(data.remaining_seconds || data.duration_minutes * 60);
        setViolationsCount(0);

        // Ensure fullscreen is active
        if (!isFullscreenActive()) {
          await requestFullscreen();
        }
      } catch (err: any) {
        if (mounted) {
          exitFullscreen();
          const errData = err.data || {};
          const isKicked = Boolean(errData.is_kicked || err.message?.toLowerCase().includes('kicked'));
          if (isKicked) {
            setKickedReason(errData.kicked_reason || err.message || 'Proctoring violations exceeded or removed by administrator.');
            setKickedExamTitle('Online Examination');
            setKickedModalOpen(true);
            setErrorMsg('');
          } else {
            setErrorMsg(err.message || 'Failed to load exam questions.');
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initExamTake();
    return () => {
      mounted = false;
    };
  }, [isTakeView, routeExamId]);

  // ─────────────────────────────────────────────────────────────
  // LIVE ADMIN END DETECTION & REMOTE KICK VIA PERIODIC HEARTBEAT
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTakeView || !takingExamData?.exam_id) return;
    const examId = takingExamData.exam_id;

    const pollStatus = setInterval(async () => {
      try {
        const res = await saveStudentExamDraft(examId, selectedAnswersRef.current);
        if (res.is_kicked) {
          clearInterval(pollStatus);
          setKickedReason(res.kicked_reason || 'Disqualified by proctor.');
          setKickedExamTitle(takingExamData?.title || 'Online Examination');
          setKickedModalOpen(true);
          exitFullscreen();
          return;
        }
        if (res.exam_status === 'ENDED' || res.exam_status === 'PUBLISHED') {
          clearInterval(pollStatus);
          handleAutoSubmit('The examination has been ended by administrator.');
        }
      } catch {
        // ignore draft save error in background
      }
    }, 4000);

    return () => clearInterval(pollStatus);
  }, [isTakeView, takingExamData?.exam_id]);

  // ─────────────────────────────────────────────────────────────
  // EXAM DURATION TIMER
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!takingExamData || remainingSecs <= 0) return;

    const timer = setInterval(() => {
      setRemainingSecs((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit('Exam duration time has expired.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [takingExamData, remainingSecs]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ─────────────────────────────────────────────────────────────
  // START EXAM HANDLERS
  // ─────────────────────────────────────────────────────────────
  const handleGoToInstructions = (examId: number) => {
    navigate(`/student/exams/${examId}/instructions`);
  };

  const handleLaunchExamFromInstructions = async () => {
    if (!agreedToRules || !instructionExam) return;
    await requestFullscreen();
    navigate(`/student/exams/${instructionExam.id}/take`);
  };

  const handleSelectOption = (question: any, optionLetter: string) => {
    const qKey = String(question.id);
    setSelectedAnswers((prev) => {
      const next = {
        ...prev,
        [qKey]: optionLetter,
      };
      selectedAnswersRef.current = next;

      // Automatically sync draft in background
      if (takingExamData?.exam_id) {
        saveStudentExamDraft(takingExamData.exam_id, next)
          .then((res) => {
            if (res.exam_status === 'ENDED') {
              handleAutoSubmit('The examination has been ended by administrator.');
            }
          })
          .catch(() => {});
      }

      return next;
    });
  };

  const handleClearOption = (question: any) => {
    const qKey = String(question.id);
    setSelectedAnswers((prev) => {
      const next = { ...prev };
      delete next[qKey];
      delete next[String(question.question_number)];
      selectedAnswersRef.current = next;

      if (takingExamData?.exam_id) {
        saveStudentExamDraft(takingExamData.exam_id, next).catch(() => {});
      }

      return next;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // SUBMISSION HANDLERS
  // ─────────────────────────────────────────────────────────────
  const handleAutoSubmit = async (reason?: string) => {
    const examId = takingExamIdRef.current;
    if (!examId || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setSubmitting(true);
    setWarningModalOpen(false);

    try {
      const res = await submitStudentExam(examId, selectedAnswersRef.current);
      setSubmitResult(res as any);
      setTakingExamData(null);
      await exitFullscreen();
      navigate('/student/exams');
      await loadExams();
      setActiveTab('PAST');
    } catch (err: any) {
      setErrorMsg('Auto-submission: ' + (err.message || 'Exam closed. Please contact administrator.'));
      await exitFullscreen();
      navigate('/student/exams');
      await loadExams();
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const handleManualSubmit = async () => {
    const examId = takingExamIdRef.current;
    if (!examId || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await submitStudentExam(examId, selectedAnswersRef.current);
      setSubmitResult(res as any);
      setShowSubmitConfirm(false);
      setTakingExamData(null);
      await exitFullscreen();
      navigate('/student/exams');
      await loadExams();
      setActiveTab('PAST');
    } catch (err: any) {
      setErrorMsg('Submission error: ' + (err.message || 'Please check your connection and retry.'));
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW 1: INSTRUCTIONS PAGE (`/student/exams/:examId/instructions`)
  // ─────────────────────────────────────────────────────────────
  if (isInstructionsView) {
    if (instructionLoading) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-600 font-medium">Loading examination instructions...</p>
          </div>
        </div>
      );
    }

    if (!instructionExam) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-md">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900">Exam Not Found or Inactive</h2>
            <p className="text-xs text-slate-500">
              {errorMsg || 'Could not load examination details or you are not authorized.'}
            </p>
            <button
              onClick={() => navigate('/student/exams')}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              Back to My Exams
            </button>
          </div>
        </div>
      );
    }

    const isRunning = instructionExam.status === 'RUNNING';
    const isRetest = Boolean(instructionExam.is_retest || instructionExam.submission?.is_retest_allowed);
    const cooldownSecs = instructionExam.cooldown_seconds || 30;
    const maxViolations = instructionExam.max_violations || 3;

    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans select-none relative">
        {/* Top Header */}
        <header className="px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/student/exams')}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Examination Hall • Instructions
              </span>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                {instructionExam.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRetest && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-black">
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>RE-TEST</span>
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
              {instructionExam.course_code}
            </span>
            {isRunning ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>EXAM IS LIVE</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-700 text-xs font-bold">
                Scheduled
              </span>
            )}
          </div>
        </header>

        {/* Instructions Body - Fills full width naturally and has bottom padding to prevent overlap with PINNED footer */}
        <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-36 sm:pb-32">
          {/* Overview Hero Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Course Examination
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                  {instructionExam.course_name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Title: <strong className="text-slate-800">{instructionExam.title}</strong>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-center min-w-[90px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Duration</span>
                  <span className="text-base font-extrabold text-blue-700 font-mono">
                    {instructionExam.duration_minutes} Mins
                  </span>
                </div>
                <div className="px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-center min-w-[90px]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Questions</span>
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    {instructionExam.questions_count} Qs
                  </span>
                </div>
              </div>
            </div>

            {/* Warning Highlights Notice */}
            <div className="mt-6 flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 text-xs leading-relaxed">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
              <div>
                <strong className="text-rose-950 block font-bold text-sm mb-0.5">
                  Strict Proctored Online Examination Environment (Malpractice Policy)
                </strong>
                Please read each rule carefully. By clicking "Start Exam", you will enter full-screen mode.
                Exiting full-screen or switching windows will trigger a <strong>{cooldownSecs}-second cooldown warning</strong>.
                If you commit <strong>{maxViolations} malpractice attempts</strong>, or fail to resume within {cooldownSecs} seconds, you will be <strong>permanently kicked and disqualified</strong>.
              </div>
            </div>
          </div>

          {/* Mandatory Instructions & Anti-Cheating Protocol */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span>Mandatory Anti-Cheating Rules & Proctoring Guidelines</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rule 1: Fullscreen */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <Maximize2 className="w-4 h-4 text-emerald-600" />
                  <span>1. Full Screen Mode Mandatory</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The test runs strictly in full-screen mode. Do not attempt to minimize the screen or exit full screen until you submit your paper.
                </p>
              </div>

              {/* Rule 2: No Window Minimizing / Alt+Tab */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                  <EyeOff className="w-4 h-4 text-amber-600" />
                  <span>2. No Window Minimizing / Alt+Tab</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Do not switch tabs, minimize the browser, or switch applications (<kbd className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-[10px] text-amber-900">Alt+Tab</kbd>). Window focus loss is monitored in real time.
                </p>
              </div>

              {/* Rule 3: No Navigation */}
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span>3. No Navigation or Page Refresh</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Do not click browser back/forward buttons, open new tabs, or press <kbd className="px-1.5 py-0.5 rounded bg-blue-100 font-mono text-[10px] text-blue-900">F5</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-blue-100 font-mono text-[10px] text-blue-900">Ctrl+R</kbd>.
                </p>
              </div>

              {/* Rule 4: No Copy / Paste */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-800">
                  <CopyX className="w-4 h-4 text-indigo-600" />
                  <span>4. Copy & Paste Disabled</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Text copying, cutting, pasting, selection, and right-click context menus are completely blocked. Keyboard shortcuts like <kbd className="px-1.5 py-0.5 rounded bg-indigo-100 font-mono text-[10px] text-indigo-900">Ctrl+C</kbd> and <kbd className="px-1.5 py-0.5 rounded bg-indigo-100 font-mono text-[10px] text-indigo-900">Ctrl+V</kbd> are disabled.
                </p>
              </div>

              {/* Rule 5: Malpractices & Kicked Rule */}
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-2 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-800">
                  <Timer className="w-4 h-4 text-rose-600 animate-pulse" />
                  <span>5. Malpractice Policy: {cooldownSecs}s Cooldown & Max {maxViolations} Attempts</span>
                </div>
                <p className="text-xs text-rose-950 leading-relaxed">
                  If you exit full screen or lose window focus, a <strong>{cooldownSecs}-second cooldown timer</strong> will begin. You must click <strong>"Continue Exam"</strong> before the timer reaches 0. If the timer expires OR you trigger <strong>{maxViolations} violations</strong>, you will be <strong>kicked immediately from the examination</strong>, marked in red in past exams as Kicked, and disqualified unless granted a Re-Test by administration.
                </p>
              </div>

              {/* Rule 6: Question & Option Shuffling */}
              <div className="p-4 rounded-2xl bg-cyan-50/60 border border-cyan-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-cyan-800">
                  <Shuffle className="w-4 h-4 text-cyan-600" />
                  <span>6. Randomized Question & Option Shuffling</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Both questions and all answer choices (A, B, C, D) are uniquely and randomly shuffled for each candidate.
                </p>
              </div>

              {/* Rule 7: Auto Submit */}
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-purple-800">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span>7. Automatic Submission on Timeout</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When the test duration timer reaches 00:00 or admin ends the exam, your paper will auto-submit.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pinned Bottom Action Bar (Cancel & Return + Start Exam + Checkbox) - TRULY FIXED AND PINNED */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-6 shadow-2xl">
          <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToRules}
                onChange={(e) => setAgreedToRules(e.target.checked)}
                className="w-5 h-5 rounded-lg text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs sm:text-sm font-semibold text-slate-800">
                I understand and agree to strictly adhere to all proctoring guidelines and the {maxViolations}-attempts malpractice rule.
              </span>
            </label>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => navigate('/student/exams')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs sm:text-sm font-bold transition shadow-xs"
              >
                Cancel & Return
              </button>

              {isRunning ? (
                <button
                  type="button"
                  onClick={handleLaunchExamFromInstructions}
                  disabled={!agreedToRules}
                  className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed group"
                >
                  <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                  <span>{isRetest ? 'Start Re-Test' : 'Start Exam'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-slate-200 text-slate-400 text-xs sm:text-sm font-bold cursor-not-allowed"
                >
                  Exam Scheduled
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW 2: ACTIVE EXAM TAKING VIEW (`/student/exams/:examId/take`)
  // ─────────────────────────────────────────────────────────────
  if (isTakeView) {
    // 1. Kicked candidate screen (if student was disqualified by proctor or admin)
    if (kickedModalOpen) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6 select-none">
          <div className="bg-white border-2 border-rose-600 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-slate-900 space-y-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto animate-bounce">
              <UserX className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <span className="px-3.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black uppercase tracking-widest border border-rose-200">
                Candidate Kicked & Disqualified
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                Examination Terminated
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                You have been removed from <strong>{kickedExamTitle || 'this examination'}</strong> due to proctoring policy or administrator action.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-rose-800 tracking-wider block">
                Disqualification Reason
              </span>
              <p className="text-xs text-rose-950 font-medium">
                {kickedReason || 'Proctoring violations exceeded or removed by administrator.'}
              </p>
              <div className="text-[11px] text-rose-700 font-semibold pt-1">
                Recorded Violations: {violationsCount}
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Your paper status is now marked as <strong>Kicked</strong>. If you believe this occurred due to a genuine system issue, contact your examination administration to request a Re-Test.
            </p>

            <div>
              <button
                type="button"
                onClick={() => {
                  setKickedModalOpen(false);
                  exitFullscreen();
                  navigate('/student/exams');
                  loadExams();
                  setActiveTab('PAST');
                }}
                className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to My Online Exams</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 2. Error loading exam screen (e.g. not eligible, already submitted, not running, network issue)
    if (errorMsg && !takingExamData) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6 select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-black text-white">
                Unable to Access Examination
              </h3>
              <p className="text-sm text-slate-400">
                {errorMsg}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setLoading(true);
                  if (routeExamId) {
                    const idNum = parseInt(routeExamId, 10);
                    fetchStudentTakeExam(idNum).then((data) => {
                      setTakingExamData(data);
                      setLoading(false);
                    }).catch((err) => {
                      const errData = err.data || {};
                      if (errData.is_kicked || err.message?.toLowerCase().includes('kicked')) {
                        setKickedReason(errData.kicked_reason || err.message);
                        setKickedExamTitle('Online Examination');
                        setKickedModalOpen(true);
                      } else {
                        setErrorMsg(err.message || 'Failed to load exam questions');
                      }
                      setLoading(false);
                    });
                  }
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  exitFullscreen();
                  navigate('/student/exams');
                  loadExams();
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Exams Hub</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 3. Loading state with Return button
    if (loading || !takingExamData) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 select-none">
          <div className="text-center space-y-5 max-w-sm">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-1">
              <h2 className="text-base font-bold">Securing Exam Environment & Loading Questions...</h2>
              <p className="text-xs text-slate-400">Please do not navigate away or refresh the page.</p>
            </div>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => {
                  exitFullscreen();
                  navigate('/student/exams');
                  loadExams();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Exams Hub</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    const questions = takingExamData.questions || [];
    const currentQ = questions[currentQIndex];
    const answeredCount = questions.filter((q) => Boolean(selectedAnswers[String(q.id)])).length;

    const studentName = takingExamData.student?.name || 'Student';
    const studentRegNo = takingExamData.student?.reg_no || '';
    const studentPhoto = takingExamData.student?.profile_image;
    const studentDept = takingExamData.student?.department || '';
    const studentSec = takingExamData.student?.section || '';
    const cooldownSecs = takingExamData.cooldown_seconds || 30;
    const maxViolations = takingExamData.max_violations || 3;

    return (
      <div className="min-h-screen bg-slate-100/60 text-slate-900 flex flex-col font-sans select-none relative overflow-x-hidden no-copy-paste-select">
        {/* JEE-Style Slanted Register Number & Name Watermark Overlay - In Front of All Elements */}
        <div
          className="fixed -inset-[20%] pointer-events-none select-none z-[9999] overflow-hidden flex flex-wrap gap-x-24 gap-y-20 justify-center items-center opacity-[0.09] -rotate-[24deg] scale-125"
          aria-hidden="true"
        >
          {Array.from({ length: 96 }).map((_, i) => (
            <div
              key={i}
              className="text-xs sm:text-sm font-black font-mono tracking-widest text-slate-900 whitespace-nowrap uppercase select-none"
            >
              {studentName} • {studentRegNo}
            </div>
          ))}
        </div>

        {/* Top Header Bar with Student Identity (Photo, Name, Reg No) */}
        <header className="px-4 sm:px-8 py-2.5 sm:py-3 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center font-bold flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xs sm:text-base text-slate-900 leading-tight truncate">
                  {takingExamData.title}
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-bold flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Proctored Full Screen</span>
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                {takingExamData.course_code} • {takingExamData.course_name}
              </p>
            </div>
          </div>

          {/* Student Profile Card (Top Right) */}
          <div className="flex items-center gap-2 sm:gap-3.5 bg-slate-50/80 px-2.5 sm:px-3.5 py-1.5 rounded-2xl border border-slate-200/80">
            <div className="text-right">
              <div className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate max-w-[130px] sm:max-w-[180px]">
                {studentName}
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="font-mono text-[10px] sm:text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">
                  {studentRegNo}
                </span>
                {(studentDept || studentSec) && (
                  <span className="hidden sm:inline text-[10px] text-slate-500 font-semibold">
                    {studentDept} {studentSec ? `(${studentSec})` : ''}
                  </span>
                )}
              </div>
            </div>

            {studentPhoto ? (
              <img
                src={studentPhoto}
                alt={studentName}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-cover border-2 border-white shadow-xs"
              />
            ) : (
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs">
                {studentName ? studentName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
            )}
          </div>
        </header>

        {/* Mobile View Question Palette & Control Bar - Auto Adjusted & Does Not Force Vertical Page Scroll */}
        <div className="lg:hidden bg-white border-b border-slate-200 p-2.5 space-y-2 flex-shrink-0 z-20 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div
              className={`px-3 py-1 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 ${
                remainingSecs < 300
                  ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTimer(remainingSecs)}</span>
            </div>

            <div className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700">
              <span>{answeredCount} / {questions.length} Ans</span>
            </div>

            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1 shadow-xs"
            >
              <Send className="w-3 h-3" />
              <span>Submit</span>
            </button>
          </div>

          {/* Auto-Adjustable Horizontal Question Palette Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {questions.map((q, idx) => {
              const isAnswered = Boolean(selectedAnswers[String(q.id)]);
              const isCurrent = idx === currentQIndex;
              return (
                <button
                  key={q.id || q.question_number}
                  onClick={() => setCurrentQIndex(idx)}
                  className={`w-7 h-7 flex-shrink-0 rounded-lg text-xs font-bold flex items-center justify-center transition ${
                    isCurrent
                      ? 'bg-blue-600 text-white ring-2 ring-blue-600 shadow-xs font-extrabold'
                      : isAnswered
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 border border-slate-200 text-slate-700'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Examination Layout: Left Sidebar (Desktop) + Right Questions Area */}
        <div className="flex-1 flex flex-col lg:flex-row relative z-10 min-h-0">
          {/* Desktop Left Sidebar */}
          <aside className="hidden lg:flex w-80 xl:w-92 bg-white border-r border-slate-200 p-5 flex-col justify-between overflow-y-auto space-y-6 shadow-xs flex-shrink-0">
            <div className="space-y-5">
              {/* Duration / Countdown Timer Card */}
              <div
                className={`p-4 rounded-2xl border transition ${
                  remainingSecs < 300
                    ? 'bg-red-50 border-red-300 text-red-900 animate-pulse'
                    : 'bg-gradient-to-br from-blue-50 to-indigo-50/50 border-blue-200/80 text-blue-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Time Remaining</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border border-slate-200">
                    {takingExamData.duration_minutes} Mins Total
                  </span>
                </div>
                <div className="mt-2 text-3xl font-black font-mono tracking-tight">
                  {formatTimer(remainingSecs)}
                </div>
              </div>

              {/* Attended / Progress Status */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">Attended / Answered:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    {answeredCount} / {questions.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Unanswered:</span>
                  <span className="font-semibold text-slate-700">{questions.length - answeredCount}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mt-1">
                  <div
                    className="bg-emerald-500 h-2 transition-all duration-300 rounded-full"
                    style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }}
                  />
                </div>
              </div>

              {/* Proctoring Policy Reminder */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span>Malpractice Safeguard Active</span>
                </div>
                <div>Attempts: <strong>{violationsCount} / {maxViolations} Max</strong></div>
                <div>Cooldown Warning: <strong>{cooldownSecs} Seconds</strong></div>
              </div>

              {/* Overall Question Palette */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Question Palette
                  </h3>
                  <span className="text-xs font-bold text-slate-700">
                    {questions.length} Questions
                  </span>
                </div>

                {/* Status legends */}
                <div className="flex items-center gap-3 text-[11px] text-slate-600 mb-3 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-emerald-600" />
                    <span>Answered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-slate-100 border border-slate-300" />
                    <span>Unanswered</span>
                  </div>
                </div>

                {/* Grid of question buttons */}
                <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
                  {questions.map((q, idx) => {
                    const isAnswered = Boolean(selectedAnswers[String(q.id)]);
                    const isCurrent = idx === currentQIndex;

                    return (
                      <button
                        key={q.id || q.question_number}
                        onClick={() => setCurrentQIndex(idx)}
                        className={`h-9 rounded-xl text-xs font-bold transition flex items-center justify-center ${
                          isCurrent
                            ? 'ring-2 ring-blue-600 bg-blue-600 text-white shadow-sm font-extrabold'
                            : isAnswered
                            ? 'bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-2xs'
                            : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pinned Submit Exam Button at Bottom of Left Sidebar */}
            <div className="pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowSubmitConfirm(true)}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Exam</span>
              </button>
            </div>
          </aside>

          {/* Right Page: Question Content & Options - Flexible on Mobile */}
          <main className="flex-1 min-w-0 p-2.5 sm:p-6 lg:p-8 flex flex-col justify-between overflow-y-auto">
            {currentQ ? (
              <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-8 shadow-xs flex-1 flex flex-col justify-between space-y-5 sm:space-y-6">
                <div className="space-y-4 sm:space-y-6">
                  {/* Question header with CO & Marks badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 sm:pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-xl bg-blue-600 text-white text-xs font-extrabold shadow-2xs">
                        Question {currentQIndex + 1} of {questions.length}
                      </span>
                      {currentQ.co && (
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
                          CO {currentQ.co}
                        </span>
                      )}
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                        {currentQ.marks || 1} {(currentQ.marks || 1) === 1 ? 'Mark' : 'Marks'}
                      </span>
                    </div>

                    {selectedAnswers[String(currentQ.id)] && (
                      <button
                        onClick={() => handleClearOption(currentQ)}
                        className="text-xs text-slate-500 hover:text-red-600 font-semibold flex items-center gap-1 px-2.5 py-1 rounded-xl hover:bg-red-50 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear Selection</span>
                      </button>
                    )}
                  </div>

                  {/* Question Prompt */}
                  <div className="text-sm sm:text-lg font-bold text-slate-900 leading-relaxed">
                    {currentQ.question_text}
                  </div>

                  {/* Options List */}
                  <div className="space-y-2.5 sm:space-y-3 pt-1">
                    {[
                      { letter: 'A', text: currentQ.option_a },
                      { letter: 'B', text: currentQ.option_b },
                      { letter: 'C', text: currentQ.option_c },
                      { letter: 'D', text: currentQ.option_d },
                    ].map((opt) => {
                      const isSelected = selectedAnswers[String(currentQ.id)] === opt.letter;

                      return (
                        <div
                          key={opt.letter}
                          onClick={() => handleSelectOption(currentQ, opt.letter)}
                          className={`p-3 sm:p-4 rounded-2xl border-2 cursor-pointer transition flex items-center gap-3 ${
                            isSelected
                              ? 'bg-blue-50/90 border-blue-600 text-blue-950 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 text-slate-700'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 transition ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 border border-slate-200 text-slate-700'
                            }`}
                          >
                            {opt.letter}
                          </div>
                          <div className="text-xs sm:text-sm flex-1 leading-snug font-medium">{opt.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 sm:pt-6 border-t border-slate-100 mt-4 sm:mt-6">
                  <button
                    onClick={() => setCurrentQIndex((i) => Math.max(0, i - 1))}
                    disabled={currentQIndex === 0}
                    className="px-4 sm:px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>

                  {currentQIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setCurrentQIndex((i) => Math.min(questions.length - 1, i + 1))}
                      className="px-5 sm:px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowSubmitConfirm(true)}
                      className="px-5 sm:px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                    >
                      Review & Submit
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </main>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* ANTI-SCREENSHOT SECURITY SHIELD OVERLAY (FOR BROWSER CAPTURE) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {screenshotShieldOpen && (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-fadeIn select-none">
            <div className="bg-gradient-to-b from-rose-950 via-slate-900 to-black border-2 border-rose-500 rounded-3xl max-w-xl w-full p-6 sm:p-8 text-white space-y-6 shadow-2xl text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />
              
              {/* Official Proctoring Shield Logo */}
              <div className="w-20 h-20 rounded-3xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20 animate-bounce">
                <ShieldAlert className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <span className="px-3.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-black uppercase tracking-widest border border-rose-500/40 inline-flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Anti-Screenshot Protection Active</span>
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Screenshots Strictly Prohibited
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Screen captures, snipping tools, and window clipping are strictly disallowed during examination. This violation has been captured and logged in your examination proctoring audit.
                </p>
              </div>

              {/* Damning Proctoring Watermark Badge (The Image Captured in Screenshots) */}
              <div className="p-4 rounded-2xl bg-black/60 border border-rose-500/30 text-left font-mono space-y-2">
                <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
                  <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Examination Audit Log</span>
                  <span className="text-[10px] text-slate-400">{new Date().toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">CANDIDATE</span>
                    <span className="text-white font-bold">{studentName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">REGISTER NO</span>
                    <span className="text-amber-300 font-bold">{studentRegNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">COURSE</span>
                    <span className="text-slate-200">{takingExamData.course_code}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">EVENT</span>
                    <span className="text-rose-400 font-bold">SCREENSHOT / SNIP</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div>
                <button
                  type="button"
                  onClick={async () => {
                    setScreenshotShieldOpen(false);
                    await handleContinueExam();
                  }}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-2"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Acknowledge & Resume Examination</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* COOLDOWN PENALTY WARNING MODAL */}
        {/* ───────────────────────────────────────────────────────────── */}
        {warningModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-white border-2 border-red-500 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-slate-900 space-y-6 shadow-2xl text-center">
              {/* Warning Icon Badge */}
              <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto animate-pulse">
                <AlertTriangle className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 text-[11px] font-extrabold uppercase tracking-widest border border-red-200">
                  Security Warning • Attempt {violationsCount} of {maxViolations}
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Examination Paused
                </h3>
                <p className="text-xs sm:text-sm text-slate-600">
                  {warningReason || 'You have exited full-screen mode or switched windows (Alt+Tab / minimizing).'}
                </p>
              </div>

              {/* Countdown Display */}
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-red-800 tracking-wider block">
                  Cooldown Time Remaining to Resume
                </span>
                <div className="text-4xl sm:text-5xl font-black font-mono text-red-600 animate-pulse">
                  00:{String(warningSecs).padStart(2, '0')}
                </div>
                <p className="text-[11px] text-red-800">
                  Click <strong>"Continue Exam"</strong> before the timer expires. If the timer hits 0 or you reach {maxViolations} attempts, you will be <strong>kicked and disqualified</strong>.
                </p>
              </div>

              {/* Continue Exam Button */}
              <div>
                <button
                  type="button"
                  onClick={handleContinueExam}
                  className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm shadow-md shadow-red-500/20 transition flex items-center justify-center gap-2 group"
                >
                  <Maximize2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Continue Exam (Re-enter Full Screen)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* KICKED CANDIDATE DISQUALIFICATION MODAL */}
        {/* ───────────────────────────────────────────────────────────── */}
        {kickedModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-white border-2 border-rose-600 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-slate-900 space-y-6 shadow-2xl text-center">
              <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto animate-bounce">
                <UserX className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="px-3.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black uppercase tracking-widest border border-rose-200">
                  Candidate Kicked & Disqualified
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Examination Terminated
                </h3>
                <p className="text-xs sm:text-sm text-slate-600">
                  You have been removed from <strong>{kickedExamTitle}</strong> due to proctoring policy and security violations.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-rose-800 tracking-wider block">
                  Disqualification Reason
                </span>
                <p className="text-xs text-rose-950 font-medium">
                  {kickedReason || 'Exceeded maximum malpractice attempts or cooldown timer expired without resuming.'}
                </p>
                <div className="text-[11px] text-rose-700 font-semibold pt-1">
                  Recorded Violations: {violationsCount}
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Your paper status is now marked as <strong>Kicked</strong>. If you believe this occurred due to a genuine system issue, contact your examination administration to request a Re-Test.
              </p>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setKickedModalOpen(false);
                    navigate('/student/exams');
                    loadExams();
                    setActiveTab('PAST');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to My Online Exams</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SUBMIT CONFIRMATION MODAL */}
        {/* ───────────────────────────────────────────────────────────── */}
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 text-slate-900 space-y-5 shadow-2xl">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Submit Examination?</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have answered <strong className="text-emerald-600 font-bold">{answeredCount}</strong> out of{' '}
                <strong>{questions.length}</strong> questions.
                {answeredCount < questions.length && (
                  <span className="text-amber-700 block mt-2 font-semibold">
                    Warning: You have {questions.length - answeredCount} unanswered questions!
                  </span>
                )}
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Continue Test
                </button>
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={submitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  {submitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>Confirm & Submit</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW 3: MAIN STUDENT EXAMS DASHBOARD (`/student/exams`)
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50/70 p-4 sm:p-6 lg:p-8 space-y-8 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Student Portal • Examination System</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Online Exams
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Assigned Section: <strong className="text-slate-800">{studentSection || 'Active Section'}</strong>
          </p>
        </div>

        <button
          onClick={() => loadExams(false)}
          disabled={loading}
          className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 shadow-sm transition self-start sm:self-auto disabled:opacity-50"
          title="Refresh exams"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Submission Success Banner */}
      {submitResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between gap-3 text-sm animate-fadeIn shadow-xs">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <div className="font-bold">Exam Submitted Successfully!</div>
              <div className="text-xs text-emerald-700">
                Your responses have been recorded. Examination scores and results will be available once published by the administration.
              </div>
            </div>
          </div>
          <button
            onClick={() => setSubmitResult(null)}
            className="text-emerald-700 hover:text-emerald-950 font-semibold text-xs px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Top Tabs: Available/Upcoming Exams vs Past Exams */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
            activeTab === 'ACTIVE'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Available & Upcoming Exams</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {activeExams.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PAST')}
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
            activeTab === 'PAST'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Past Exams & Results</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'PAST' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {pastExams.length}
          </span>
        </button>
      </div>

      {/* Tab Content: Available & Upcoming Exams */}
      {activeTab === 'ACTIVE' && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-medium">Checking available exams for your section...</p>
            </div>
          ) : activeExams.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Upcoming Exams Right Now</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                There are currently no active or scheduled exams created for your section ({studentSection || 'N/A'}).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeExams.map((ex) => {
                const isLive = ex.status === 'RUNNING';
                const isRetest = Boolean(ex.is_retest || ex.submission?.is_retest_allowed);

                return (
                  <div
                    key={ex.id}
                    className={`bg-white rounded-3xl p-6 border transition flex flex-col justify-between shadow-sm hover:shadow-md ${
                      isRetest
                        ? 'border-amber-300 ring-2 ring-amber-500/20 bg-amber-50/20'
                        : isLive
                        ? 'border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
                            {ex.course_code}
                          </span>
                          {isRetest && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-black text-[10px] border border-amber-300">
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>RE-TEST</span>
                            </span>
                          )}
                        </div>

                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>LIVE NOW</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                            Scheduled
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">{ex.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{ex.course_name}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Exam Date</span>
                          <strong className="text-slate-800">{ex.exam_date}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Duration</span>
                          <strong className="text-slate-800">{ex.duration_minutes} Mins</strong>
                        </div>
                      </div>

                      {ex.start_mode === 'AUTO' && ex.auto_start_time && (
                        <div className="text-[11px] text-blue-600 bg-blue-50/80 px-3 py-1.5 rounded-xl border border-blue-100 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Auto-starts at <strong>{ex.auto_start_time}</strong></span>
                        </div>
                      )}
                    </div>

                    <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">
                        {ex.questions_count} Questions
                      </span>

                      {isLive ? (
                        <button
                          onClick={() => handleGoToInstructions(ex.id)}
                          className={`px-6 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 group ${
                            isRetest
                              ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20'
                              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform" />
                          <span>{isRetest ? 'Start Re-Test' : 'Start Exam'}</span>
                        </button>
                      ) : (
                        <span className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold italic">
                          Starts when scheduled
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Past Exams */}
      {activeTab === 'PAST' && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-medium">Loading past exam history...</p>
            </div>
          ) : pastExams.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300">
              <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Past Exams</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                You haven't completed any online examinations yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pastExams.map((ex) => {
                const sub = ex.submission;
                const isKicked = sub?.status === 'KICKED' || sub?.is_kicked;

                return (
                  <div
                    key={ex.id}
                    className={`rounded-3xl p-6 border transition flex flex-col justify-between shadow-sm ${
                      isKicked
                        ? 'bg-rose-50/40 border-2 border-rose-300 ring-2 ring-rose-500/20 shadow-xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-3 py-1 rounded-xl font-bold text-xs ${
                            isKicked
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ex.course_code}
                        </span>

                        {isKicked ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 border border-rose-300 text-rose-800 text-xs font-black">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            <span>KICKED</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                            Ended
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className={`font-extrabold text-base ${isKicked ? 'text-rose-950' : 'text-slate-900'}`}>
                          {ex.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{ex.course_name}</p>
                      </div>

                      {/* If kicked, show prominent red violation reason box */}
                      {isKicked && (
                        <div className="p-3 rounded-2xl bg-rose-100/70 border border-rose-200 text-rose-900 text-xs space-y-1">
                          <strong className="font-extrabold block text-rose-950 flex items-center gap-1">
                            <ShieldX className="w-3.5 h-3.5 text-rose-600" />
                            <span>Kicked: {sub?.kicked_reason || 'Disqualified due to malpractice violation'}</span>
                          </strong>
                          {sub?.violations_count ? (
                            <div className="text-[10px] text-rose-700 font-mono font-bold">
                              Recorded Violations: {sub.violations_count} Attempt(s)
                            </div>
                          ) : null}
                          {sub?.kicked_at && (
                            <div className="text-[10px] text-rose-600 font-mono">
                              Kicked at: {sub.kicked_at}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Exam Date</span>
                          <strong>{ex.exam_date}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Questions</span>
                          <strong>{ex.questions_count} Qs</strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                      {isKicked ? (
                        <div className="flex items-center gap-1.5 text-rose-700 text-xs font-bold">
                          <XCircle className="w-4 h-4 text-rose-600" />
                          <span>Candidate Disqualified</span>
                        </div>
                      ) : sub?.submitted ? (
                        ex.is_results_published && sub.score !== null && sub.score !== undefined ? (
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs font-bold text-slate-800">
                              Score: {sub.score} / {sub.total_questions} ({Math.round((sub.score / Math.max(1, sub.total_questions)) * 100)}%)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/60 text-xs font-semibold">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Results Pending Announcement</span>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not attempted</span>
                      )}

                      {isKicked ? (
                        <span className="px-3 py-1 rounded-xl bg-rose-100 text-rose-800 text-xs font-bold border border-rose-300">
                          Disqualified
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
