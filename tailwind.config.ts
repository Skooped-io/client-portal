import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ===== Ice Cream Brand Colors =====
        strawberry: {
          DEFAULT: '#D94A7A',
          50: 'rgb(217 74 122 / 0.05)',
          100: 'rgb(217 74 122 / 0.1)',
          150: 'rgb(217 74 122 / 0.15)',
          200: 'rgb(217 74 122 / 0.2)',
          500: '#D94A7A',
          600: '#C43F6E',
          700: '#AF3562',
        },
        vanilla: {
          DEFAULT: '#E8C87A',
          100: 'rgb(232 200 122 / 0.1)',
          200: 'rgb(232 200 122 / 0.2)',
          500: '#E8C87A',
        },
        gold: {
          DEFAULT: '#C99035',
          100: 'rgb(201 144 53 / 0.1)',
          200: 'rgb(201 144 53 / 0.2)',
          500: '#C99035',
          600: '#B48030',
        },
        chocolate: {
          DEFAULT: '#6E3D20',
          500: '#6E3D20',
        },
        maroon: {
          DEFAULT: '#6D1326',
          500: '#6D1326',
        },
        // Mint (for success states, additional ice cream flavor)
        mint: {
          DEFAULT: '#4CAF50',
          100: 'rgb(76 175 80 / 0.1)',
          500: '#4CAF50',
        },
        // Blueberry (info color)
        blueberry: {
          DEFAULT: '#5B8DEF',
          100: 'rgb(91 141 239 / 0.1)',
          500: '#5B8DEF',
        },

        // ===== Semantic (mapped to CSS vars for theme switching) =====
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          hover: 'hsl(var(--card-hover))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
          light: 'hsl(var(--muted-light))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        error: 'hsl(var(--error))',
        info: 'hsl(var(--info))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },

      fontFamily: {
        nunito: ['var(--font-nunito)', 'system-ui', 'sans-serif'],
        'dm-sans': ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
      },

      fontSize: {
        // Design system type scale
        display: ['3.5rem', { lineHeight: '1.1', fontWeight: '800' }],
        'heading-1': ['2.5rem', { lineHeight: '1.2', fontWeight: '700' }],
        'heading-2': ['2rem', { lineHeight: '1.25', fontWeight: '700' }],
        'heading-3': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-4': ['1.25rem', { lineHeight: '1.35', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        body: ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
      },

      spacing: {
        // Design system spacing scale (base: 4px)
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
        '4xl': '96px',
      },

      borderRadius: {
        sm: '0.375rem',    // 6px — small buttons, tags
        DEFAULT: '0.75rem',
        md: '0.75rem',     // 12px — default cards, inputs
        lg: '1rem',        // 16px — feature cards
        full: '9999px',    // pills, avatars
        // also keep shadcn radix var
        'shadcn-lg': 'var(--radius)',
        'shadcn-md': 'calc(var(--radius) - 2px)',
        'shadcn-sm': 'calc(var(--radius) - 4px)',
      },

      boxShadow: {
        card: '0 2px 8px rgb(54 28 36 / 0.06)',
        'card-hover': '0 4px 16px rgb(54 28 36 / 0.1)',
        'card-dark': '0 2px 8px rgb(0 0 0 / 0.2)',
        'card-dark-hover': '0 4px 16px rgb(0 0 0 / 0.3)',
        'strawberry-glow': '0 0 20px rgb(217 74 122 / 0.25)',
        'gold-glow': '0 0 20px rgb(201 144 53 / 0.25)',
      },

      transitionDuration: {
        fast: '150ms',
        base: '300ms',
        slow: '500ms',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'avatar-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },

      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'count-up': 'count-up 0.4s ease-out forwards',
        'avatar-breathe': 'avatar-breathe 3s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
