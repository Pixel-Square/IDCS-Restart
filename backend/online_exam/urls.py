from django.urls import path
from .views import (
    OnlineExamMetaView,
    OnlineExamListView,
    OnlineExamCreateView,
    OnlineExamStartView,
    OnlineExamEndView,
    OnlineExamStudentExamsView,
    OnlineExamStudentDetailView,
    OnlineExamStudentTakeView,
    OnlineExamQuestionBankListView,
    OnlineExamPublishResultsView,
    OnlineExamLiveSubmissionsView,
    OnlineExamStudentLogView,
    OnlineExamStudentSaveDraftView,
    OnlineExamStudentKickView,
    OnlineExamAllowRetestView,
)

app_name = 'online_exam'

urlpatterns = [
    path('meta/', OnlineExamMetaView.as_view(), name='online-exam-meta'),
    path('question-banks/', OnlineExamQuestionBankListView.as_view(), name='online-exam-question-banks'),
    path('exams/', OnlineExamListView.as_view(), name='online-exam-list'),
    path('exams/create/', OnlineExamCreateView.as_view(), name='online-exam-create'),
    path('exams/<int:pk>/start/', OnlineExamStartView.as_view(), name='online-exam-start'),
    path('exams/<int:pk>/end/', OnlineExamEndView.as_view(), name='online-exam-end'),
    path('exams/<int:pk>/publish-results/', OnlineExamPublishResultsView.as_view(), name='online-exam-publish-results'),
    path('exams/<int:pk>/submissions/', OnlineExamLiveSubmissionsView.as_view(), name='online-exam-live-submissions'),
    path('exams/<int:pk>/allow-retest/<int:student_id>/', OnlineExamAllowRetestView.as_view(), name='online-exam-allow-retest'),
    path('exams/<int:pk>/student-log/<int:student_id>/', OnlineExamStudentLogView.as_view(), name='online-exam-student-log'),
    path('student/exams/', OnlineExamStudentExamsView.as_view(), name='online-exam-student-exams'),
    path('student/exams/<int:pk>/detail/', OnlineExamStudentDetailView.as_view(), name='online-exam-student-detail'),
    path('student/exams/<int:pk>/take/', OnlineExamStudentTakeView.as_view(), name='online-exam-student-take'),
    path('student/exams/<int:pk>/kick/', OnlineExamStudentKickView.as_view(), name='online-exam-student-kick'),
    path('student/exams/<int:pk>/save-draft/', OnlineExamStudentSaveDraftView.as_view(), name='online-exam-student-save-draft'),
]

