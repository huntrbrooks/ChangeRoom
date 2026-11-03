import React from 'react';
import { render, screen } from '@testing-library/react';
import PricingPage from '@/app/pricing/page';

const originalTarget = process.env.VERCEL_ENV;
afterEach(() => {
  if (originalTarget === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalTarget;
});

test.each(['preview', 'development', undefined])('target %s has no path to the live email portal', (target) => {
  if (target === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = target;
  render(<PricingPage />);
  expect(screen.queryByRole('link', { name: /portal by email/i })).toBeNull();
  expect(screen.getByRole('link', { name: /manage billing or cancel/i })).toHaveAttribute('href', '/billing');
  expect(screen.getByRole('link', { name: 'info@igetdressed.online' })).toHaveAttribute('href', 'mailto:info@igetdressed.online');
});

test('production retains the email fallback during the sales pause', () => {
  process.env.VERCEL_ENV = 'production';
  render(<PricingPage />);
  expect(screen.getByRole('link', { name: /portal by email/i })).toHaveAttribute(
    'href', expect.stringMatching(/^https:\/\/billing\.stripe\.com\/p\/login\//)
  );
});
