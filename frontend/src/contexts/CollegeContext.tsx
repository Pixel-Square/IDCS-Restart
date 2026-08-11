import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface CollegeInfo {
  id: number
  code: string
  name: string
  short_name: string
  logo?: string
  city?: string
}

interface CollegeContextValue {
  /** All colleges the user can access. */
  colleges: CollegeInfo[]
  /** Currently selected college, or null if none selected / global mode. */
  selectedCollege: CollegeInfo | null
  /** Switch to a different college. Persists to localStorage. */
  setSelectedCollege: (college: CollegeInfo | null) => void
}

const CollegeContext = createContext<CollegeContextValue>({
  colleges: [],
  selectedCollege: null,
  setSelectedCollege: () => {},
})

/** localStorage key for persisting the selected college id. */
const STORAGE_KEY = 'selectedCollegeId'

export function CollegeProvider({
  children,
  userCollege,
  allColleges,
}: {
  children: React.ReactNode
  /** The user's own college from /api/accounts/me/ */
  userCollege: CollegeInfo | null
  /** All active colleges (for super admins). For normal users, same as [userCollege]. */
  allColleges: CollegeInfo[]
}) {
  const [selectedCollege, setSelectedCollegeState] = useState<CollegeInfo | null>(null)
  const [initialized, setInitialized] = useState(false)

  // On first load, pick the persisted college or fall back to the user's own college.
  useEffect(() => {
    if (initialized) return
    const storedId = window.localStorage.getItem(STORAGE_KEY)
    if (storedId) {
      const id = parseInt(storedId, 10)
      const match = allColleges.find((c) => c.id === id)
      if (match) {
        setSelectedCollegeState(match)
        setInitialized(true)
        return
      }
    }
    // Fallback: use the user's own college, or the first available.
    if (userCollege) {
      setSelectedCollegeState(userCollege)
    } else if (allColleges.length > 0) {
      setSelectedCollegeState(allColleges[0])
    }
    setInitialized(true)
  }, [initialized, userCollege, allColleges])

  const setSelectedCollege = useCallback((college: CollegeInfo | null) => {
    setSelectedCollegeState(college)
    if (college) {
      window.localStorage.setItem(STORAGE_KEY, String(college.id))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return (
    <CollegeContext.Provider
      value={{
        colleges: allColleges,
        selectedCollege,
        setSelectedCollege,
      }}
    >
      {children}
    </CollegeContext.Provider>
  )
}

/** Hook: read the current college context. */
export function useCollege(): CollegeContextValue {
  return useContext(CollegeContext)
}

/** Hook: resolve the college-prefixed path for navigation. */
export function useCollegePath() {
  const { selectedCollege } = useCollege()
  return useCallback(
    (path: string) => {
      if (!selectedCollege) return path
      return `/colleges/${selectedCollege.id}${path.startsWith('/') ? path : `/${path}`}`
    },
    [selectedCollege],
  )
}
