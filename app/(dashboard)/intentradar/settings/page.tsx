// app/(dashboard)/intentradar/settings/page.tsx
// API keys moved to Settings → API Keys (used across all AI features + IntentRadar).
// This route now redirects to the centralized location.
import { redirect } from 'next/navigation';

export default function IntentRadarSettingsRedirect() {
  redirect('/settings/api-keys');
}
