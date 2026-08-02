import fs from 'node:fs';

const path = 'apps/api/src/patients/patients.service.spec.ts';
let text = fs.readFileSync(path, 'utf8');

const declarationTarget = `    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });`;
const declarationReplacement = `    const auditCalls: Array<{ data: { userId: string; action: string } }> = [];
    const auditCreate = jest.fn(
      async (args: { data: { userId: string; action: string } }) => {
        auditCalls.push(args);
        return { id: 'audit-1' };
      },
    );`;
const declarationCount = text.split(declarationTarget).length - 1;
if (declarationCount !== 1) {
  throw new Error(
    `patients.service.spec.ts: déclaration audit attendue une fois, trouvée ${declarationCount}`,
  );
}
text = text.replace(declarationTarget, declarationReplacement);

const assertionTarget = `    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'super-user-1',
          action: 'PATIENT_PERMANENTLY_DELETED',
        }),
      }),
    );`;
const assertionReplacement = `    const auditCall = auditCalls.at(0);
    expect(auditCall).toBeDefined();
    expect(auditCall?.data.userId).toBe('super-user-1');
    expect(auditCall?.data.action).toBe('PATIENT_PERMANENTLY_DELETED');`;
const assertionCount = text.split(assertionTarget).length - 1;
if (assertionCount !== 1) {
  throw new Error(
    `patients.service.spec.ts: assertion audit attendue une fois, trouvée ${assertionCount}`,
  );
}
text = text.replace(assertionTarget, assertionReplacement);

fs.writeFileSync(path, text);
console.log('Typage du test patient corrigé sans accès direct à mock.calls.');
