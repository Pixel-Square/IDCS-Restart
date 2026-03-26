import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	fetchApplicationsNav,
	fetchApproverInbox,
	fetchPastApprovals,
	submitApplicationAction,
	ApplicationsNavResponse,
	ApproverInboxItem,
	PastApprovalItem,
} from '../../services/applications'
import { Check, Clock, Eye, History, X } from 'lucide-react'

function stateBadgeClass(state: string): string {
	switch ((state || '').toUpperCase()) {
		case 'APPROVED':
			return 'bg-green-100 text-green-700 border-green-200'
		case 'REJECTED':
			return 'bg-red-100 text-red-700 border-red-200'
		case 'IN_REVIEW':
		case 'SUBMITTED':
			return 'bg-indigo-100 text-indigo-700 border-indigo-200'
		default:
			return 'bg-gray-100 text-gray-700 border-gray-200'
	}
}

function kindBadge(kind?: 'STUDENT' | 'STAFF' | null): { label: string; className: string } | null {
	if (kind === 'STUDENT') {
		return { label: 'Student', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
	}
	if (kind === 'STAFF') {
		return { label: 'Staff', className: 'bg-amber-50 text-amber-700 border-amber-200' }
	}
	return null
}

type Props = {
	isSubComponent?: boolean
}

export default function ApplicationsInboxPage({ isSubComponent = false }: Props): JSX.Element {
	const navigate = useNavigate()

	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [nav, setNav] = useState<ApplicationsNavResponse | null>(null)

	const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')

	const [pending, setPending] = useState<ApproverInboxItem[]>([])
	const [history, setHistory] = useState<PastApprovalItem[]>([])
	const [historyLoading, setHistoryLoading] = useState(false)

	const [actingOn, setActingOn] = useState<number | null>(null)

	const roleSummary = useMemo(() => {
		const codes = (nav?.staff_roles || []).map((r) => r.code).filter(Boolean)
		const override = (nav?.override_roles || []).filter(Boolean)
		return Array.from(new Set([...codes, ...override])).join(', ')
	}, [nav])

	const loadPending = async () => {
		setLoading(true)
		setError(null)
		try {
			const [navRes, inboxRes] = await Promise.all([
				fetchApplicationsNav(),
				fetchApproverInbox().catch(() => [] as ApproverInboxItem[]),
			])
			setNav(navRes)
			setPending(navRes.show_applications ? inboxRes : [])
		} catch (e: any) {
			setError(e?.message || 'Failed to load applications inbox.')
		} finally {
			setLoading(false)
		}
	}

	const loadHistory = async () => {
		setHistoryLoading(true)
		try {
			const data = await fetchPastApprovals()
			setHistory(data)
		} catch (e: any) {
			// Keep history as-is; show pending UX normally.
		} finally {
			setHistoryLoading(false)
		}
	}

	useEffect(() => {
		loadPending()
	}, [])

	useEffect(() => {
		if (activeTab === 'history' && history.length === 0 && !historyLoading) {
			loadHistory()
		}
	}, [activeTab])

	const handleAction = async (applicationId: number, action: 'FORWARD' | 'REJECT') => {
		const ok = window.confirm(`Are you sure you want to ${action === 'FORWARD' ? 'Accept' : 'Reject'} this application?`)
		if (!ok) return

		setActingOn(applicationId)
		try {
			await submitApplicationAction(applicationId, action, '')
			await loadPending()
			if (history.length > 0) {
				await loadHistory()
			}
		} catch (e: any) {
			alert(e?.message || 'Action failed.')
		} finally {
			setActingOn(null)
		}
	}

	const WrapperTag = (isSubComponent ? 'div' : 'main') as any
	const wrapperClass = isSubComponent ? '' : 'min-h-screen bg-gray-50 p-4 md:p-6'

	if (loading && pending.length === 0) {
		return (
			<WrapperTag className={wrapperClass}>
				<div className="max-w-6xl mx-auto">
					<div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
						<div className="h-4 bg-gray-200 rounded w-1/3" />
						<div className="h-3 bg-gray-200 rounded w-2/3 mt-3" />
						<div className="h-3 bg-gray-200 rounded w-1/2 mt-2" />
					</div>
				</div>
			</WrapperTag>
		)
	}

	return (
		<WrapperTag className={wrapperClass}>
			<div className={isSubComponent ? 'space-y-4' : 'max-w-6xl mx-auto space-y-6'}>
				{!isSubComponent && (
					<div className="flex items-center justify-between flex-wrap gap-4">
						<div>
							<h1 className="text-2xl font-bold text-gray-900">Approvals Inbox</h1>
							<p className="text-sm text-gray-500 mt-1">Accept, reject, or view assigned applications.</p>
						</div>
						<button
							onClick={() => navigate('/applications')}
							className="text-sm px-4 py-2 bg-white border border-gray-200 rounded-lg text-indigo-600 hover:bg-gray-50 font-medium"
						>
							My Applications →
						</button>
					</div>
				)}

				{error ? (
					<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
				) : null}

				{!nav?.show_applications ? (
					<div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
						You do not currently have any approval roles configured.
					</div>
				) : (
					<div className="space-y-4">
						<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-2">
							<div className="flex p-1 bg-gray-100 rounded-lg">
								<button
									onClick={() => setActiveTab('pending')}
									className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
										activeTab === 'pending'
											? 'bg-white text-indigo-700 border border-gray-200'
											: 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
									}`}
								>
									<Clock className="w-4 h-4" />
									Pending
									{pending.length > 0 && (
										<span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] text-indigo-700 font-bold">
											{pending.length}
										</span>
									)}
								</button>
								<button
									onClick={() => setActiveTab('history')}
									className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
										activeTab === 'history'
											? 'bg-white text-indigo-700 border border-gray-200'
											: 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
									}`}
								>
									<History className="w-4 h-4" />
									History
								</button>
							</div>

							<div className="px-3 text-xs text-gray-500 flex items-center gap-3">
								<span className="font-medium text-gray-700">{nav.staff_department?.name || '—'}</span>
								<span className="h-3.5 w-px bg-gray-300" />
								<span className="font-medium text-gray-700">{roleSummary || '—'}</span>
							</div>
						</div>

						<div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
							{activeTab === 'pending' && (
								<>
									{pending.length === 0 ? (
										<div className="flex flex-col items-center justify-center p-12 text-gray-500">
											<div className="rounded-full bg-gray-50 p-4 mb-3">
												<Clock className="h-8 w-8 text-gray-400" />
											</div>
											<p className="text-sm font-medium text-gray-600">No pending approvals</p>
										</div>
									) : (
										<div className="divide-y divide-gray-100">
											{pending.map((row) => (
												<div
													key={row.application_id}
													className="p-4 sm:p-5 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-4"
												>
													<div className="flex items-center gap-4 flex-1 min-w-0">
														<div className="shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full overflow-hidden bg-gray-200 border border-gray-200">
															{row.applicant_profile_image ? (
																<img src={row.applicant_profile_image} alt="" className="h-full w-full object-cover" />
															) : (
																<div className="h-full w-full flex items-center justify-center text-gray-400 font-semibold">
																	{(row.applicant_name || '?').charAt(0).toUpperCase()}
																</div>
															)}
														</div>

														<div className="min-w-0">
															<div className="flex items-center gap-2 flex-wrap">
																<h4 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
																	{row.applicant_name || '—'}
																</h4>
																{(() => {
																	const b = kindBadge(row.applicant_kind)
																	if (!b) return null
																	return (
																		<span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${b.className}`}>
																			{b.label}
																		</span>
																	)
																})()}
																<span
																	className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stateBadgeClass(
																		row.current_state,
																	)}`}
																>
																	{row.current_state}
																</span>
															</div>

															<div className="text-[11px] text-gray-500 mt-1 truncate">
																Pending at <span className="text-indigo-700 font-medium">{row.current_step_role || '—'}</span>
															</div>
														</div>
													</div>

													<div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto shrink-0 border-t border-gray-100 sm:border-0 pt-3 sm:pt-0">
														<button
															disabled={actingOn === row.application_id}
															onClick={() => handleAction(row.application_id, 'FORWARD')}
															className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-green-700 bg-green-50 border border-green-100 hover:bg-green-100 disabled:opacity-50"
														>
															{actingOn === row.application_id ? (
																<div className="w-4 h-4 border-2 border-green-500/30 border-t-green-600 rounded-full animate-spin" />
															) : (
																<Check className="w-4 h-4" />
															)}
															<span>Accept</span>
														</button>

														<button
															disabled={actingOn === row.application_id}
															onClick={() => handleAction(row.application_id, 'REJECT')}
															className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 border border-red-100 hover:bg-red-100 disabled:opacity-50"
														>
															<X className="w-4 h-4" />
															<span>Reject</span>
														</button>

														<button
															onClick={() => navigate(`/applications/${row.application_id}`)}
															className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
														>
															<Eye className="w-4 h-4 text-gray-400" />
															<span>View</span>
														</button>
													</div>
												</div>
											))}
										</div>
									)}
								</>
							)}

							{activeTab === 'history' && (
								<>
									{historyLoading ? (
										<div className="p-8 flex justify-center">
											<div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
										</div>
									) : history.length === 0 ? (
										<div className="flex flex-col items-center justify-center p-12 text-gray-500">
											<div className="rounded-full bg-gray-50 p-4 mb-3">
												<History className="h-8 w-8 text-gray-400" />
											</div>
											<p className="text-sm font-medium text-gray-600">No past approvals found</p>
										</div>
									) : (
										<div className="divide-y divide-gray-100">
											{history.map((row) => {
												const statusText = (row.decision || row.current_state || '').toString()
												const exited = !!row.gatepass_scanned_at
												const exitTime = row.gatepass_scanned_at
													? new Date(row.gatepass_scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
													: null
												return (
													<div
														key={row.application_id}
														className="p-4 sm:p-5 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-4"
													>
														<div className="flex items-center gap-4 flex-1 min-w-0">
															<div className="shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full overflow-hidden bg-gray-200 border border-gray-200">
																{row.applicant_profile_image ? (
																	<img src={row.applicant_profile_image} alt="" className="h-full w-full object-cover" />
																) : (
																	<div className="h-full w-full flex items-center justify-center text-gray-400 font-semibold">
																		{(row.applicant_name || '?').charAt(0).toUpperCase()}
																	</div>
																)}
															</div>

															<div className="min-w-0">
																<div className="flex items-center gap-2 flex-wrap">
																	<h4 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{row.applicant_name || '—'}</h4>
																	{(() => {
																		const b = kindBadge(row.applicant_kind)
																		if (!b) return null
																		return (
																			<span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${b.className}`}>
																				{b.label}
																			</span>
																		)
																	})()}
																	<span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stateBadgeClass(statusText)}`}>
																		{statusText}
																	</span>
																</div>
																{exited && (
																	<div className="text-[11px] text-green-700 mt-1 font-medium">Exited at {exitTime}</div>
																)}
															</div>
														</div>

														<div className="flex items-center justify-end gap-2 sm:w-auto w-full shrink-0 border-t border-gray-100 sm:border-0 pt-3 sm:pt-0">
															<button
																onClick={() => navigate(`/applications/${row.application_id}`)}
																className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
															>
																<Eye className="w-4 h-4 text-gray-400" />
																<span>View</span>
															</button>
														</div>
													</div>
												)
											})}
										</div>
									)}
								</>
							)}
						</div>
					</div>
				)}
			</div>
		</WrapperTag>
	)
}
