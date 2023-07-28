from calliopemini import *

last = None
while True:
    current = accelerometer.current_gesture()
    if current != last:
        last = current
        print(current)
