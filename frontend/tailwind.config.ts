import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // Exact color matching from original design
      colors: {
        // Primary brown background color
        brown: {
          50: '#fef6f2',
          100: '#fee8d7',
          200: '#fcd9bd',
          300: '#f9b79e',
          400: '#f5946c',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          850: '#615353', // Primary background color from original
          900: '#7f1d1d',
          950: '#450a0a'
        },
        // Primary orange accent color
        orange: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c', // Primary accent color from original
          500: '#f97316',
          600: '#d8690e', // Border color from original
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407'
        },
        // Additional custom colors for better contrast
        gray: {
          850: '#1f2937', // Dark background for content areas
          900: '#111827',
          950: '#030712'
        },
        // Success/error colors
        green: {
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d'
        },
        red: {
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d'
        },
        blue: {
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a'
        },
        purple: {
          600: '#9333ea',
          700: '#7c3aed',
          800: '#6d28d9',
          900: '#5b21b6'
        }
      },
      // Custom border styles to match original
      borderWidth: {
        '3': '3px'
      },
      // Extended spacing for better layout
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem'
      },
      // Custom font sizes for better hierarchy
      fontSize: {
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }]
      },
      // Custom shadows for depth matching original design
      boxShadow: {
        'orange': '0 4px 6px -1px rgba(217, 119, 6, 0.3), 0 2px 4px -1px rgba(217, 119, 6, 0.2)',
        'orange-lg': '0 10px 15px -3px rgba(217, 119, 6, 0.3), 0 4px 6px -2px rgba(217, 119, 6, 0.2)',
        'brown': '0 4px 6px -1px rgba(97, 83, 83, 0.3), 0 2px 4px -1px rgba(97, 83, 83, 0.2)',
        'brown-lg': '0 10px 15px -3px rgba(97, 83, 83, 0.3), 0 4px 6px -2px rgba(97, 83, 83, 0.2)'
      },
      // Custom backdrop filters
      backdropBlur: {
        'xs': '2px'
      },
      // Custom animations
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-in': 'slideIn 0.3s ease-out forwards',
        'bounce-gentle': 'bounceGentle 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        }
      },
      // Custom border radius for consistency
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem'
      },
      // Custom gradients for enhanced design
      backgroundImage: {
        'brown-gradient': 'linear-gradient(135deg, #615353 0%, #991b1b 100%)',
        'orange-gradient': 'linear-gradient(135deg, #fb923c 0%, #d8690e 100%)',
        'radial-brown': 'radial-gradient(circle at center, #615353 0%, #450a0a 100%)'
      }
    }
  },
  plugins: [
    // Plugin for custom focus styles that match the orange theme
    function({ addUtilities, theme }: any) {
      const newUtilities = {
        '.focus-orange': {
          outline: `2px solid ${theme('colors.orange.400')}`,
          outlineOffset: '2px'
        },
        '.border-orange-dashed': {
          borderStyle: 'dashed',
          borderColor: theme('colors.orange.600')
        },
        '.border-orange-dotted': {
          borderStyle: 'dotted',
          borderColor: theme('colors.orange.600')
        },
        '.text-shadow-orange': {
          textShadow: '0 2px 4px rgba(217, 119, 6, 0.3)'
        },
        '.bg-brown-pattern': {
          backgroundColor: theme('colors.brown.850'),
          backgroundImage: `url("data:image/svg+xml,%3csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='%23615353' fill-opacity='0.05'%3e%3ccircle cx='20' cy='20' r='20'/%3e%3c/g%3e%3c/svg%3e")`,
        }
      };
      addUtilities(newUtilities);
    },
    // Plugin for responsive text sizes that match original design
    function({ addUtilities }: any) {
      addUtilities({
        '.text-responsive': {
          fontSize: 'clamp(0.875rem, 2.5vw, 1.125rem)'
        },
        '.text-responsive-lg': {
          fontSize: 'clamp(1rem, 4vw, 1.5rem)'
        },
        '.text-responsive-xl': {
          fontSize: 'clamp(1.25rem, 5vw, 2rem)'
        }
      });
    }
  ]
};

export default config;