// sound.ts - Generador de tonos de audio con Web Audio API (100% nativo, sin archivos mp3 externos)
class NotificationSoundPlayer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  // Desbloquea el audio context tras cualquier interacción del usuario en la pantalla
  public unlockAudio() {
    this.getContext();
  }

  // Reproduce un doble timbre alegre para "Pedido listo para retirar"
  public playListoRetiro() {
    try {
      // Vibración nativa en celulares Android (siempre se intenta primero)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 300]);
        } catch {
          // ignore
        }
      }

      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Primer tono (587 Hz - D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Segundo tono más alto (880 Hz - A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15);
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.20);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);

      // Vibración nativa en celulares Android
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 100, 250]);
      }
    } catch (e) {
      console.warn('No se pudo reproducir audio:', e);
    }
  }
}

export const soundPlayer = new NotificationSoundPlayer();

// Solicitar permisos de notificación nativa del sistema operativo (Android/iOS/Desktop)
export async function solicitarPermisoNotificaciones(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// Disparar notificación flotante nativa
export function mostrarNotificacionNativa(titulo: string, cuerpo: string, tag = 'triton-notif') {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      new Notification(titulo, {
        body: cuerpo,
        icon: '/logo-triton.jpg',
        badge: '/logo-triton.jpg',
        tag,
      });
    } catch (e) {
      console.warn('Error mostrando notificación nativa:', e);
    }
  }
}

