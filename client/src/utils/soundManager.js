// Sound utility for support alert notifications
// Uses Web Audio API with fallback to HTML5 Audio

class SoundManager {
  constructor() {
    this.enabled = true;
    this.volume = 0.5;
    this.sounds = {
      newTicket: "/sounds/new-ticket.mp3",
      ticketClosed: "/sounds/ticket-closed.mp3",
      escalation: "/sounds/escalation.mp3",
    };
  }

  // Generate simple audio tones using Web Audio API as fallback
  createTone(frequency, duration, type = "sine") {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) {
        console.log("Web Audio API not supported");
        return;
      }

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      // Resume audio context if it's suspended (required for user interaction)
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(this.volume * 0.3, audioContext.currentTime); // Reduced volume
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + duration
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);

      console.log(`🔊 Playing tone: ${frequency}Hz for ${duration}s`);
    } catch (error) {
      console.error("Error creating tone:", error);
    }
  }

  // Generate tone with custom volume level
  createToneWithVolume(frequency, duration, volumeLevel, type = "sine") {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) {
        console.log("Web Audio API not supported");
        return;
      }

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      // Resume audio context if it's suspended
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      // Use custom volume level
      gainNode.gain.setValueAtTime(
        volumeLevel * this.volume,
        audioContext.currentTime
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + duration
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);

      console.log(
        `🔊 Playing tone: ${frequency}Hz for ${duration}s at ${Math.round(
          volumeLevel * 100
        )}% volume`
      );
    } catch (error) {
      console.error("Error creating tone with volume:", error);
    }
  }

  // Play audio file with fallback to generated tone
  async playSound(soundType) {
    if (!this.enabled) {
      console.log("🔇 Sound disabled - not playing", soundType);
      return;
    }

    console.log("🔊 Attempting to play sound:", soundType);

    try {
      // Try to play audio file first
      const audio = new Audio(this.sounds[soundType]);
      audio.volume = this.volume;

      // If file doesn't exist, fall back to generated tones
      audio.onerror = () => {
        console.log(
          `Audio file not found for ${soundType}, using generated tone`
        );
        this.playFallbackTone(soundType);
      };

      await audio.play();
      console.log("✅ Audio file played successfully");
    } catch (error) {
      console.log(
        `Failed to play audio file for ${soundType}:`,
        error.message,
        "- using fallback tone"
      );
      this.playFallbackTone(soundType);
    }
  }

  // Fallback tones for when audio files aren't available
  playFallbackTone(soundType) {
    switch (soundType) {
      case "newTicket":
        // Gentle ascending chime sequence - starts quiet, gets more noticeable
        this.createToneWithVolume(300, 0.3, 0.1); // Very quiet start
        setTimeout(() => this.createToneWithVolume(400, 0.3, 0.2), 200);
        setTimeout(() => this.createToneWithVolume(500, 0.3, 0.3), 400);
        setTimeout(() => this.createToneWithVolume(600, 0.4, 0.4), 600); // Slightly longer, more obvious
        setTimeout(() => this.createToneWithVolume(700, 0.4, 0.5), 850); // Most noticeable
        break;

      case "ticketClosed":
        // Satisfying descending sequence - starts loud, fades gently
        this.createToneWithVolume(700, 0.3, 0.5); // Start strong
        setTimeout(() => this.createToneWithVolume(600, 0.3, 0.4), 200);
        setTimeout(() => this.createToneWithVolume(500, 0.3, 0.3), 400);
        setTimeout(() => this.createToneWithVolume(400, 0.4, 0.2), 600); // Longer, softer
        setTimeout(() => this.createToneWithVolume(300, 0.5, 0.1), 850); // Gentle finish
        break;

      case "escalation":
        // URGENT ALARM - Classic emergency alert pattern with single tone
        // Rapid-fire bursts like a fire alarm - impossible to ignore
        this.createToneWithVolume(900, 0.15, 0.9); // Short, loud burst
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 200);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 400);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 600);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 800);

        // Brief pause then repeat sequence
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 1200);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 1400);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 1600);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 1800);
        setTimeout(() => this.createToneWithVolume(900, 0.15, 0.9), 2000);

        // Final urgent burst
        setTimeout(() => this.createToneWithVolume(900, 0.25, 1.0), 2400); // Longest, loudest
        break;

      default:
        this.createTone(440, 0.3);
    }
  }

  // Control methods
  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem("soundEnabled", enabled.toString());
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem("soundVolume", this.volume.toString());
  }

  // Load preferences from localStorage
  loadPreferences() {
    const savedEnabled = localStorage.getItem("soundEnabled");
    const savedVolume = localStorage.getItem("soundVolume");

    if (savedEnabled !== null) {
      this.enabled = savedEnabled === "true";
    }

    if (savedVolume !== null) {
      this.volume = parseFloat(savedVolume);
    }
  }

  // Test all sounds
  testSounds() {
    console.log("Testing new ticket sound...");
    this.playSound("newTicket");

    setTimeout(() => {
      console.log("Testing ticket closed sound...");
      this.playSound("ticketClosed");
    }, 2000);

    setTimeout(() => {
      console.log("Testing escalation sound...");
      this.playSound("escalation");
    }, 4000);
  }
}

// Create singleton instance
const soundManager = new SoundManager();
soundManager.loadPreferences();

export default soundManager;
