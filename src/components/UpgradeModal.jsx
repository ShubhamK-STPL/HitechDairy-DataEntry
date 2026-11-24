import React, { useState } from 'react';
import { X, Check, Zap, Shield, Sparkles, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

export default function UpgradeModal({ onClose, user, onUpgradeSuccess, addToast }) {
  const [selectedPlan, setSelectedPlan] = useState('sprint_90d');
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = () => {
    setIsLoading(true);
    // In production, this redirects to Lemon Squeezy / Stripe Checkout:
    // window.location.href = `https://jobtrackere.lemonsqueezy.com/buy/...`
    setTimeout(() => {
      setIsLoading(false);
      if (onUpgradeSuccess) {
        onUpgradeSuccess({ tier: selectedPlan, expires_at: new Date(Date.now() + 90 * 86400000).toISOString() });
      }
      if (addToast) {
        addToast('License activated! Thank you for supporting JobTrackere.', 'success');
      }
      onClose();
    }, 1200);
  };

  return (
    <motion.div 
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ zIndex: 1200 }}
    >
      <motion.div 
        className="modal modal-lg"
        initial={{ scale: 0.95, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 15 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '680px', padding: '32px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 166, 35, 0.15)', color: '#f5a623', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px' }}>
              <Zap size={14} /> UPGRADE TO PRO
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0 }}>Supercharge Your Job Search</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              No predatory recurring subscriptions. Pay once for your search sprint.
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close" type="button">
            <X size={20} />
          </button>
        </div>

        {/* Plan Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {/* Sprint Pass */}
          <div 
            onClick={() => setSelectedPlan('sprint_90d')}
            style={{
              padding: '20px',
              borderRadius: '12px',
              border: selectedPlan === 'sprint_90d' ? '2px solid var(--accent, #38bdf8)' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: selectedPlan === 'sprint_90d' ? 'rgba(56, 189, 248, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.02))',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ position: 'absolute', top: '-10px', right: '12px', background: 'var(--accent, #38bdf8)', color: '#000', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}>
              MOST POPULAR
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
              <Clock size={16} color="#38bdf8" /> 90-Day Sprint Pass
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Perfect for active job hunts. One-time payment, auto-cancels.
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '14px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>$29</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>flat (90 days)</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#3ecf8e', fontWeight: 600 }}>
              Equivalent to ~$9.60/month
            </div>
          </div>

          {/* Annual Pro */}
          <div 
            onClick={() => setSelectedPlan('pro_annual')}
            style={{
              padding: '20px',
              borderRadius: '12px',
              border: selectedPlan === 'pro_annual' ? '2px solid var(--accent, #38bdf8)' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: selectedPlan === 'pro_annual' ? 'rgba(56, 189, 248, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.02))',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
              <Sparkles size={16} color="#3ecf8e" /> Annual Career Pro
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              For contractors, freelancers, and continuous career growth.
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '14px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>$69</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ year</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#3ecf8e', fontWeight: 600 }}>
              Save 40% vs quarterly
            </div>
          </div>
        </div>

        {/* Feature List */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '10px', marginBottom: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-primary)' }}>
            What you unlock with Pro:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {[
              'Unlimited job application tracking (Free capped at 25)',
              '1-Click Chrome Extension for LinkedIn, Naukri, Indeed',
              'Real-time Supabase cloud sync across laptop & mobile',
              'Export high-res visual Funnel Cards for LinkedIn',
              'AI Resume-to-Job Fit Match score & keyword tips',
              '30-day no-questions-asked refund guarantee'
            ].map((feat, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <div style={{ color: '#3ecf8e', flexShrink: 0 }}>
                  <Check size={15} strokeWidth={2.5} />
                </div>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Checkout CTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <Shield size={14} color="#3ecf8e" /> Secure 256-bit checkout via Lemon Squeezy
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Maybe Later
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handleCheckout} 
              disabled={isLoading}
              style={{ minWidth: '170px' }}
            >
              {isLoading ? 'Processing...' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Get Sprint Pass <ArrowRight size={16} />
                </span>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
