import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, ClipboardList, FileText, Camera, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ObeRequestsPage from '../iqac/ObeRequestsPage';
import ObeEditRequestsPage from '../hod/ObeEditRequestsPage';
import ApplicationsInboxPage from '../applications/ApplicationsInboxPage';
import ApprovalInboxPage from '../Academic 2.1/admin/ApprovalInboxPage';
import { fetchApplicationsNav } from '../../services/applications';

type RequestsPageProps = {
  user?: any | null;
};

type RequestLink = {
  key: string;
  title: string;
  description: string;
  to: string;
  icon: React.ComponentType<any>;
};

export default function RequestsPage({ user }: RequestsPageProps) {
  const [searchParams] = useSearchParams();
  const roles = ((user?.roles || []) as string[]).map((r) => String(r || '').toUpperCase());
  const perms = ((user?.permissions || []) as string[]).map((p) => String(p || '').toLowerCase());
  const section = String(searchParams.get('section') || '').toLowerCase();
  const [canSeeApplicationsInbox, setCanSeeApplicationsInbox] = React.useState(false);

  // PERMISSION-BASED ONLY: Staff approvals require explicit permission
  const canSeeStaffApprovals = perms.includes('staff_requests.approve_requests');
  const canSeeAttendanceRequests =
    roles.includes('HOD') ||
    roles.includes('IQAC') ||
    perms.includes('academics.view_all_attendance') ||
    perms.includes('academics.view_attendance_overall') ||
    perms.includes('academics.view_all_departments') ||
    perms.includes('academics.view_department_attendance') ||
    perms.includes('academics.view_class_attendance') ||
    perms.includes('academics.view_section_attendance');
  const canSeeObeMasterRequests = perms.includes('obe.master_obe_requests');
  const canSeeHodObeRequests = perms.includes('obe.hod_obe_requests');
  const canSeeProfileImageUnlockRequests = perms.includes('accounts.profile_image_unlock_approve');
  const canSeeAc21Approvals = roles.includes('IQAC') || roles.includes('HOD') || roles.includes('ADMIN');

  React.useEffect(() => {
    let mounted = true;
    const isSecurity = roles.includes('SECURITY');

    (async () => {
      try {
        const nav = await fetchApplicationsNav();
        if (!mounted) return;
        const hasInboxRole =
          Boolean(nav?.show_applications) &&
          ((nav?.staff_roles?.length || 0) > 0 || (nav?.override_roles?.length || 0) > 0);
        setCanSeeApplicationsInbox(!isSecurity && hasInboxRole);
      } catch {
        if (!mounted) return;
        setCanSeeApplicationsInbox(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [roles]);

  const links: RequestLink[] = [];

  if (canSeeStaffApprovals) {
    links.push({
      key: 'staff-approvals',
      title: 'Staff Request Approvals',
      description: 'Review and act on staff requests pending your approval.',
      to: '/staff-requests/pending-approvals',
      icon: ClipboardList,
    });
  }

  if (canSeeAttendanceRequests) {
    links.push({
      key: 'attendance-requests',
      title: 'Attendance Unlock Requests',
      description: 'Handle attendance analytics unlock and correction requests.',
      to: '/attendance-analytics/requests',
      icon: Bell,
    });
  }

  if (canSeeObeMasterRequests) {
    links.push({
      key: 'obe-master-requests',
      title: 'OBE: Master Requests',
      description: 'Review and process OBE master-level requests.',
      to: '/requests?section=obe-master-requests',
      icon: FileText,
    });
  }

  if (canSeeHodObeRequests) {
    links.push({
      key: 'obe-hod-requests',
      title: 'HOD: OBE Requests',
      description: 'Review and process HOD-level OBE requests.',
      to: '/requests?section=obe-hod-requests',
      icon: FileText,
    });
  }

  if (canSeeProfileImageUnlockRequests) {
    links.push({
      key: 'profile-image-unlock-requests',
      title: 'Profile Image Unlock Requests',
      description: 'Approve requests to unlock one-time profile image update.',
      to: '/requests/profile-image-update',
      icon: Camera,
    });
  }

  if (canSeeApplicationsInbox) {
    links.push({
      key: 'applications-inbox',
      title: 'Approvals Inbox',
      description: 'Review and process application approvals assigned to you.',
      to: '/requests?section=applications-inbox',
      icon: ClipboardList,
    });
  }

  if (canSeeAc21Approvals) {
    links.push({
      key: 'ac21-approvals',
      title: 'AC 2.1: Pending Approvals',
      description: 'Review faculty edit requests for Academic 2.1 mark entry.',
      to: '/requests?section=ac21-approvals',
      icon: ClipboardList,
    });
  }

  const showObeMasterSection = section === 'obe-master-requests' && canSeeObeMasterRequests;
  const showObeHodSection = section === 'obe-hod-requests' && canSeeHodObeRequests;
  const showApplicationsInboxSection = section === 'applications-inbox' && canSeeApplicationsInbox;
  const showAc21ApprovalsSection = section === 'ac21-approvals' && canSeeAc21Approvals;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {(showObeMasterSection || showObeHodSection || showApplicationsInboxSection) && (
          <div className="mb-4">
            <Link
              to="/requests"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Requests Hub
            </Link>
          </div>
        )}
        {showAc21ApprovalsSection && (
          <div className="mb-4">
            <Link
              to="/requests"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Requests Hub
            </Link>
          </div>
        )}

        <div className="mb-6 flex gap-3 items-center">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm text-white">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">Requests Hub</h1>
            <p className="mt-1 text-sm sm:text-base text-slate-500 font-medium">
              Access all request workflows available for your permissions.
            </p>
          </div>
        </div>

        {showObeMasterSection ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <ObeRequestsPage />
          </div>
        ) : null}

        {showObeHodSection ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <ObeEditRequestsPage />
          </div>
        ) : null}

        {showApplicationsInboxSection ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <ApplicationsInboxPage />
          </div>
        ) : null}

        {showAc21ApprovalsSection ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <ApprovalInboxPage />
          </div>
        ) : null}

        {!showObeMasterSection && !showObeHodSection && !showApplicationsInboxSection && !showAc21ApprovalsSection && links.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 shadow-sm">
            <Bell className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700">No Request Workflows</h3>
            <p className="mt-1">You do not have permission to access request workflows.</p>
          </div>
        ) : null}

        {!showObeMasterSection && !showObeHodSection && !showApplicationsInboxSection && !showAc21ApprovalsSection && links.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {links.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className="group bg-white border border-slate-200 hover:border-indigo-200 hover:shadow-md rounded-2xl p-6 transition-all duration-200 flex flex-col h-full"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-indigo-100 transition-transform duration-200">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                        {item.title}
                      </h2>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium mt-auto group-hover:text-slate-700">
                    {item.description}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
