import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../state/app_state.dart';
import '../services/api_service.dart';

class StudentTakeExamScreen extends StatefulWidget {
  final int examId;
  final String examTitle;

  const StudentTakeExamScreen({
    super.key,
    required this.examId,
    required this.examTitle,
  });

  @override
  State<StudentTakeExamScreen> createState() => _StudentTakeExamScreenState();
}

class _StudentTakeExamScreenState extends State<StudentTakeExamScreen> with WidgetsBindingObserver {
  static const MethodChannel _securityChannel = MethodChannel('com.kr_tracker.security/window_flags');

  bool _isLoading = true;
  String _errorMessage = '';
  List<Map<String, dynamic>> _questions = [];
  int _currentIndex = 0;
  final Map<String, String> _selectedAnswers = {};

  // Proctoring & Security
  int _violationsCount = 0;
  int _maxViolations = 3;
  int _cooldownSeconds = 30;
  bool _warningModalOpen = false;
  int _warningTimerSecs = 30;
  Timer? _warningTimer;
  String _warningReason = '';

  // Kicked state
  bool _isKicked = false;
  String _kickedReason = '';

  // Remaining duration timer
  int _remainingSeconds = 0;
  Timer? _durationTimer;
  Timer? _heartbeatTimer;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _enterFullImmersiveMode();
    _enableHardwareScreenshotShield();
    _loadExamQuestions();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _durationTimer?.cancel();
    _warningTimer?.cancel();
    _heartbeatTimer?.cancel();
    _exitFullImmersiveMode();
    _disableHardwareScreenshotShield();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────
  // FULL SCREEN & NATIVE HARDWARE ANTI-SCREENSHOT LOCK
  // ─────────────────────────────────────────────────────────────

  /// Enter truly full-screen mode: hide home, back, recents, and notification bar
  void _enterFullImmersiveMode() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  /// Restore edge-to-edge system UI on exit
  void _exitFullImmersiveMode() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }

  /// Physically blocks screenshots & screen recording at OS level (Android FLAG_SECURE)
  Future<void> _enableHardwareScreenshotShield() async {
    try {
      await _securityChannel.invokeMethod('enableSecure');
    } catch (e) {
      debugPrint('FLAG_SECURE enable error: $e');
    }
  }

  Future<void> _disableHardwareScreenshotShield() async {
    try {
      await _securityChannel.invokeMethod('disableSecure');
    } catch (e) {
      debugPrint('FLAG_SECURE disable error: $e');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // APP LIFECYCLE MALPRACTICE MONITORING (APP SWITCH / NOTIFICATION SHADE)
  // ─────────────────────────────────────────────────────────────
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_isSubmitting || _isKicked || _isLoading) return;

    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      // User minimized app, switched applications, or pulled down notification drawer!
      _triggerMalpracticeWarning(
        'Application lost focus or was minimized. Navigating away from the examination is prohibited.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DATA LOADING & AUTO TIMERS
  // ─────────────────────────────────────────────────────────────
  Future<void> _loadExamQuestions() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final res = await ApiService.fetchStudentTakeOnlineExam(widget.examId);
      if (mounted) {
        if (res['success'] == true) {
          final qList = List<Map<String, dynamic>>.from(res['questions'] ?? []);
          final savedAns = Map<String, dynamic>.from(res['saved_answers'] ?? {});
          final remainingSecs = res['remaining_seconds'] as int? ?? (res['duration_minutes'] as int? ?? 30) * 60;
          final maxV = res['max_violations'] as int? ?? 3;
          final coolS = res['cooldown_seconds'] as int? ?? 30;

          setState(() {
            _questions = qList;
            _remainingSeconds = remainingSecs;
            _maxViolations = maxV;
            _cooldownSeconds = coolS;
            savedAns.forEach((k, v) {
              if (v != null) _selectedAnswers[k.toString()] = v.toString();
            });
            _isLoading = false;
          });

          _startDurationCountdown();
          _startHeartbeatTimer();
        } else {
          setState(() {
            _isLoading = false;
            _errorMessage = res['error'] ?? 'Failed to load exam.';
            if (res['is_kicked'] == true) {
              _isKicked = true;
              _kickedReason = res['kicked_reason'] ?? 'Disqualified by proctor';
            }
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Connection error: $e';
        });
      }
    }
  }

  void _startDurationCountdown() {
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (_remainingSeconds <= 1) {
          timer.cancel();
          _remainingSeconds = 0;
          _handleAutoSubmitTimeUp();
        } else {
          _remainingSeconds--;
        }
      });
    });
  }

  /// Live periodic heartbeat: auto-saves student answers and detects if admin ended exam or disqualified candidate
  void _startHeartbeatTimer() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (!mounted || _isSubmitting || _isKicked || _isLoading) return;
      try {
        final res = await ApiService.saveStudentOnlineExamDraft(widget.examId, _selectedAnswers);
        if (mounted) {
          // 1. Check if student was kicked / disqualified by proctor
          if (res['is_kicked'] == true) {
            _durationTimer?.cancel();
            _warningTimer?.cancel();
            _heartbeatTimer?.cancel();
            setState(() {
              _isKicked = true;
              _kickedReason = res['kicked_reason'] ?? 'Disqualified by proctor';
              _warningModalOpen = false;
            });
            _exitFullImmersiveMode();
            _disableHardwareScreenshotShield();
            return;
          }

          // 2. Check if admin concluded or ended the exam live
          final examStatus = (res['exam_status'] ?? '').toString().toUpperCase();
          if (examStatus == 'ENDED' || examStatus == 'PUBLISHED') {
            _durationTimer?.cancel();
            _warningTimer?.cancel();
            _heartbeatTimer?.cancel();
            _handleAutoSubmitExamEnded();
            return;
          }
        }
      } catch (_) {}
    });
  }

  Future<void> _handleAutoSubmitExamEnded() async {
    setState(() {
      _isSubmitting = true;
    });

    await ApiService.submitStudentOnlineExam(
      widget.examId,
      _selectedAnswers,
      violationsCount: _violationsCount,
    );

    if (mounted) {
      _exitFullImmersiveMode();
      _disableHardwareScreenshotShield();
      _showSubmissionSuccessDialog(
        isAuto: true,
        customMessage: 'The examination has been concluded by the instructor. Your responses have been securely preserved and submitted.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MALPRACTICE WARNING & DISQUALIFICATION LOGIC
  // ─────────────────────────────────────────────────────────────
  void _triggerMalpracticeWarning(String reason) {
    if (_warningModalOpen || _isSubmitting || _isKicked) return;

    _violationsCount++;
    if (_violationsCount >= _maxViolations) {
      _handleKickStudent(
        'Exceeded maximum allowed attempts ($_violationsCount/$_maxViolations). Reason: $reason',
      );
      return;
    }

    setState(() {
      _warningModalOpen = true;
      _warningReason = reason;
      _warningTimerSecs = _cooldownSeconds;
    });

    _warningTimer?.cancel();
    _warningTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (_warningTimerSecs <= 1) {
          timer.cancel();
          _warningTimerSecs = 0;
          _warningModalOpen = false;
          // Cooldown timeout expired without resuming: kick candidate!
          _handleKickStudent(
            'Security cooldown of ${_cooldownSeconds}s expired without resuming the examination.',
          );
        } else {
          _warningTimerSecs--;
        }
      });
    });
  }

  void _resumeFromWarning() {
    _warningTimer?.cancel();
    setState(() {
      _warningModalOpen = false;
      _warningTimerSecs = _cooldownSeconds;
    });
    // Re-lock immersive full screen
    _enterFullImmersiveMode();
  }

  Future<void> _handleKickStudent(String reason) async {
    _durationTimer?.cancel();
    _warningTimer?.cancel();
    _heartbeatTimer?.cancel();
    setState(() {
      _isSubmitting = true;
      _warningModalOpen = false;
    });

    await ApiService.kickStudentOnlineExam(
      widget.examId,
      reason,
      _selectedAnswers,
      violationsCount: _violationsCount,
    );

    if (mounted) {
      setState(() {
        _isSubmitting = false;
        _isKicked = true;
        _kickedReason = reason;
      });
      _exitFullImmersiveMode();
      _disableHardwareScreenshotShield();
    }
  }

  Future<void> _handleAutoSubmitTimeUp() async {
    _durationTimer?.cancel();
    _warningTimer?.cancel();
    _heartbeatTimer?.cancel();
    setState(() {
      _isSubmitting = true;
    });

    await ApiService.submitStudentOnlineExam(
      widget.examId,
      _selectedAnswers,
      violationsCount: _violationsCount,
    );

    if (mounted) {
      _exitFullImmersiveMode();
      _disableHardwareScreenshotShield();
      _showSubmissionSuccessDialog(isAuto: true);
    }
  }

  Future<void> _handleManualSubmit() async {
    _heartbeatTimer?.cancel();
    setState(() {
      _isSubmitting = true;
    });

    final res = await ApiService.submitStudentOnlineExam(
      widget.examId,
      _selectedAnswers,
      violationsCount: _violationsCount,
    );

    if (mounted) {
      setState(() {
        _isSubmitting = false;
      });
      if (res['success'] == true) {
        _durationTimer?.cancel();
        _warningTimer?.cancel();
        _exitFullImmersiveMode();
        _disableHardwareScreenshotShield();
        _showSubmissionSuccessDialog(isAuto: false);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['error'] ?? 'Submission error. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showSubmissionSuccessDialog({bool isAuto = false, String? customMessage}) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return PopScope(
          canPop: false,
          child: AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            title: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 28),
                const SizedBox(width: 10),
                const Text('Exam Submitted', style: TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  customMessage ??
                      (isAuto
                          ? 'The exam duration has ended. Your responses were securely auto-submitted.'
                          : 'Your responses have been successfully submitted to the evaluation server.'),
                  style: const TextStyle(fontSize: 13, height: 1.4),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.done_all_rounded, color: Color(0xFF10B981), size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'Answered: ${_selectedAnswers.length} / ${_questions.length} Questions',
                        style: const TextStyle(
                          color: Color(0xFF10B981),
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx); // Close dialog
                  Navigator.pop(context); // Exit exam screen
                },
                child: const Text('Return to Exams Hub', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        );
      },
    );
  }

  void _confirmSubmitDialog() {
    final answeredCount = _selectedAnswers.length;
    final totalCount = _questions.length;
    final unansweredCount = totalCount - answeredCount;

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          title: const Text('Confirm Submission', style: TextStyle(fontWeight: FontWeight.w900)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Are you sure you want to finish and submit your examination?',
                style: TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Text(
                            '$answeredCount',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF10B981)),
                          ),
                          const Text('Answered', style: TextStyle(fontSize: 11, color: Color(0xFF10B981))),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Text(
                            '$unansweredCount',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.amber),
                          ),
                          const Text('Unanswered', style: TextStyle(fontSize: 11, color: Colors.amber)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Keep Answering', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                _handleManualSubmit();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Confirm Submit', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ),
          ],
        );
      },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // UI BUILD
  // ─────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    // Prevent back navigation completely
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _triggerMalpracticeWarning('Back navigation gesture detected. Exiting examination is strictly prohibited.');
      },
      // Disable hold, text selection, and context menus completely
      child: SelectionContainer.disabled(
        child: Scaffold(
          backgroundColor: const Color(0xFFF8FAFC),
          body: Stack(
            children: [
              // Main Exam Screen Content
              if (_isLoading)
                const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
              else if (_errorMessage.isNotEmpty && _questions.isEmpty)
                _buildErrorView()
              else
                _buildActiveExamView(),

              // JEE-Style Slanted Register Number & Name Watermark Overlay (In Front of All Elements)
              _buildJEEWatermarkOverlay(),

              // Cooldown Warning Modal (When user minimizes or leaves app)
              if (_warningModalOpen) _buildCooldownWarningOverlay(),

              // Kicked Candidate Disqualification Screen
              if (_isKicked) _buildKickedOverlay(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildJEEWatermarkOverlay() {
    final state = AppState.instance;
    final studentName = state.userName;
    final studentReg = state.studentId;

    return IgnorePointer(
      child: Opacity(
        opacity: 0.08,
        child: Transform.rotate(
          angle: -0.42, // Slanted angle
          child: SizedBox(
            width: double.infinity,
            height: double.infinity,
            child: Wrap(
              spacing: 48,
              runSpacing: 40,
              alignment: WrapAlignment.center,
              children: List.generate(40, (i) {
                return Text(
                  '$studentName • $studentReg',
                  style: const TextStyle(
                    color: Colors.black,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2,
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActiveExamView() {
    if (_questions.isEmpty) return const Center(child: Text('No questions found.'));

    final currentQ = _questions[_currentIndex];
    final qId = (currentQ['id'] ?? currentQ['question_number']).toString();
    final currentAnswer = _selectedAnswers[qId];

    final minutes = _remainingSeconds ~/ 60;
    final seconds = _remainingSeconds % 60;
    final timerText = '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    final isTimerLow = _remainingSeconds < 300; // < 5 mins

    return SafeArea(
      child: Column(
        children: [
          // Top Header Bar: Exam info, Timer, Student Info
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Exam Title & Question count
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.examTitle,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        'Question ${_currentIndex + 1} of ${_questions.length}',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),

                // Live Timer Box
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: isTimerLow ? Colors.red.shade50 : const Color(0xFF6366F1).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isTimerLow ? Colors.red.shade300 : const Color(0xFF6366F1).withValues(alpha: 0.25),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.timer_outlined,
                        size: 16,
                        color: isTimerLow ? Colors.red : const Color(0xFF6366F1),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        timerText,
                        style: TextStyle(
                          color: isTimerLow ? Colors.red : const Color(0xFF6366F1),
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Question Palette (Horizontal Pill Strip with states)
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
            ),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _questions.length,
              itemBuilder: (context, index) {
                final q = _questions[index];
                final id = (q['id'] ?? q['question_number']).toString();
                final isAnswered = _selectedAnswers.containsKey(id);
                final isCurrent = index == _currentIndex;

                Color bg;
                Color fg;
                if (isCurrent) {
                  bg = const Color(0xFF6366F1);
                  fg = Colors.white;
                } else if (isAnswered) {
                  bg = const Color(0xFF10B981);
                  fg = Colors.white;
                } else {
                  bg = Colors.grey.shade100;
                  fg = Colors.grey.shade700;
                }

                return GestureDetector(
                  onTap: () {
                    setState(() {
                      _currentIndex = index;
                    });
                  },
                  child: Container(
                    width: 36,
                    height: 36,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: bg,
                      shape: BoxShape.circle,
                      border: isCurrent ? Border.all(color: Colors.white, width: 2) : null,
                      boxShadow: isCurrent
                          ? [
                              BoxShadow(
                                color: const Color(0xFF6366F1).withValues(alpha: 0.4),
                                blurRadius: 6,
                                offset: const Offset(0, 2),
                              )
                            ]
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${index + 1}',
                      style: TextStyle(
                        color: fg,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          // Question Card & Options (Scrollable)
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // Question Header Chips (CO & Marks)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'CO ${currentQ['co'] ?? 1}',
                        style: const TextStyle(
                          color: Color(0xFF6366F1),
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '${currentQ['marks'] ?? 1} Mark(s)',
                        style: const TextStyle(
                          color: Color(0xFF10B981),
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                // Question Text
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.grey.shade200),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.02),
                        blurRadius: 10,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Text(
                    currentQ['question_text'] ?? 'Question',
                    style: const TextStyle(
                      color: Color(0xFF0F172A),
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      height: 1.5,
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                // Options (A, B, C, D)
                _buildOptionTile('A', currentQ['option_a'], qId, currentAnswer),
                _buildOptionTile('B', currentQ['option_b'], qId, currentAnswer),
                _buildOptionTile('C', currentQ['option_c'], qId, currentAnswer),
                _buildOptionTile('D', currentQ['option_d'], qId, currentAnswer),
              ],
            ),
          ),

          // Pinned Bottom Action Bar (Prev, Clear, Next / Submit)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 12,
                  offset: const Offset(0, -3),
                ),
              ],
            ),
            child: Row(
              children: [
                // Previous Button
                if (_currentIndex > 0)
                  IconButton(
                    onPressed: () {
                      setState(() {
                        _currentIndex--;
                      });
                    },
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
                    tooltip: 'Previous Question',
                  ),

                // Clear Choice Button
                if (currentAnswer != null)
                  TextButton.icon(
                    onPressed: () {
                      setState(() {
                        _selectedAnswers.remove(qId);
                      });
                      ApiService.saveStudentOnlineExamDraft(widget.examId, _selectedAnswers);
                    },
                    icon: const Icon(Icons.clear_rounded, size: 16, color: Colors.grey),
                    label: const Text('Clear', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  ),

                const Spacer(),

                // Next or Submit Button
                if (_currentIndex < _questions.length - 1)
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _currentIndex++;
                      });
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF6366F1),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Next', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                        SizedBox(width: 4),
                        Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 14),
                      ],
                    ),
                  )
                else
                  ElevatedButton.icon(
                    onPressed: _confirmSubmitDialog,
                    icon: const Icon(Icons.check_circle_rounded, color: Colors.white, size: 18),
                    label: const Text('Review & Submit', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOptionTile(String optKey, dynamic optText, String qId, String? currentAnswer) {
    if (optText == null || optText.toString().trim().isEmpty) {
      return const SizedBox.shrink();
    }

    final isSelected = currentAnswer == optKey;

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedAnswers[qId] = optKey;
        });
        // Auto-save draft in background
        ApiService.saveStudentOnlineExamDraft(widget.examId, _selectedAnswers);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF6366F1).withValues(alpha: 0.08) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? const Color(0xFF6366F1) : Colors.grey.shade200,
            width: isSelected ? 1.8 : 1.0,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isSelected ? 0.06 : 0.02),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFF6366F1) : Colors.grey.shade100,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text(
                optKey,
                style: TextStyle(
                  color: isSelected ? Colors.white : Colors.grey.shade700,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                optText.toString(),
                style: TextStyle(
                  color: isSelected ? const Color(0xFF6366F1) : const Color(0xFF1E293B),
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                  height: 1.3,
                ),
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle_rounded, color: Color(0xFF6366F1), size: 22),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // COOLDOWN WARNING MODAL OVERLAY
  // ─────────────────────────────────────────────────────────────
  Widget _buildCooldownWarningOverlay() {
    return Container(
      color: Colors.black.withValues(alpha: 0.85),
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: Colors.red, width: 2),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 36),
            ),
            const SizedBox(height: 16),
            Text(
              'SECURITY WARNING ($_violationsCount/$_maxViolations)',
              style: const TextStyle(
                color: Colors.red,
                fontSize: 12,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Examination Paused',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              _warningReason,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  const Text(
                    'COOLDOWN TIME REMAINING',
                    style: TextStyle(color: Colors.red, fontSize: 10, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '00:${_warningTimerSecs.toString().padLeft(2, '0')}',
                    style: const TextStyle(
                      color: Colors.red,
                      fontSize: 36,
                      fontWeight: FontWeight.w900,
                      fontFamily: 'monospace',
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Tap "Resume Exam" before the countdown expires or you will be disqualified.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.red, fontSize: 10),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _resumeFromWarning,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text(
                  'RESUME EXAM (RE-ENTER FULL SCREEN)',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // KICKED DISQUALIFICATION OVERLAY
  // ─────────────────────────────────────────────────────────────
  Widget _buildKickedOverlay() {
    return Container(
      color: Colors.black.withValues(alpha: 0.95),
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: Colors.red, width: 2),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.person_off_rounded, color: Colors.red, size: 36),
            ),
            const SizedBox(height: 16),
            const Text(
              'CANDIDATE DISQUALIFIED',
              style: TextStyle(color: Colors.red, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1),
            ),
            const SizedBox(height: 6),
            const Text(
              'Examination Terminated',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            Text(
              'You have been kicked from ${widget.examTitle} due to proctoring violations:\n\n"$_kickedReason"',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade700, fontSize: 12, height: 1.4),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F172A),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('Exit to Hub', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.red, size: 48),
            const SizedBox(height: 16),
            Text(
              _errorMessage,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Return Back'),
            ),
          ],
        ),
      ),
    );
  }
}
