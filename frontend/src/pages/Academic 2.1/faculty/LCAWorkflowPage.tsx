import React, { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { BookOpen, ClipboardList, FileSpreadsheet, Target, GraduationCap } from 'lucide-react';

import CDAPPage from '../../lca/CDAPPage';
import LCAPage from '../../lca/LCAPage';
import ArticulationMatrixPage from '../../lca/ArticulationMatrixPage';
import COTargetPage from '../../lca/COTargetPage';

type TabKey = 'instructions' | 'lca' | 'cdap' | 'articulation' | 'cotarget';

const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentType<any> }> = [
  { key: 'instructions', label: 'LCA Instruction', icon: ClipboardList },
  { key: 'lca', label: 'LCA', icon: GraduationCap },
  { key: 'cdap', label: 'CDAP', icon: FileSpreadsheet },
  { key: 'articulation', label: 'Articulation Matrix', icon: BookOpen },
  { key: 'cotarget', label: 'CO Target', icon: Target },
];

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function LCAWorkflowPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('instructions');

  const courseName = useMemo(() => {
    const fromState = (location.state as any)?.courseName || '';
    const fromQuery = new URLSearchParams(location.search).get('name') || '';
    return fromState || fromQuery || courseId || 'Selected course';
  }, [courseId, location.search, location.state]);

  const courseCode = useMemo(() => courseId || '', [courseId]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">Academic 2.1</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">LCA Workflow</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                The Academic 2.1 LCA module now mirrors the full legacy flow with the same instruction, assessment, CDAP, articulation, and CO target logic while using the current Academic 2.1 experience.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Course</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{courseCode}</div>
              <div className="text-sm text-slate-600">{courseName}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'instructions' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="LCA Instruction Overview"
              description="Use this module to map the learner profile, align instruction emphasis, and prepare the delivery plan with the same logic used in the legacy academics flow."
            >
              <div className="space-y-3 text-sm text-slate-600">
                <p>1. Identify the learner profile and supporting prerequisite pattern for the cohort.</p>
                <p>2. Complete the LCA worksheet to derive the learner-centric level and teaching emphasis.</p>
                <p>3. Move to CDAP, then generate the articulation matrix and CO targets using the same saved revision data.</p>
              </div>
            </SectionCard>

            <SectionCard
              title="Recommended Instruction Distribution"
              description="This is a starting reference for the in-course planning matrix and assessment spread."
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Learner Profile</th>
                      <th className="px-4 py-3 text-left font-semibold">IL-1</th>
                      <th className="px-4 py-3 text-left font-semibold">IL-2</th>
                      <th className="px-4 py-3 text-left font-semibold">IL-3</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    <tr>
                      <td className="px-4 py-3">L1</td>
                      <td className="px-4 py-3">60%</td>
                      <td className="px-4 py-3">30%</td>
                      <td className="px-4 py-3">10%</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">L2</td>
                      <td className="px-4 py-3">30%</td>
                      <td className="px-4 py-3">50%</td>
                      <td className="px-4 py-3">20%</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">L3</td>
                      <td className="px-4 py-3">10%</td>
                      <td className="px-4 py-3">40%</td>
                      <td className="px-4 py-3">50%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === 'lca' && (
          <SectionCard
            title="LCA"
            description="The full learner-centric worksheet remains intact with the same calculations, save behavior, publish flow, and lock handling as the legacy module."
          >
            <LCAPage embedded={true} courseId={courseCode} courseCode={courseCode} courseName={courseName} />
          </SectionCard>
        )}

        {activeTab === 'cdap' && (
          <SectionCard
            title="CDAP"
            description="This tab reuses the established CDAP editor and uploader so the active learning and assessment definitions continue to sync with the same backend revision model."
          >
            <CDAPPage courseId={courseCode} showHeader={false} showCourseInput={false} />
          </SectionCard>
        )}

        {activeTab === 'articulation' && (
          <SectionCard
            title="Articulation Matrix"
            description="The matrix is generated from the saved CDAP revision and follows the original source-of-truth logic used by the legacy academics implementation."
          >
            <ArticulationMatrixPage embedded={true} courseId={courseCode} />
          </SectionCard>
        )}

        {activeTab === 'cotarget' && (
          <SectionCard
            title="CO Target"
            description="CO target planning remains tied to the same learner level and articulation-based weighting flow used in the older academics experience."
          >
            <COTargetPage embedded={true} courseCode={courseCode} courseName={courseName} />
          </SectionCard>
        )}
      </div>
    </div>
  );
}
