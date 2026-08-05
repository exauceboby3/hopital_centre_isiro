import { matchesSearch } from './display';

export const ACTIVE_NURSING_STATUSES = ['ORDERED', 'SCHEDULED', 'IN_PROGRESS'] as const;

export interface NursingWorklistCare {
  id: string;
  status: string;
  label: string;
  medicationName?: string;
  scheduledAt: string;
  performedAt?: string;
  patient: {
    id: string;
    medicalRecordNumber: string;
    lastName: string;
    postName?: string | null;
    firstName?: string | null;
  };
}

export interface NursingPatientGroup<T extends NursingWorklistCare> {
  patient: T['patient'];
  rows: T[];
  activeRows: T[];
  nextCare: T;
  overdueCount: number;
  dueSoonCount: number;
  completedTodayCount: number;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function buildNursingPatientGroups<T extends NursingWorklistCare>(
  rows: T[],
  query = '',
  now = new Date(),
): NursingPatientGroup<T>[] {
  const rowsByPatient = new Map<string, T[]>();
  for (const row of rows) {
    const patientRows = rowsByPatient.get(row.patient.id) ?? [];
    patientRows.push(row);
    rowsByPatient.set(row.patient.id, patientRows);
  }

  const alertLimit = now.getTime() + 30 * 60 * 1000;
  return [...rowsByPatient.values()]
    .map((patientRows) => {
      const sortedRows = [...patientRows].sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
      );
      const activeRows = sortedRows.filter((row) =>
        ACTIVE_NURSING_STATUSES.includes(row.status as (typeof ACTIVE_NURSING_STATUSES)[number]),
      );
      const firstRow = sortedRows[0];
      const nextCare = activeRows[0];
      if (!firstRow || !nextCare) return null;

      const patient = firstRow.patient;
      return {
        patient,
        rows: sortedRows,
        activeRows,
        nextCare,
        overdueCount: activeRows.filter(
          (row) => new Date(row.scheduledAt).getTime() < now.getTime(),
        ).length,
        dueSoonCount: activeRows.filter((row) => new Date(row.scheduledAt).getTime() <= alertLimit)
          .length,
        completedTodayCount: sortedRows.filter(
          (row) =>
            row.status === 'COMPLETED' &&
            Boolean(row.performedAt) &&
            isSameLocalDay(new Date(row.performedAt as string), now),
        ).length,
      } satisfies NursingPatientGroup<T>;
    })
    .filter((group): group is NursingPatientGroup<T> => group !== null)
    .filter((group) =>
      matchesSearch(
        query,
        group.patient.lastName,
        group.patient.postName,
        group.patient.firstName,
        group.patient.medicalRecordNumber,
        ...group.activeRows.flatMap((row) => [row.label, row.medicationName]),
      ),
    )
    .sort((left, right) => {
      if (left.overdueCount !== right.overdueCount) return right.overdueCount - left.overdueCount;
      if (left.dueSoonCount !== right.dueSoonCount) return right.dueSoonCount - left.dueSoonCount;
      return (
        new Date(left.nextCare.scheduledAt).getTime() -
        new Date(right.nextCare.scheduledAt).getTime()
      );
    });
}
