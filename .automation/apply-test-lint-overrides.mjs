import fs from 'node:fs';

function replaceOnce(text, target, replacement, label) {
  const count = text.split(target).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: motif attendu une fois, trouvé ${count}`);
  }
  return text.replace(target, replacement);
}

const patientPath = 'apps/api/src/patients/patients.service.spec.ts';
let patientText = fs.readFileSync(patientPath, 'utf8');
patientText = replaceOnce(
  patientText,
  `    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });`,
  `    const auditCalls: Array<{ data: { userId: string; action: string } }> = [];
    const auditCreate = jest.fn(
      (args: { data: { userId: string; action: string } }) => {
        auditCalls.push(args);
        return Promise.resolve({ id: 'audit-1' });
      },
    );`,
  'patients.service.spec.ts déclaration audit',
);
patientText = replaceOnce(
  patientText,
  `    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'super-user-1',
          action: 'PATIENT_PERMANENTLY_DELETED',
        }),
      }),
    );`,
  `    const auditCall = auditCalls.at(0);
    expect(auditCall).toBeDefined();
    expect(auditCall?.data.userId).toBe('super-user-1');
    expect(auditCall?.data.action).toBe('PATIENT_PERMANENTLY_DELETED');`,
  'patients.service.spec.ts assertion audit',
);
fs.writeFileSync(patientPath, patientText);

const pharmacyPath = 'apps/api/src/enterprise/grace-aware-enterprise.service.spec.ts';
let pharmacyText = fs.readFileSync(pharmacyPath, 'utf8');
pharmacyText = replaceOnce(
  pharmacyText,
  `    const prescriptionClaim = jest.fn(async (args: PrescriptionClaimArgs) => {
      prescriptionCalls.push(args);
      operationOrder.push('prescription');
      return { count: 1 };
    });`,
  `    const prescriptionClaim = jest.fn((args: PrescriptionClaimArgs) => {
      prescriptionCalls.push(args);
      operationOrder.push('prescription');
      return Promise.resolve({ count: 1 });
    });`,
  'pharmacy prescription claim',
);
pharmacyText = replaceOnce(
  pharmacyText,
  `    const batchClaim = jest.fn(async (args: BatchClaimArgs) => {
      batchCalls.push(args);
      operationOrder.push('batch');
      return { count: 1 };
    });`,
  `    const batchClaim = jest.fn((args: BatchClaimArgs) => {
      batchCalls.push(args);
      operationOrder.push('batch');
      return Promise.resolve({ count: 1 });
    });`,
  'pharmacy batch claim',
);
pharmacyText = replaceOnce(
  pharmacyText,
  `    const medicationClaim = jest.fn(async (args: MedicationClaimArgs) => {
      medicationCalls.push(args);
      operationOrder.push('medication');
      return { count: 1 };
    });`,
  `    const medicationClaim = jest.fn((args: MedicationClaimArgs) => {
      medicationCalls.push(args);
      operationOrder.push('medication');
      return Promise.resolve({ count: 1 });
    });`,
  'pharmacy medication claim',
);
fs.writeFileSync(pharmacyPath, pharmacyText);

console.log('Typage et règles require-await des tests corrigés.');
