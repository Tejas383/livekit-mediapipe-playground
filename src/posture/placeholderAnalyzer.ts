import type { PostureAnalyzer } from './types'

/** Default until your team's engine is plugged in: never emits anything. */
export function createPlaceholderAnalyzer(): PostureAnalyzer {
  return { analyze: () => [] }
}
