export interface HospitalNotificationToneStep {
  startsAfter: number;
  duration: number;
  frequency: number;
  peakGain: number;
  type: OscillatorType;
}

export function hospitalNotificationTone(
  baseFrequency: number,
  requestedRepeats: number,
): HospitalNotificationToneStep[] {
  const urgent = baseFrequency >= 800;
  const repeats = urgent ? Math.max(requestedRepeats, 4) : Math.max(requestedRepeats, 2);
  const interval = urgent ? 0.3 : 0.34;
  const ratios = urgent ? [1, 0.72, 1.22, 1] : [1, 1.18, 1];

  return Array.from({ length: repeats }, (_, index) => ({
    startsAfter: index * interval,
    duration: urgent ? 0.23 : 0.2,
    frequency: Math.round(baseFrequency * (ratios[index % ratios.length] ?? 1)),
    peakGain: urgent ? 0.48 : 0.32,
    type: urgent ? 'square' : 'triangle',
  }));
}

export function scheduleHospitalNotificationSound(
  context: AudioContext,
  baseFrequency: number,
  repeats: number,
) {
  for (const step of hospitalNotificationTone(baseFrequency, repeats)) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + step.startsAfter;
    const end = start + step.duration;

    oscillator.frequency.setValueAtTime(step.frequency, start);
    oscillator.type = step.type;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(step.peakGain, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }
}
