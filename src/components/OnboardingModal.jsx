import React, { useState } from 'react';
import { X, Sparkles, Check, Globe, Briefcase, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { CAREER_DOMAINS, CURRENCIES, saveUserPreferences } from '../utils';

export default function OnboardingModal({ currentPrefs, onClose, onSave }) {
  const [selectedDomain, setSelectedDomain] = useState(currentPrefs?.domain || 'Full Stack & Web');
  const [selectedCurrency, setSelectedCurrency] = useState(currentPrefs?.currency || 'USD');

  const handleSave = () => {
    const updated = saveUserPreferences({
      domain: selectedDomain,
      currency: selectedCurrency,
      hasOnboarded: true
    });
    onSave(updated);
    onClose();
  };

  const domainIcons = {
    'Full Stack & Web': '💻',
    'QA & SDET': '🧪',
    'Data & AI / ML': '🧠',
    'DevOps & Cloud': '☁️',
    'Mobile Development': '📱',
    'Product & Design': '🎨',
    'Custom / Other': '⚡'
  };

  return (
    <motion.div 
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ zIndex: 1100 }}
    >
      <motion.div 
        className="modal modal-lg"
        initial={{ scale: 0.95, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 15 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px', padding: '28px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ 
              background: 'rgba(56, 189, 248, 0.15)', 
              color: '#38bdf8', 
              padding: '8px', 
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Sparkles size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Tailor Your Workspace</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Customize your tracking presets for your domain and target market
              </p>
            </div>
          </div>
          {currentPrefs?.hasOnboarded && (
            <button 
              className="btn btn-ghost btn-icon" 
              onClick={onClose} 
              aria-label="Close"
              type="button"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Step 1: Career Track */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px' }}>
            <Briefcase size={16} color="#38bdf8" /> Select Your Career Track
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
            {Object.keys(CAREER_DOMAINS).map(domain => {
              const isSelected = selectedDomain === domain;
              return (
                <button
                  key={domain}
                  type="button"
                  onClick={() => setSelectedDomain(domain)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '12px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid var(--accent, #38bdf8)' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'var(--card-bg, rgba(255,255,255,0.03))',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <span style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{domainIcons[domain] || '💼'}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{domain}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {CAREER_DOMAINS[domain].slice(0, 3).join(', ')}...
                  </span>
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'var(--accent, #38bdf8)',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#000'
                    }}>
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Preferred Currency */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px' }}>
            <DollarSign size={16} color="#3ecf8e" /> Primary Salary Currency
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
            {Object.values(CURRENCIES).map(curr => {
              const isSelected = selectedCurrency === curr.code;
              return (
                <button
                  key={curr.code}
                  type="button"
                  onClick={() => setSelectedCurrency(curr.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #3ecf8e' : '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    background: isSelected ? 'rgba(62, 207, 142, 0.1)' : 'var(--card-bg, rgba(255,255,255,0.03))',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.88rem'
                  }}
                >
                  <span>{curr.label}</span>
                  <span style={{ color: isSelected ? '#3ecf8e' : 'var(--text-muted)', fontSize: '1rem' }}>
                    {curr.symbol}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          {currentPrefs?.hasOnboarded && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
            >
              Cancel
            </button>
          )}
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={handleSave}
            style={{ minWidth: '150px' }}
          >
            Apply Preferences
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
