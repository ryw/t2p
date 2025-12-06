// ANSI color codes for modern terminals (Ghostty, iTerm2, etc.)
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright foreground
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Helper to style text
const style = {
  bold: (text: string) => `${colors.bold}${text}${colors.reset}`,
  dim: (text: string) => `${colors.dim}${text}${colors.reset}`,
  italic: (text: string) => `${colors.italic}${text}${colors.reset}`,
  underline: (text: string) => `${colors.underline}${text}${colors.reset}`,

  green: (text: string) => `${colors.green}${text}${colors.reset}`,
  red: (text: string) => `${colors.red}${text}${colors.reset}`,
  yellow: (text: string) => `${colors.yellow}${text}${colors.reset}`,
  blue: (text: string) => `${colors.blue}${text}${colors.reset}`,
  cyan: (text: string) => `${colors.cyan}${text}${colors.reset}`,
  magenta: (text: string) => `${colors.magenta}${text}${colors.reset}`,

  brightBlack: (text: string) => `${colors.brightBlack}${text}${colors.reset}`,
  brightCyan: (text: string) => `${colors.brightCyan}${text}${colors.reset}`,
  brightYellow: (text: string) => `${colors.brightYellow}${text}${colors.reset}`,
  brightGreen: (text: string) => `${colors.brightGreen}${text}${colors.reset}`,
  brightMagenta: (text: string) => `${colors.brightMagenta}${text}${colors.reset}`,

  // Combined styles
  successIcon: () => `${colors.green}✓${colors.reset}`,
  errorIcon: () => `${colors.red}✗${colors.reset}`,
  infoIcon: () => `${colors.cyan}ℹ${colors.reset}`,
  warnIcon: () => `${colors.yellow}⚠${colors.reset}`,
  stepIcon: () => `${colors.blue}→${colors.reset}`,
};

export const logger = {
  success(message: string): void {
    console.log(`${style.successIcon()} ${style.green(message)}`);
  },

  error(message: string): void {
    console.error(`${style.errorIcon()} ${style.red(message)}`);
  },

  warn(message: string): void {
    console.log(`${style.warnIcon()} ${style.yellow(message)}`);
  },

  info(message: string): void {
    console.log(message);
  },

  step(message: string): void {
    console.log(`${style.stepIcon()} ${message}`);
  },

  section(message: string): void {
    console.log(`\n${style.bold(message)}`);
  },

  blank(): void {
    console.log();
  },

  // Expose style helpers for custom formatting
  style,
  colors,

  // Box drawing helpers
  box: {
    top: (width: number) => `╭${'─'.repeat(width - 2)}╮`,
    bottom: (width: number) => `╰${'─'.repeat(width - 2)}╯`,
    line: (width: number) => '─'.repeat(width),
    doubleLine: (width: number) => '═'.repeat(width),
  },
};
