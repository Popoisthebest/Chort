# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Vite development server
npm run build      # Production build
npm run preview    # Preview the production build locally
npm test           # Run tests in watch mode
npm run test:ci    # Run tests once
npm run lint       # Run ESLint
```

## Architecture Overview

**Chort** is a GitHub trending discovery app built with React + Vite + Firebase + GitHub API.

### Tech Stack
- React 19, react-router-dom (v7)
- Firebase (Auth with GitHub OAuth, Firestore for comments/replies)
- Tailwind CSS for styling
- Framer Motion, Lucide React icons
- DOMPurify for XSS protection

### Directory Structure
```
src/
├── api/           # External services (firebase.js, github.js)
├── components/    # UI components (Card, Feed, Layout, Comments)
├── hooks/         # Custom hooks (useFeed.js)
├── pages/         # Route pages (Home, Login, Explore, Saved, Profile)
├── utils/         # Helpers (algorithm.js, userProfile.js, normalizers.js, formatters.js)
└── App.jsx        # Router + auth state management
```

### Key Flows

**Authentication**
- GitHub OAuth via Firebase popup login
- Access token stored in memory + sessionStorage (uid-bound) for GitHub API calls
- Token cleared on logout; profile cached in sessionStorage

**Feed System (useFeed hook)**
- Fetches trending repos from GitHub API in batches (3 pages × 4 rounds)
- Deduplicates against `seenIds` (localStorage, max 500)
- Ranks repos via `algorithm.js` (trending score × language/topic boost × seen penalty)
- Infinite scroll via IntersectionObserver

**Personalization**
- User profile stored in localStorage (`chort_user_profile`)
- Tracks: languages, topics, starred repos, skip count
- View dwell time recorded via IntersectionObserver (<800ms = skip, else view)

**Caching**
- GitHub API responses cached in memory + sessionStorage with TTLs:
  - Search: 5min, README: 30min, Translate: 6hr, Default: 10min
- Inflight request deduplication prevents duplicate fetches

**Comments (Firestore)**
- Nested structure: `comments/{id}/replies`
- Firestore reads are query-limited and indexed for repo/user comment views
- Owner validation on delete (client + Firestore rules)
- Comment count cached in sessionStorage (2min TTL)

### Security Notes
- DOMPurify sanitizes rendered README HTML (OWASP-compliant)
- GitHub token is session-scoped with uid-binding to reduce persistent-token exposure
- Firebase App Check can be enabled with `REACT_APP_FIREBASE_APPCHECK_SITE_KEY`
- Error messages from APIs are not exposed to users (logged only)
- `dangerouslySetInnerHTML` only used after DOMPurify sanitization
