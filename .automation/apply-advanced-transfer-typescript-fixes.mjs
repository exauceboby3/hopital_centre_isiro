import fs from 'node:fs';

function replaceExact(path, from, to) {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(from)) {
    throw new Error(`Motif introuvable dans ${path}`);
  }
  fs.writeFileSync(path, current.replace(from, to));
}

replaceExact(
  'apps/api/src/appointments/appointments.service.ts',
  `      if (\n        appointment.status !== AppointmentStatus.CHECKED_IN ||\n        [PatientJourneyStage.COMPLETED, PatientJourneyStage.CANCELLED].includes(\n          appointment.journeyStage,\n        )\n      ) {`,
  `      if (\n        appointment.status !== AppointmentStatus.CHECKED_IN ||\n        appointment.journeyStage === PatientJourneyStage.COMPLETED ||\n        appointment.journeyStage === PatientJourneyStage.CANCELLED\n      ) {`,
);

replaceExact(
  'apps/api/src/appointments/appointments.service.ts',
  `      if (\n        appointment.consultation &&\n        (appointment.consultation.certificate ||\n          [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED].includes(\n            appointment.consultation.status,\n          ))\n      ) {`,
  `      if (\n        appointment.consultation &&\n        (appointment.consultation.certificate ||\n          appointment.consultation.status === ConsultationStatus.COMPLETED ||\n          appointment.consultation.status === ConsultationStatus.CANCELLED)\n      ) {`,
);

replaceExact(
  'apps/api/src/appointments/appointments.transfer.integration.spec.ts',
  `    const transferred = episodesA[0];\n    await appointments.transfer(`,
  `    const transferred = episodesA[0];\n    if (!transferred) throw new Error('Épisode à transférer introuvable.');\n    await appointments.transfer(`,
);

console.log('Corrections TypeScript des transferts avancés appliquées.');
