'use client'

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VirtualMirror } from '@/app/components/VirtualMirror'

jest.mock('@/app/components/TryOnProgressLoader', () => {
  const React = require('react')
  return {
    TryOnProgressLoader: (props: any) => {
      React.useEffect(() => {
        if (props.status !== 'pending') {
          props.onFinished?.()
        }
      }, [props.status, props.onFinished])
      return <div data-testid="mock-loader" data-status={props.status} />
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
})

