import fs from 'node:fs';

const path = 'apps/api/src/patients/patients.service.spec.ts';
const before = fs.readFileSync(path, 'utf8');
const target = `    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'super-user-1',
          action: 'PATIENT_PERMANENTLY_DELETED',
        }),
      }),
    );`;
const replacement = `    const auditCall = auditCreate.mock.calls[0]?.[0] as unknown as {
      data: { userId: string; action: string };
    };
    expect(auditCall.data.userId).toBe('super-user-1');
    expect(auditCall.data.action).toBe('PATIENT_PERMANENTLY_DELETED');`;
const count = before.split(target).length - 1;
if (count !== 1) {
  throw new Error(`patients.service.spec.ts: motif de lint attendu une fois, trouvé ${count}`);
}
fs.writeFileSync(path, before.replace(target, replacement));
console.log('Typage du test patient corrigé.');
