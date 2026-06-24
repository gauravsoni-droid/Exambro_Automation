'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 py-12">
          <div className="w-[60px] h-[60px] rounded-full bg-[#fbe9ec] flex items-center justify-center mb-4 text-[26px]">
            ⚠
          </div>
          <h2 className="text-[18px] font-extrabold text-text m-0 mb-2 leading-tight">
            Something went wrong
          </h2>
          <p className="text-[13px] font-medium text-muted mb-5 max-w-[300px] leading-[1.6] m-0">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-orange text-white rounded-[12px] px-5 py-[11px] text-[13px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
