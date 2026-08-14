import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// The Canvas screen renders react-konva, which needs a real <canvas>. Stub every
// primitive with a plain <div> so the navigation test can mount it under jsdom.
vi.mock('react-konva', async () => {
  const RK = await import('react')
  const make =
    (name: string) =>
    ({
      children,
      text,
      onClick,
      onTap,
    }: {
      children?: React.ReactNode
      text?: React.ReactNode
      onClick?: (event: unknown) => void
      onTap?: (event: unknown) => void
    }) =>
      RK.createElement('div', { onClick: onClick ?? onTap, 'data-konva': name }, text ?? children)
  return {
    Stage: make('Stage'),
    Layer: make('Layer'),
    Group: make('Group'),
    Rect: make('Rect'),
    Circle: make('Circle'),
    Line: make('Line'),
    Arc: make('Arc'),
    Arrow: make('Arrow'),
    Path: make('Path'),
    Text: make('Text'),
    Shape: make('Shape'),
  }
})

describe('App navigation', () => {
  it('switches between the Connection, Telegram Builder, and Canvas screens', () => {
    render(<App />)

    // Connection screen is shown first.
    expect(screen.getByRole('heading', { name: 'Session Status' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Telegrams' }))
    expect(screen.getByRole('heading', { name: 'Telegram Type Registry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Session Status' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(screen.getByRole('heading', { name: 'Property Inspector' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Telegram Type Registry' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Connection' }))
    expect(screen.getByRole('heading', { name: 'Session Status' })).toBeInTheDocument()
  })
})
