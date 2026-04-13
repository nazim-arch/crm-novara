// app/intentradar/generate/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CITIES = ['Bangalore', 'Mumbai', 'Delhi-NCR', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Ahmedabad', 'Goa'];

const MICRO_MARKETS: Record<string, string[]> = {
  'Bangalore': ['Indiranagar', 'Koramangala', 'HSR Layout', 'Whitefield', 'Sarjapur Road', 'Hebbal', 'Yelahanka', 'Electronic City', 'JP Nagar', 'Bannerghatta Road', 'Marathahalli', 'KR Puram'],
  'Mumbai': ['Andheri', 'Bandra', 'Thane', 'Powai', 'Worli', 'Goregaon', 'Mulund', 'Navi Mumbai', 'Panvel', 'Chembur'],
  'Delhi-NCR': ['Gurgaon', 'Noida', 'Greater Noida', 'Dwarka', 'Faridabad', 'Ghaziabad', 'Golf Course Road', 'Sohna Road'],
  'Hyderabad': ['Gachibowli', 'HITEC City', 'Kondapur', 'Banjara Hills', 'Jubilee Hills', 'Miyapur', 'Kompally', 'Shamshabad'],
  'Pune': ['Hinjewadi', 'Wakad', 'Baner', 'Kharadi', 'Viman Nagar', 'Koregaon Park', 'Hadapsar', 'PCMC'],
  'Chennai': ['OMR', 'ECR', 'Anna Nagar', 'Adyar', 'Velachery', 'Porur', 'Sholinganallur', 'Tambaram'],
  'Kolkata': ['Salt Lake', 'Rajarhat', 'New Town', 'Alipore', 'EM Bypass', 'Howrah', 'Garia'],
  'Ahmedabad': ['SG Highway', 'Satellite', 'Prahlad Nagar', 'Bopal', 'South Bopal', 'Shela', 'Vastrapur'],
  'Goa': ['Panjim', 'Mapusa', 'Margao', 'Calangute', 'Anjuna', 'Porvorim', 'Assagao'],
};

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
const SOURCES = [
  { id: 'youtube', label: 'YouTube', icon: '🎬', desc: 'Comment monitoring on property channels' },
  { id: 'reddit', label: 'Reddit', icon: '💬', desc: 'r/IndianRealEstate, city subreddits' },
  { id: 'google_maps', label: 'Google Maps', icon: '📍', desc: 'Reviews on project locations' },
  { id: 'instagram', label: 'Instagram', icon: '📸', desc: 'Public posts via SerpAPI (optional key)' },
  { id: 'facebook', label: 'Facebook Groups', icon: '👥', desc: 'Public group posts via SerpAPI (optional key)' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', desc: 'Relocation & job-change posts via SerpAPI (optional key)' },
  { id: 'twitter', label: 'Twitter/X', icon: '🐦', desc: 'Relocation & property discussions' },
  { id: 'telegram', label: 'Telegram', icon: '✈️', desc: 'Public real estate groups' },
  { id: '99acres', label: '99acres', icon: '🏢', desc: 'Buyer forums & want-ads' },
  { id: 'magicbricks', label: 'MagicBricks', icon: '🧱', desc: 'Listings & reviews' },
];

export default function GenerateLeadsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [city, setCity] = useState('');
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [bhkConfig, setBhkConfig] = useState('');
  const [personas, setPersonas] = useState<string[]>([]);
  const [urgency, setUrgency] = useState('exploring');
  const [selectedSources, setSelectedSources] = useState<string[]>(['youtube', 'reddit', 'google_maps']);
  const [keywords, setKeywords] = useState('');

  const toggleMarket = (m: string) => {
    setSelectedMarkets(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };
  const togglePersona = (p: string) => {
    setPersonas(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };
  const toggleSource = (s: string) => {
    setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const canGenerate = city && selectedMarkets.length > 0 && budgetMin && budgetMax && selectedSources.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setProgress('Initializing campaign...');

    try {
      setProgress('Scanning sources for buyer signals...');

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
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      setProgress(`Found ${data.summary.totalLeads} leads! Redirecting...`);

      // Navigate to leads page with campaign ID
      setTimeout(() => {
        router.push(`/intentradar/leads?campaignId=${data.campaignId}`);
      }, 1500);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const markets = MICRO_MARKETS[city] || [];

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
      <Section title="City" required>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CITIES.map(c => (
            <Chip key={c} selected={city === c} onClick={() => { setCity(c); setSelectedMarkets([]); }}>{c}</Chip>
          ))}
        </div>
      </Section>

      {/* ── MICRO-MARKETS ── */}
      {city && (
        <Section title="Micro-Markets" required subtitle="Select target localities">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {markets.map(m => (
              <Chip key={m} selected={selectedMarkets.includes(m)} onClick={() => toggleMarket(m)}>{m}</Chip>
            ))}
          </div>
          {selectedMarkets.length > 0 && (
            <p style={{ fontSize: 12, color: '#4338ca', marginTop: 8, fontWeight: 600 }}>
              Selected: {selectedMarkets.join(', ')}
            </p>
          )}
        </Section>
      )}

      {/* ── BUDGET ── */}
      <Section title="Budget Range (in Crores)" required>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="number" step="0.5" min="0" placeholder="Min (e.g., 1.5)"
            value={budgetMin} onChange={e => setBudgetMin(e.target.value)}
            style={inputStyle}
          />
          <span style={{ color: '#a8a29e', fontWeight: 600 }}>to</span>
          <input
            type="number" step="0.5" min="0" placeholder="Max (e.g., 3)"
            value={budgetMax} onChange={e => setBudgetMax(e.target.value)}
            style={inputStyle}
          />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {SOURCES.map(s => (
            <div key={s.id} onClick={() => toggleSource(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 10, border: `1px solid ${selectedSources.includes(s.id) ? '#4338ca' : '#e7e5e4'}`,
              background: selectedSources.includes(s.id) ? '#eef2ff' : 'white', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: selectedSources.includes(s.id) ? '#4338ca' : '#1c1917' }}>{s.label}</div>
                <div style={{ fontSize: 10, color: '#a8a29e' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── CUSTOM KEYWORDS ── */}
      <Section title="Custom Keywords" subtitle="Optional — comma separated additional search terms">
        <input
          type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
          placeholder="e.g., RERA approved, gated community, near metro, east facing"
          style={{ ...inputStyle, width: '100%' }}
        />
      </Section>

      {/* ── GENERATE BUTTON ── */}
      <div style={{ marginTop: 32, textAlign: 'center' }}>
        {loading ? (
          <div style={{ padding: 40 }}>
            <div style={{ width: 48, height: 48, margin: '0 auto 16px', border: '4px solid #eef2ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#4338ca', marginBottom: 4 }}>{progress}</p>
            <p style={{ fontSize: 12, color: '#a8a29e' }}>This may take 1-2 minutes depending on sources selected</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                padding: '16px 48px', borderRadius: 12, border: 'none',
                background: canGenerate ? 'linear-gradient(135deg, #4338ca, #6366f1)' : '#e7e5e4',
                color: canGenerate ? 'white' : '#a8a29e',
                fontWeight: 800, fontSize: 16, cursor: canGenerate ? 'pointer' : 'not-allowed',
                boxShadow: canGenerate ? '0 4px 14px rgba(67,56,202,0.3)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              🚀 Generate Leads
            </button>
            {!canGenerate && (
              <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>
                Please fill in: city, micro-markets, budget range, and select at least one source
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

// ─── Reusable Components ───

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
