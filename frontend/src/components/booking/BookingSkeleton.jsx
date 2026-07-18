import React from 'react'

export default function BookingSkeleton() {
  return (
    <div className="bk-skeleton">
      <div className="bk-skeleton-bar" style={{ width: '40%', height: 20, marginBottom: '1.5rem' }} />
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bk-skeleton-bar" style={{ flex: 1, height: 60 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="bk-skeleton-bar" style={{ flex: 1, height: 38 }} />
        ))}
      </div>
      <div className="bk-skeleton-bar" style={{ height: 400 }} />
    </div>
  )
}
