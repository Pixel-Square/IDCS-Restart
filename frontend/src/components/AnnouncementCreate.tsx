import React, { useState, useEffect } from 'react';
import { X, Send, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import { apiClient } from '../services/auth';
import { getApiBase } from '../services/apiBase';

interface Course {
  id: number;
  code: string;
  title: string;
}

interface AnnouncementCreateProps {
  onClose: () => void;
  onSuccess?: () => void;
  user?: { username: string; profile_type?: string; profile?: any } | null;
}

export default function AnnouncementCreate({ onClose, onSuccess, user }: AnnouncementCreateProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch available courses
  useEffect(() => {
    fetchAvailableCourses();
  }, []);

  const fetchAvailableCourses = async () => {
    try {
      setLoading(true);
      const url = `${getApiBase()}/api/announcements/announcements/available_courses/`;
      const response = await apiClient.get(url);
      setCourses(response.data);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setError('Failed to load available courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCourseToggle = (courseId: number) => {
    const newSelected = new Set(selectedCourses);
    if (newSelected.has(courseId)) {
      newSelected.delete(courseId);
    } else {
      newSelected.add(courseId);
    }
    setSelectedCourses(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedCourses.size === filteredCourses.length) {
      setSelectedCourses(new Set());
    } else {
      setSelectedCourses(new Set(filteredCourses.map(c => c.id)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    if (selectedCourses.size === 0) {
      setError('Please select at least one course');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        title: title.trim(),
        content: content.trim(),
        course_ids: Array.from(selectedCourses),
        is_published: true,
      };

      const url = `${getApiBase()}/api/announcements/announcements/`;
      await apiClient.post(url, payload);

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to create announcement:', err);
      setError(err.response?.data?.detail || 'Failed to create announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCourses = courses.filter(course =>
    course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Create Announcement</h2>
            <p className="text-sm text-gray-600 mt-1">Send announcement to selected courses</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 p-4 m-6 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-green-800 font-medium">Announcement created successfully!</p>
              <p className="text-green-700 text-sm">Your announcement has been published.</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 m-6 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Announcement Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter announcement title"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              disabled={submitting}
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Announcement Content *
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter announcement content..."
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
              disabled={submitting}
            />
          </div>

          {/* Course Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-900">
                Select Courses *
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                disabled={loading || submitting}
              >
                {selectedCourses.size === filteredCourses.length && filteredCourses.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            {/* Search Box */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search courses by code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                disabled={loading || submitting}
              />
            </div>

            {/* Course List */}
            <div className="border border-gray-300 rounded-lg p-4 max-h-72 overflow-y-auto bg-gray-50">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading courses...</div>
              ) : filteredCourses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {courses.length === 0 ? 'No courses available' : 'No matching courses found'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCourses.map((course) => (
                    <label key={course.id} className="flex items-center p-3 bg-white rounded hover:bg-blue-50 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={selectedCourses.has(course.id)}
                        onChange={() => handleCourseToggle(course.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        disabled={submitting}
                      />
                      <div className="ml-3 flex-1">
                        <div className="font-medium text-gray-900">{course.code}</div>
                        <div className="text-sm text-gray-600">{course.title}</div>
                      </div>
                      {selectedCourses.has(course.id) && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Count */}
            {selectedCourses.size > 0 && (
              <p className="text-sm text-blue-600 mt-3 font-medium">
                {selectedCourses.size} course{selectedCourses.size !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={submitting || loading}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Announcement
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
