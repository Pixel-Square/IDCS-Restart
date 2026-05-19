import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Camera, Phone, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

interface RequirementsConfig {
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  has_profile_photo: boolean;
  has_mobile_number: boolean;
}

interface Props {
  /** If provided, the page auto-loads from the API. Pass null to use externalConfig. */
  externalConfig?: RequirementsConfig | null;
  /** Called when all requirements are met and the user presses "Continue" */
  onAllMet?: () => void;
}

function PulsingDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
    </span>
  );
}

function RequirementRow({
  icon: Icon,
  title,
  description,
  met,
  actionLabel,
  onAction,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  met: boolean;
  actionLabel?: string;
  onAction?: () => void;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={`transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <div className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-colors ${
        met
          ? 'border-green-200 bg-green-50'
          : 'border-orange-200 bg-orange-50'
      }`}>
        <div className={`mt-0.5 p-2.5 rounded-xl flex-shrink-0 ${met ? 'bg-green-100' : 'bg-orange-100'}`}>
          <Icon size={20} className={met ? 'text-green-600' : 'text-orange-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-semibold text-sm ${met ? 'text-green-800' : 'text-orange-800'}`}>{title}</p>
            {met ? (
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
            ) : (
              <PulsingDot />
            )}
          </div>
          <p className={`text-xs mt-0.5 ${met ? 'text-green-600' : 'text-orange-600'}`}>{description}</p>
          {!met && actionLabel && onAction && (
            <button
              onClick={onAction}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-700 underline underline-offset-2 hover:text-orange-900 transition-colors"
            >
              {actionLabel} <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * RequirementsPage — animated gate page shown when student has unmet requirements.
 * Used for My Marks feature (and can be reused for others).
 */
export default function RequirementsPage({ externalConfig, onAllMet }: Props) {
  const [config, setConfig] = useState<RequirementsConfig | null>(externalConfig ?? null);
  const [loading, setLoading] = useState(!externalConfig);
  const [logoVisible, setLogoVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (externalConfig !== undefined) {
      setConfig(externalConfig);
      setLoading(false);
      return;
    }
    // Auto-fetch from API
    import('../../services/fetchAuth').then(({ default: fetchWithAuth }) => {
      fetchWithAuth('/api/academic-v2/student/my-marks-config/')
        .then((r) => r.json())
        .then((d) => setConfig(d))
        .catch(() => setConfig(null))
        .finally(() => setLoading(false));
    });
  }, [externalConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-400">
        <ShieldAlert size={48} strokeWidth={1.2} />
        <p className="font-medium">Unable to load requirements.</p>
      </div>
    );
  }

  if (!config.viewing_enabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className={`transition-all duration-700 ${logoVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={36} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">My Marks Unavailable</h2>
          <p className="text-gray-500 text-sm max-w-xs">
            The My Marks feature is currently disabled by your institution.
            Please check back later.
          </p>
        </div>
      </div>
    );
  }

  const requirements: Array<{
    key: string;
    icon: React.ElementType;
    title: string;
    description: string;
    required: boolean;
    met: boolean;
    actionLabel: string;
    actionPath: string;
  }> = [
    {
      key: 'photo',
      icon: Camera,
      title: 'Profile Photo',
      description: 'A profile photo is required to access your marks.',
      required: config.require_profile_photo,
      met: config.has_profile_photo,
      actionLabel: 'Upload profile photo',
      actionPath: '/profile',
    },
    {
      key: 'mobile',
      icon: Phone,
      title: 'Mobile Number',
      description: 'A verified mobile number is required to access your marks.',
      required: config.require_mobile_number,
      met: config.has_mobile_number,
      actionLabel: 'Add mobile number',
      actionPath: '/profile',
    },
  ].filter((r) => r.required);

  const allMet = requirements.every((r) => r.met);

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      {/* Header */}
      <div
        className={`text-center mb-8 transition-all duration-700 ${logoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
      >
        {/* Logo / Icon */}
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 shadow-lg ${
          allMet ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 'bg-gradient-to-br from-orange-400 to-red-500'
        }`}>
          <ShieldAlert size={36} className="text-white" />
        </div>

        <h1 className="text-2xl font-extrabold text-gray-800 mb-2">
          {allMet ? 'You\'re all set!' : 'Action Required'}
        </h1>
        <p className="text-gray-500 text-sm">
          {allMet
            ? 'All requirements are met. You can now view your marks.'
            : 'Complete the following steps to access My Marks.'}
        </p>
      </div>

      {/* Requirements list */}
      {requirements.length > 0 ? (
        <div className="flex flex-col gap-3 mb-8">
          {requirements.map((req, i) => (
            <RequirementRow
              key={req.key}
              icon={req.icon}
              title={req.title}
              description={req.description}
              met={req.met}
              actionLabel={req.met ? undefined : req.actionLabel}
              onAction={req.met ? undefined : () => navigate(req.actionPath)}
              delay={200 + i * 150}
            />
          ))}
        </div>
      ) : null}

      {/* CTA */}
      {allMet && (
        <div className={`transition-all duration-500 delay-500 ${logoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button
            onClick={() => {
              if (onAllMet) {
                onAllMet();
              } else {
                navigate('/academic-v2/student/courses');
              }
            }}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-indigo-200 hover:shadow-xl transition-all active:scale-95"
          >
            Continue to My Marks →
          </button>
        </div>
      )}
    </div>
  );
}
