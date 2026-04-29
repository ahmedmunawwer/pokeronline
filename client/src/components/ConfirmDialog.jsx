import React from 'react';
import { G, DIM } from './UI';

export default function ConfirmDialog({ title, body, confirmLabel, confirmBg, onConfirm, onCancel }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
        }}>
            <div style={{
                maxWidth: 360, width: '100%',
                background: 'linear-gradient(160deg, rgba(30,18,10,0.98) 0%, rgba(10,5,0,0.99) 100%)',
                border: '1px solid rgba(240,192,64,0.25)',
                borderRadius: 16,
                padding: '28px 24px',
                textAlign: 'center',
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}>
                <p style={{ color: G, fontWeight: 800, fontSize: 17, margin: '0 0 10px' }}>{title}</p>
                <p style={{ color: DIM, fontSize: 13, margin: '0 0 22px', lineHeight: 1.5 }}>{body}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={onConfirm}
                        style={{
                            flex: 1, padding: '11px 0',
                            background: confirmBg || '#7a1a1a',
                            border: 'none', borderRadius: 10,
                            color: '#fff', fontWeight: 800, fontSize: 14,
                            cursor: 'pointer',
                        }}
                    >
                        {confirmLabel || 'Confirm'}
                    </button>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1, padding: '11px 0',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 10,
                            color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 14,
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
