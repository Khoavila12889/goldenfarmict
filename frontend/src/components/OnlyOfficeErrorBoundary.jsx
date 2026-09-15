import React from 'react'

export default class OnlyOfficeErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[OO] ErrorBoundary caught:', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: '0.75rem',
          background: '#fff', padding: '2rem',
        }}>
          <p style={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: 600 }}>
            Trình xem tài liệu gặp lỗi. Vui lòng thử lại.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false })
              if (this.props.onClose) this.props.onClose()
            }}
            style={{
              padding: '0.5rem 1.2rem', background: '#0a5b35', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            Đóng
          </button>
        </div>
      )
    }
    return this.props.children
  }
}