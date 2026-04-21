// app/intentradar/generate/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Source definitions with free flag ────────────────────────────────────────
const SOURCE_GROUPS = [
  {
    label: 'AI-Generated Signals (uses your OpenAI key)',
    sources: [
      { id: 'openai_generate', label: 'OpenAI Lead Gen', icon: '🤖', desc: 'GPT-4o generates realistic buyer signals from your criteria', free: false, freeNote: 'OpenAI key' },
    ],
  },
  {
    label: 'Open APIs (no paid subscription needed)',
    sources: [
      { id: 'youtube', label: 'YouTube', icon: '🎬', desc: 'Property walkthrough comments', free: true, freeNote: 'Free API key (10k req/day)' },
      { id: 'reddit', label: 'Reddit', icon: '💬', desc: 'r/IndianRealEstate + city subreddits', free: true, freeNote: 'No key needed' },
    ],
  },
  {
    label: 'Social Media (requires SerpAPI key)',
    sources: [
      { id: 'instagram', label: 'Instagram', icon: '📸', desc: 'Builder & influencer posts', free: false, freeNote: 'SerpAPI ~$50/mo' },
      { id: 'facebook', label: 'Facebook Groups', icon: '👥', desc: 'NRI & local buyer groups', free: false, freeNote: 'SerpAPI ~$50/mo' },
      { id: 'linkedin', label: 'LinkedIn', icon: '💼', desc: 'Job relocations & NRI return signals', free: false, freeNote: 'SerpAPI ~$50/mo' },
    ],
  },
  {
    label: 'Maps & Reviews (requires Google Places API key)',
    sources: [
      { id: 'google_maps', label: 'Google Maps', icon: '📍', desc: 'Project & broker reviews', free: false, freeNote: 'Google Places ($200 free credit/mo)' },
    ],
  },
  {
    label: 'Messaging (requires Telegram Bot Token)',
    sources: [
      { id: 'telegram', label: 'Telegram', icon: '✈️', desc: 'Public real estate groups', free: false, freeNote: 'Free Bot Token' },
    ],
  },
  {
    label: 'Forums & Q&A (requires SerpAPI key)',
    sources: [
      { id: 'quora', label: 'Quora', icon: '❓', desc: 'Property buying & NRI Q&A threads', free: false, freeNote: 'SerpAPI ~$50/mo' },
      { id: 'portal_forums', label: 'Portal Forums', icon: '🏢', desc: '99acres, NoBroker, Housing', free: false, freeNote: 'SerpAPI ~$50/mo' },
      { id: 'financial_forums', label: 'Financial Forums', icon: '🏦', desc: 'BankBazaar, Paisabazaar home loan queries', free: false, freeNote: 'SerpAPI ~$50/mo' },
      { id: 'news', label: 'Property News', icon: '📰', desc: 'ET Realty, MoneyControl, Mint, TOI', free: false, freeNote: 'SerpAPI ~$50/mo' },
    ],
  },
];

const FREE_SOURCE_IDS = SOURCE_GROUPS.flatMap(g => g.sources).filter(s => s.free).map(s => s.id);

const PROPERTY_TYPES = ['Apartment', 'Villa', 'Plot', 'Penthouse', 'Row House', 'Commercial'];
const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK'];
const BUYER_PERSONAS = [
  { id: 'end_user', label: 'End Users (IT professionals, families)', icon: '👨‍👩‍👧' },
  { id: 'nri', label: 'NRI Buyers (US/UAE/UK/Singapore)', icon: '🌍' },
  { id: 'investor', label: 'Investors (rental yield, appreciation)', icon: '📈' },
  { id: 'upgrade_buyer', label: 'Upgrade Buyers (2BHK → 3BHK)', icon: '🏠' },
  { id: 'first_time', label: 'First-Time Buyers', icon: '🔑' },
];
const URGENCY_OPTIONS = [
  { id: 'immediate', label: 'Immediate (0-3 months)', color: '#ef4444' },
  { id: '6_months', label: '3-6 Months', color: '#f59e0b' },
  { id: 'exploring', label: 'Exploring (6+ months)', color: '#22c55e' },
];

// ─── Nominatim types ──────────────────────────────────────────────────────────
interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  address: Record<string, string>;
  type: string;
  class: string;
}

interface KeyAvailability {
  sources: Record<string, boolean>;
  ai: { claude: boolean; openai: boolean };
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GenerateLeadsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keyAvail, setKeyAvail] = useState<KeyAvailability | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  // Form state
  const [city, setCity] = useState('');
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [bhkConfig, setBhkConfig] = useState('');
  const [personas, setPersonas] = useState<string[]>([]);
  const [urgency, setUrgency] = useState('exploring');
  const [freeOnly, setFreeOnly] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');

  const ALL_SOURCE_IDS = SOURCE_GROUPS.flatMap(g => g.sources).map(s => s.id);

  // Fetch which API keys are configured; auto-select available sources
  useEffect(() => {
    fetch('/api/intentradar/available-sources')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: KeyAvailability) => {
        setKeyAvail(data);
        // Auto-select all sources that have keys configured
        const available = Object.entries(data.sources).filter(([, ok]) => ok).map(([id]) => id);
        setSelectedSources(available.length > 0 ? available : ALL_SOURCE_IDS);
      })
      .catch(() => {
        // Fallback: select all sources — scrapers will skip ones without keys at runtime
        setSelectedSources(ALL_SOURCE_IDS);
      });
  }, []);

  const togglePersona = (p: string) => setPersonas(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleSource = (s: string) => {
    const available = keyAvail?.sources[s] ?? true;
    if (!available) return; // can't select sources without keys
    setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };
  const removeMarket = (m: string) => setSelectedMarkets(prev => prev.filter(x => x !== m));

  // When free-only toggled on, keep only free sources selected
  const handleFreeOnly = (on: boolean) => {
    setFreeOnly(on);
    if (on) setSelectedSources(prev => prev.filter(id => FREE_SOURCE_IDS.includes(id)));
    else {
      // Re-select all available sources
      if (keyAvail) {
        const available = Object.entries(keyAvail.sources).filter(([, ok]) => ok).map(([id]) => id);
        setSelectedSources(available);
      }
    }
  };

  const visibleGroups = freeOnly
    ? SOURCE_GROUPS.map(g => ({ ...g, sources: g.sources.filter(s => s.free) })).filter(g => g.sources.length > 0)
    : SOURCE_GROUPS;

  const canGenerate = city && selectedMarkets.length > 0 && budgetMin && budgetMax && selectedSources.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setProgress('Queuing campaign...');
    setProgressDetail('');

    try {
      const res = await fetch('/api/intentradar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          microMarkets: selectedMarkets,
          budgetMin: parseFloat(budgetMin),
          budgetMax: parseFloat(budgetMax),
          propertyType,
          bhkConfig: bhkConfig || null,
          buyerPersonas: personas,
          urgency,
          sources: selectedSources,
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to queue generation');
      }

      const { campaignId } = await res.json();
      setActiveCampaignId(campaignId);
      setProgress('Scanning sources for buyer signals...');
      setProgressDetail('This runs in the background — typically 2-5 minutes');

      const POLL_INTERVAL = 5000;
      const MAX_WAIT_MS = 10 * 60 * 1000;
      const startedAt = Date.now();

      const poll = async (): Promise<void> => {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          router.push(`/intentradar/leads?campaignId=${campaignId}`);
          return;
        }
        const statusRes = await fetch(`/api/intentradar/generate/status?campaignId=${campaignId}`);
        const { campaign } = await statusRes.json();
        if (campaign.status === 'completed') {
          setProgress(`Found ${campaign.totalLeads} leads! Redirecting...`);
          setProgressDetail(`${campaign.hotLeads} HOT · ${campaign.warmLeads} WARM · ${campaign.coolLeads} COOL`);
          setTimeout(() => router.push(`/intentradar/leads?campaignId=${campaignId}`), 1500);
          return;
        }
        if (campaign.status === 'failed') {
          const msg = campaign.errorMessage
            ? `Generation failed: ${campaign.errorMessage}`
            : 'Lead generation failed — check Vercel logs for details.';
          throw new Error(msg);
        }
        if (campaign.status === 'running') {
          setProgress('Scanning sources for buyer signals...');
          setProgressDetail(`Running for ${Math.round((Date.now() - startedAt) / 1000)}s…`);
        }
        setTimeout(poll, POLL_INTERVAL);
      };

      setTimeout(poll, POLL_INTERVAL);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeCampaignId || stopping) return;
    setStopping(true);
    try {
      await fetch('/api/intentradar/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: activeCampaignId }),
      });
      // Poll will detect 'completed' on next tick and redirect
    } catch {
      setStopping(false);
    }
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, #4338ca, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 18 }}>IR</div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1c1917' }}>Generate Leads</h1>
          <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>Define your criteria and scan all sources for buyer intent signals</p>
        </div>
      </div>

      {/* ── CITY ── */}
      <Section title="City" required subtitle="Search any city in India or worldwide">
        <CitySearch value={city} onChange={(c) => { setCity(c); setSelectedMarkets([]); }} />
      </Section>

      {/* ── MICRO-MARKETS ── */}
      <Section title="Micro-Markets" required subtitle="Search and add any localities, neighbourhoods, or areas">
        <MarketTagInput
          city={city}
          selected={selectedMarkets}
          onAdd={(m) => setSelectedMarkets(prev => prev.includes(m) ? prev : [...prev, m])}
          onRemove={removeMarket}
        />
      </Section>

      {/* ── BUDGET ── */}
      <Section title="Budget Range (in Crores)" required>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="number" step="0.5" min="0" placeholder="Min (e.g., 1.5)"
            value={budgetMin} onChange={e => setBudgetMin(e.target.value)} style={inputStyle} />
          <span style={{ color: '#a8a29e', fontWeight: 600 }}>to</span>
          <input type="number" step="0.5" min="0" placeholder="Max (e.g., 3)"
            value={budgetMax} onChange={e => setBudgetMax(e.target.value)} style={inputStyle} />
          <span style={{ color: '#a8a29e', fontSize: 13 }}>Cr</span>
        </div>
      </Section>

      {/* ── PROPERTY TYPE & BHK ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section title="Property Type" required>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PROPERTY_TYPES.map(t => (
              <Chip key={t} selected={propertyType === t} onClick={() => setPropertyType(t)}>{t}</Chip>
            ))}
          </div>
        </Section>
        <Section title="Configuration">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BHK_OPTIONS.map(b => (
              <Chip key={b} selected={bhkConfig === b} onClick={() => setBhkConfig(bhkConfig === b ? '' : b)}>{b}</Chip>
            ))}
          </div>
        </Section>
      </div>

      {/* ── BUYER PERSONAS ── */}
      <Section title="Target Buyer Personas" subtitle="Select all that apply">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {BUYER_PERSONAS.map(p => (
            <div key={p.id} onClick={() => togglePersona(p.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
              borderRadius: 10, border: `1px solid ${personas.includes(p.id) ? '#4338ca' : '#e7e5e4'}`,
              background: personas.includes(p.id) ? '#eef2ff' : 'white', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 20 }}>{p.icon}</span>
              <span style={{ fontSize: 13, fontWeight: personas.includes(p.id) ? 700 : 500, color: personas.includes(p.id) ? '#4338ca' : '#57534e' }}>{p.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── URGENCY ── */}
      <Section title="Buyer Urgency" subtitle="What timeline are you targeting?">
        <div style={{ display: 'flex', gap: 10 }}>
          {URGENCY_OPTIONS.map(u => (
            <div key={u.id} onClick={() => setUrgency(u.id)} style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
              border: `2px solid ${urgency === u.id ? u.color : '#e7e5e4'}`,
              background: urgency === u.id ? `${u.color}10` : 'white',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: urgency === u.id ? u.color : '#78716c' }}>{u.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── SOURCES ── */}
      <Section title="Signal Sources" required subtitle="Select platforms to scan">
        {/* Free-only toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 10, background: freeOnly ? '#f0fdf4' : '#fafaf9',
          border: `1px solid ${freeOnly ? '#86efac' : '#e7e5e4'}`, marginBottom: 14, cursor: 'pointer',
        }} onClick={() => handleFreeOnly(!freeOnly)}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: freeOnly ? '#15803d' : '#1c1917' }}>
              🆓 Free APIs Only
            </span>
            <span style={{ fontSize: 11, color: '#a8a29e', marginLeft: 8 }}>
              Use only YouTube & Reddit — no paid subscriptions needed
            </span>
          </div>
          <div style={{
            width: 40, height: 22, borderRadius: 11, background: freeOnly ? '#22c55e' : '#d1d5db',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute', top: 3, left: freeOnly ? 21 : 3,
              width: 16, height: 16, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </div>

        {/* AI provider availability banner */}
        {keyAvail && (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: '#78716c', alignSelf: 'center', fontWeight: 600 }}>AI insights:</span>
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
              background: keyAvail.ai.claude ? '#dcfce7' : '#fef2f2',
              color: keyAvail.ai.claude ? '#15803d' : '#dc2626',
            }}>
              {keyAvail.ai.claude ? '✓' : '✗'} Claude
            </span>
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
              background: keyAvail.ai.openai ? '#dcfce7' : '#fef2f2',
              color: keyAvail.ai.openai ? '#15803d' : '#dc2626',
            }}>
              {keyAvail.ai.openai ? '✓' : '✗'} GPT-4o
            </span>
            {!keyAvail.ai.claude && !keyAvail.ai.openai && (
              <span style={{ fontSize: 11, color: '#f59e0b' }}>No AI keys — rule-based scoring only</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {visibleGroups.map(group => (
            <div key={group.label}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{group.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {group.sources.map(s => {
                  const hasKey = keyAvail?.sources[s.id] ?? true;
                  const selected = selectedSources.includes(s.id);
                  return (
                    <div key={s.id} onClick={() => toggleSource(s.id)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                      borderRadius: 10, border: `1px solid ${selected ? '#4338ca' : hasKey ? '#e7e5e4' : '#fecaca'}`,
                      background: selected ? '#eef2ff' : hasKey ? 'white' : '#fff5f5',
                      cursor: hasKey ? 'pointer' : 'not-allowed', position: 'relative',
                      opacity: hasKey ? 1 : 0.6,
                    }}>
                      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? '#4338ca' : hasKey ? '#1c1917' : '#78716c' }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 1 }}>{s.desc}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          <div style={{
                            display: 'inline-block', fontSize: 9, fontWeight: 700,
                            padding: '2px 6px', borderRadius: 4,
                            background: s.free ? '#dcfce7' : '#fef9c3', color: s.free ? '#15803d' : '#854d0e',
                          }}>
                            {s.freeNote}
                          </div>
                          {keyAvail && (
                            <div style={{
                              display: 'inline-block', fontSize: 9, fontWeight: 700,
                              padding: '2px 6px', borderRadius: 4,
                              background: hasKey ? '#f0fdf4' : '#fef2f2',
                              color: hasKey ? '#15803d' : '#dc2626',
                            }}>
                              {hasKey ? '✓ Key ready' : '✗ No key'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── CUSTOM KEYWORDS ── */}
      <Section title="Custom Keywords" subtitle="Optional — comma separated additional search terms">
        <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
          placeholder="e.g., RERA approved, gated community, near metro, east facing"
          style={{ ...inputStyle, width: '100%' }} />
      </Section>

      {/* ── GENERATE BUTTON ── */}
      <div style={{ marginTop: 32, textAlign: 'center' }}>
        {loading ? (
          <div style={{ padding: 40 }}>
            <div style={{ width: 48, height: 48, margin: '0 auto 16px', border: '4px solid #eef2ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#4338ca', marginBottom: 4 }}>{progress}</p>
            <p style={{ fontSize: 12, color: '#a8a29e' }}>{progressDetail || 'Starting up…'}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {activeCampaignId && (
              <button
                onClick={handleStop}
                disabled={stopping}
                style={{
                  marginTop: 20, padding: '8px 24px', borderRadius: 8, border: '1px solid #fca5a5',
                  background: stopping ? '#fef2f2' : 'white', color: stopping ? '#a8a29e' : '#dc2626',
                  fontSize: 13, fontWeight: 600, cursor: stopping ? 'not-allowed' : 'pointer',
                }}
              >
                {stopping ? 'Stopping…' : '⏹ Stop & Save Results'}
              </button>
            )}
          </div>
        ) : (
          <>
            <button onClick={handleGenerate} disabled={!canGenerate} style={{
              padding: '16px 48px', borderRadius: 12, border: 'none',
              background: canGenerate ? 'linear-gradient(135deg, #4338ca, #6366f1)' : '#e7e5e4',
              color: canGenerate ? 'white' : '#a8a29e',
              fontWeight: 800, fontSize: 16, cursor: canGenerate ? 'pointer' : 'not-allowed',
              boxShadow: canGenerate ? '0 4px 14px rgba(67,56,202,0.3)' : 'none', transition: 'all 0.2s',
            }}>
              🚀 Generate Leads
            </button>
            {!canGenerate && (
              <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>
                Please fill in: city, at least one micro-market, budget range, and select at least one source
              </p>
            )}
          </>
        )}
        {error && (
          <div style={{ marginTop: 16, padding: '12px 20px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── City Autocomplete ────────────────────────────────────────────────────────
function CitySearch({ value, onChange }: { value: string; onChange: (city: string) => void }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&featuretype=city&accept-language=en`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Novara-CRM/1.0' } });
        const data: NominatimResult[] = await res.json();
        // Filter to city/town/village type results
        const cities = data.filter(r => ['city', 'town', 'village', 'administrative'].includes(r.type) || r.class === 'place');
        setSuggestions(cities.slice(0, 6));
        setOpen(cities.length > 0);
      } catch { /* silently fail */ }
    }, 350);
  }, []);

  const handleInput = (q: string) => { setQuery(q); onChange(q); search(q); };
  const select = (r: NominatimResult) => {
    const cityName = r.address?.city || r.address?.town || r.address?.village || r.name;
    setQuery(cityName);
    onChange(cityName);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', maxWidth: 360 }}>
      <input
        type="text"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Type any city (e.g., Pune, Bangalore, Hyderabad…)"
        style={{ ...inputStyle, width: '100%' }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'white', border: '1px solid #e7e5e4', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
        }}>
          {suggestions.map(r => {
            const cityName = r.address?.city || r.address?.town || r.address?.village || r.name;
            const country = r.address?.country || '';
            const state = r.address?.state || '';
            return (
              <div key={r.place_id} onMouseDown={() => select(r)} style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f5f4',
                fontSize: 13, display: 'flex', flexDirection: 'column', gap: 1,
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                <span style={{ fontWeight: 600, color: '#1c1917' }}>📍 {cityName}</span>
                <span style={{ fontSize: 11, color: '#a8a29e' }}>{[state, country].filter(Boolean).join(', ')}</span>
              </div>
            );
          })}
        </div>
      )}
      {value && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#4338ca', fontWeight: 600 }}>
          ✓ City: {value}
        </div>
      )}
    </div>
  );
}

// ─── Micro-Market Tag Input with Nominatim ────────────────────────────────────
function MarketTagInput({ city, selected, onAdd, onRemove }: {
  city: string;
  selected: string[];
  onAdd: (market: string) => void;
  onRemove: (market: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const cityQuery = city ? `${q}, ${city}` : q;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityQuery)}&format=json&addressdetails=1&limit=8&accept-language=en`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Novara-CRM/1.0' } });
        const data: NominatimResult[] = await res.json();
        setSuggestions(data.slice(0, 7));
        setOpen(data.length > 0);
      } catch { /* silently fail */ }
    }, 350);
  }, [city]);

  const handleInput = (q: string) => { setQuery(q); search(q); };

  const getMarketName = (r: NominatimResult): string => {
    return (
      r.address?.suburb ||
      r.address?.neighbourhood ||
      r.address?.quarter ||
      r.address?.village ||
      r.address?.town ||
      r.name
    );
  };

  const select = (r: NominatimResult) => {
    const name = getMarketName(r);
    if (name) { onAdd(name); setQuery(''); setSuggestions([]); setOpen(false); inputRef.current?.focus(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && query.trim()) {
      e.preventDefault();
      onAdd(query.trim());
      setQuery('');
      setSuggestions([]);
      setOpen(false);
    }
    if (e.key === 'Backspace' && !query && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Tag + input box */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
          borderRadius: 8, border: '1px solid #e7e5e4', background: '#fafaf9',
          minHeight: 44, cursor: 'text',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map(m => (
          <span key={m} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6, background: '#4338ca', color: 'white',
            fontSize: 12, fontWeight: 600,
          }}>
            {m}
            <button
              onMouseDown={e => { e.stopPropagation(); onRemove(m); }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={selected.length === 0 ? (city ? `Search localities in ${city}…` : 'Search any locality or neighbourhood…') : ''}
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            fontSize: 13, flex: '1 0 160px', minWidth: 140, padding: '2px 4px',
          }}
        />
      </div>

      <p style={{ fontSize: 11, color: '#a8a29e', marginTop: 4 }}>
        Search and select · or type any name and press <kbd style={{ fontSize: 10, background: '#f5f5f4', padding: '1px 5px', borderRadius: 4, border: '1px solid #e7e5e4' }}>Enter</kbd> to add custom location
      </p>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'white', border: '1px solid #e7e5e4', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
        }}>
          {suggestions.map(r => {
            const name = getMarketName(r);
            const context = [r.address?.city, r.address?.town, r.address?.state].filter(Boolean).join(', ');
            const alreadyAdded = selected.includes(name);
            return (
              <div key={r.place_id} onMouseDown={() => !alreadyAdded && select(r)} style={{
                padding: '9px 14px', cursor: alreadyAdded ? 'default' : 'pointer',
                borderBottom: '1px solid #f5f5f4', fontSize: 13,
                opacity: alreadyAdded ? 0.5 : 1,
              }}
                onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = '#f5f3ff'; }}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                <span style={{ fontWeight: 600, color: '#1c1917' }}>📍 {name}</span>
                {alreadyAdded && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 6 }}>✓ Added</span>}
                {context && <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 1 }}>{context}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reusable Components ──────────────────────────────────────────────────────
function Section({ title, subtitle, required, children }: { title: string; subtitle?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1c1917' }}>{title}</span>
        {required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        {subtitle && <span style={{ fontSize: 12, color: '#a8a29e', marginLeft: 8 }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 8, border: `1px solid ${selected ? '#4338ca' : '#e7e5e4'}`,
      background: selected ? '#4338ca' : 'white', color: selected ? 'white' : '#57534e',
      fontSize: 13, fontWeight: selected ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8, border: '1px solid #e7e5e4',
  fontSize: 14, background: '#fafaf9', outline: 'none', flex: 1,
};
