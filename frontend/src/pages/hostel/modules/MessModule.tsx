import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Loader2,
  Plus,
  Star,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import * as api from '../../../services/hostelOps';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SectionTitle,
  Spinner,
  btnPrimary,
  btnSecondary,
  cx,
  formatDate,
  inputClass,
  statusTone,
} from '../HostelUI';

const MEALS = [
  { key: 'BREAKFAST', label: 'Breakfast', time: '7:30 – 9:00 AM' },
  { key: 'LUNCH', label: 'Lunch', time: '12:30 – 2:00 PM' },
  { key: 'SNACKS', label: 'Snacks', time: '4:30 – 5:30 PM' },
  { key: 'DINNER', label: 'Dinner', time: '7:30 – 9:30 PM' },
];

const CATEGORIES = [
  { key: 'QUALITY', label: 'Quality' },
  { key: 'HYGIENE', label: 'Hygiene' },
  { key: 'QUANTITY', label: 'Quantity' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={cx(
            'rounded-md p-1 transition',
            star <= value ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400',
          )}
          aria-label={`${star} star`}
        >
          <Star className="h-6 w-6" fill={star <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
      <span className="ml-2 text-sm font-semibold text-gray-700">{value}/5</span>
    </div>
  );
}

export default function MessModule({ canManage }: { canManage: boolean }) {
  const [menus, setMenus] = useState<api.MessMenu[]>([]);
  const [bookings, setBookings] = useState<api.MealBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [feedback, setFeedback] = useState<api.MessFeedback[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [headcount, setHeadcount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuModal, setMenuModal] = useState(false);
  const [menuForm, setMenuForm] = useState({ day_of_week: 'MONDAY', meal_type: 'LUNCH', items: '' });
  const [rating, setRating] = useState(4);
  const [category, setCategory] = useState('QUALITY');
  const [comments, setComments] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [menuResponse, bookingResponse] = await Promise.all([
        canManage ? api.getMenus({ from: selectedDate, to: selectedDate }) : api.getMyMenus(7),
        api.getMealBookings({ from: selectedDate, to: selectedDate }),
      ]);
      const menuRows = Array.isArray(menuResponse) ? menuResponse : menuResponse.results;
      setMenus(menuRows);
      setBookings(bookingResponse.results || []);
      if (canManage) {
        const [feedbackResponse, feedbackSummary, counting] = await Promise.all([
          api.getMessFeedback({ date: selectedDate }),
          api.getMessFeedbackSummary(),
          api.getMealHeadcount(selectedDate),
        ]);
        setFeedback(feedbackResponse.results || []);
        setSummary(feedbackSummary);
        setHeadcount(counting);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load mess data.');
    } finally {
      setLoading(false);
    }
  }, [canManage, selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);
        return date;
      }),
    [],
  );

  const bookingFor = (meal: string) =>
    bookings.find((row) => row.date === selectedDate && row.meal_type === meal);

  const toggleMeal = async (meal: string) => {
    setSaving(true);
    setError('');
    try {
      const existing = bookingFor(meal);
      const saved = await api.setMealBooking({
        date: selectedDate,
        meal_type: meal,
        is_opted_in: existing ? !existing.is_opted_in : false,
      });
      setBookings((rows) => {
        const others = rows.filter((row) => !(row.date === selectedDate && row.meal_type === meal));
        return [...others, saved];
      });
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not update the meal preference.');
    } finally {
      setSaving(false);
    }
  };

  const submitFeedback = async () => {
    setSaving(true);
    setFeedbackMessage('');
    setError('');
    try {
      await api.submitMessFeedback({
        date: selectedDate,
        meal_type: 'LUNCH',
        rating,
        category,
        comments,
      });
      setFeedbackMessage('Thanks! Your feedback has been recorded.');
      setComments('');
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not submit feedback.');
    } finally {
      setSaving(false);
    }
  };

  const saveMenu = async () => {
    setSaving(true);
    setError('');
    try {
      await api.createMenu({
        date: selectedDate,
        day_of_week: menuForm.day_of_week as any,
        effective_date: selectedDate,
        meal_type: menuForm.meal_type as any,
        items: menuForm.items,
        menu_items: menuForm.items.split(',').map((item) => item.trim()).filter(Boolean),
        is_published: true,
      });
      setMenuModal(false);
      setMenuForm({ day_of_week: 'MONDAY', meal_type: 'LUNCH', items: '' });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save the menu.');
    } finally {
      setSaving(false);
    }
  };

  const removeMenu = async (id: number) => {
    if (!window.confirm('Remove this menu entry?')) return;
    setSaving(true);
    try {
      await api.deleteMenu(id);
      await load();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not remove the menu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Mess management"
        subtitle={canManage ? 'Weekly menus, headcounts and feedback insights.' : 'See what is cooking and tell us how it was.'}
        right={
          <div className="flex items-end gap-2">
            <Field label="Date" className="w-44">
              <input type="date" className={inputClass} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </Field>
            {canManage ? (
              <button type="button" className={btnPrimary} onClick={() => setMenuModal(true)}>
                <Plus className="h-4 w-4" /> Add menu
              </button>
            ) : null}
          </div>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      {canManage ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MEALS.map((meal) => (
            <Card key={meal.key} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{meal.label}</p>
                <Utensils className="h-4 w-4 text-blue-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{headcount?.counts?.[meal.key] ?? 0}</p>
              <p className="text-xs text-gray-500">opted in for {formatDate(selectedDate)}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">Meal preference for {formatDate(selectedDate)}</p>
              <p className="text-xs text-gray-500">Opt out to help us reduce food waste.</p>
            </div>
            <Badge tone="blue">{bookings.filter((row) => row.is_opted_in).length} of {MEALS.length} meals selected</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MEALS.map((meal) => {
              const booking = bookingFor(meal.key);
              const optedIn = booking ? booking.is_opted_in : true;
              return (
                <button
                  key={meal.key}
                  type="button"
                  onClick={() => toggleMeal(meal.key)}
                  disabled={saving}
                  className={cx(
                    'rounded-xl border p-3 text-left transition',
                    optedIn
                      ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">{meal.label}</span>
                    <span
                      className={cx(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full',
                        optedIn ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600',
                      )}
                    >
                      {optedIn ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{meal.time}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                    {optedIn ? 'Meal opted in' : 'Opted out'}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {loading ? (
        <Spinner label="Loading menus…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <SectionTitle title="Menu schedule" subtitle={canManage ? formatDate(selectedDate) : 'Next 7 days'} />
            {canManage ? (
              <div className="mt-4 space-y-3">
                {menus.length === 0 ? (
                  <EmptyState icon={Utensils} title="No menu published" message="Add a menu entry for this date." />
                ) : (
                  menus.map((menu) => (
                    <div key={menu.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="blue">{menu.meal_type_display || menu.meal_type}</Badge>
                          <span className="text-xs font-semibold text-gray-600">{menu.day_of_week_display || menu.day_of_week}</span>
                        </div>
                        <button type="button" className="text-red-500 hover:text-red-700" onClick={() => removeMenu(menu.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-gray-700">
                        {(menu.menu_items?.length ? menu.menu_items : menu.items.split(',')).join(' · ')}
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {weekDays.map((day) => {
                  const iso = day.toISOString().slice(0, 10);
                  const dayMenus = menus.filter((menu) => menu.date === iso);
                  return (
                    <div key={iso} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-blue-500" />
                        <p className="text-sm font-semibold text-gray-900">
                          {day.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                      {dayMenus.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-400">Menu not published yet.</p>
                      ) : (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {dayMenus.map((menu) => (
                            <div key={menu.id} className="rounded-lg bg-gray-50 p-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                                {menu.meal_type_display || menu.meal_type}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-700">
                                {(menu.menu_items?.length ? menu.menu_items : menu.items.split(',')).join(' · ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle title="Share feedback" subtitle="Help the mess committee improve." />
            <div className="mt-3 space-y-3">
              <Field label="Rating" required>
                <StarRating value={rating} onChange={setRating} />
              </Field>
              <Field label="Category">
                <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Comments">
                <textarea
                  className={cx(inputClass, 'min-h-[88px]')}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder="What worked well? What can improve?"
                />
              </Field>
              {feedbackMessage ? (
                <p className="rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">{feedbackMessage}</p>
              ) : null}
              <button type="button" className={btnPrimary} onClick={submitFeedback} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />} Submit feedback
              </button>
            </div>

            {canManage && summary ? (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">30-day feedback</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{summary.average_rating}/5</p>
                <div className="mt-2 space-y-1">
                  {summary.by_category?.map((row: any) => (
                    <div key={row.category} className="flex items-center justify-between text-xs text-gray-600">
                      <span>{row.category}</span>
                      <span className="font-semibold">{row.average} · {row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {canManage && feedback.length ? (
        <Card className="p-4">
          <SectionTitle title="Recent feedback" subtitle={formatDate(selectedDate)} />
          <div className="mt-3 space-y-2">
            {feedback.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-lg border border-gray-100 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {row.student_detail?.name || row.student_detail?.reg_no || 'Student'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(row.category)}>{row.category}</Badge>
                    <span className="text-xs font-semibold text-amber-600">{row.rating}/5</span>
                  </div>
                </div>
                {row.comments ? <p className="mt-1 text-xs text-gray-600">{row.comments}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Modal
        open={menuModal}
        title="Publish menu"
        onClose={() => setMenuModal(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setMenuModal(false)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={saveMenu} disabled={saving || !menuForm.items.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save menu
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day" required>
            <select
              className={inputClass}
              value={menuForm.day_of_week}
              onChange={(event) => setMenuForm({ ...menuForm, day_of_week: event.target.value })}
            >
              {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => (
                <option key={day} value={day}>{day.charAt(0) + day.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Meal" required>
            <select
              className={inputClass}
              value={menuForm.meal_type}
              onChange={(event) => setMenuForm({ ...menuForm, meal_type: event.target.value })}
            >
              {MEALS.map((meal) => (
                <option key={meal.key} value={meal.key}>{meal.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Menu items" required hint="Comma separated" className="sm:col-span-2">
            <textarea
              className={cx(inputClass, 'min-h-[100px]')}
              value={menuForm.items}
              onChange={(event) => setMenuForm({ ...menuForm, items: event.target.value })}
              placeholder="Rice, Dal, Paneer, Curd"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
