// app/intentradar/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';

interface ApiKeyField {
  key: string;
  label: string;
  category: string;
  placeholder: string;
  required: boolean;
  note?: string;
}

// Actor config fields — stored as plain text, not encrypted
const ACTOR_FIELDS: ApiKeyField[] = [
  {
    key: 'actor_instagram_comments',
    label: 'Instagram Comment Scraper Actor ID',
    category: 'actors',
    placeholder: 'apify~instagram-scraper (default)',
    required: false,
    note: 'Apify actor used to extract commenters. Default: apify~instagram-scraper (built-in). To use a dedicated comment actor, find one at apify.com/store → search "instagram comments" and paste its ID here.',
  },
];

const API_KEY_GROUPS: { group: string; desc: string; fields: ApiKeyField[] }[] = [
  {
    group: 'AI & NLP',
    desc: 'Required for intent scoring and lead analysis',
    fields: [
      { key: 'api_key_claude', label: 'Anthropic Claude API Key', category: 'api_keys', placeholder: 'sk-ant-...', required: false },
      { key: 'api_key_openai', label: 'OpenAI API Key', category: 'api_keys', placeholder: 'sk-...', required: false },
    ],
  },
  {
    group: 'Always-Active Sources',
    desc: 'Core scrapers — work without SerpAPI',
    fields: [
      { key: 'api_key_youtube', label: 'YouTube Data API v3', category: 'api_keys', placeholder: 'AIzaSy...', required: false, note: 'console.cloud.google.com → Enable YouTube Data API v3' },
      { key: 'api_key_google_places', label: 'Google Places API', category: 'api_keys', placeholder: 'AIzaSy...', required: false, note: 'Same Google Cloud project — Enable Places API. $200 free credit/month' },
      { key: 'api_key_reddit_client_id', label: 'Reddit Client ID', category: 'api_keys', placeholder: 'Your Reddit app client ID', required: false, note: 'reddit.com/prefs/apps → Create script app' },
      { key: 'api_key_reddit_client_secret', label: 'Reddit Client Secret', category: 'api_keys', placeholder: 'Your Reddit app secret', required: false },
    ],
  },
  {
    group: 'SerpAPI (Instagram / Facebook / LinkedIn / Quora / News / Forums)',
    desc: 'One key unlocks 8 sources via Google search — serpapi.com (~$50/mo)',
    fields: [
      { key: 'api_key_serp', label: 'SerpAPI Key', category: 'api_keys', placeholder: 'serpapi.com → Dashboard → API Key', required: false },
    ],
  },
  {
    group: 'Apify (Deep Social Scraping)',
    desc: 'Full Facebook Group + Instagram comment scraping — more powerful than SerpAPI for social (~$49/mo)',
    fields: [
      { key: 'api_key_apify', label: 'Apify API Token', category: 'api_keys', placeholder: 'apify_api_...', required: false, note: 'console.apify.com → Settings → Integrations → API Token' },
    ],
  },
  {
    group: 'Telegram',
    desc: 'Monitor public real estate groups — free',
    fields: [
      { key: 'api_key_telegram_bot', label: 'Telegram Bot Token', category: 'api_keys', placeholder: '123456:ABC-DEF...', required: false, note: 'Telegram → @BotFather → /newbot. Then add the bot to your target groups.' },
    ],
  },
  {
    group: 'Twitter / X',
    desc: 'Relocation & property discussions — $100/mo Basic tier',
    fields: [
      { key: 'api_key_twitter', label: 'Twitter/X Bearer Token', category: 'api_keys', placeholder: 'AAAA...', required: false, note: 'developer.x.com → Apply for Basic access ($100/mo)' },
    ],
  },
  {
    group: 'Lead Enrichment',
    desc: 'Enrich HOT leads with contact info and income data',
    fields: [
      { key: 'api_key_proxycurl', label: 'Proxycurl API Key', category: 'api_keys', placeholder: 'nubela.co → Dashboard → API Key', required: false, note: 'LinkedIn profile enrichment — job title → income band estimation. $0.01/lookup, used only on HOT leads.' },
      { key: 'api_key_apollo', label: 'Apollo.io API Key', category: 'api_keys', placeholder: 'apollo.io → Settings → Integrations → API Key', required: false, note: 'Email + phone discovery from name + company. More India coverage than Hunter.io. $49/mo.' },
      { key: 'api_key_hunter', label: 'Hunter.io API Key', category: 'api_keys', placeholder: 'hunter.io → API → Key', required: false, note: 'Email discovery. 25 free lookups/month.' },
    ],
  },
  {
    group: 'HOT Lead Outreach',
    desc: 'WhatsApp automation for leads scoring 80+',
    fields: [
      { key: 'api_key_whatsapp', label: 'WhatsApp Business API Token', category: 'api_keys', placeholder: 'Gupshup / Wati / Twilio token', required: false, note: 'Indian providers: Gupshup (cheapest), Wati, or Twilio. ₹2,000–5,000/mo. Templates need pre-approval.' },
    ],
  },
  {
    group: 'Registration Data (Trust Differentiator)',
    desc: 'Real transaction prices vs marketed prices — the strongest trust signal with buyers',
    fields: [
      { key: 'api_key_propstack', label: 'PropStack API Key', category: 'api_keys', placeholder: 'propstack.com → API access', required: false, note: 'Actual Kaveri/IGR registered prices. Sharing real vs asking price makes you the most trusted voice.' },
    ],
  },
  {
    group: 'Meta Graph API',
    desc: 'For monitoring your own Instagram/Facebook business account comments',
    fields: [
      { key: 'api_key_meta', label: 'Meta Graph API Token', category: 'api_keys', placeholder: 'EAA...', required: false, note: 'developers.facebook.com → Business app. Monitors comments on YOUR own pages, not public search.' },
    ],
  },
];

const ALL_FIELDS = [...API_KEY_GROUPS.flatMap(g => g.fields), ...ACTOR_FIELDS];

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
      .catch(() => {
        setError('Failed to load settings');
        setLoaded(true);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const settings = ALL_FIELDS.map(f => ({
        key: f.key,
        value: values[f.key] || '',
        category: f.category,
        encrypted: f.category === 'api_keys',
      }));

      const res = await fetch('/api/intentradar/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (!res.ok) throw new Error('Failed to save');

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const configuredCount = ALL_FIELDS.filter(f => {
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
            <div style={{ height: '100%', width: `${(configuredCount / ALL_FIELDS.length) * 100}%`, background: configuredCount >= 4 ? '#22c55e' : '#f59e0b', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 12, color: '#78716c', fontWeight: 600 }}>{configuredCount}/{ALL_FIELDS.length} configured</span>
        </div>
      </div>

      {/* API Key Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {API_KEY_GROUPS.map(group => (
          <div key={group.group}>
            {/* Group Header */}
            <div style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', margin: 0 }}>{group.group}</h2>
              <p style={{ fontSize: 12, color: '#78716c', margin: '2px 0 0' }}>{group.desc}</p>
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.fields.map(field => (
                <div key={field.key} style={{ background: 'white', borderRadius: 12, border: '1px solid #e7e5e4', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>
                      {field.label}
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {field.required && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fef2f2', color: '#ef4444' }}>REQUIRED</span>
                      )}
                      {values[field.key] && values[field.key].length > 3 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f0fdf4', color: '#22c55e' }}>SET</span>
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
                  {field.note && (
                    <p style={{ fontSize: 11, color: '#a8a29e', margin: '6px 0 0', lineHeight: 1.5 }}>{field.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Apify Actor Configuration */}
      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', margin: 0 }}>Apify Actor Configuration</h2>
          <p style={{ fontSize: 12, color: '#78716c', margin: '2px 0 0' }}>Customize which Apify actors are used for scraping — find alternatives at apify.com/store</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACTOR_FIELDS.map(field => (
            <div key={field.key} style={{ background: 'white', borderRadius: 12, border: '1px solid #e7e5e4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>{field.label}</label>
                {values[field.key] && values[field.key].length > 3 && !values[field.key].startsWith('***') && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f0fdf4', color: '#22c55e' }}>SET</span>
                )}
              </div>
              <input
                type="text"
                value={values[field.key] || ''}
                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid #e7e5e4', fontSize: 13,
                  fontFamily: 'monospace', background: '#fafaf9',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {field.note && (
                <p style={{ fontSize: 11, color: '#a8a29e', margin: '6px 0 0', lineHeight: 1.5 }}>{field.note}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: 32, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving || !loaded}
          style={{
            padding: '12px 32px', borderRadius: 10, border: 'none',
            background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #4338ca, #6366f1)',
            color: 'white', fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
        {saved && <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 13 }}>Settings saved successfully</span>}
        {error && <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
