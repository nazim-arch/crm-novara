'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSourceConfidence } from '@/lib/intentradar/confidence';
import { freshnessLabel, freshnessColor } from '@/lib/intentradar/freshness';

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

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  hot:      { label: '🔥 HOT',   color: '#dc2626', bg: '#fef2f2' },
  warm:     { label: '🟡 WARM',  color: '#d97706', bg: '#fffbeb' },
  cool:     { label: '🟢 COOL',  color: '#16a34a', bg: '#f0fdf4' },
  watching: { label: '⚪ WATCH', color: '#78716c', bg: '#f5f5f4' },
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
  probable_duplicate: { label: 'Probable duplicate intent',        color: '#7c3aed', bg: '#ede9fe' },
  possible_cluster:   { label: 'Possible same prospect cluster',   color: '#b45309', bg: '#fef3c7' },
  exact_duplicate:    { label: 'Exact duplicate signal',           color: '#dc2626', bg: '#fee2e2' },
};

const STATUS_OPTIONS = ['new', 'contacted', 'responded', 'site_visit', 'converted', 'lost'];

function snippet(content: string, max = 130): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaignId');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<'ALL' | 'BUYER' | 'SELLER'>('ALL');
  const [showSynthetic, setShowSynthetic] = useState(false);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [aiTab, setAiTab] = useState<Record<string, 'claude' | 'gpt'>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (tierFilter) params.set('tier', tierFilter);
    if (showSynthetic) params.set('showSynthetic', 'true');
    fetch(`/api/intentradar/leads?${params}`)
      .then(r => r.json())
      .then(data => { setLeads(data.leads || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [campaignId, tierFilter, showSynthetic]);

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

  const updateStatus = async (leadId: string, status: string) => {
    await fetch('/api/intentradar/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, status }),
    });
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, engagementStatus: status } : l));
  };

  const displayedLeads = modeFilter === 'ALL' ? leads : leads.filter(l => l.intentMode === modeFilter);

  const counts = {
    all: displayedLeads.length,
    hot: displayedLeads.filter(l => l.tier === 'hot').length,
    warm: displayedLeads.filter(l => l.tier === 'warm').length,
    cool: displayedLeads.filter(l => l.tier === 'cool').length,
    watching: displayedLeads.filter(l => l.tier === 'watching').length,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg,#4338ca,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 18 }}>IR</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1c1917' }}>AI Leads</h1>
            <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>
              {leads.length} leads{leads[0]?.campaign ? ` — ${leads[0].campaign.name}` : ''}
              {!showSynthetic && ' · Real signals only'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mode filter */}
          {(['ALL', 'BUYER', 'SELLER'] as const).map(m => (
            <button key={m} onClick={() => setModeFilter(m)} style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${modeFilter === m ? (m === 'SELLER' ? '#f59e0b' : m === 'BUYER' ? '#6366f1' : '#4338ca') : '#e7e5e4'}`,
              background: modeFilter === m ? (m === 'SELLER' ? '#fffbeb' : m === 'BUYER' ? '#eef2ff' : '#f5f5f4') : 'white',
              color: modeFilter === m ? (m === 'SELLER' ? '#b45309' : m === 'BUYER' ? '#4338ca' : '#1c1917') : '#78716c',
            }}>
              {m === 'ALL' ? 'All Modes' : m === 'BUYER' ? '🔍 Buyers' : '🏷 Sellers'}
            </button>
          ))}
          <button onClick={() => setShowSynthetic(s => !s)} style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showSynthetic ? '#7c3aed' : '#e7e5e4'}`,
            background: showSynthetic ? '#ede9fe' : 'white',
            color: showSynthetic ? '#7c3aed' : '#78716c',
          }}>
            🤖 {showSynthetic ? 'Hide' : 'Show'} Synthetic
          </button>
          <a href="/intentradar/generate" style={{ padding: '8px 16px', borderRadius: 8, background: '#4338ca', color: 'white', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>
            + New Search
          </a>
        </div>
      </div>

      {/* Tier tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterTab active={!tierFilter} onClick={() => setTierFilter(null)} label={`All (${counts.all})`} />
        <FilterTab active={tierFilter === 'hot'}      onClick={() => setTierFilter('hot')}      label={`🔥 Hot (${counts.hot})`}      color="#ef4444" />
        <FilterTab active={tierFilter === 'warm'}     onClick={() => setTierFilter('warm')}     label={`🟡 Warm (${counts.warm})`}     color="#f59e0b" />
        <FilterTab active={tierFilter === 'cool'}     onClick={() => setTierFilter('cool')}     label={`🟢 Cool (${counts.cool})`}     color="#22c55e" />
        <FilterTab active={tierFilter === 'watching'} onClick={() => setTierFilter('watching')} label={`⚪ Watch (${counts.watching})`} color="#94a3b8" />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', border: '3px solid #eef2ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#78716c', fontSize: 14 }}>Loading leads…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {!loading && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#a8a29e' }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>No leads found</p>
          <p style={{ fontSize: 13 }}>
            {!showSynthetic ? 'Showing real signals only. Toggle "Show Synthetic" to include AI-generated leads.' : 'Try adjusting filters or running a new search.'}
          </p>
        </div>
      )}

      {!loading && displayedLeads.map(lead => {
        const isExpanded = expandedLead === lead.id;
        const tc = TIER_CONFIG[lead.tier] || TIER_CONFIG.watching;
        const isSynthetic = lead.leadOriginType === 'synthetic';
        const isSeller = lead.intentMode === 'SELLER';
        const conf = getSourceConfidence(lead.sourcePlatform);
        const fresh = freshnessLabel(lead.freshnessScore ?? 1);
        const freshCol = freshnessColor(lead.freshnessScore ?? 1);
        const dedupe = lead.dedupeDecision ? DEDUPE_CONFIG[lead.dedupeDecision] : null;
        const currentAiTab = aiTab[lead.id] || 'claude';
        const intentTypeCfg = lead.intentType ? INTENT_TYPE_CONFIG[lead.intentType] : null;

        return (
          <div key={lead.id} style={{
            background: isSynthetic ? '#fafaf9' : 'white',
            borderRadius: 14,
            border: `1px solid ${isExpanded ? tc.color : isSynthetic ? '#d4d4d4' : '#e7e5e4'}`,
            borderLeft: `4px solid ${isSynthetic ? '#a8a29e' : tc.color}`,
            marginBottom: 12,
            boxShadow: isExpanded ? `0 4px 20px ${tc.color}20` : 'none',
            transition: 'all 0.2s',
            opacity: isSynthetic ? 0.88 : 1,
          }}>
            {/* Card header */}
            <div onClick={() => setExpandedLead(isExpanded ? null : lead.id)} style={{ padding: '14px 18px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Row 1: mode badge + identity + tier + meta badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16 }}>{PLATFORM_ICONS[lead.sourcePlatform] || '📌'}</span>

                    {/* Mode pill */}
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 800, letterSpacing: '0.05em',
                      background: isSeller ? '#fffbeb' : '#eef2ff',
                      color: isSeller ? '#b45309' : '#4338ca',
                      border: `1px solid ${isSeller ? '#fcd34d' : '#c7d2fe'}`,
                    }}>
                      {isSeller ? '🏷 SELLER' : '🔍 BUYER'}
                    </span>

                    <span style={{ fontWeight: 700, fontSize: 14, color: isSynthetic ? '#78716c' : '#1c1917' }}>
                      {lead.profileName || lead.profileHandle || (isSeller ? 'Property Listing' : 'Anonymous')}
                    </span>

                    {/* Intent type */}
                    {intentTypeCfg && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: intentTypeCfg.bg, color: intentTypeCfg.color, fontWeight: 700 }}>
                        {intentTypeCfg.label}
                      </span>
                    )}

                    {/* Tier / synthetic label */}
                    {isSynthetic ? (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed', fontWeight: 700, border: '1px solid #c4b5fd' }}>
                        🤖 AI Generated · {isSeller ? 'not a real listing' : 'not a real buyer'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: tc.bg, color: tc.color, fontWeight: 700 }}>{tc.label}</span>
                    )}

                    {/* Seller: listing price */}
                    {isSeller && lead.listingPrice && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                        {lead.listingPrice}
                      </span>
                    )}

                    {/* Buyer: NRI + budget */}
                    {!isSeller && lead.isNRI && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca', fontWeight: 700 }}>
                        NRI{lead.nriCountry ? ` · ${lead.nriCountry}` : ''}
                      </span>
                    )}
                    {!isSeller && lead.inferredBudget && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>
                        Budget: {lead.inferredBudget}
                      </span>
                    )}
                  </div>

                  {/* Row 2: confidence + freshness + dedupe badges */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: conf.bg, color: conf.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {conf.label}
                    </span>
                    {(lead.freshnessScore ?? 1) < 0.9 && (
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#f5f5f4', color: freshCol, fontWeight: 700, textTransform: 'uppercase' }}>
                        {fresh}
                      </span>
                    )}
                    {dedupe && (
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: dedupe.bg, color: dedupe.color, fontWeight: 700 }}>
                        ⚠ {dedupe.label}
                      </span>
                    )}
                  </div>

                  {/* Row 3: evidence snippet */}
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                    "{snippet(lead.sourceContent)}"
                  </p>
                </div>

                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: isSynthetic ? '#a8a29e' : tc.color, fontFamily: 'monospace', lineHeight: 1 }}>{lead.totalScore}</div>
                  <div style={{ fontSize: 9, color: '#a8a29e', fontWeight: 600 }}>/100</div>
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f5f5f4' }}>

                {isSynthetic && (
                  <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: '#ede9fe', border: '1px solid #c4b5fd' }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#6d28d9', fontWeight: 600 }}>
                      🤖 AI-generated signal — not sourced from a real platform. For demo/testing only. Do not treat as a genuine buyer.
                    </p>
                  </div>
                )}

                {dedupe && lead.matchReasons.length > 0 && (
                  <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: dedupe.bg, border: `1px solid ${dedupe.color}30` }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: dedupe.color }}>⚠ {dedupe.label}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#57534e' }}>Match reasons: {lead.matchReasons.join(' · ')}</p>
                  </div>
                )}

                {/* Score grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px,1fr))', gap: 8, marginTop: 14, marginBottom: 14 }}>
                  {([['Specificity', lead.scoreSpecificity, 15], ['Budget', lead.scoreBudgetClarity, 12], ['Urgency', lead.scoreUrgency, 12], ['Velocity', lead.scoreEngagementVelocity, 14], ['Financial', lead.scoreFinancialReady, 10], ['Location', lead.scoreLocationLock, 8]] as [string, number, number][]).map(([l, s, m]) => (
                    <div key={l} style={{ textAlign: 'center', padding: '8px 4px', background: '#fafaf9', borderRadius: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#4338ca', fontFamily: 'monospace' }}>{s}</div>
                      <div style={{ fontSize: 9, color: '#a8a29e' }}>{l} /{m}</div>
                    </div>
                  ))}
                </div>

                {/* Attributes — mode-aware */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {isSeller ? (
                    <>
                      {lead.inferredBuyerType && <Tag label="Seller type" value={lead.inferredBuyerType} />}
                      {lead.listingPrice && <Tag label="Price" value={lead.listingPrice} />}
                      {lead.inferredLocation && <Tag label="Location" value={lead.inferredLocation} />}
                      {lead.inferredTimeline && <Tag label="Status" value={lead.inferredTimeline} />}
                      {lead.sourceUrl && (
                        <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309', fontWeight: 700, textDecoration: 'none' }}>
                          🔗 View Listing
                        </a>
                      )}
                    </>
                  ) : (
                    <>
                      {lead.intentType && <Tag label="Intent" value={lead.intentType} />}
                      {lead.inferredBuyerType && <Tag label="Buyer type" value={lead.inferredBuyerType} />}
                      {lead.inferredBudget && <Tag label="Budget" value={lead.inferredBudget} />}
                      {lead.inferredLocation && <Tag label="Area" value={lead.inferredLocation} />}
                      {lead.inferredTimeline && <Tag label="Timeline" value={lead.inferredTimeline} />}
                      {lead.profileHandle && (
                        <a href={lead.sourceUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', fontWeight: 700, textDecoration: 'none' }}>
                          👤 {lead.profileHandle}
                        </a>
                      )}
                      {lead.behavioralPatterns?.map(p => (
                        <span key={p} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#fdf2f8', color: '#be185d', fontWeight: 600 }}>{p.replace(/_/g, ' ')}</span>
                      ))}
                    </>
                  )}
                </div>

                {/* Full source signal */}
                <div style={{ background: '#fafaf9', borderRadius: 10, border: '1px solid #e7e5e4', padding: '12px 14px', marginBottom: 14 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {PLATFORM_ICONS[lead.sourcePlatform] || '📌'} Source · {conf.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{lead.sourceContent}</p>
                </div>

                {/* AI Insights */}
                <div style={{ background: '#fafaf9', borderRadius: 12, border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid #e7e5e4' }}>
                    {(['claude', 'gpt'] as const).map(tab => (
                      <button key={tab} onClick={() => setAiTab(p => ({ ...p, [lead.id]: tab }))} style={{
                        flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                        background: currentAiTab === tab ? '#eef2ff' : 'transparent',
                        color: currentAiTab === tab ? '#4338ca' : '#78716c',
                        fontWeight: currentAiTab === tab ? 700 : 500, fontSize: 13,
                        borderBottom: currentAiTab === tab ? '2px solid #4338ca' : 'none',
                      }}>{tab === 'claude' ? 'Claude Insight' : 'GPT-4o Insight'}</button>
                    ))}
                  </div>
                  <div style={{ padding: 16 }}>
                    <pre style={{ fontSize: 12, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                      {currentAiTab === 'claude' ? (lead.aiInsightClaude || 'No Claude insight. Add Anthropic API key in Settings.') : (lead.aiInsightGPT || 'No GPT insight. Add OpenAI API key in Settings.')}
                    </pre>
                  </div>
                </div>

                {lead.aiRecommendedAction && (
                  <div style={{ background: '#eef2ff', borderRadius: 10, padding: 14, border: '1px solid #c7d2fe', marginBottom: 14 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: 1 }}>Recommended Action</p>
                    <p style={{ fontSize: 13, color: '#312e81', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.aiRecommendedAction}</p>
                  </div>
                )}

                {lead.aiResponseDraft && (
                  <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 14, border: '1px solid #bbf7d0', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 1 }}>Suggested Response</span>
                      <button onClick={() => navigator.clipboard.writeText(lead.aiResponseDraft || '')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: 'white', color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>Copy</button>
                    </div>
                    <p style={{ fontSize: 13, color: '#14532d', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.aiResponseDraft}</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={lead.engagementStatus} onChange={e => updateStatus(lead.id, e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12, fontWeight: 600, background: 'white', cursor: 'pointer' }}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>)}
                  </select>
                  <button onClick={() => regenerateInsights(lead.id)} disabled={regenerating === lead.id} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e7e5e4', background: 'white', color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {regenerating === lead.id ? 'Regenerating…' : '🔄 Regenerate AI'}
                  </button>
                  {lead.sourceUrl && (
                    <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e7e5e4', background: 'white', color: '#57534e', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      🔗 View Source
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilterTab({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 8,
      border: `1px solid ${active ? (color || '#4338ca') : '#e7e5e4'}`,
      background: active ? (color ? `${color}15` : '#eef2ff') : 'white',
      color: active ? (color || '#4338ca') : '#78716c',
      fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    }}>{label}</button>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f5f5f4', border: '1px solid #e7e5e4' }}>
      <span style={{ color: '#a8a29e' }}>{label}: </span>
      <span style={{ color: '#1c1917', fontWeight: 600 }}>{value}</span>
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
