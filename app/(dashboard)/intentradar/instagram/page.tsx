// app/intentradar/instagram/page.tsx
'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface InstagramResult {
  username: string;
  interaction: string;
  interactionType: 'comment' | 'post_owner';
  postUrl: string;
  postCaption: string;
  hashtag: string;
  timestamp: string;
}

interface MineResponse {
  results: InstagramResult[];
  hashtags: string[];
  listingTags: string[];
  buyerTags: string[];
  totalFound: number;
  postsScraped: number;
  commentCount: number;
  buyerPostCount: number;
  error?: string;
}

// ─── Client-side hashtag generator (mirrors server) ──────────────────────────
function generateHashtags(inputs: {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  customHashtags?: string[];
}): { listingTags: string[]; buyerTags: string[] } {
  const { city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig, customHashtags } = inputs;
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  const propSlug = propertyType.toLowerCase().replace(/[^a-z]/g, '');

  const listing = new Set<string>();
  const buyer = new Set<string>();

  listing.add(`${citySlug}realestate`);
  listing.add(`${citySlug}properties`);
  listing.add(`${citySlug}flats`);
  listing.add(`${citySlug}homes`);
  listing.add(`${citySlug}${propSlug}`);
  listing.add('indianrealestate');
  listing.add('readytomovein');
  listing.add(`newlaunch${citySlug}`);
  listing.add('reraapproved');

  for (const market of microMarkets.slice(0, 4)) {
    const mSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '');
    listing.add(`${mSlug}${propSlug}`);
    listing.add(`${citySlug}${mSlug}`);
  }

  if (bhkConfig) {
    const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
    listing.add(`${bhkSlug}${citySlug}`);
    listing.add(`${bhkSlug}forsale`);
  }

  if (budgetMin && budgetMax) {
    if (budgetMin < 100) {
      listing.add('affordablehousing');
      listing.add(`under${Math.round(budgetMax)}lakhs`);
    } else {
      listing.add('luxuryproperties');
      listing.add('premiumhomes');
    }
  }

  buyer.add('homehunting');
  buyer.add('househunting');
  buyer.add('lookingforhome');
  buyer.add('propertysearch');
  buyer.add('dreamhomesearch');
  buyer.add('firsthomebuyer');
  buyer.add('newhomesearch');
  buyer.add(`lookingfor${citySlug}home`);
  buyer.add(`wanttobuy${citySlug}`);
  buyer.add(`${citySlug}homesearch`);
  buyer.add(`${citySlug}propertysearch`);
  buyer.add('homeshopping');
  buyer.add('buyingahome');
  buyer.add(`${citySlug}firsthome`);

  if (bhkConfig) {
    const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
    buyer.add(`looking${bhkSlug}${citySlug}`);
  }

  if (customHashtags) {
    for (const tag of customHashtags) {
      listing.add(tag.replace(/^#/, '').replace(/\s/g, '').toLowerCase());
    }
  }

  return {
    listingTags: Array.from(listing).filter(Boolean).slice(0, 12),
    buyerTags: Array.from(buyer).filter(Boolean).slice(0, 12),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortcode(url: string): string {
  const m = url.match(/\/(p|reel)\/([^/?]+)/);
  return m ? `/${m[1]}/${m[2]}` : url.slice(-18);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const IG_GRADIENT = 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)';
const IG_ACCENT = '#e1306c';
const IG_PURPLE = '#833ab4';
const PROPERTY_TYPES = ['Apartment', 'Villa', 'Plot', 'Penthouse', 'Row House', 'Commercial'];
const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK'];
const RESULTS_LIMITS = [50, 100, 200, 500];
const STEPS = [
  '🔍 Generating listing + buyer-intent hashtags...',
  '📡 Scanning listing hashtags for posts to mine comments from...',
  '🛒 Scanning buyer-intent hashtags for direct buying signals...',
  '💬 Mining comments from listing posts — finding buyers...',
  '🧹 Deduplicating and ranking results by signal strength...',
];

// ─── Tag Input ────────────────────────────────────────────────────────────────
function TagInput({ tags, onAdd, onRemove, placeholder, accent }: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
  accent: string;
}) {
  const [input, setInput] = useState('');

  const commit = () => {
    const val = input.trim().replace(/,+$/, '');
    if (val) { onAdd(val); setInput(''); }
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
      background: 'rgba(255,255,255,0.05)', minHeight: 44, alignItems: 'center',
      cursor: 'text',
    }}>
      {tags.map(tag => (
        <span key={tag} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 20,
          background: accent + '25', color: accent,
          fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>
          {tag}
          <button
            type="button"
            onClick={() => onRemove(tag)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: accent, fontSize: 15, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}
          >×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          if (e.key === 'Backspace' && !input && tags.length > 0) onRemove(tags[tags.length - 1]);
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ border: 'none', outline: 'none', background: 'transparent', color: 'white', fontSize: 13, minWidth: 140, flex: 1 }}
      />
    </div>
  );
}

// ─── Label ────────────────────────────────────────────────────────────────────
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
      {children}
      {hint && <span style={{ fontWeight: 400, color: '#475569', marginLeft: 6 }}>{hint}</span>}
    </label>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InstagramMinerPage() {
  // Form
  const [city, setCity] = useState('');
  const [microMarkets, setMicroMarkets] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [bhk, setBhk] = useState<string | null>(null);
  const [customHashtags, setCustomHashtags] = useState<string[]>([]);
  const [manualUrls, setManualUrls] = useState('');
  const [resultsLimit, setResultsLimit] = useState(100);

  // UI
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<InstagramResult[] | null>(null);
  const [generatedListingTags, setGeneratedListingTags] = useState<string[]>([]);
  const [generatedBuyerTags, setGeneratedBuyerTags] = useState<string[]>([]);
  const [postsScraped, setPostsScraped] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [buyerPostCount, setBuyerPostCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live hashtag preview
  const { listingTags: previewListingTags, buyerTags: previewBuyerTags } = useMemo(() => {
    if (!city.trim()) return { listingTags: [], buyerTags: [] };
    return generateHashtags({
      city, microMarkets,
      budgetMin: Number(budgetMin) || 0,
      budgetMax: Number(budgetMax) || 0,
      propertyType,
      bhkConfig: bhk || undefined,
      customHashtags,
    });
  }, [city, microMarkets, budgetMin, budgetMax, propertyType, bhk, customHashtags]);

  const hasManualUrls = manualUrls.split('\n').map(u => u.trim()).some(Boolean);
  const hasHashtagInputs = !!city.trim() && microMarkets.length > 0 && !!budgetMin && !!budgetMax;
  const canStart = hasManualUrls || hasHashtagInputs;

  const handleMine = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    setStepIndex(0);

    let si = 0;
    stepTimer.current = setInterval(() => {
      si = Math.min(si + 1, STEPS.length - 1);
      setStepIndex(si);
    }, 18000);

    try {
      const res = await fetch('/api/intentradar/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          microMarkets,
          budgetMin: Number(budgetMin),
          budgetMax: Number(budgetMax),
          propertyType,
          bhkConfig: bhk || undefined,
          customHashtags,
          manualPostUrls: manualUrls.split('\n').map(u => u.trim()).filter(Boolean),
          resultsLimit,
        }),
      });

      const data: MineResponse = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Mining failed');

      setResults(data.results);
      setGeneratedListingTags(data.listingTags || []);
      setGeneratedBuyerTags(data.buyerTags || []);
      setPostsScraped(data.postsScraped);
      setCommentCount(data.commentCount || 0);
      setBuyerPostCount(data.buyerPostCount || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Mining failed');
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setLoading(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    const q = filter.toLowerCase();
    if (!q) return results;
    return results.filter(r =>
      r.username.toLowerCase().includes(q) ||
      r.interaction.toLowerCase().includes(q)
    );
  }, [results, filter]);

  const exportCSV = () => {
    if (!results) return;
    const header = 'Username,Interaction,Post URL,Timestamp,Signal Type';
    const rows = results.map(r =>
      `"@${r.username}","${r.interaction.replace(/"/g, '""')}","${r.postUrl}","${r.timestamp}","${r.interactionType}"`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyUsernames = () => {
    if (!results) return;
    navigator.clipboard.writeText(results.map(r => `@${r.username}`).join('\n'));
  };

  // ── Shared input style ──
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
    color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  const glassCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.1)',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        input::placeholder { color: #475569; }
        textarea::placeholder { color: #475569; }
        button:hover { opacity: 0.9; }
        a:hover { opacity: 0.85; }
      `}</style>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ borderRadius: 20, padding: '40px 32px', marginBottom: 28, textAlign: 'center', background: IG_GRADIENT, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)' }} />
          <div style={{ position: 'relative' }}>
            <Link href="/intentradar" style={{ position: 'absolute', left: 0, top: 0, color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              ← IntentRadar
            </Link>
            <div style={{ fontSize: 48, marginBottom: 10 }}>📸</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 8px', color: 'white' }}>Instagram Intent Miner</h1>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, margin: 0, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Find real buyers who commented on Instagram posts matching your real estate keywords
            </p>
          </div>
        </div>

        {/* ── Input Panel ──────────────────────────────────────────────────── */}
        <div style={{ ...glassCard, padding: '28px', marginBottom: 20 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 24px' }}>Search Criteria</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* City */}
            <div>
              <Label>City *</Label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Bangalore" style={inputStyle} />
            </div>

            {/* Results Limit */}
            <div>
              <Label>Results Limit</Label>
              <select
                value={resultsLimit}
                onChange={e => setResultsLimit(Number(e.target.value))}
                style={{ ...inputStyle, background: '#0f172a', cursor: 'pointer' }}
              >
                {RESULTS_LIMITS.map(l => <option key={l} value={l}>{l} results</option>)}
              </select>
            </div>

            {/* Micro-Markets */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Label hint="— press Enter or comma to add each area">Micro-Markets *</Label>
              <TagInput
                tags={microMarkets}
                onAdd={t => setMicroMarkets(m => m.includes(t) ? m : [...m, t])}
                onRemove={t => setMicroMarkets(m => m.filter(x => x !== t))}
                placeholder="e.g. Whitefield, Koramangala, Sarjapur..."
                accent={IG_ACCENT}
              />
            </div>

            {/* Budget Range */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Label>Budget Range (₹ Lakhs) *</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="number" value={budgetMin} onChange={e => setBudgetMin(e.target.value)} placeholder="Min" style={{ ...inputStyle, flex: 1 }} />
                <span style={{ color: '#475569', fontWeight: 600, flexShrink: 0 }}>to</span>
                <input type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="Max" style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>

            {/* Property Type */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Label>Property Type</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PROPERTY_TYPES.map(pt => (
                  <button key={pt} type="button" onClick={() => setPropertyType(pt)} style={{
                    padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                    background: propertyType === pt ? IG_GRADIENT : 'rgba(255,255,255,0.08)',
                    color: propertyType === pt ? 'white' : '#94a3b8',
                  }}>{pt}</button>
                ))}
              </div>
            </div>

            {/* BHK Config */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Label hint="— optional, single select">BHK Config</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BHK_OPTIONS.map(b => (
                  <button key={b} type="button" onClick={() => setBhk(prev => prev === b ? null : b)} style={{
                    padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                    background: bhk === b ? IG_GRADIENT : 'rgba(255,255,255,0.08)',
                    color: bhk === b ? 'white' : '#94a3b8',
                  }}>{b}</button>
                ))}
              </div>
            </div>

            {/* Custom Hashtags */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Label hint="— press Enter or comma to add, without #">Custom Hashtags</Label>
              <TagInput
                tags={customHashtags}
                onAdd={t => {
                  const clean = t.replace(/^#/, '').replace(/\s/g, '').toLowerCase();
                  if (clean) setCustomHashtags(h => h.includes(clean) ? h : [...h, clean]);
                }}
                onRemove={t => setCustomHashtags(h => h.filter(x => x !== t))}
                placeholder="e.g. luxuryhomes, rera2024..."
                accent={IG_PURPLE}
              />
            </div>

            {/* Manual Post URLs */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Label hint="— paste reels/posts with lots of comments to extract ALL commenters">
                Target Posts / Reels
              </Label>
              <textarea
                value={manualUrls}
                onChange={e => setManualUrls(e.target.value)}
                placeholder={'https://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/p/XYZ789/\n\nOne URL per line. All commenters will be extracted.'}
                rows={4}
                style={{
                  ...inputStyle, resize: 'vertical',
                  fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
                }}
              />
              {hasManualUrls && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
                  ✓ Will extract up to {resultsLimit} commenters per post — no city input needed
                </div>
              )}
            </div>
          </div>

          {/* Hashtag Preview */}
          {(previewListingTags.length > 0 || previewBuyerTags.length > 0) && (
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {previewListingTags.length > 0 && (
                <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📋 Listing Tags ({previewListingTags.length}) — mine comments from these posts
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {previewListingTags.map(tag => (
                      <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {previewBuyerTags.length > 0 && (
                <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    🛒 Buyer-Intent Tags ({previewBuyerTags.length}) — these posters ARE buyers
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {previewBuyerTags.map(tag => (
                      <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: 'rgba(34,197,94,0.15)', color: '#86efac' }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Start Button */}
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={handleMine}
              disabled={!canStart || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                background: canStart && !loading ? IG_GRADIENT : 'rgba(255,255,255,0.08)',
                color: canStart && !loading ? 'white' : '#475569',
                fontSize: 15, fontWeight: 700,
                cursor: canStart && !loading ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '⏳ Mining in progress...' : '🔍 Start Mining'}
            </button>
            {!canStart && !loading && (
              <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 8, margin: '8px 0 0' }}>
                Paste post/reel URLs below — or fill in City + Micro-Markets + Budget to search by hashtag
              </p>
            )}
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ ...glassCard, padding: '48px 32px', textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              display: 'inline-block', width: 56, height: 56, borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.1)',
              borderTopColor: IG_ACCENT, borderRightColor: IG_PURPLE,
              animation: 'spin 1s linear infinite', marginBottom: 24,
            }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'white', marginBottom: 8, animation: 'pulse 2s ease-in-out infinite' }}>
              {STEPS[stepIndex]}
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>Estimated time: ~60–90 seconds</div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= stepIndex ? IG_ACCENT : 'rgba(255,255,255,0.15)', transition: 'background 0.3s' }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && !loading && (
          <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 16, border: '1px solid rgba(239,68,68,0.3)', padding: '24px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#f87171', fontSize: 15, marginBottom: 6 }}>
              ⚠️ {error.includes('Apify API Key') ? 'Apify API Key Not Configured' : 'Mining Failed'}
            </div>
            <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {error.toLowerCase().includes('apify') && (
                <Link href="/intentradar/settings" style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 8, background: IG_GRADIENT, color: 'white', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  ⚙️ Go to Settings →
                </Link>
              )}
              <button type="button" onClick={handleMine} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#f87171', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                🔄 Retry
              </button>
            </div>
          </div>
        )}

        {/* ── Empty State ──────────────────────────────────────────────────── */}
        {!loading && !error && results === null && (
          <div style={{ textAlign: 'center', padding: '64px 24px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📸</div>
            <div style={{ fontSize: 14, color: '#64748b', maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>
              Enter your real estate criteria above and click{' '}
              <span style={{ color: IG_ACCENT, fontWeight: 600 }}>Start Mining</span>{' '}
              to find Instagram users who are actively engaging with relevant property content.
            </div>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {results !== null && !loading && (
          <div style={{ ...glassCard, overflow: 'hidden' }}>

            {/* Results Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>
                  Showing {filteredResults.length} username{filteredResults.length !== 1 ? 's' : ''}
                  {filter && ` matching "${filter}"`}
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                  {results.length} total · {commentCount} commenters · {buyerPostCount} buyer posts · {postsScraped} posts scraped
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {generatedListingTags.length > 0 && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600 }}>
                      📋 {generatedListingTags.length} listing tags
                    </span>
                  )}
                  {generatedBuyerTags.length > 0 && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 600 }}>
                      🛒 {generatedBuyerTags.length} buyer tags
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={copyUsernames} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  📋 Copy Usernames
                </button>
                <button type="button" onClick={exportCSV} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: IG_GRADIENT, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ⬇ Export CSV
                </button>
              </div>
            </div>

            {/* Filter */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by @username or keyword in comment..."
                style={{ ...inputStyle }}
              />
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['#', '@Username', 'Interaction', 'Post', 'When', 'Signal'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1.2, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px 24px', textAlign: 'center', color: '#475569' }}>
                        No results match your filter
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((r, i) => (
                      <tr key={`${r.username}-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 16px', color: '#334155', fontSize: 12, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <a
                            href={`https://instagram.com/${r.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: IG_ACCENT, fontWeight: 700, textDecoration: 'none', fontSize: 13 }}
                          >
                            @{r.username}
                          </a>
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                          <span
                            title={r.interaction}
                            style={{ color: '#cbd5e1', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}
                          >
                            {r.interaction.length > 120 ? r.interaction.slice(0, 120) + '…' : r.interaction}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          {r.postUrl ? (
                            <a
                              href={r.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#475569', fontSize: 11, fontFamily: 'monospace', textDecoration: 'none' }}
                            >
                              {shortcode(r.postUrl)}
                            </a>
                          ) : <span style={{ color: '#334155' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: '#475569', fontSize: 12 }}>
                          {formatRelativeTime(r.timestamp)}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          {r.interactionType === 'comment' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                              💬 Commenter
                            </span>
                          ) : r.hashtag === 'buyer-intent' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                              🛒 Buyer Post
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: 'rgba(100,116,139,0.15)', color: '#94a3b8' }}>
                              📋 Listing
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
