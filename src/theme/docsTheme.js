/**
 * @type {Object.<string, string>}
 * @property {string} fontsize returns px value
 */
const fontSize = {
  xsmall: '11px',
  tiny: '12px',
  small: '13px',
  default: '16px',
  h1: '36px',
  h2: '24px',
  h3: '18px',
  h4: '16px',
};
/**
 * @type {Object}
 * @property {string} size returns px value
 * @property {function(string): number} stripUnit removes px unit
 */
const size = {
  tiny: '4px',
  small: '8px',
  default: '16px',
  medium: '24px',
  large: '32px',
  xlarge: '64px',
  xxlarge: '128px',
  maxWidth: '1400px',
  /** @type {function(string): number} */
  stripUnit(unit) {
    return parseInt(unit, 10);
  },
};

/**
 * store common responsive sizes as numbers
 * @type {Object.<string, number>}
 */
const breakpoints = {
  xSmall: 320,
  small: 480,
  medium: 767,
  large: 1023,
  xLarge: 1200,
  xxLarge: 1440,
  xxxLarge: 1920,
};

/**
 * store common responsive sizes
 * @type {Object.<string, string>}
 */
const screenSize = {
  upToXSmall: `only screen and (max-width: ${breakpoints.xSmall}px)`,
  xSmallAndUp: `not all and (max-width: ${breakpoints.xSmall}px)`,
  upToSmall: `only screen and (max-width: ${breakpoints.small}px)`,
  smallAndUp: `not all and (max-width: ${breakpoints.small}px)`,
  upToMedium: `only screen and (max-width: ${breakpoints.medium}px)`,
  mediumAndUp: `not all and (max-width: ${breakpoints.medium}px)`,
  upToLarge: `only screen and (max-width: ${breakpoints.large}px)`,
  largeAndUp: `not all and (max-width: ${breakpoints.large}px)`,
  upToXLarge: `only screen and (max-width: ${breakpoints.xLarge}px)`,
  xLargeAndUp: `not all and (max-width: ${breakpoints.xLarge}px)`,
  upTo2XLarge: `only screen and (max-width: ${breakpoints.xxLarge}px)`,
  '2XLargeAndUp': `not all and (max-width: ${breakpoints.xxLarge}px)`,
  upTo3XLarge: `only screen and (max-width: ${breakpoints.xxxLarge}px)`,
  '3XLargeAndUp': `not all and (max-width: ${breakpoints.xxxLarge}px)`,
  tablet: `only screen and (min-width: ${breakpoints.small + 1}px) and (max-width: ${breakpoints.large}px)`,
};

const header = {
  bannerHeight: '40px',
  navbarHeight: '88px',
  navbarMobileHeight: '56px',
  docsMobileMenuHeight: '52px',
};

const transitionSpeed = {
  iaExit: '100ms',
  iaEnter: '200ms',
  contentFade: '300ms',
};

export const theme = {
  breakpoints,
  fontSize,
  header,
  screenSize,
  size,
  transitionSpeed,
};
