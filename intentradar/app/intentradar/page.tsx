// app/intentradar/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function IntentRadarDashboard() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, hot: 0, warm: 0, cool: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch recent campaigns and stats
    fetch('/api/intentradar/leads?limit=5')
      .then(r => r.json())
      .then(data => {
        const leads = data.leads || [];
        setStats({
          total: data.pagination?.total || leads.length,
          hot: leads.filter((l: any) => l.tier === 'hot').length,
          warm: leads.filter((l: any) => l.tier === 'warm').length,
          cool: leads.filter((l: any) => l.tier === 'cool').length,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        borderRadius: 20, padding: '40px 32px', marginBottom: 32, textAlign: 'center',
        border: '1px solid rgba(99,102,241,0.3)',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 4, color: '#818cf8', marginBottom: 10, fontWeight: 600 }}>AI-Powered Module</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: 'white', margin: '0 0 8px' }}>
          <span style={{ color: '#a5b4fc' }}>Intent</span>Radar
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 15, margin: '0 0 24px', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
          Zero ad-spend buyer intent engine. Scan 20+ digital sources, detect genuine buying signals, get AI-powered lead insights.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <Link href="/intentradar/generate" style={{
            padding: '14px 32px', borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            color: 'white', fontWeight: 700, fontSize: 15, textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          }}>
            🚀 Generate Leads
          </Link>
          <Link href="/intentradar/settings" style={{
            padding: '14px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.1)',
            color: '#a5b4fc', fontWeight: 600, fontSize: 14, textDecoration: 'none',
            border: '1px solid rgba(165,180,252,0.3)',
          }}>
            ⚙️ Settings
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Total Leads', value: stats.total, color: '#4338ca' },
          { label: 'Hot', value: stats.hot, color: '#ef4444' },
          { label: 'Warm', value: stats.warm, color: '#f59e0b' },
          { label: 'Cool', value: stats.cool, color: '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: 14, padding: '20px 16px', textAlign: 'center',
            border: '1px solid #e7e5e4',
          }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize: 12, color: '#78716c', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { href: '/intentradar/generate', icon: '🎯', title: 'New Search', desc: 'Define criteria & scan sources' },
          { href: '/intentradar/leads', icon: '📋', title: 'All Leads', desc: 'View & manage captured leads' },
          { href: '/intentradar/settings', icon: '🔑', title: 'API Settings', desc: 'Configure API keys & sources' },
        ].map((link, i) => (
          <Link key={i} href={link.href} style={{
            background: 'white', borderRadius: 14, padding: '24px 20px', textDecoration: 'none',
            border: '1px solid #e7e5e4', transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{link.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', marginBottom: 4 }}>{link.title}</div>
            <div style={{ fontSize: 12, color: '#78716c' }}>{link.desc}</div>
          </Link>
        ))}
      </div>

      {/* How It Works */}
      <div style={{ marginTop: 32, background: 'white', borderRadius: 14, border: '1px solid #e7e5e4', padding: '24px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1c1917', margin: '0 0 16px' }}>How It Works</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { step: '1', title: 'Configure', desc: 'Add API keys in Settings (YouTube, Reddit, Claude, OpenAI)' },
            { step: '2', title: 'Define Criteria', desc: 'Set city, micro-markets, budget range, property type, buyer personas' },
            { step: '3', title: 'Generate', desc: 'System scans all sources, extracts intent signals, scores each lead' },
            { step: '4', title: 'AI Analysis', desc: 'Claude + GPT analyze each lead with buyer profile, recommended action, response draft' },
            { step: '5', title: 'Act', desc: 'Use prioritized leads with AI-suggested responses to engage high-intent buyers' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: '#eef2ff', color: '#4338ca',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0,
              }}>{s.step}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1917' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#78716c' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
