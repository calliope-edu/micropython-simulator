# Test RGB LED functionality on pin_RGB
import neopixel
from calliopemini import pin_RGB

# Create a neopixel strip with 3 LEDs on pin_RGB
np = neopixel.NeoPixel(pin_RGB, 3)

# Set the first LED to red
np[0] = (255, 0, 0)

# Set the second LED to green  
np[1] = (0, 255, 0)

# Set the third LED to blue
np[2] = (0, 0, 255)

# Write the data to the LEDs
np.show()

print("RGB LEDs should now be lit: Red, Green, Blue")
