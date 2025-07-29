// Constants for RGB LED configuration
const MAX_RGB_LEDS = 3; // Max RGB LEDs on Calliope mini
const RGB_BYTES_PER_LED = 3; // R, G, B bytes per LED
const GLOW_THRESHOLD = 20; // Show glow only when total brightness > 20
const MAX_BRIGHTNESS = 255 * 3; // Maximum possible brightness (765)
const GRAYSCALE_GLOW_FACTOR = 0.6; // Reduce glow intensity for grayscale colors

// Glow size multipliers for performance
const GLOW_SIZES = {
    base: 8,
    medium: 16,
    large: 24
} as const;

// Cache for LED elements to avoid repeated DOM queries
const ledElementCache = new Map<string, SVGPathElement | null>();

// Debug logging flag - set to false for production
const DEBUG_LOGGING = true;

/**
 * Updates RGB LEDs in the SVG with the specified colors and glow effects
 * @param svg - The SVG element containing the LED elements
 * @param pin - The pin number (for logging purposes)
 * @param buffer - Uint8Array containing RGB values (3 bytes per LED: G, R, B)
 */
export function writeRGBLEDs(svg: SVGElement, pin: number, buffer: Uint8Array): void {
    if (!svg || !buffer) {
        console.warn('Invalid parameters provided to writeRGBLEDs');
        return;
    }

    if (DEBUG_LOGGING) {
        console.log(`NEW RGB LED data for pin ${pin}:`, Array.from(buffer));
    }
    
    const numLEDs = Math.min(Math.floor(buffer.length / RGB_BYTES_PER_LED), MAX_RGB_LEDS);
    
    for (let i = 0; i < numLEDs; i++) {
        const baseIndex = i * RGB_BYTES_PER_LED;
        
        // Extract and validate RGB values (note: G and R are swapped in the buffer)
        const g = Math.min(buffer[baseIndex] || 0, 255);
        const r = Math.min(buffer[baseIndex + 1] || 0, 255);
        const b = Math.min(buffer[baseIndex + 2] || 0, 255);
        
        updateSingleLED(svg, i, r, g, b);
    }
}

/**
 * Updates a single RGB LED with the specified color and glow effect
 */
function updateSingleLED(svg: SVGElement, ledIndex: number, r: number, g: number, b: number): void {
    const ledPath = getLEDElement(svg, ledIndex);
    if (!ledPath) return;

    const totalBrightness = r + g + b;
    
    if (totalBrightness === 0) {
        // LED is off
        resetSingleLED(ledPath);
        return;
    }

    // Determine if color is grayscale (white/gray) - any equal RGB values should be treated as white
    // BUT exclude (0,0,0) which should turn the LED off
    const isGrayscale = (r === g && g === b && totalBrightness > 0);
    
    let displayColor: string;
    if (isGrayscale) {
        // For grayscale colors, show as white regardless of the actual RGB values
        displayColor = `rgb(255, 255, 255)`;
    } else {
        // For colored LEDs, normalize to full brightness while preserving color ratios
        const maxComponent = Math.max(r, g, b);
        if (maxComponent > 0) {
            // Scale all components so the brightest becomes 255 (full saturation)
            const scaleFactor = 255 / maxComponent;
            const normalizedR = Math.round(r * scaleFactor);
            const normalizedG = Math.round(g * scaleFactor);
            const normalizedB = Math.round(b * scaleFactor);
            displayColor = `rgb(${normalizedR}, ${normalizedG}, ${normalizedB})`;
        } else {
            // Fallback (shouldn't happen as we check totalBrightness > 0 above)
            displayColor = `rgb(${r}, ${g}, ${b})`;
        }
    }
    
    ledPath.style.fill = displayColor;
    
    // Calculate and apply glow effect (use original RGB values for glow intensity)
    applyGlowEffect(ledPath, displayColor, totalBrightness, isGrayscale);
    
    if (DEBUG_LOGGING) {
        console.log(`LED ${ledIndex}: RGB(${r}, ${g}, ${b}), brightness: ${totalBrightness}, grayscale: ${isGrayscale}`);
    }
}

/**
 * Applies glow effect based on LED brightness
 */
function applyGlowEffect(ledPath: SVGPathElement, color: string, totalBrightness: number, isGrayscale: boolean = false): void {
    // Always show the LED color, even for small values
    ledPath.style.zIndex = '10';
    
    if (totalBrightness <= GLOW_THRESHOLD) {
        // Show color without glow for small values
        ledPath.style.filter = 'none';
        return;
    }

    // Calculate glow intensity based on total brightness (0-765 range)
    const normalizedBrightness = Math.min(totalBrightness / MAX_BRIGHTNESS, 1);
    const glowIntensity = isGrayscale ? normalizedBrightness * GRAYSCALE_GLOW_FACTOR : normalizedBrightness;
    
    // Calculate glow sizes using constants
    const baseGlow = glowIntensity * GLOW_SIZES.base;
    const mediumGlow = glowIntensity * GLOW_SIZES.medium;
    const largeGlow = glowIntensity * GLOW_SIZES.large;
    
    // Only apply glow if it's meaningful (avoid tiny glow effects that look bad)
    if (baseGlow < 0.5) {
        ledPath.style.filter = 'none';
        return;
    }
    
    // Apply glow effect with multiple drop shadows
    const dropShadows = [
        `drop-shadow(0 0 ${baseGlow}px ${color})`,
        `drop-shadow(0 0 ${mediumGlow}px ${color})`,
        `drop-shadow(0 0 ${largeGlow}px ${color})`
    ].join(' ');
    
    // Calculate brightness enhancement
    const brightnessMultiplier = isGrayscale ? 0.3 : 0.5;
    const brightness = 1.0 + (glowIntensity * brightnessMultiplier);
    
    ledPath.style.filter = `${dropShadows} brightness(${brightness})`;
}

/**
 * Gets the LED path element for the specified index with caching
 */
function getLEDElement(svg: SVGElement, ledIndex: number): SVGPathElement | null {
    const cacheKey = `${svg.id || 'svg'}-${ledIndex}`;
    
    // Check cache first
    if (ledElementCache.has(cacheKey)) {
        return ledElementCache.get(cacheKey) || null;
    }
    
    try {
        const rgbLedGroup = svg.querySelector(`#RGB-LED_${ledIndex}`);
        if (!rgbLedGroup) {
            console.warn(`RGB LED group ${ledIndex} not found in SVG`);
            ledElementCache.set(cacheKey, null);
            return null;
        }
        
        const ledPath = rgbLedGroup.querySelector('.boardSt29') as SVGPathElement;
        if (!ledPath) {
            console.warn(`LED path element not found for RGB-LED_${ledIndex}`);
            ledElementCache.set(cacheKey, null);
            return null;
        }
        
        // Cache the result
        ledElementCache.set(cacheKey, ledPath);
        return ledPath;
    } catch (error) {
        console.error(`Error accessing LED ${ledIndex}:`, error);
        ledElementCache.set(cacheKey, null);
        return null;
    }
}

/**
 * Resets a single LED to its default state (black/off)
 */
function resetSingleLED(ledPath: SVGPathElement): void {
    ledPath.style.fill = 'rgb(0, 0, 0)'; // Explicitly set to black when off
    ledPath.style.filter = 'none';
    // Keep zIndex so LED remains visible when turned back on
}
  
/**
 * Resets all RGB LEDs to their default state
 * @param svg - The SVG element containing the LED elements
 */
export function resetRGBLEDs(svg: SVGElement): void {
    if (!svg) {
        console.warn('Invalid SVG element provided to resetRGBLEDs');
        return;
    }

    for (let i = 0; i < MAX_RGB_LEDS; i++) {
        const ledPath = getLEDElement(svg, i);
        if (ledPath) {
            resetSingleLED(ledPath);
        }
    }
}