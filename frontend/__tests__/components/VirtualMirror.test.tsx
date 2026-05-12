'use client'

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VirtualMirror } from '@/app/components/VirtualMirror'

jest.mock('@/app/components/TryOnProgressLoader', () => {
  const React = require('react')
  return {
    TryOnProgressLoader: ({
      status,
      onFinished,
    }: {
      status: 'pending' | 'success' | 'error'
      onFinished?: () => void
    }) => {
      React.useEffect(() => {
        if (status !== 'pending') {
          onFinished?.()
        }
      }, [status, onFinished])
      return <div data-testid="mock-loader" data-status={status} />
    },
  }
})

describe('VirtualMirror', () => {
  it('invokes onImageLoaded when image finishes loading', () => {
    const handleImageLoaded = jest.fn()

    render(
      <VirtualMirror
        imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XoykcAAAAASUVORK5CYII="
        isLoading
        onImageLoaded={handleImageLoaded}
      />,
    )

    const img = screen.getByAltText(/Virtual Try-On Result/i)
    act(() => {
      fireEvent.load(img)
    })

    expect(handleImageLoaded).toHaveBeenCalled()
  })

  it('reports a result image load failure instead of leaving the loader pending', () => {
    const handleImageError = jest.fn()
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <VirtualMirror
        imageUrl="https://example.com/missing-result.png"
        isLoading
        onImageError={handleImageError}
      />,
    )

    const img = screen.getByAltText(/Virtual Try-On Result/i)
    act(() => {
      fireEvent.error(img)
    })

    expect(handleImageError).toHaveBeenCalledWith(
      'The try-on finished, but the generated image could not be loaded. Please try again.',
    )
    expect(screen.getByText(/generated image could not be loaded/i)).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })
})
