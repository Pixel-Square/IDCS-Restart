import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, KeyRound, Mail, Smartphone } from 'lucide-react'
import Navbar from '../../components/navigation/Navbar'
import {
  requestForgotPasswordOtp,
  resetForgottenPassword,
  verifyForgotPasswordOtp,
} from '../../services/auth'

type Method = 'email' | 'mobile'
type Step = 'request' | 'verify' | 'reset' | 'done'

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('request')
  const [method, setMethod] = useState<Method>('email')
  const [email, setEmail] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showMobileFallback, setShowMobileFallback] = useState(false)

  const targetLabel = useMemo(() => (method === 'email' ? 'Email' : 'Mobile Number'), [method])

  const targetValue = method === 'email' ? email.trim() : mobileNumber.trim()

  const extractApiError = (err: any): string => {
    const status = Number(err?.response?.status || 0)
    if (status === 404) {
      return 'Forgot-password API is not available on the server yet. Please contact admin to deploy latest backend.'
    }
    return String(err?.response?.data?.detail || err?.message || 'Request failed.')
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setShowMobileFallback(false)

    if (!targetValue) {
      setError(`${targetLabel} is required.`)
      return
    }

    setLoading(true)
    try {
      await requestForgotPasswordOtp(
        method === 'email'
          ? { method, email: targetValue }
          : { method, mobile_number: targetValue },
      )
      setInfo(`OTP sent to your ${targetLabel.toLowerCase()}.`)
      setStep('verify')
    } catch (err: any) {
      const status = Number(err?.response?.status || 0)
      if (method === 'email' && status === 502) {
        setMethod('mobile')
        setShowMobileFallback(true)
        setError('Email OTP service is currently unavailable. Please continue with Mobile OTP.')
      } else {
        setError(extractApiError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!otp.trim()) {
      setError('OTP is required.')
      return
    }

    setLoading(true)
    try {
      const data = await verifyForgotPasswordOtp(
        method === 'email'
          ? { method, otp: otp.trim(), email: targetValue }
          : { method, otp: otp.trim(), mobile_number: targetValue },
      )
      const token = String(data?.reset_token || '')
      if (!token) {
        throw new Error('Invalid reset token.')
      }
      setResetToken(token)
      setInfo('OTP verified. Set your new password.')
      setStep('reset')
    } catch (err: any) {
      setError(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!newPassword || !confirmPassword) {
      setError('Please enter and confirm your new password.')
      return
    }

    setLoading(true)
    try {
      await resetForgottenPassword(resetToken, newPassword, confirmPassword)
      setStep('done')
      setInfo('Password changed successfully. Please sign in with your new password.')
      setOtp('')
      setNewPassword('')
      setConfirmPassword('')
      setResetToken('')
    } catch (err: any) {
      setError(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar user={null} />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Forgot Password</h2>
              <p className="text-gray-600">Verify your identity with OTP and set a new password</p>
            </div>

            {step === 'request' && (
              <form className="space-y-6" onSubmit={handleSendOtp}>
                {showMobileFallback && method === 'mobile' && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Email OTP is temporarily down. Enter your registered mobile number and continue.
                  </div>
                )}
                <div>
                  <p className="block text-sm font-semibold text-gray-700 mb-3">Choose OTP Method</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setMethod('email')}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        method === 'email'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Mail className="h-4 w-4" /> Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setMethod('mobile')}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        method === 'mobile'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Smartphone className="h-4 w-4" /> Mobile
                    </button>
                  </div>
                </div>

                {method === 'email' ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="mobile_number">
                      Mobile Number
                    </label>
                    <input
                      id="mobile_number"
                      type="text"
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      placeholder="Enter your registered mobile"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            )}

            {step === 'verify' && (
              <form className="space-y-6" onSubmit={handleVerifyOtp}>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                  OTP has been sent to your {targetLabel.toLowerCase()}: <span className="font-semibold">{targetValue}</span>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="otp">
                    Enter OTP
                  </label>
                  <input
                    id="otp"
                    type="text"
                    className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    placeholder="Enter OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('request')
                      setOtp('')
                      setError(null)
                      setInfo(null)
                    }}
                    className="w-full bg-white text-gray-900 py-3 px-4 rounded-lg font-semibold border border-gray-300 hover:bg-gray-50"
                    disabled={loading}
                  >
                    Change Method
                  </button>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60"
                    disabled={loading}
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </div>
              </form>
            )}

            {step === 'reset' && (
              <form className="space-y-6" onSubmit={handleResetPassword}>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="new_password">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="new_password"
                      type="password"
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="confirm_password">
                    Confirm Password
                  </label>
                  <input
                    id="confirm_password"
                    type="password"
                    className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Change Password'}
                </button>
              </form>
            )}

            {step === 'done' && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-800">Password changed successfully.</p>
                </div>
                <Link
                  to="/login"
                  className="block w-full text-center bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700"
                >
                  Go to Login
                </Link>
              </div>
            )}

            {(error || info) && step !== 'done' && (
              <div className={`mt-6 rounded-lg p-4 flex items-start gap-3 ${error ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
                {error ? (
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                )}
                <p className={`text-sm ${error ? 'text-red-800' : 'text-blue-800'}`}>{error || info}</p>
              </div>
            )}

            {step !== 'done' && (
              <p className="mt-6 text-center text-sm text-gray-600">
                Remembered your password?{' '}
                <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">
                  Back to login
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
