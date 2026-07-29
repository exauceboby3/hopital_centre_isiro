import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatientHistoryService } from './patient-history.service';

interface DeathMetadata {
  occurredAt?: string;
  reason?: string;
  notes?: string | null;
}

interface PublicHistoryEntry {
  id: string;
  kind: string;
  date: Date;
  dateKey: string;
  title: string;
  description?: string;
  status?: string;
  author?: string;
  department?: string;
  signature?: { doctorName: string; signedAt: string; hash: string } | null;
}

interface PublicHistory {
  patient: unknown;
  entries: PublicHistoryEntry[];
  groups: Array<{ date: string; entries: PublicHistoryEntry[] }>;
  counts: Record<string, number>;
}

@Injectable()
export class PatientHistoryWithDeathService {
  private readonly baseHistory: PatientHistoryService;

  constructor(private readonly database: PrismaService) {
    this.baseHistory = new PatientHistoryService(database);
  }

  async history(id: string): Promise<PublicHistory> {
    const [history, deathAudit] = await Promise.all([
      this.baseHistory.history(id),
      this.database.auditLog.findFirst({
        where: { entity: 'Patient', entityId: id, action: 'PATIENT_DEATH_DECLARED' },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!deathAudit) return history;

    const metadata = this.deathMetadata(deathAudit.metadata);
    const occurredAt = metadata.occurredAt ? new Date(metadata.occurredAt) : deathAudit.createdAt;
    const dateKey = occurredAt.toISOString().slice(0, 10);
    const entry: PublicHistoryEntry = {
      id: deathAudit.id,
      kind: 'DEATH',
      date: occurredAt,
      dateKey,
      title: 'Décès déclaré et dossier médical clôturé',
      description: [metadata.reason, metadata.notes].filter(Boolean).join(' — ') || undefined,
      status: 'CANCELLED',
      author: deathAudit.user?.username,
      department: 'Médecine / Administration',
      signature: null,
    };
    if (history.entries.some((item) => item.id === entry.id)) return history;

    const entries = [...history.entries, entry].sort((a, b) => b.date.getTime() - a.date.getTime());
    const groups = entries.reduce<Record<string, { date: string; entries: PublicHistoryEntry[] }>>(
      (result, item) => {
        const group = result[item.dateKey] ?? { date: item.dateKey, entries: [] };
        group.entries.push(item);
        result[item.dateKey] = group;
        return result;
      },
      {},
    );
    return {
      ...history,
      entries,
      groups: Object.values(groups).sort((a, b) => b.date.localeCompare(a.date)),
      counts: { ...history.counts, DEATH: (history.counts.DEATH ?? 0) + 1 },
    };
  }

  private deathMetadata(value: Prisma.JsonValue | null): DeathMetadata {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    const record = value;
    return {
      occurredAt: typeof record.occurredAt === 'string' ? record.occurredAt : undefined,
      reason: typeof record.reason === 'string' ? record.reason : undefined,
      notes: typeof record.notes === 'string' ? record.notes : null,
    };
  }
}
