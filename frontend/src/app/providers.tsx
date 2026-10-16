'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  colors: {
    brand: {
      50: '#F0FDFA',
      100: '#CCFBF1',
      200: '#99F6E4',
      300: '#5EEAD4',
      400: '#2DD4BF',
      500: '#14B8A6',
      600: '#0D9488',
      700: '#0F766E',
      800: '#115E59',
      900: '#134E4A',
    },
    accent: {
      50: '#EFF6FF',
      100: '#DBEAFE',
      200: '#BFDBFE',
      300: '#93C5FD',
      400: '#60A5FA',
      500: '#3B82F6',
      600: '#2563EB',
      700: '#1D4ED8',
      800: '#1E40AF',
      900: '#1E3A8A',
    },
    surface: {
      50: '#F8FAFC',
      100: '#1A2332',
      200: '#151C27',
      300: '#111822',
      400: '#0E141C',
      500: '#0B0F14',
    },
    dark: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
  },
  fonts: {
    heading: 'var(--font-geist-sans)',
    body: 'var(--font-geist-sans)',
    mono: 'var(--font-geist-mono)',
  },
  styles: {
    global: {
      'html, body': {
        bg: 'surface.500',
        color: 'gray.100',
      },
      '*:focus-visible': {
        outline: '2px solid',
        outlineColor: 'brand.400',
        outlineOffset: '2px',
      },
      '::selection': {
        bg: 'brand.700',
        color: 'white',
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '600',
        borderRadius: 'md',
      },
      variants: {
        solid: {
          bg: 'brand.500',
          color: 'gray.900',
          _hover: { bg: 'brand.400' },
          _active: { bg: 'brand.600' },
        },
        outline: {
          borderColor: 'whiteAlpha.300',
          color: 'gray.100',
          _hover: { bg: 'whiteAlpha.100', borderColor: 'brand.400' },
        },
        ghost: {
          color: 'gray.300',
          _hover: { bg: 'whiteAlpha.100', color: 'white' },
        },
      },
    },
    Input: {
      variants: {
        filled: {
          field: {
            bg: 'surface.200',
            borderWidth: '1px',
            borderColor: 'whiteAlpha.200',
            _hover: { borderColor: 'whiteAlpha.400' },
            _focus: {
              borderColor: 'brand.400',
              bg: 'surface.200',
            },
          },
        },
      },
      defaultProps: {
        variant: 'filled',
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'surface.200',
          borderWidth: '1px',
          borderColor: 'whiteAlpha.200',
          borderRadius: 'lg',
        },
      },
    },
  },
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CacheProvider>
      <ChakraProvider theme={theme}>{children}</ChakraProvider>
    </CacheProvider>
  );
}
