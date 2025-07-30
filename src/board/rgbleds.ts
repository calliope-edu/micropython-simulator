  // Function to turn on RGB leds
  export function writeRGBLEDs(svg: SVGElement, pin: number, buffer: Uint8Array): void {
      console.log(`RGB LED data for pin ${pin}:`, Array.from(buffer));
      
      const numLEDs = Math.min(buffer.length / 3, 3); // Max 3 RGB LEDs on Calliope
      for (let i = 0; i < numLEDs; i++) {
          // Cap RGB values properly
          let g = Math.min(buffer[i * 3], 255); // green and red are swapped
          let r = Math.min(buffer[i * 3 + 1], 255);
          let b = Math.min(buffer[i * 3 + 2], 255);
  
          // Convert RGB to HSL
          const [hue, saturation, lightness] = rgb2hsl(r, g, b);
          console.log(`LED ${i}: HSL(${hue}°, ${saturation}%, ${lightness}%)`);
  
          // Update the visual RGB LED in the SVG
          const rgbLedGroup = svg.querySelector(`#RGB-LED_${i}`);
          if (rgbLedGroup) {
              const ledPath = rgbLedGroup.querySelector('.boardSt29') as SVGPathElement;
              if (ledPath) {
                  
                var fixedlightness = 50; // Use 50% lightness for good visibility
                if (g == r && g == b)
                  fixedlightness = 100; // Use 100% lightness in case led color is 'white'
                
                // Use HSL for the LED fill color with full saturation and lightness
                const hslColor = `hsl(${hue}, ${saturation}%, ${fixedlightness}%)`; 
                ledPath.style.fill = hslColor;
  
                  // Always show LEDs at full opacity with correct color, control brightness via glow
                  const totalBrightness = r + g + b;
                  // ledPath.style.opacity = totalBrightness > 0 ? '1.0' : '0.1';
  
                  // Create brightness-controlled glow effect using the HSL color
                  if (totalBrightness > 0) {
  
                      // Scale glow intensity based on the original lightness value
                      const glowIntensity = 1.0 - Math.min(1.0, lightness / 50); // Scale based on HSL lightness, needed to be inverted (HW) 
       
                      // Use a combination of CSS filters for a smoother effect
                      // First, apply a drop-shadow filter with the LED's color
                      const baseGlow = Math.max(2, glowIntensity * 8); // Min 2px, max 8px
                      const mediumGlow = Math.max(4, glowIntensity * 16); // Min 4px, max 16px
                      const largeGlow = Math.max(6, glowIntensity * 24); // Min 6px, max 24px
                      
                      // Apply multiple drop shadows with increasing blur radius for a more natural glow
                      ledPath.style.filter = `drop-shadow(0 0 ${baseGlow}px ${hslColor}) 
                                             drop-shadow(0 0 ${mediumGlow}px ${hslColor}) 
                                             drop-shadow(0 0 ${largeGlow}px ${hslColor})`;
                      
                      // Add a subtle brightness filter to enhance the glow effect
                      const brightness = 1.0 + (glowIntensity * 0.5); // 1.0 to 1.5
                      ledPath.style.filter += ` brightness(${brightness})`;
                      
                      // Make sure the LED is visible above other elements
                      ledPath.style.zIndex = '10';
                } else {
                      ledPath.style.filter = 'none';
                      ledPath.style.boxShadow = 'none';
                  }
              } 
              }
          }
    }
  
  export function resetRGBLEDs(svg: SVGElement) {
    // Reset all 3 RGB LEDs
    for (let i = 0; i < 3; i++) {
      const rgbLedGroup = svg.querySelector(`#RGB-LED_${i}`);
      if (rgbLedGroup) {
        const ledPath = rgbLedGroup.querySelector('.boardSt29') as SVGPathElement;
        if (ledPath) {
          // Reset the LED appearance
          ledPath.style.fill = ''; // Reset to default fill color
          ledPath.style.filter = 'none'; // Remove any glow effects
        }
      }
    }
  }

  // RGB to HSL conversion function
  export function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
      // see https://en.wikipedia.org/wiki/HSL_and_HSV#Formal_derivation
      // convert r,g,b [0,255] range to [0,1]
      r = r / 255;
      g = g / 255;
      b = b / 255;
      // get the min and max of r,g,b
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      // lightness is the average of the largest and smallest color components
      var lum = (max + min) / 2;
      var hue = 0;
      var sat = 0;
      if (max != min) { // has saturation
          var c = max - min; // chroma
          // saturation is simply the chroma scaled to fill
          // the interval [0, 1] for every combination of hue and lightness
          sat = c / (1 - Math.abs(2 * lum - 1));
          switch(max) {
              case r:
                  hue = (g - b) / c + (g < b ? 6 : 0);
                  break;
              case g:
                  hue = (b - r) / c + 2;
                  break;
              case b:
                  hue = (r - g) / c + 4;
                  break;
          }
      }
      hue = Math.round(hue * 60); // °
      sat = Math.round(sat * 100); // %
      lum = Math.round(lum * 100); // %
      return [hue, sat, lum];
  }