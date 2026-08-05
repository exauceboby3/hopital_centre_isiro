import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ExamStatus, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { decodeLabTemplate } from './lab-template-envelope';
import { stripLabFinancialDetails } from './laboratory.service.helpers';

const groupExamInclude = {
  patient: true,
  requestedByDoctor: { include: { user: { select: { id: true, username: true } } } },
  performedByLabTech: { include: { user: { select: { username: true } } } },
  validatedByLabTech: { include: { user: { select: { username: true } } } },
  careAuthorization: { include: { service: true, invoice: { include: { payments: true } } } },
  document: {
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
  },
} satisfies Prisma.ExamRequestInclude;

type GroupExamRow = Prisma.ExamRequestGetPayload<{ include: typeof groupExamInclude }>;

@ApiTags('laboratory')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.DOCTOR,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.LAB_TECHNICIAN,
  Role.MEDICAL_BIOLOGIST,
)
@Controller('laboratory/requests')
export class LaboratoryRequestPrintController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':requestGroupId')
  async getGroup(
    @Param('requestGroupId', ParseUUIDPipe) requestGroupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rows = await this.prisma.examRequest.findMany({
      where: { requestGroupId },
      include: groupExamInclude,
      orderBy: [{ requestedAt: 'asc' }, { type: 'asc' }],
    });
    if (!rows.length) throw new NotFoundException('Demande de laboratoire introuvable.');
    const first = rows[0]!;

    const clinicalUser = hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    const privileged = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.LAB_TECHNICIAN,
      Role.MEDICAL_BIOLOGIST,
    ]);
    if (clinicalUser && !privileged && first.requestedByDoctor.userId !== user.id) {
      throw new ForbiddenException('Cette demande appartient à un autre médecin.');
    }

    return {
      id: requestGroupId,
      patient: first.patient,
      requestedAt: first.requestedAt,
      requestedByDoctor: first.requestedByDoctor,
      exams: rows.map((row) => this.present(row)),
    };
  }

  private present(row: GroupExamRow) {
    const service = row.careAuthorization?.service;
    const template = decodeLabTemplate(
      service?.labResultTemplate,
      service?.code,
      service?.category,
    );
    const authorizationStatus = row.careAuthorization?.status;
    const workflowStatus =
      row.status === ExamStatus.CANCELLED
        ? 'CANCELLED'
        : authorizationStatus === 'PENDING'
          ? 'PENDING_PAYMENT'
          : row.status === ExamStatus.REQUESTED
            ? 'PAID'
            : row.status === ExamStatus.IN_PROGRESS
              ? 'IN_PROGRESS'
              : row.status === ExamStatus.COMPLETED
                ? 'RESULT_ENTERED'
                : row.status === ExamStatus.VALIDATED
                  ? 'VALIDATED'
                  : 'IN_PROGRESS';

    return {
      ...stripLabFinancialDetails(row),
      workflowStatus,
      catalogMetadata: {
        specimenType: template.specimenType,
        method: template.method,
      },
    };
  }
}
