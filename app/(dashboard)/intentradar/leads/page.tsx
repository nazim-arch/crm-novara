'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSourceConfidence } from '@/lib/intentradar/confidence';
import { freshnessLabel, freshnessColor } from '@/lib/intentradar/freshness';

interface Campaign {
  id: string;
  name: string;
  city: string;
  status: string;
  intentMode: string;
  totalLeads: number | null;
  hotLeads: number | null;
  warmLeads: number | null;
  coolLeads: number | null;
  createdAt: string;
  completedAt: string | null;
  propertyType: string;
  budgetMin: number;
  budgetMax: number;
}

interface Lead {
  id: string;
  profileHandle: string | null;
  profileName: string | null;
  sourcePlatform: string;
  sourceUrl: string | null;
  sourceContent: string;
  sourceType: string;
  totalScore: number;
  tier: string;
  scoreSpecificity: number;
  scoreBudgetClarity: number;
  scoreUrgency: number;
  scoreEngagementVelocity: number;
  scoreFinancialReady: number;
  scoreLocationLock: number;
  inferredBuyerType: string | null;
  inferredBudget: string | null;
  inferredLocation: string | null;
  inferredTimeline: string | null;
  isNRI: boolean;
  nriCountry: string | null;
  behavioralPatterns: string[];
  aiInsightClaude: string | null;
  aiInsightGPT: string | null;
  aiRecommendedAction: string | null;
  aiResponseDraft: string | null;
  aiWhyStrong: string | null;
  engagementStatus: string;
  leadOriginType: string;
  intentMode: string;
  intentType: string | null;
  listingPrice: string | null;
  profileUrl: string | null;
  freshnessScore: number;
  dedupeDecision: string | null;
  duplicateProbability: number | null;
  matchReasons: string[];
  campaign?: { name: string; city: string };
}

// ── Config ─────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  hot:      { label: '🔥 HOT',   color: '#dc2626', bg: '#fef2f2', ring: '#fca5a5' },
  warm:     { label: '🟡 WARM',  color: '#d97706', bg: '#fffbeb', ring: '#fcd34d' },
  cool:     { label: '🟢 COOL',  color: '#16a34a', bg: '#f0fdf4', ring: '#86efac' },
  watching: { label: '⚪ WATCH', color: '#78716c', bg: '#f5f5f4', ring: '#d6d3d1' },
};

const ENGAGEMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  new:        { label: 'Open',         color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  contacted:  { label: 'Contacted',    color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  responded:  { label: 'Responded',    color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  site_visit: { label: 'Site Visit',   color: '#0e7490', bg: '#cffafe', border: '#67e8f9' },
  converted:  { label: '✓ Won',        color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  lost:       { label: '✗ Lost',       color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: '🎬', youtube_comment: '🎬',
  reddit: '💬', reddit_post: '💬',
  google_maps: '📍', instagram: '📸', twitter: '🐦',
  telegram: '✈️', facebook: '👥', linkedin: '💼', linkedin_post: '💼',
  '99acres': '🏢', magicbricks: '🧱', housing: '🏠', nobroker: '🔓',
  squareyards: '🏙', portal_listing: '🏗', portal_forums: '🏢',
  forum_post: '🗨️', openai_generate: '🤖', openai_generated: '🤖',
  openai_generated_seller: '🤖',
};

const INTENT_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  buyer:      { label: '🔍 Buyer',      color: '#1d4ed8', bg: '#dbeafe' },
  investor:   { label: '📈 Investor',   color: '#0e7490', bg: '#cffafe' },
  relocation: { label: '✈️ Relocation', color: '#7c3aed', bg: '#ede9fe' },
  owner:      { label: '🏠 Owner',      color: '#15803d', bg: '#dcfce7' },
  broker:     { label: '🤝 Broker',     color: '#b45309', bg: '#fef3c7' },
  developer:  { label: '🏗 Developer',  color: '#6b21a8', bg: '#f3e8ff' },
};

const DEDUPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  probable_duplicate: { label: 'Probable duplicate',      color: '#7c3aed', bg: '#ede9fe' },
  possible_cluster:   { label: 'Same prospect cluster',   color: '#b45309', bg: '#fef3c7' },
  exact_duplicate:    { label: 'Exact duplicate',         color: '#dc2626', bg: '#fee2e2' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function snippet(content: string, max = 110): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
}

// Quick actions to show on each card based on current status
function getQuickActions(status: string): { label: string; next: string; color: string; bg: string; border: string }[] {
  switch (status) {
    case 'new':
      return [
        { label: '📞 Contact', next: 'contacted', color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
        { label: '✗ Lost',    next: 'lost',      color: '#dc2626', bg: '#fff1f2', border: '#fca5a5' },
      ];
    case 'contacted':
      return [
        { label: '💬 Responded',  next: 'responded',  color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
        { label: '🏠 Site Visit', next: 'site_visit', color: '#0e7490', bg: '#ecfeff', border: '#67e8f9' },
        { label: '✗ Lost',       next: 'lost',        color: '#dc2626', bg: '#fff1f2', border: '#fca5a5' },
      ];
    case 'responded':
      return [
        { label: '🏠 Site Visit', next: 'site_visit', color: '#0e7490', bg: '#ecfeff', border: '#67e8f9' },
        { label: '✓ Won',        next: 'converted',   color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
        { label: '✗ Lost',       next: 'lost',        color: '#dc2626', bg: '#fff1f2', border: '#fca5a5' },
      ];
    case 'site_visit':
      return [
        { label: '✓ Won',  next: 'converted', color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
        { label: '✗ Lost', next: 'lost',      color: '#dc2626', bg: '#fff1f2', border: '#fca5a5' },
      ];
    case 'converted':
    case 'lost':
      return [
        { label: '↩ Reopen', next: 'new', color: '#78716c', bg: '#f5f5f4', border: '#d6d3d1' },
      ];
    default:
      return [];
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CampaignStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; dot: string }> = {
    completed: { color: '#15803d', bg: '#dcfce7', dot: '#22c55e' },
    running:   { color: '#1d4ed8', bg: '#dbeafe', dot: '#3b82f6' },
    queued:    { color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
    failed:    { color: '#dc2626', bg: '#fee2e2', dot: '#ef4444' },
  };
  const c = cfg[status] || { color: '#78716c', bg: '#f5f5f4', dot: '#a8a29e' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 700 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, ...(status === 'running' ? { animation: 'pulse 1.2s ease-in-out infinite' } : {}) }} />
      {status.toUpperCase()}
    </span>
  );
}

function ScoreRing({ score, color, ring }: { score: number; color: string; ring: string }) {
  const pct = Math.min(score / 100, 1);
  const r = 20, cx = 24, cy = 24, stroke = 4;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
      <svg width={48} height={48} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0efee" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1, fontFamily: 'monospace' }}>{score}</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: '#57534e', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: 'monospace' }}>{value}/{max}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: '#f0efee', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, background: '#f5f5f4', border: '1px solid #e7e5e4', display: 'inline-flex', gap: 4 }}>
      <span style={{ color: '#a8a29e' }}>{label}:</span>
      <span style={{ color: '#1c1917', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FilterTab({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 7, marginBottom: 10,
      border: `1px solid ${active ? (color || '#4338ca') : '#e7e5e4'}`,
      background: active ? (color ? `${color}18` : '#eef2ff') : 'white',
      color: active ? (color || '#4338ca') : '#78716c',
      fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
    }}>{label}</button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function LeadsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCampaignId = searchParams.get('campaignId');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(initialCampaignId);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<'ALL' | 'BUYER' | 'SELLER'>('ALL');
  const [showSynthetic, setShowSynthetic] = useState(false);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [aiTab, setAiTab] = useState<Record<string, 'claude' | 'gpt'>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch('/api/intentradar/campaigns')
      .then(r => r.json())
      .then(data => {
        const list: Campaign[] = data.campaigns || [];
        setCampaigns(list);
        setCampaignsLoading(false);
        if (!selectedCampaignId && list.length > 0) setSelectedCampaignId(list[0].id);
      })
      .catch(() => setCampaignsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeads = useCallback((campaignId: string | null) => {
    setLeadsLoading(true);
    setLeads([]);
    setExpandedLead(null);
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (tierFilter) params.set('tier', tierFilter);
    if (showSynthetic) params.set('showSynthetic', 'true');
    fetch(`/api/intentradar/leads?${params}`)
      .then(r => r.json())
      .then(data => { setLeads(data.leads || []); setLeadsLoading(false); })
      .catch(() => setLeadsLoading(false));
  }, [tierFilter, showSynthetic]);

  useEffect(() => {
    loadLeads(selectedCampaignId);
  }, [selectedCampaignId, tierFilter, showSynthetic, loadLeads]);

  const selectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    setTierFilter(null);
    setModeFilter('ALL');
    router.replace(`/intentradar/leads?campaignId=${id}`, { scroll: false });
  };

  const updateStatus = async (leadId: string, status: string) => {
    setUpdatingStatus(leadId);
    await fetch('/api/intentradar/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, status }),
    });
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, engagementStatus: status } : l));
    setUpdatingStatus(null);
  };

  const regenerateInsights = async (leadId: string) => {
    setRegenerating(leadId);
    try {
      const res = await fetch('/api/intentradar/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, providers: ['claude', 'gpt'] }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads(prev => prev.map(l => l.id === leadId ? {
          ...l,
          aiInsightClaude: data.insights.claude,
          aiInsightGPT: data.insights.gpt,
          aiRecommendedAction: data.insights.recommendedAction,
          aiResponseDraft: data.insights.responseDraft,
        } : l));
      }
    } catch { /* non-fatal */ }
    setRegenerating(null);
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const displayedLeads = modeFilter === 'ALL' ? leads : leads.filter(l => l.intentMode === modeFilter);

  const counts = {
    all: displayedLeads.length,
    hot: displayedLeads.filter(l => l.tier === 'hot').length,
    warm: displayedLeads.filter(l => l.tier === 'warm').length,
    cool: displayedLeads.filter(l => l.tier === 'cool').length,
    watching: displayedLeads.filter(l => l.tier === 'watching').length,
  };

  // Group campaigns by date
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const week = new Date(today); week.setDate(today.getDate() - 7);
  const buckets: { label: string; items: Campaign[] }[] = [
    { label: 'Today', items: [] }, { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] }, { label: 'Older', items: [] },
  ];
  for (const c of campaigns) {
    const d = new Date(c.createdAt); d.setHours(0,0,0,0);
    if (d >= today) buckets[0].items.push(c);
    else if (d >= yesterday) buckets[1].items.push(c);
    else if (d >= week) buckets[2].items.push(c);
    else buckets[3].items.push(c);
  }
  const grouped = buckets.filter(b => b.items.length > 0);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden', background: '#f5f4f3' }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
        .lead-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important; }
        .qa-btn:hover { opacity: 0.85; }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{
        width: sidebarOpen ? 272 : 0, minWidth: sidebarOpen ? 272 : 0,
        transition: 'width 0.2s, min-width 0.2s', overflow: 'hidden',
        background: 'white', borderRight: '1px solid #e7e5e4', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #f0efee' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>Campaigns</span>
            <a href="/intentradar/generate" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#4338ca', color: 'white', fontWeight: 600, textDecoration: 'none' }}>+ New</a>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: '#a8a29e' }}>{campaigns.length} runs · newest first</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {campaignsLoading && <div style={{ padding: 24, textAlign: 'center' }}><div style={{ width: 22, height: 22, margin: '0 auto', border: '2px solid #eef2ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}
          {!campaignsLoading && campaigns.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#a8a29e', fontSize: 12 }}>
              No campaigns yet.<br /><a href="/intentradar/generate" style={{ color: '#4338ca', fontWeight: 600 }}>Generate your first</a>
            </div>
          )}
          {grouped.map(group => (
            <div key={group.label}>
              <div style={{ padding: '8px 14px 3px', fontSize: 10, fontWeight: 700, color: '#c4b8b0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.label}</div>
              {group.items.map(c => {
                const isSelected = c.id === selectedCampaignId;
                const isSeller = c.intentMode === 'SELLER';
                return (
                  <div key={c.id} onClick={() => selectCampaign(c.id)} style={{
                    padding: '9px 14px', cursor: 'pointer',
                    background: isSelected ? '#eef2ff' : 'transparent',
                    borderLeft: isSelected ? '3px solid #4338ca' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 800, background: isSeller ? '#fffbeb' : '#eef2ff', color: isSeller ? '#b45309' : '#4338ca' }}>
                        {isSeller ? '🏷' : '🔍'} {c.intentMode}
                      </span>
                      <CampaignStatusBadge status={c.status} />
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a8a29e' }}>{timeAgo(c.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 600, color: isSelected ? '#1c1917' : '#57534e', lineHeight: 1.3, marginBottom: 4, wordBreak: 'break-word' }}>
                      {c.name.replace(/^(🏷 Seller \| |🔍 Buyer \| )/, '')}
                    </div>
                    {(c.totalLeads ?? 0) > 0 && (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {(c.hotLeads ?? 0) > 0  && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>🔥 {c.hotLeads}</span>}
                        {(c.warmLeads ?? 0) > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#d97706', fontWeight: 700 }}>🟡 {c.warmLeads}</span>}
                        {(c.coolLeads ?? 0) > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>🟢 {c.coolLeads}</span>}
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#f5f5f4', color: '#78716c', fontWeight: 600 }}>{c.totalLeads} total</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Top bar */}
        <div style={{ padding: '12px 20px', background: 'white', borderBottom: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e7e5e4', background: 'white', cursor: 'pointer', fontSize: 13, color: '#78716c' }}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedCampaign ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedCampaign.name.replace(/^(🏷 Seller \| |🔍 Buyer \| )/, '')}
                </div>
                <div style={{ fontSize: 11, color: '#a8a29e' }}>
                  {selectedCampaign.city} · {timeAgo(selectedCampaign.createdAt)}
                  {selectedCampaign.completedAt && ` · ${Math.round((new Date(selectedCampaign.completedAt).getTime() - new Date(selectedCampaign.createdAt).getTime()) / 60000)}m run`}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 700, color: '#a8a29e' }}>Select a campaign</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['ALL', 'BUYER', 'SELLER'] as const).map(m => (
              <button key={m} onClick={() => setModeFilter(m)} style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${modeFilter === m ? (m === 'SELLER' ? '#f59e0b' : m === 'BUYER' ? '#6366f1' : '#4338ca') : '#e7e5e4'}`,
                background: modeFilter === m ? (m === 'SELLER' ? '#fffbeb' : m === 'BUYER' ? '#eef2ff' : '#f5f5f4') : 'white',
                color: modeFilter === m ? (m === 'SELLER' ? '#b45309' : m === 'BUYER' ? '#4338ca' : '#1c1917') : '#78716c',
              }}>{m === 'ALL' ? 'All' : m === 'BUYER' ? '🔍 Buyers' : '🏷 Sellers'}</button>
            ))}
          </div>
          <button onClick={() => setShowSynthetic(s => !s)} style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showSynthetic ? '#7c3aed' : '#e7e5e4'}`,
            background: showSynthetic ? '#ede9fe' : 'white', color: showSynthetic ? '#7c3aed' : '#78716c',
          }}>🤖 {showSynthetic ? 'Hide AI' : 'Show AI'}</button>
        </div>

        {/* Tier filter */}
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'white', borderBottom: '1px solid #e7e5e4' }}>
          <FilterTab active={!tierFilter}               onClick={() => setTierFilter(null)}       label={`All (${counts.all})`} />
          <FilterTab active={tierFilter === 'hot'}      onClick={() => setTierFilter('hot')}      label={`🔥 Hot (${counts.hot})`}      color="#ef4444" />
          <FilterTab active={tierFilter === 'warm'}     onClick={() => setTierFilter('warm')}     label={`🟡 Warm (${counts.warm})`}     color="#f59e0b" />
          <FilterTab active={tierFilter === 'cool'}     onClick={() => setTierFilter('cool')}     label={`🟢 Cool (${counts.cool})`}     color="#22c55e" />
          <FilterTab active={tierFilter === 'watching'} onClick={() => setTierFilter('watching')} label={`⚪ Watch (${counts.watching})`} color="#94a3b8" />
        </div>

        {/* Cards */}
        <div style={{ padding: '14px 20px 60px' }}>

          {leadsLoading && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ width: 36, height: 36, margin: '0 auto 12px', border: '3px solid #eef2ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ color: '#78716c', fontSize: 13 }}>Loading leads…</p>
            </div>
          )}

          {!leadsLoading && !selectedCampaignId && (
            <div style={{ textAlign: 'center', padding: 60, color: '#a8a29e' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>👈</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#78716c' }}>Select a campaign from the left</p>
              <p style={{ fontSize: 13 }}>Pick any generation run to view its leads</p>
            </div>
          )}

          {!leadsLoading && selectedCampaignId && displayedLeads.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#a8a29e' }}>
              <p style={{ fontSize: 15, fontWeight: 600 }}>No leads found</p>
              <p style={{ fontSize: 13 }}>{!showSynthetic ? 'Toggle "Show AI" to include synthetic leads.' : 'Try adjusting filters.'}</p>
            </div>
          )}

          {!leadsLoading && displayedLeads.map((lead, idx) => {
            const isExpanded = expandedLead === lead.id;
            const tc = TIER_CONFIG[lead.tier] || TIER_CONFIG.watching;
            const sc = ENGAGEMENT_STATUS_CONFIG[lead.engagementStatus] || ENGAGEMENT_STATUS_CONFIG.new;
            const isSynthetic = lead.leadOriginType === 'synthetic';
            const isSeller = lead.intentMode === 'SELLER';
            const conf = getSourceConfidence(lead.sourcePlatform);
            const fresh = freshnessLabel(lead.freshnessScore ?? 1);
            const freshCol = freshnessColor(lead.freshnessScore ?? 1);
            const dedupe = lead.dedupeDecision ? DEDUPE_CONFIG[lead.dedupeDecision] : null;
            const currentAiTab = aiTab[lead.id] || 'claude';
            const intentTypeCfg = lead.intentType ? INTENT_TYPE_CONFIG[lead.intentType] : null;
            const quickActions = getQuickActions(lead.engagementStatus);
            const displayName = lead.profileName || lead.profileHandle || (isSeller ? 'Property Listing' : 'Anonymous Lead');
            const isUpdating = updatingStatus === lead.id;

            // Score bars data
            const scoreBars = isSeller
              ? [
                  { label: 'Price Clarity',   value: lead.scoreSpecificity,        max: 15 },
                  { label: 'Property Detail', value: lead.scoreBudgetClarity,       max: 12 },
                  { label: 'Seller Urgency',  value: lead.scoreUrgency,            max: 12 },
                  { label: 'Location',        value: lead.scoreLocationLock,        max: 10 },
                  { label: 'Contact Avail.',  value: lead.scoreFinancialReady,      max: 10 },
                  { label: 'Velocity',        value: lead.scoreEngagementVelocity,  max: 14 },
                ]
              : [
                  { label: 'Specificity',  value: lead.scoreSpecificity,       max: 15 },
                  { label: 'Budget',       value: lead.scoreBudgetClarity,      max: 12 },
                  { label: 'Urgency',      value: lead.scoreUrgency,           max: 12 },
                  { label: 'Velocity',     value: lead.scoreEngagementVelocity, max: 14 },
                  { label: 'Financial',    value: lead.scoreFinancialReady,     max: 10 },
                  { label: 'Location',     value: lead.scoreLocationLock,       max: 8  },
                ];

            return (
              <div key={lead.id} className="lead-card" style={{
                background: isSynthetic ? '#fafaf9' : 'white',
                borderRadius: 12,
                border: `1px solid ${isExpanded ? tc.color + '60' : '#e7e5e4'}`,
                borderLeft: `4px solid ${isSynthetic ? '#d4d4d4' : tc.color}`,
                marginBottom: 10,
                boxShadow: isExpanded ? `0 4px 20px ${tc.color}18` : '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s',
                opacity: isSynthetic ? 0.85 : 1,
              }}>

                {/* ── Card Summary Row ── */}
                <div style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                  {/* Score ring */}
                  <div onClick={() => setExpandedLead(isExpanded ? null : lead.id)} style={{ cursor: 'pointer', marginTop: 2 }}>
                    <ScoreRing score={lead.totalScore} color={isSynthetic ? '#a8a29e' : tc.color} ring={isSynthetic ? '#d4d4d4' : tc.ring} />
                    <div style={{ textAlign: 'center', fontSize: 9, color: '#a8a29e', marginTop: 2, fontWeight: 600 }}>{tc.label.split(' ')[1]}</div>
                  </div>

                  {/* Main content */}
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpandedLead(isExpanded ? null : lead.id)}>

                    {/* Name + status + platform row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[lead.sourcePlatform] || '📌'}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSynthetic ? '#78716c' : '#1c1917' }}>
                        {displayName}
                      </span>

                      {/* Lead status badge */}
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                        {sc.label}
                      </span>

                      {/* Mode pill */}
                      <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 800, background: isSeller ? '#fffbeb' : '#eef2ff', color: isSeller ? '#b45309' : '#4338ca', border: `1px solid ${isSeller ? '#fcd34d' : '#c7d2fe'}` }}>
                        {isSeller ? '🏷 SELLER' : '🔍 BUYER'}
                      </span>

                      {/* Intent type */}
                      {intentTypeCfg && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: intentTypeCfg.bg, color: intentTypeCfg.color, fontWeight: 700 }}>
                          {intentTypeCfg.label}
                        </span>
                      )}

                      {isSynthetic && (
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#ede9fe', color: '#7c3aed', fontWeight: 700 }}>🤖 AI</span>
                      )}
                    </div>

                    {/* Key attributes row */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
                      {isSeller ? (
                        <>
                          {lead.listingPrice && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>{lead.listingPrice}</span>}
                          {lead.inferredLocation && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#f5f5f4', color: '#57534e', fontWeight: 600 }}>📍 {lead.inferredLocation}</span>}
                          {lead.inferredBuyerType && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#f5f5f4', color: '#57534e', fontWeight: 600 }}>{lead.inferredBuyerType}</span>}
                        </>
                      ) : (
                        <>
                          {lead.inferredBudget && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#f0fdf4', color: '#15803d', fontWeight: 700 }}>₹ {lead.inferredBudget}</span>}
                          {lead.inferredLocation && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#f5f5f4', color: '#57534e', fontWeight: 600 }}>📍 {lead.inferredLocation}</span>}
                          {lead.isNRI && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#eef2ff', color: '#4338ca', fontWeight: 700 }}>NRI{lead.nriCountry ? ` · ${lead.nriCountry}` : ''}</span>}
                          {lead.inferredTimeline && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#fffbeb', color: '#b45309', fontWeight: 600 }}>⏱ {lead.inferredTimeline}</span>}
                        </>
                      )}

                      {/* Confidence + freshness */}
                      <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: conf.bg, color: conf.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{conf.label}</span>
                      {(lead.freshnessScore ?? 1) < 0.85 && (
                        <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: '#f5f5f4', color: freshCol, fontWeight: 700 }}>{fresh}</span>
                      )}
                      {dedupe && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: dedupe.bg, color: dedupe.color, fontWeight: 700 }}>⚠ {dedupe.label}</span>}
                    </div>

                    {/* Snippet */}
                    <p style={{ margin: 0, fontSize: 12, color: '#78716c', lineHeight: 1.5, fontStyle: 'italic' }}>
                      "{snippet(lead.sourceContent)}"
                    </p>
                  </div>

                  {/* Quick actions — right column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 10, color: '#a8a29e', marginBottom: 2, fontWeight: 600 }}>#{idx + 1}</div>
                    {quickActions.map(a => (
                      <button key={a.next} className="qa-btn" disabled={isUpdating} onClick={e => { e.stopPropagation(); updateStatus(lead.id, a.next); }} style={{
                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                        border: `1px solid ${a.border}`, background: a.bg, color: a.color,
                        opacity: isUpdating ? 0.5 : 1, transition: 'opacity 0.1s',
                      }}>{isUpdating ? '…' : a.label}</button>
                    ))}
                    <button onClick={e => { e.stopPropagation(); setExpandedLead(isExpanded ? null : lead.id); }} style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid #e7e5e4', background: isExpanded ? '#eef2ff' : 'white', color: isExpanded ? '#4338ca' : '#78716c',
                    }}>{isExpanded ? '▲ Less' : '▼ More'}</button>
                  </div>
                </div>

                {/* ── Expanded Detail ── */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f0efee', padding: '16px 14px 16px' }}>

                    {isSynthetic && (
                      <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: '#ede9fe', border: '1px solid #c4b5fd' }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#6d28d9', fontWeight: 600 }}>🤖 AI-generated signal — not a real {isSeller ? 'listing' : 'buyer'}. For demo/testing only.</p>
                      </div>
                    )}

                    {dedupe && lead.matchReasons.length > 0 && (
                      <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: dedupe.bg, border: `1px solid ${dedupe.color}30` }}>
                        <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: dedupe.color }}>⚠ {dedupe.label}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#57534e' }}>Reasons: {lead.matchReasons.join(' · ')}</p>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                      {/* Left col: scores + attributes */}
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signal Scores</p>
                        {scoreBars.map(b => (
                          <ScoreBar key={b.label} label={b.label} value={b.value} max={b.max} color={tc.color} />
                        ))}

                        <p style={{ margin: '14px 0 8px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attributes</p>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {isSeller ? (
                            <>
                              {lead.inferredBuyerType && <Tag label="Seller" value={lead.inferredBuyerType} />}
                              {lead.listingPrice && <Tag label="Price" value={lead.listingPrice} />}
                              {lead.inferredLocation && <Tag label="Location" value={lead.inferredLocation} />}
                              {lead.inferredTimeline && <Tag label="Status" value={lead.inferredTimeline} />}
                            </>
                          ) : (
                            <>
                              {lead.intentType && <Tag label="Intent" value={lead.intentType} />}
                              {lead.inferredBuyerType && <Tag label="Type" value={lead.inferredBuyerType} />}
                              {lead.inferredBudget && <Tag label="Budget" value={lead.inferredBudget} />}
                              {lead.inferredLocation && <Tag label="Area" value={lead.inferredLocation} />}
                              {lead.inferredTimeline && <Tag label="Timeline" value={lead.inferredTimeline} />}
                              {lead.behavioralPatterns?.map(p => (
                                <span key={p} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 4, background: '#fdf2f8', color: '#be185d', fontWeight: 600 }}>{p.replace(/_/g, ' ')}</span>
                              ))}
                            </>
                          )}
                        </div>

                        {/* Profile / listing link */}
                        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {lead.sourceUrl && (
                            <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: isSeller ? '#fffbeb' : '#eef2ff', border: `1px solid ${isSeller ? '#fcd34d' : '#c7d2fe'}`, color: isSeller ? '#b45309' : '#4338ca', fontWeight: 700, textDecoration: 'none' }}>
                              {isSeller ? '🔗 View Listing' : '👤 View Profile'}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Right col: source + AI */}
                      <div>
                        {/* Full source */}
                        <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {PLATFORM_ICONS[lead.sourcePlatform] || '📌'} Full Signal
                        </p>
                        <div style={{ background: '#fafaf9', borderRadius: 8, border: '1px solid #e7e5e4', padding: '10px 12px', marginBottom: 14, maxHeight: 120, overflowY: 'auto' }}>
                          <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{lead.sourceContent}</p>
                        </div>

                        {/* AI Insights */}
                        <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Insights</p>
                        <div style={{ background: '#fafaf9', borderRadius: 8, border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: 12 }}>
                          <div style={{ display: 'flex', borderBottom: '1px solid #e7e5e4' }}>
                            {(['claude', 'gpt'] as const).map(tab => (
                              <button key={tab} onClick={() => setAiTab(p => ({ ...p, [lead.id]: tab }))} style={{
                                flex: 1, padding: '8px 10px', border: 'none', cursor: 'pointer', fontSize: 11,
                                background: currentAiTab === tab ? '#eef2ff' : 'transparent',
                                color: currentAiTab === tab ? '#4338ca' : '#78716c',
                                fontWeight: currentAiTab === tab ? 700 : 500,
                                borderBottom: currentAiTab === tab ? '2px solid #4338ca' : 'none',
                              }}>{tab === 'claude' ? '✦ Claude' : '⚡ GPT-4o'}</button>
                            ))}
                          </div>
                          <div style={{ padding: '10px 12px', maxHeight: 160, overflowY: 'auto' }}>
                            <pre style={{ fontSize: 11, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                              {currentAiTab === 'claude'
                                ? (lead.aiInsightClaude || 'No Claude insight — add Anthropic API key in Settings.')
                                : (lead.aiInsightGPT || 'No GPT insight — add OpenAI API key in Settings.')}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recommended action + response draft — full width */}
                    {lead.aiRecommendedAction && (
                      <div style={{ marginTop: 4, padding: '10px 14px', borderRadius: 8, background: '#eef2ff', border: '1px solid #c7d2fe' }}>
                        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: 1 }}>Recommended Action</p>
                        <p style={{ fontSize: 12, color: '#312e81', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.aiRecommendedAction}</p>
                      </div>
                    )}

                    {lead.aiResponseDraft && (
                      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 1 }}>Suggested Message</span>
                          <button onClick={() => navigator.clipboard.writeText(lead.aiResponseDraft || '')} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid #bbf7d0', background: 'white', color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>Copy</button>
                        </div>
                        <p style={{ fontSize: 12, color: '#14532d', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.aiResponseDraft}</p>
                      </div>
                    )}

                    {/* Bottom actions */}
                    <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#a8a29e', fontWeight: 600 }}>Status:</span>
                      {Object.entries(ENGAGEMENT_STATUS_CONFIG).map(([key, cfg]) => (
                        <button key={key} onClick={() => updateStatus(lead.id, key)} disabled={isUpdating} style={{
                          padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          border: `1.5px solid ${lead.engagementStatus === key ? cfg.border : '#e7e5e4'}`,
                          background: lead.engagementStatus === key ? cfg.bg : 'white',
                          color: lead.engagementStatus === key ? cfg.color : '#a8a29e',
                          opacity: isUpdating ? 0.5 : 1,
                        }}>{cfg.label}</button>
                      ))}
                      <button onClick={() => regenerateInsights(lead.id)} disabled={regenerating === lead.id} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 7, border: '1px solid #e7e5e4', background: 'white', color: '#4338ca', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {regenerating === lead.id ? '…' : '🔄 Regen AI'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#78716c' }}>Loading…</div>}>
      <LeadsContent />
    </Suspense>
  );
}
