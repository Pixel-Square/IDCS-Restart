import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';

class RecordIncidentScreen extends StatefulWidget {
  final Map<String, dynamic> student;
  final String barcode;

  const RecordIncidentScreen({
    super.key,
    required this.student,
    required this.barcode,
  });

  @override
  State<RecordIncidentScreen> createState() => _RecordIncidentScreenState();
}

class _RecordIncidentScreenState extends State<RecordIncidentScreen> {
  final TextEditingController _remarksController = TextEditingController();
  final Set<int> _selectedCategoryIds = {};
  List<Map<String, dynamic>> _categories = [];
  bool _isLoadingCategories = true;
  bool _isSubmitting = false;

  // Photo / File Proof State
  String? _attachedFileName;
  String? _attachedFileProof; // base64 or simulated asset path

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  @override
  void dispose() {
    _remarksController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    setState(() => _isLoadingCategories = true);

    // 1. Try local offline cache first for instant UI response
    final offlineCats = OfflineStorageService.instance.getCategories();
    if (offlineCats.isNotEmpty) {
      _categories = offlineCats;
    }

    // 2. Refresh from backend if online
    try {
      final onlineCats = await ApiService.fetchDisciplineCategories();
      if (onlineCats.isNotEmpty) {
        _categories = onlineCats;
        await OfflineStorageService.instance.saveCategories(onlineCats);
      }
    } catch (_) {}

    if (mounted) {
      setState(() => _isLoadingCategories = false);
    }
  }

  bool _isCommentRequired() {
    for (final cat in _categories) {
      final id = cat['id'];
      if (_selectedCategoryIds.contains(id) && cat['require_comment'] == true) {
        return true;
      }
    }
    return false;
  }

  void _simulatePhotoCapture() {
    setState(() {
      _attachedFileName = 'IMG_EVIDENCE_${DateTime.now().millisecondsSinceEpoch}.jpg';
      _attachedFileProof = 'assets/kr_track_clean.png';
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Camera proof snapshot attached successfully.'),
        duration: Duration(seconds: 2),
        backgroundColor: Color(0xFF6366F1),
      ),
    );
  }

  void _simulateFileUpload() {
    setState(() {
      _attachedFileName = 'DEC_DOCUMENT_${DateTime.now().millisecondsSinceEpoch}.pdf';
      _attachedFileProof = 'doc://simulated_upload';
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Disciplinary document proof attached successfully.'),
        duration: Duration(seconds: 2),
        backgroundColor: Color(0xFF06B6D4),
      ),
    );
  }

  Future<void> _submitIncident() async {
    if (_selectedCategoryIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select at least one violation category.'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    final commentRequired = _isCommentRequired();
    final remarks = _remarksController.text.trim();
    if (commentRequired && remarks.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Staff Remarks / Notes are required for the selected violation!'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final student = widget.student;
    final regNo = student['reg_no']?.toString() ?? widget.barcode;
    final name = student['name']?.toString() ?? 'Rohit SK';
    final username = student['username']?.toString() ?? '@ROHIT S K';
    final department = student['department']?.toString() ?? 'AI&ML';
    final batch = student['batch']?.toString() ?? '2024 (Sec A)';
    final section = student['section']?.toString() ?? 'Sec A';

    // Get selected category objects
    final selectedCats = _categories.where((c) => _selectedCategoryIds.contains(c['id'])).toList();
    final primaryCat = selectedCats.isNotEmpty ? selectedCats.first : null;
    final primaryCatId = primaryCat != null ? primaryCat['id'] as int? : null;
    final primaryCatTitle = selectedCats.map((c) => c['title'] ?? '').join(', ');

    final appState = AppState.instance;
    final staffId = appState.studentId.isNotEmpty ? appState.studentId : appState.userName;

    // 1. Attempt live online submission to database
    bool onlineSuccess = false;
    try {
      onlineSuccess = await ApiService.recordDisciplineIncident(
        regNo: regNo,
        studentName: name,
        username: username,
        departmentName: department,
        batchName: batch,
        sectionName: section,
        category: primaryCatId,
        categoryIds: _selectedCategoryIds.toList(),
        categoryTitle: primaryCatTitle,
        remarks: remarks,
        incidentDocument: _attachedFileProof,
        reportedByName: appState.userName,
        reportedByUsername: staffId,
      );
    } catch (_) {
      onlineSuccess = false;
    }

    if (onlineSuccess) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF10B981),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            content: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Colors.white),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Incident for $name recorded to database!',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        );
        Navigator.of(context).pop(true);
      }
      return;
    }

    // 2. Offline Mode or Network Unreachable: Save locally to device storage
    await OfflineStorageService.instance.addOfflineIncident({
      'reg_no': regNo,
      'student_name': name,
      'username': username,
      'department_name': department,
      'batch_name': batch,
      'section_name': section,
      'category': primaryCatId,
      'category_ids': _selectedCategoryIds.toList(),
      'category_title': primaryCatTitle,
      'remarks': remarks,
      'photo_base64': _attachedFileProof,
      'incident_document': _attachedFileProof,
      'attached_file_name': _attachedFileName,
      'reported_by_name': appState.userName,
      'reported_by_username': staffId,
      'created_at': DateTime.now().toIso8601String(),
    });

    // WhatsApp-like immediate background attempt in case connection was restored
    OfflineStorageService.instance.syncOfflineIncidentsToDatabase();

    if (mounted) {
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: const Color(0xFFF59E0B),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          content: Row(
            children: [
              const Icon(Icons.access_time_rounded, color: Colors.white), // WhatsApp clock icon
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Saved offline in device! Pending sync to database.',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          duration: const Duration(seconds: 4),
        ),
      );
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppState.instance.isDarkMode;
    final student = widget.student;

    final regNo = student['reg_no']?.toString() ?? widget.barcode;
    final name = student['name']?.toString() ?? 'Rohit SK';
    final rawUsername = student['username']?.toString() ?? 'ROHIT S K';
    final username = rawUsername.startsWith('@') ? rawUsername : '@$rawUsername';
    final department = student['department']?.toString() ?? 'AI&ML';
    final batch = student['batch']?.toString() ?? '2024 (Sec A)';
    final isOffline = student['is_offline'] == true;

    final bgColor = isDark ? const Color(0xFF0B0F19) : const Color(0xFFF8FAFC);
    final cardBg = isDark ? const Color(0xFF131A2A) : Colors.white;
    final textColor = isDark ? Colors.white : const Color(0xFF0F172A);
    final subtextColor = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);
    final borderColor = isDark ? const Color(0xFF232D42) : const Color(0xFFE2E8F0);

    final commentRequired = _isCommentRequired();

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: textColor, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Record Incident',
          style: TextStyle(
            color: textColor,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: isOffline
                  ? const Color(0xFFF59E0B).withValues(alpha: 0.15)
                  : const Color(0xFF10B981).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isOffline ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                width: 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isOffline ? Icons.cloud_off_rounded : Icons.cloud_done_rounded,
                  size: 14,
                  color: isOffline ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                ),
                const SizedBox(width: 5),
                Text(
                  isOffline ? 'Offline Mode' : 'Online',
                  style: TextStyle(
                    color: isOffline ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── 1. STUDENT DETAILS CARD (AS REQUESTED) ──
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: cardBg,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: borderColor, width: 1.2),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.05),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'STUDENT IDENTITY',
                          style: TextStyle(
                            color: AppColors.accentCyan,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFF6366F1).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text(
                            'Active Student',
                            style: TextStyle(
                              color: Color(0xFF6366F1),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Rohit SK
                    Text(
                      name,
                      style: TextStyle(
                        color: textColor,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 2),

                    // @ROHIT S K
                    Text(
                      username,
                      style: TextStyle(
                        color: subtextColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 6),

                    // 2403811714821042
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E283C) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        regNo,
                        style: TextStyle(
                          color: AppColors.primary,
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // AI&ML
                    Text(
                      department,
                      style: TextStyle(
                        color: textColor,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),

                    // Batch: 2024 (Sec A)
                    Text(
                      batch.toLowerCase().startsWith('batch') ? batch : 'Batch: $batch',
                      style: TextStyle(
                        color: subtextColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // ── 2. SELECT VIOLATION CATEGORIES * ──
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  RichText(
                    text: TextSpan(
                      text: 'Select Violation Categories ',
                      style: TextStyle(
                        color: textColor,
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                      ),
                      children: const [
                        TextSpan(
                          text: '*',
                          style: TextStyle(color: Color(0xFFEF4444)),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '${_selectedCategoryIds.length} selected',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              if (_isLoadingCategories)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                )
              else
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _categories.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final cat = _categories[index];
                    final catId = cat['id'] as int;
                    final isSelected = _selectedCategoryIds.contains(catId);
                    final title = cat['title'] ?? 'Category';
                    final penalty = cat['penalty_points'] ?? 0;
                    final fine = cat['fine_amount'] ?? 0;
                    final reqComment = cat['require_comment'] == true;

                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          if (isSelected) {
                            _selectedCategoryIds.remove(catId);
                          } else {
                            _selectedCategoryIds.add(catId);
                          }
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.primary.withValues(alpha: isDark ? 0.2 : 0.08)
                              : cardBg,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.primary
                                : borderColor,
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              isSelected
                                  ? Icons.check_box_rounded
                                  : Icons.check_box_outline_blank_rounded,
                              color: isSelected ? AppColors.primary : subtextColor,
                              size: 22,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: TextStyle(
                                      color: textColor,
                                      fontSize: 14,
                                      fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Row(
                                    children: [
                                      Text(
                                        '-$penalty pts',
                                        style: const TextStyle(
                                          color: Color(0xFFEF4444),
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      if (fine > 0) ...[
                                        const SizedBox(width: 8),
                                        Text(
                                          'Fine: ₹$fine',
                                          style: const TextStyle(
                                            color: Color(0xFFF59E0B),
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                      if (reqComment) ...[
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFF8B5CF6).withValues(alpha: 0.15),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: const Text(
                                            'Notes Required',
                                            style: TextStyle(
                                              color: Color(0xFF8B5CF6),
                                              fontSize: 9,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),

              const SizedBox(height: 24),

              // ── 3. STAFF REMARKS / NOTES ──
              RichText(
                text: TextSpan(
                  text: 'Staff Remarks / Notes ',
                  style: TextStyle(
                    color: textColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                  children: [
                    TextSpan(
                      text: commentRequired ? '(Required)' : '(Optional)',
                      style: TextStyle(
                        color: commentRequired ? const Color(0xFFEF4444) : subtextColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Container(
                decoration: BoxDecoration(
                  color: cardBg,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: commentRequired && _remarksController.text.trim().isEmpty
                        ? const Color(0xFFEF4444).withValues(alpha: 0.7)
                        : borderColor,
                    width: 1.2,
                  ),
                ),
                child: TextField(
                  controller: _remarksController,
                  maxLines: 4,
                  style: TextStyle(color: textColor, fontSize: 13),
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Add context e.g. location, period, or warning details...',
                    hintStyle: TextStyle(color: subtextColor.withValues(alpha: 0.7), fontSize: 13),
                    contentPadding: const EdgeInsets.all(16),
                    border: InputBorder.none,
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // ── 4. PHOTO / FILE PROOF (OPTIONAL) ──
              Text(
                'Photo / File Proof',
                style: TextStyle(
                  color: textColor,
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                '(Optional) Attach student photo or evidence document',
                style: TextStyle(
                  color: subtextColor,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        side: BorderSide(color: borderColor, width: 1.2),
                        backgroundColor: cardBg,
                      ),
                      onPressed: _simulateFileUpload,
                      icon: const Icon(Icons.upload_file_rounded, size: 18, color: Color(0xFF06B6D4)),
                      label: Text(
                        'Upload File',
                        style: TextStyle(color: textColor, fontSize: 13, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        side: BorderSide(color: borderColor, width: 1.2),
                        backgroundColor: cardBg,
                      ),
                      onPressed: _simulatePhotoCapture,
                      icon: const Icon(Icons.camera_alt_rounded, size: 18, color: Color(0xFF8B5CF6)),
                      label: Text(
                        'Camera',
                        style: TextStyle(color: textColor, fontSize: 13, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ),

              if (_attachedFileName != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _attachedFileName!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: textColor, fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        icon: const Icon(Icons.close_rounded, size: 16, color: Color(0xFFEF4444)),
                        onPressed: () {
                          setState(() {
                            _attachedFileName = null;
                            _attachedFileProof = null;
                          });
                        },
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 32),

              // ── 5. RECORD INCIDENT TO DB BUTTON ──
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    elevation: 6,
                    shadowColor: AppColors.primary.withValues(alpha: 0.4),
                  ),
                  onPressed: _isSubmitting ? null : _submitIncident,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.save_rounded, size: 20),
                            SizedBox(width: 10),
                            Text(
                              'Record Incident to DB',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ],
                        ),
                ),
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
