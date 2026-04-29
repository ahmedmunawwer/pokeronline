import React from 'react';

export default function PhaseModal({ children }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
        }}>
            <div style={{
                maxWidth: 400, width: '100%',
                background: 'rgba(20,30,40,0.95)',
                border: '1px solid rgba(240,192,64,0.25)',
                borderRadius: 16,
                padding: '24px 20px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
                maxHeight: '85vh',
                overflowY: 'auto',
            }}>
                {children}
            </div>
        </div>
    );
}
