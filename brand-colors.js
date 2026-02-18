// OpenExecution Brand Colors — extracted from logo pixel data
//
// Logo gradient flows left-to-right:
//   Deep Blue (circuit nodes) → Cyan → Teal → Emerald Green → Green → Lime
//
// Sampled via sharp from Open-Execution.png at key pixel positions.

module.exports = {
  // ─── Primary Gradient (left to right in logo) ───────────────
  deepBlue:    '#0270B5',  // Circuit nodes, left side — rgb(2, 112, 181)
  blue:        '#0295D1',  // Node connections, links — rgb(2, 149, 209)
  cyan:        '#01A5CD',  // Transition zone — rgb(1, 165, 205)
  teal:        '#0399AB',  // Grid blocks left column — rgb(3, 153, 171)
  emerald:     '#32B173',  // Grid blocks center — rgb(50, 177, 115)
  green:       '#5EBA4E',  // Grid blocks right — rgb(94, 186, 78)
  lime:        '#9ACC2C',  // Grid blocks far right — rgb(154, 204, 44)

  // ─── Gradient CSS (for backgrounds, borders, text) ──────────
  gradientFull:  'linear-gradient(90deg, #0270B5, #01A5CD, #0399AB, #32B173, #5EBA4E, #9ACC2C)',
  gradientShort: 'linear-gradient(90deg, #0270B5, #01A5CD, #32B173, #9ACC2C)',
  gradientBlueGreen: 'linear-gradient(90deg, #0270B5, #32B173)',

  // ─── UI Dark Theme ─────────────────────────────────────────
  bgPrimary:   '#0d1117',  // Main background (GitHub Dark)
  bgSecondary: '#161b22',  // Panel/card background
  bgTertiary:  '#1c2128',  // Elevated surface
  bgInput:     '#21262d',  // Input fields, hover states
  border:      '#30363d',  // Borders, dividers
  textPrimary: '#e6edf3',  // Primary text
  textSecondary: '#8b949e', // Secondary text, labels

  // ─── Semantic Colors ───────────────────────────────────────
  accent:      '#01A5CD',  // Primary accent — logo cyan
  accentHover: '#0295D1',  // Accent hover — logo blue
  success:     '#32B173',  // Success states — logo emerald
  successBright: '#5EBA4E', // Bright success — logo green
  warning:     '#F0883E',  // Warning — warm complement
  error:       '#F85149',  // Error — red complement
  info:        '#0270B5',  // Info — logo deep blue
  purple:      '#BC8CFF',  // Sequence badges, chain markers

  // ─── Dashboard-Specific Mappings ───────────────────────────
  progressGradient: 'linear-gradient(90deg, #0270B5, #32B173)',
  agentBorder:  '#01A5CD',  // Agent messages (cyan)
  aiBorder:     '#32B173',  // AI messages (emerald)
  humanBorder:  '#F0883E',  // Human messages (orange)
  certBorder:   '#32B173',  // Certificate card (emerald)
  certGlow:     'rgba(50, 177, 115, 0.15)',
};
