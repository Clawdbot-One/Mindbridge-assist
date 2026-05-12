import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Empty from '@/components/Empty'
import { cn } from '@/lib/utils'

describe('utils', () => {
  it('cn should merge classes', () => {
    const result = cn('text-red-500', 'bg-blue-500')
    expect(result).toBe('text-red-500 bg-blue-500')
  })
})

describe('Empty', () => {
  it('renders Empty text', () => {
    render(<Empty />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })
})
