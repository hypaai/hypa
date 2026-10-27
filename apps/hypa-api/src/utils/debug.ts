const COLORS = {
  reset: '\x1b[0m',
  fgBlue: '\x1b[34m',
  fgRed: '\x1b[31m',
  fgYellow: '\x1b[33m',
  fgGreen: '\x1b[32m',
  fgMagenta: '\x1b[35m',
  fgCyan: '\x1b[36m',
  fgWhite: '\x1b[37m',
  fgGray: '\x1b[90m',
};

export class Debug {
  static log(...message: unknown[]) {
    console.log(`${COLORS.fgBlue}[DEBUG]`, ...message, `${COLORS.reset}`);
  }

  static error(...message: unknown[]) {
    console.error(
      `${COLORS.fgRed}[DEBUG ERROR]`,
      ...message,
      `${COLORS.reset}`,
    );
  }

  static warn(...message: unknown[]) {
    console.warn(
      `${COLORS.fgYellow}[DEBUG WARN]`,
      ...message,
      `${COLORS.reset}`,
    );
  }

  static info(...message: unknown[]) {
    console.info(
      `${COLORS.fgGreen}[DEBUG INFO]`,
      ...message,
      `${COLORS.reset}`,
    );
  }
}
