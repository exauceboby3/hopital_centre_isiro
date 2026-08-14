import { hospitalNotificationTone } from './notification-sound';

describe('son des notifications hospitalières', () => {
  it('produit une alerte urgente forte et reconnaissable', () => {
    const steps = hospitalNotificationTone(880, 3);

    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.frequency)).toEqual([880, 634, 1074, 880]);
    expect(steps.every((step) => step.type === 'square')).toBe(true);
    expect(steps.every((step) => step.peakGain === 0.48)).toBe(true);
  });

  it('conserve un signal plus doux pour un message ordinaire', () => {
    const steps = hospitalNotificationTone(620, 3);

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.frequency)).toEqual([620, 732, 620]);
    expect(steps.every((step) => step.type === 'triangle')).toBe(true);
    expect(steps.every((step) => step.peakGain === 0.32)).toBe(true);
  });
});
