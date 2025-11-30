/**
 * Tests for ProductCard component
 */
import { render, screen } from '@testing-library/react'
import { ProductCard } from '@/app/components/ProductCard'

const mockProduct = {
  title: 'Test Product',
  price: '$29.99',
  link: 'https://example.com/product',
  thumbnail: 'https://example.com/image.jpg',
  source: 'Test Store',
}

describe('ProductCard', () => {
  it('renders product information', () => {
    render(<ProductCard product={mockProduct} />)
    
    expect(screen.getByText('Test Product')).toBeInTheDocument()
    expect(screen.getByText('$29.99')).toBeInTheDocument()
    expect(screen.getByText('Test Store')).toBeInTheDocument()
  })

  it('renders buy now button with correct link', () => {
    render(<ProductCard product={mockProduct} />)
    
    const buyButton = screen.getByText('Buy Now').closest('a')
    expect(buyButton).toHaveAttribute('href', 'https://example.com/product')
    expect(buyButton).toHaveAttribute('target', '_blank')
    expect(buyButton).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders product image with alt text', () => {
    render(<ProductCard product={mockProduct} />)
    
    const image = screen.getByAltText('Test Product')
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg')
  })
})

