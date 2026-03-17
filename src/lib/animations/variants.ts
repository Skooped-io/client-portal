import type { Variants, Transition } from 'framer-motion'

// ===== Base Transitions =====

export const transitionFast: Transition = {
  duration: 0.15,
  ease: 'easeOut',
}

export const transitionBase: Transition = {
  duration: 0.3,
  ease: 'easeInOut',
}

export const transitionSlow: Transition = {
  duration: 0.5,
  ease: 'easeInOut',
}

// ===== Core Animation Variants =====

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitionBase,
  },
  exit: {
    opacity: 0,
    transition: transitionFast,
  },
}

export const slideUp: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitionBase,
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: transitionFast,
  },
}

export const slideDown: Variants = {
  hidden: {
    opacity: 0,
    y: -12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitionBase,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: transitionFast,
  },
}

export const slideInRight: Variants = {
  hidden: {
    opacity: 0,
    x: 12,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitionBase,
  },
  exit: {
    opacity: 0,
    x: 8,
    transition: transitionFast,
  },
}

export const slideInLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -12,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitionBase,
  },
  exit: {
    opacity: 0,
    x: -8,
    transition: transitionFast,
  },
}

export const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitionBase,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: transitionFast,
  },
}

export const scaleInBounce: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.34, 1.56, 0.64, 1], // spring-like cubic bezier
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: transitionFast,
  },
}

// ===== Stagger Container =====
// Wrap children with this and they'll animate in sequence

export const stagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
}

export const staggerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
}

// ===== Page Transition =====
// Used with AnimatePresence on route changes

export const pageTransition: Variants = {
  hidden: {
    opacity: 0,
    y: 6,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: 0.15,
      ease: 'easeIn',
    },
  },
}

// ===== Card Interaction =====

export const cardHover = {
  rest: { y: 0, boxShadow: '0 2px 8px rgb(54 28 36 / 0.06)' },
  hover: { y: -2, boxShadow: '0 4px 16px rgb(54 28 36 / 0.1)' },
  tap: { scale: 0.98, y: 0 },
}

export const cardHoverDark = {
  rest: { y: 0, boxShadow: '0 2px 8px rgb(0 0 0 / 0.2)' },
  hover: { y: -2, boxShadow: '0 4px 16px rgb(0 0 0 / 0.3)' },
  tap: { scale: 0.98, y: 0 },
}

// ===== Agent Avatar (breathing animation) =====

export const avatarBreathe: Variants = {
  animate: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 3,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
}

// ===== Command Palette =====

export const commandPaletteOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
}

export const commandPaletteModal: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.97,
    y: -8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -4,
    transition: {
      duration: 0.15,
      ease: 'easeIn',
    },
  },
}

// ===== Sidebar collapse =====

export const sidebarVariants = {
  expanded: {
    width: 240,
    transition: { duration: 0.2, ease: 'easeInOut' },
  },
  collapsed: {
    width: 64,
    transition: { duration: 0.2, ease: 'easeInOut' },
  },
}

export const sidebarLabelVariants: Variants = {
  expanded: {
    opacity: 1,
    width: 'auto',
    transition: { duration: 0.15, ease: 'easeOut', delay: 0.05 },
  },
  collapsed: {
    opacity: 0,
    width: 0,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
}

// ===== Toast / Notification slide =====

export const toastSlideIn: Variants = {
  hidden: { opacity: 0, x: 24, y: 0 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    x: 24,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
}

// ===== Metric counter =====

export const counterVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
}
