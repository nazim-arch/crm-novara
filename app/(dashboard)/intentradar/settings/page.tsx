// app/intentradar/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';

const API_KEY_FIELDS = [
  { key: 'api_key_youtube', label: 'YouTube Data API v3', category: 'api_keys', placeholder: 'AIzaSy...', required: true },
  { key: 'api_key_google_places', label: 'Google Places API', category: 'api_keys', placeholder: 'AIzaSy...', required: false },
  { key: 'api_key_reddit_client_id', label: 'Reddit Client ID', category: 'api_keys', placeholder: 'Your Reddit app client ID', required: true },
  { key: 'api_key_reddit_client_secret', label: 'Reddit Client Secret', category: 'api_keys', placeholder: 'Your Reddit app secret', required: true },
  { key: 'api_key_claude', label: 'Anthropic Claude API Key', category: 'api_keys', placeholder: 'sk-ant-...', required: true },
  { key: 'api_key_openai', label: 'OpenAI API Key', category: 'api_keys', placeholder: 'sk-...', required: true },
  { key: 'api_key_telegram_bot', label: 'Telegram Bot Token', category: 'api_keys', placeholder: '123456:ABC-DEF...', required: false },
  { key: 'api_key_twitter', label: 'Twitter/X Bearer Token', category: 'api_keys', placeholder: 'AAAA...', required: false },
  { key: 'api_key_meta', label: 'Meta Graph API Token', category: 'api_keys', placeholder: 'EAA...', required: false },
  { key: 'api_key_serp', label: 'SerpAPI Key', category: 'api_keys', placeholder: 'Enables Instagram, Facebook & LinkedIn signal search via Google', required: false },
  { key: 'api_key_hunter', label: 'Hunter.io API Key', category: 'api_keys', placeholder: 'For email enrichment', required: false },
];

export default function IntentRadarSettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/intentradar/settings')
      .then(r => r.json())
      .then(data => {
        const vals: Record<string, string> = {};
        for (const s of data.settings || []) {
          vals[s.key] = s.hasValue ? s.value : '';
        }
        setValues(vals);
        setLoaded(true);
      })
      .catch(e => {
        setError('Failed to load settings');
        setLoaded(true);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const settings = API_KEY_FIELDS.map(f => ({
        key: f.key,
        value: values[f.key] || '',
        category: f.category,
        encrypted: true,
      }));

      const res = await fetch('/api/intentradar/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (!res.ok) throw new Error('Failed to save');

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const configuredCount = API_KEY_FIELDS.filter(f => {
    const val = values[f.key];
    return val && val.length > 3 && !val.startsWith('***');
  }).length;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #4338ca, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 18 }}>IR</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1c1917' }}>IntentRadar Settings</h1>
            <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>Configure API keys for all signal sources</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <div style={{ height: 6, flex: 1, borderRadius: 3, background: '#f5f5f4', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(configuredCount / API_KEY_FIELDS.length) * 100}%`, background: configuredCount >= 4 ? '#22c55e' : '#f59e0b', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 12, color: '#78716c', fontWeight: 600 }}>{configuredCount}/{API_KEY_FIELDS.length} configured</span>
        </div>
      </div>

      {/* API Key Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {API_KEY_FIELDS.map(field => (
          <div key={field.key} style={{ background: 'white', borderRadius: 12, border: '1px solid #e7e5e4', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#1c1917' }}>
                {field.label}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {field.required && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fef2f2', color: '#ef4444' }}>REQUIRED</span>
                )}
                {values[field.key] && values[field.key].length > 3 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f0fdf4', color: '#22c55e' }}>✓ SET</span>
                )}
              </div>
            </div>
            <input
              type="password"
              value={values[field.key] || ''}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1px solid #e7e5e4', fontSize: 13,
                fontFamily: 'monospace', background: '#fafaf9',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.type = 'text'; }}
              onBlur={e => { e.target.type = 'password'; }}
            />
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 32px', borderRadius: 10, border: 'none',
            background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #4338ca, #6366f1)',
            color: 'white', fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
        {saved && <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 13 }}>✓ Settings saved successfully</span>}
        {error && <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
