import asyncio
import os
import edge_tts

VOICE = "en-US-EmmaNeural"
RATE = "+10%"

POKE_PHRASES = [
  "Hehe, that tickles! What are we working on today?",
  "Boop! Piko is fully charged and ready to roll!",
  "Hi bestie! You're doing incredible work today!",
  "Beep boop! Don't forget to take a sip of water!",
  "Piko is always happy when you poke me!",
  "Checking in! Everything looking good on your end?",
  "Aww, thanks for saying hi! Keep up the great pace!",
  "Yay! Double tap, high five! Let's conquer the day!",
  "I'm right here cheering for you, one click at a time!",
  "All systems running super smooth and fast!",
]

IDLE_PHRASES = [
  "Watching your cursor fly across the screen like magic!",
  "Just admiring your setup from up here on the Dynamic Island~",
  "Take a deep breath and relax your shoulders for a second!",
  "Hmm, what exciting project are we building right now?",
  "Piko is on duty! Scanning for good vibes and high productivity!",
  "Remember to blink and rest your eyes for a moment!",
  "The Dynamic Island is super cozy today!",
  "La la la~ Loving the rhythm of your workflow!",
  "Everything is humming smoothly under the hood!",
  "You're making great progress! Keep going!",
]

async def generate(text, filename):
    if os.path.exists(filename) and os.path.getsize(filename) > 1000:
        print(f"Already exists: {filename}")
        return

    for attempt in range(5):
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
            await communicate.save(filename)
            print(f"Generated {filename} ({len(text)} chars)")
            await asyncio.sleep(1.0)
            return
        except Exception as e:
            print(f"Retry {attempt+1} for {filename}: {e}")
            await asyncio.sleep(2.0)

async def main():
    out_dir = "public/audio/piko"
    os.makedirs(out_dir, exist_ok=True)
    
    for i, phrase in enumerate(POKE_PHRASES):
        path = os.path.join(out_dir, f"poke_{i}.mp3")
        await generate(phrase, path)
        
    for i, phrase in enumerate(IDLE_PHRASES):
        path = os.path.join(out_dir, f"idle_{i}.mp3")
        await generate(phrase, path)

    print("All audio files generated successfully!")

if __name__ == "__main__":
    asyncio.run(main())

