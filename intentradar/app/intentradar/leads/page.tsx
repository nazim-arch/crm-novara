// app/intentradar/leads/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface Lead {
  id: string;
  profileHandle: string | null;
  profileName: string | null;
  profileUrl: string | null;
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
  capturedAt: string;
  campaign?: { name: string; city: string };
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  hot: { label: '🔥 HOT', color: '#dc2626', bg: '#fef2f2' },
  warm: { label: '🟡 WARM', color: '#d97706', bg: '#fffbeb' },
  cool: { label: '🟢 COOL', color: '#16a34a', bg: '#f0fdf4' },
  watching: { label: '⚪ WATCH', color: '#78716c', bg: '#f5f5f4' },
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: '🎬', reddit: '💬', google_maps: '📍', instagram: '📸',
  twitter: '🐦', telegram: '✈️', facebook: '👥', linkedin: '💼',
  '99acres': '🏢', magicbricks: '🧱', housing: '🏠', nobroker: '🔓',
};

const STATUS_OPTIONS = ['new', 'contacted', 'responded', 'site_visit', 'converted', 'lost'];

function LeadsContent() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaignId');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [aiTab, setAiTab] = useState<Record<string, 'claude' | 'gpt'>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (tierFilter) params.set('tier', tierFilter);

    fetch(`/api/intentradar/leads?${params}`)
      .then(r => r.json())
      .then(data => { setLeads(data.leads || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [campaignId, tierFilter]);

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
          aiWhyStrong: data.insights.whyStrong,
        } : l));
      }
    } catch (e) {
      console.error('Regenerate failed:', e);
    }
    setRegenerating(null);
  };

  const updateStatus = async (leadId: string, status: string) => {
    try {
      await fetch('/api/intentradar/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status }),
      });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, engagementStatus: status } : l));
    } catch (e) { console.error('Status update failed:', e); }
  };

  const counts = {
    all: leads.length,
    hot: leads.filter(l => l.tier === 'hot').length,
    warm: leads.filter(l => l.tier === 'warm').length,
    cool: leads.filter(l => l.tier === 'cool').length,
    watching: leads.filter(l => l.tier === 'watching').length,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, #4338ca, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 18 }}>IR</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1c1917' }}>AI Leads</h1>
            <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>{leads.length} leads found{leads[0]?.campaign ? ` — ${leads[0].campaign.name}` : ''}</p>
          </div>
        </div>
        <a href="/intentradar/generate" style={{
          padding: '10px 20px', borderRadius: 8, background: '#4338ca', color: 'white',
          fontWeight: 600, fontSize: 13, textDecoration: 'none',
        }}>+ New Search</a>
      </div>

      {/* Tier Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterTab active={!tierFilter} onClick={() => setTierFilter(null)} label={`All (${counts.all})`} />
        <FilterTab active={tierFilter === 'hot'} onClick={() => setTierFilter('hot')} label={`🔥 Hot (${counts.hot})`} color="#ef4444" />
        <FilterTab active={tierFilter === 'warm'} onClick={() => setTierFilter('warm')} label={`🟡 Warm (${counts.warm})`} color="#f59e0b" />
        <FilterTab active={tierFilter === 'cool'} onClick={() => setTierFilter('cool')} label={`🟢 Cool (${counts.cool})`} color="#22c55e" />
        <FilterTab active={tierFilter === 'watching'} onClick={() => setTierFilter('watching')} label={`⚪ Watch (${counts.watching})`} color="#94a3b8" />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', border: '3px solid #eef2ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#78716c', fontSize: 14 }}>Loading leads...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Lead Cards */}
      {!loading && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#a8a29e' }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>No leads found</p>
          <p style={{ fontSize: 13 }}>Try adjusting your search criteria or adding more sources</p>
        </div>
      )}

      {!loading && leads.map(lead => {
        const isExpanded = expandedLead === lead.id;
        const tc = TIER_CONFIG[lead.tier] || TIER_CONFIG.watching;
        const currentAiTab = aiTab[lead.id] || 'claude';

        return (
          <div key={lead.id} style={{
            background: 'white', borderRadius: 14, border: `1px solid ${isExpanded ? tc.color : '#e7e5e4'}`,
            borderLeft: `4px solid ${tc.color}`, marginBottom: 12,
            boxShadow: isExpanded ? `0 4px 20px ${tc.color}20` : 'none',
            transition: 'all 0.2s',
          }}>
            {/* Lead Header */}
            <div onClick={() => setExpandedLead(isExpanded ? null : lead.id)} style={{ padding: '16px 20px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18 }}>{PLATFORM_ICONS[lead.sourcePlatform] || '📌'}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1c1917' }}>{lead.profileName || lead.profileHandle || 'Anonymous'}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: tc.bg, color: tc.color, fontWeight: 700 }}>{tc.label}</span>
                    {lead.isNRI && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca', fontWeight: 700 }}>NRI {lead.nriCountry ? `(${lead.nriCountry})` : ''}</span>}
                    {lead.inferredBudget && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', fontWeight: 600 }}>{lead.inferredBudget}</span>}
                  </div>
                  <p style={{ fontSize: 13, color: '#57534e', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: isExpanded ? 99 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    "{lead.sourceContent}"
                  </p>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: tc.color, fontFamily: 'monospace' }}>{lead.totalScore}</div>
                  <div style={{ fontSize: 9, color: '#a8a29e', fontWeight: 600 }}>/100</div>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f5f5f4' }}>
                {/* Score Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 16, marginBottom: 16 }}>
                  {[
                    ['Specificity', lead.scoreSpecificity, 15],
                    ['Budget', lead.scoreBudgetClarity, 12],
                    ['Urgency', lead.scoreUrgency, 12],
                    ['Velocity', lead.scoreEngagementVelocity, 14],
                    ['Financial', lead.scoreFinancialReady, 10],
                    ['Location', lead.scoreLocationLock, 8],
                  ].map(([label, score, max]) => (
                    <div key={label as string} style={{ textAlign: 'center', padding: '8px 4px', background: '#fafaf9', borderRadius: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#4338ca', fontFamily: 'monospace' }}>{score as number}</div>
                      <div style={{ fontSize: 9, color: '#a8a29e' }}>{label as string} /{max as number}</div>
                    </div>
                  ))}
                </div>

                {/* Inferred Attributes */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {lead.inferredBuyerType && <Tag label="Buyer Type" value={lead.inferredBuyerType} />}
                  {lead.inferredLocation && <Tag label="Location" value={lead.inferredLocation} />}
                  {lead.inferredTimeline && <Tag label="Timeline" value={lead.inferredTimeline} />}
                  {lead.behavioralPatterns?.map(p => (
                    <span key={p} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#fdf2f8', color: '#be185d', fontWeight: 600 }}>{p.replace('_', ' ')}</span>
                  ))}
                </div>

                {/* AI Insights */}
                <div style={{ background: '#fafaf9', borderRadius: 12, border: '1px solid #e7e5e4', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid #e7e5e4' }}>
                    <button onClick={() => setAiTab(p => ({ ...p, [lead.id]: 'claude' }))} style={{
                      flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                      background: currentAiTab === 'claude' ? '#eef2ff' : 'transparent',
                      color: currentAiTab === 'claude' ? '#4338ca' : '#78716c',
                      fontWeight: currentAiTab === 'claude' ? 700 : 500, fontSize: 13,
                      borderBottom: currentAiTab === 'claude' ? '2px solid #4338ca' : 'none',
                    }}>
                      Claude AI Insight
                    </button>
                    <button onClick={() => setAiTab(p => ({ ...p, [lead.id]: 'gpt' }))} style={{
                      flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                      background: currentAiTab === 'gpt' ? '#eef2ff' : 'transparent',
                      color: currentAiTab === 'gpt' ? '#4338ca' : '#78716c',
                      fontWeight: currentAiTab === 'gpt' ? 700 : 500, fontSize: 13,
                      borderBottom: currentAiTab === 'gpt' ? '2px solid #4338ca' : 'none',
                    }}>
                      GPT AI Insight
                    </button>
                  </div>
                  <div style={{ padding: 16 }}>
                    <pre style={{ fontSize: 12, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                      {currentAiTab === 'claude' ? (lead.aiInsightClaude || 'No Claude insight available') : (lead.aiInsightGPT || 'No GPT insight available')}
                    </pre>
                  </div>
                </div>

                {/* Recommended Action */}
                {lead.aiRecommendedAction && (
                  <div style={{ background: '#eef2ff', borderRadius: 10, padding: 14, border: '1px solid #c7d2fe', marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Recommended Action</div>
                    <p style={{ fontSize: 13, color: '#312e81', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.aiRecommendedAction}</p>
                  </div>
                )}

                {/* Response Draft */}
                {lead.aiResponseDraft && (
                  <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 14, border: '1px solid #bbf7d0', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 1 }}>Suggested Response</span>
                      <button onClick={() => navigator.clipboard.writeText(lead.aiResponseDraft || '')} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #bbf7d0',
                        background: 'white', color: '#16a34a', cursor: 'pointer', fontWeight: 600,
                      }}>Copy</button>
                    </div>
                    <p style={{ fontSize: 13, color: '#14532d', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.aiResponseDraft}</p>
                  </div>
                )}

                {/* Actions Bar */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={lead.engagementStatus}
                    onChange={e => updateStatus(lead.id, e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12, fontWeight: 600, background: 'white', cursor: 'pointer' }}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
                    ))}
                  </select>

                  <button onClick={() => regenerateInsights(lead.id)} disabled={regenerating === lead.id} style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #e7e5e4',
                    background: 'white', color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {regenerating === lead.id ? 'Regenerating...' : '🔄 Regenerate AI Insights'}
                  </button>

                  {lead.sourceUrl && (
                    <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #e7e5e4',
                      background: 'white', color: '#57534e', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                    }}>
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
      padding: '8px 16px', borderRadius: 8, border: `1px solid ${active ? (color || '#4338ca') : '#e7e5e4'}`,
      background: active ? (color ? `${color}10` : '#eef2ff') : 'white',
      color: active ? (color || '#4338ca') : '#78716c',
      fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    }}>
      {label}
    </button>
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
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#78716c' }}>Loading...</div>}>
      <LeadsContent />
    </Suspense>
  );
}
